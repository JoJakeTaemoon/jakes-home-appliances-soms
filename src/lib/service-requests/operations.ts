/**
 * Service-request side-effect orchestration.
 *
 * Centralises the multi-table writes so the API routes stay readable:
 *   - createServiceRequest    : run pricing rules, allocate code, write row,
 *                               auto-create Visit when free, queue notifs.
 *   - approveServiceRequest   : UC-SR-02 paid-flow approval. Transition →
 *                               APPROVED, create the linked Visit, fire
 *                               SMS_SR_APPROVED + EMAIL_SR_APPROVED_DETAILS.
 *   - rejectServiceRequest    : UC-SR-03 transition → REJECTED + SMS.
 *   - cancelServiceRequest    : UC-SR-05 transition → CANCELLED with linked
 *                               Visit cascade.
 *   - markScheduledFromVisit  : called when a Visit is created/linked for an
 *                               APPROVED SR (lift state to SCHEDULED).
 *   - completeSrFromVisit     : called from the Visit completion flow to
 *                               drag the SR into COMPLETED.
 */

import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications/send";
import { allocateServiceRequestCode } from "@/lib/service-requests/code";
import {
  determineIsPaid,
  srTypeToVisitType,
  type ServiceRequestTypeLite,
} from "@/lib/service-requests/pricing";
import {
  planSrTransition,
  type ServiceRequestState,
} from "@/lib/service-requests/state";
import { updateWithStateGuard } from "@/lib/db/state-guard";
import type {
  CreateServiceRequestInput,
  ApproveServiceRequestInput,
  RejectServiceRequestInput,
} from "@/lib/validators/serviceRequest";
import type { Prisma } from "@/generated/prisma/client";

interface ActorContext {
  actorType: "USER" | "CUSTOMER" | "SYSTEM";
  actorUserId?: string | null;
  actorContactId?: string | null;
}

// ── helpers ─────────────────────────────────────────────────────────────

function pickPrimaryContactId(
  contacts: { id: string; role: string; isPrimary: boolean; scope: string }[],
  preferredContactId?: string | null,
): string | null {
  // Prefer the submitter when present, else primary OPS, else first
  // CONTRACT_PARTY, else any.
  if (preferredContactId) {
    const me = contacts.find((c) => c.id === preferredContactId);
    if (me) return me.id;
  }
  const primaryOps = contacts.find(
    (c) => c.role === "OPS_CONTACT" && c.isPrimary,
  );
  if (primaryOps) return primaryOps.id;
  const cp = contacts.find((c) => c.role === "CONTRACT_PARTY");
  if (cp) return cp.id;
  return contacts[0]?.id ?? null;
}

function isoDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

function isoTime(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(11, 16) : "";
}

interface PricingContext {
  customer: { id: string; type: "B2C" | "B2B" };
  equipment: {
    id: string;
    installedAt: Date | null;
    contracts: { contract: { type: "SALE" | "RENTAL" | "MAINTENANCE"; state: string } }[];
  } | null;
  hadPriorRelocation: boolean;
}

async function loadPricingContext(
  customerId: string,
  equipmentId: string | null,
  srType: ServiceRequestTypeLite,
): Promise<PricingContext> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, type: true },
  });
  if (!customer) throw new Error("Customer not found for pricing");

  let equipment: PricingContext["equipment"] = null;
  let hadPriorRelocation = false;
  if (equipmentId) {
    const eq = await prisma.equipment.findUnique({
      where: { id: equipmentId },
      select: {
        id: true,
        installedAt: true,
        contracts: {
          select: {
            contract: { select: { type: true, state: true } },
          },
        },
      },
    });
    if (eq) {
      equipment = {
        id: eq.id,
        installedAt: eq.installedAt ?? null,
        contracts: eq.contracts,
      };
    }
    if (srType === "RELOCATION") {
      const prior = await prisma.serviceRequest.count({
        where: {
          equipmentId,
          type: "RELOCATION",
          state: { in: ["APPROVED", "SCHEDULED", "COMPLETED"] },
        },
      });
      hadPriorRelocation = prior > 0;
    }
  }
  return { customer, equipment, hadPriorRelocation };
}

// ── create ──────────────────────────────────────────────────────────────

export interface CreateServiceRequestArgs {
  customerId: string;
  contactId: string | null;
  input: CreateServiceRequestInput;
  actor: ActorContext;
}

export interface CreateServiceRequestResult {
  serviceRequestId: string;
  code: string;
  state: ServiceRequestState;
  isPaid: boolean;
  reason: string;
  visitId: string | null;
  notificationsQueued: number;
}

export async function createServiceRequest(
  args: CreateServiceRequestArgs,
): Promise<CreateServiceRequestResult> {
  const { customerId, contactId, input, actor } = args;

  // Equipment ownership check
  if (input.equipmentId) {
    const eq = await prisma.equipment.findUnique({
      where: { id: input.equipmentId },
      select: { customerId: true },
    });
    if (!eq || eq.customerId !== customerId) {
      throw new Error("Equipment does not belong to this customer");
    }
  }

  // Pricing
  const ctx = await loadPricingContext(
    customerId,
    input.equipmentId ?? null,
    input.type,
  );
  const decision = determineIsPaid({
    type: input.type,
    customerType: ctx.customer.type,
    equipment: ctx.equipment
      ? {
          id: ctx.equipment.id,
          installedAt: ctx.equipment.installedAt,
          hadPriorRelocation: ctx.hadPriorRelocation,
        }
      : null,
    contracts: ctx.equipment?.contracts
      .filter((c) => c.contract.state === "ACTIVE" || c.contract.state === "AMENDED")
      .map((c) => ({ type: c.contract.type })),
  });

  // Allocate code w/ one retry on collision.
  let code = await allocateServiceRequestCode();
  let created;
  try {
    created = await prisma.serviceRequest.create({
      data: {
        code,
        customerId,
        contactId,
        equipmentId: input.equipmentId ?? null,
        type: input.type,
        isPaid: decision.isPaid,
        state: decision.isPaid ? "PENDING_REVIEW" : "APPROVED",
        description: input.description,
        attachments:
          (input.attachments && input.attachments.length > 0
            ? (input.attachments as unknown as Prisma.InputJsonValue)
            : undefined) ?? undefined,
        submittedAt: new Date(),
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      code = await allocateServiceRequestCode();
      created = await prisma.serviceRequest.create({
        data: {
          code,
          customerId,
          contactId,
          equipmentId: input.equipmentId ?? null,
          type: input.type,
          isPaid: decision.isPaid,
          state: decision.isPaid ? "PENDING_REVIEW" : "APPROVED",
          description: input.description,
          attachments:
            (input.attachments && input.attachments.length > 0
              ? (input.attachments as unknown as Prisma.InputJsonValue)
              : undefined) ?? undefined,
          submittedAt: new Date(),
        },
      });
    } else {
      throw err;
    }
  }

  // Auto-create Visit for free SR.
  let visitId: string | null = null;
  if (!decision.isPaid) {
    const visit = await prisma.visit.create({
      data: {
        customerId,
        equipmentId: input.equipmentId ?? null,
        serviceRequestId: created.id,
        type: srTypeToVisitType(input.type),
        state: "SUGGESTED",
        scheduledFor: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
    });
    visitId = visit.id;
  }

  // Notify submitter (best-effort).
  let notificationsQueued = 0;
  if (contactId) {
    try {
      const submitter = await prisma.customerContact.findUnique({
        where: { id: contactId },
        select: { name: true, language: true },
      });
      const results = await sendNotification({
        templateCode: "EMAIL_SR_RECEIVED",
        customerContactId: contactId,
        vars: {
          name: submitter?.name ?? "",
          req_no: created.code.replace(/^SR-/, ""),
          type: input.type,
          received_at: created.submittedAt.toISOString().slice(0, 16).replace("T", " "),
          url: `/portal/requests/${created.id}`,
          hq_phone: "+84-28-1234-5678",
        },
        actorId: actor.actorUserId ?? actor.actorContactId ?? null,
        actorType: actor.actorType,
        locale: submitter?.language ?? undefined,
      });
      notificationsQueued = results.filter((r) => r.status !== "SKIPPED").length;
    } catch (err) {
      console.error("[service-requests/operations] receipt notification failed:", err);
    }
  }

  await logAudit({
    actorType: actor.actorType,
    actorId: actor.actorUserId ?? actor.actorContactId ?? null,
    action: "SR_CREATE",
    entityType: "ServiceRequest",
    entityId: created.id,
    after: {
      code: created.code,
      type: created.type,
      isPaid: decision.isPaid,
      reason: decision.reason,
      state: created.state,
      visitId,
    },
  });

  return {
    serviceRequestId: created.id,
    code: created.code,
    state: created.state as ServiceRequestState,
    isPaid: decision.isPaid,
    reason: decision.reason,
    visitId,
    notificationsQueued,
  };
}

// ── approve / reject ───────────────────────────────────────────────────

export interface ApproveSrArgs {
  serviceRequestId: string;
  input: ApproveServiceRequestInput;
  actor: ActorContext;
}

export async function approveServiceRequest(args: ApproveSrArgs) {
  const { serviceRequestId, input, actor } = args;
  const current = await prisma.serviceRequest.findUnique({
    where: { id: serviceRequestId },
    include: {
      customer: { select: { contacts: { select: { id: true, role: true, isPrimary: true, scope: true } } } },
      contact: { select: { id: true, language: true, name: true } },
    },
  });
  if (!current) throw new Error("ServiceRequest not found");

  const plan = planSrTransition(
    current.state as ServiceRequestState,
    "APPROVED",
    { actorUserId: actor.actorUserId ?? null },
  );

  await updateWithStateGuard(prisma.serviceRequest, {
    id: serviceRequestId,
    expectedPriorState: current.state,
    data: {
      ...plan,
      approvedPrice: input.approvedPrice,
      approvedDate: input.approvedDate,
    },
    entityName: "ServiceRequest",
  });

  // Create Visit linked to the SR.
  const visit = await prisma.visit.create({
    data: {
      customerId: current.customerId,
      equipmentId: current.equipmentId ?? null,
      serviceRequestId: current.id,
      type: srTypeToVisitType(current.type as ServiceRequestTypeLite),
      state: input.leadTechnicianId ? "SCHEDULED" : "SUGGESTED",
      scheduledFor: input.scheduledFor ?? input.approvedDate,
      scheduledWindow: input.scheduledWindow ?? null,
      expectedAmount: input.approvedPrice,
      leadTechnicianId: input.leadTechnicianId ?? null,
    },
  });

  // If a tech was assigned, lift SR to SCHEDULED.
  let finalState: ServiceRequestState = "APPROVED";
  if (input.leadTechnicianId) {
    const lift = planSrTransition("APPROVED", "SCHEDULED");
    await prisma.serviceRequest.update({
      where: { id: serviceRequestId },
      data: lift,
    });
    finalState = "SCHEDULED";
  }

  // Notify submitter — SMS_SR_APPROVED + EMAIL_SR_APPROVED_DETAILS.
  const targetContactId =
    current.contactId ??
    pickPrimaryContactId(current.customer.contacts as never);
  let notifSms = 0;
  let notifEmail = 0;
  if (targetContactId) {
    try {
      const submitter = await prisma.customerContact.findUnique({
        where: { id: targetContactId },
        select: { name: true, language: true },
      });
      const dateStr = isoDate(input.scheduledFor ?? input.approvedDate);
      const timeStr = isoTime(input.scheduledFor ?? null);
      const lead = input.leadTechnicianId
        ? await prisma.user.findUnique({
            where: { id: input.leadTechnicianId },
            select: { username: true },
          })
        : null;

      const smsResults = await sendNotification({
        templateCode: "SMS_SR_APPROVED",
        customerContactId: targetContactId,
        vars: {
          req_no: current.code.replace(/^SR-/, ""),
          amount: String(input.approvedPrice),
          date: dateStr,
          url: `/portal/requests/${current.id}`,
        },
        actorId: actor.actorUserId ?? null,
        actorType: actor.actorType,
        locale: submitter?.language ?? undefined,
      });
      notifSms = smsResults.filter((r) => r.status !== "SKIPPED").length;

      const emailResults = await sendNotification({
        templateCode: "EMAIL_SR_APPROVED_DETAILS",
        customerContactId: targetContactId,
        vars: {
          name: submitter?.name ?? "",
          req_no: current.code.replace(/^SR-/, ""),
          type: current.type,
          itemized_table: `${current.type} — ${input.approvedPrice} VND`,
          amount: String(input.approvedPrice),
          date: dateStr,
          time: timeStr || "—",
          technician: lead?.username ?? "—",
          url: `/portal/requests/${current.id}`,
          hq_phone: "+84-28-1234-5678",
        },
        actorId: actor.actorUserId ?? null,
        actorType: actor.actorType,
        locale: submitter?.language ?? undefined,
      });
      notifEmail = emailResults.filter((r) => r.status !== "SKIPPED").length;
    } catch (err) {
      console.error("[service-requests/operations] approve notification failed:", err);
    }
  }

  await logAudit({
    actorType: actor.actorType,
    actorId: actor.actorUserId ?? null,
    action: "SR_APPROVE",
    entityType: "ServiceRequest",
    entityId: current.id,
    before: { state: current.state },
    after: {
      state: finalState,
      approvedPrice: String(input.approvedPrice),
      approvedDate: input.approvedDate,
      visitId: visit.id,
      smsQueued: notifSms,
      emailQueued: notifEmail,
    },
  });

  return {
    serviceRequestId: current.id,
    state: finalState,
    visitId: visit.id,
    approvedPrice: input.approvedPrice,
    notificationsQueued: notifSms + notifEmail,
  };
}

export interface RejectSrArgs {
  serviceRequestId: string;
  input: RejectServiceRequestInput;
  actor: ActorContext;
}

export async function rejectServiceRequest(args: RejectSrArgs) {
  const { serviceRequestId, input, actor } = args;
  const current = await prisma.serviceRequest.findUnique({
    where: { id: serviceRequestId },
    include: {
      customer: { select: { contacts: { select: { id: true, role: true, isPrimary: true, scope: true } } } },
      contact: { select: { id: true, language: true, name: true } },
    },
  });
  if (!current) throw new Error("ServiceRequest not found");

  const plan = planSrTransition(
    current.state as ServiceRequestState,
    "REJECTED",
    {
      actorUserId: actor.actorUserId ?? null,
      rejectionReason: input.reason,
    },
  );

  await updateWithStateGuard(prisma.serviceRequest, {
    id: serviceRequestId,
    expectedPriorState: current.state,
    data: plan,
    entityName: "ServiceRequest",
  });

  const targetContactId =
    current.contactId ??
    pickPrimaryContactId(current.customer.contacts as never);
  let queued = 0;
  if (targetContactId) {
    try {
      const submitter = await prisma.customerContact.findUnique({
        where: { id: targetContactId },
        select: { language: true },
      });
      const customerMessage = input.customerMessage ?? input.reason;
      const results = await sendNotification({
        templateCode: "SMS_SR_REJECTED",
        customerContactId: targetContactId,
        vars: {
          req_no: current.code.replace(/^SR-/, ""),
          reason: customerMessage.slice(0, 80),
          hq_phone: "+84-28-1234-5678",
        },
        actorId: actor.actorUserId ?? null,
        actorType: actor.actorType,
        locale: submitter?.language ?? undefined,
      });
      queued = results.filter((r) => r.status !== "SKIPPED").length;
    } catch (err) {
      console.error("[service-requests/operations] reject notification failed:", err);
    }
  }

  await logAudit({
    actorType: actor.actorType,
    actorId: actor.actorUserId ?? null,
    action: "SR_REJECT",
    entityType: "ServiceRequest",
    entityId: current.id,
    before: { state: current.state },
    after: { state: "REJECTED", reason: input.reason, smsQueued: queued },
  });

  return { serviceRequestId: current.id, state: "REJECTED" as const };
}

// ── cancel ─────────────────────────────────────────────────────────────

export interface CancelSrArgs {
  serviceRequestId: string;
  reason: string | null;
  actor: ActorContext;
}

export async function cancelServiceRequest(args: CancelSrArgs) {
  const { serviceRequestId, reason, actor } = args;
  const current = await prisma.serviceRequest.findUnique({
    where: { id: serviceRequestId },
    include: { visit: { select: { id: true, state: true } } },
  });
  if (!current) throw new Error("ServiceRequest not found");

  const plan = planSrTransition(
    current.state as ServiceRequestState,
    "CANCELLED",
    {
      actorUserId: actor.actorUserId ?? null,
    },
  );

  await updateWithStateGuard(prisma.serviceRequest, {
    id: serviceRequestId,
    expectedPriorState: current.state,
    data: plan,
    entityName: "ServiceRequest",
  });

  let cascadedVisit: string | null = null;
  if (current.visit) {
    // Only cascade if Visit is in a state that allows cancellation.
    if (
      current.visit.state === "SUGGESTED" ||
      current.visit.state === "SCHEDULED" ||
      current.visit.state === "RESCHEDULED"
    ) {
      await prisma.visit.update({
        where: { id: current.visit.id },
        data: { state: "CANCELLED", failureReason: reason ?? "SR cancelled" },
      });
      cascadedVisit = current.visit.id;
    }
  }

  await logAudit({
    actorType: actor.actorType,
    actorId: actor.actorUserId ?? actor.actorContactId ?? null,
    action: "SR_CANCEL",
    entityType: "ServiceRequest",
    entityId: current.id,
    before: { state: current.state },
    after: { state: "CANCELLED", reason, cascadedVisit },
  });

  return { serviceRequestId: current.id, state: "CANCELLED" as const, cascadedVisit };
}

// ── visit → SR linkage helpers ─────────────────────────────────────────

/** When the linked Visit transitions SCHEDULED, lift APPROVED → SCHEDULED. */
export async function markScheduledFromVisit(serviceRequestId: string) {
  const sr = await prisma.serviceRequest.findUnique({
    where: { id: serviceRequestId },
    select: { state: true },
  });
  if (!sr) return;
  if (sr.state !== "APPROVED") return;
  const plan = planSrTransition("APPROVED", "SCHEDULED");
  await prisma.serviceRequest.update({
    where: { id: serviceRequestId },
    data: plan,
  });
}

/** Called from `completeVisit` to transition the SR (if any) to COMPLETED. */
export async function completeSrFromVisit(serviceRequestId: string) {
  const sr = await prisma.serviceRequest.findUnique({
    where: { id: serviceRequestId },
    select: { state: true },
  });
  if (!sr) return;
  // APPROVED or SCHEDULED can move to COMPLETED.
  if (sr.state !== "APPROVED" && sr.state !== "SCHEDULED") return;
  const plan = planSrTransition(sr.state as ServiceRequestState, "COMPLETED");
  await prisma.serviceRequest.update({
    where: { id: serviceRequestId },
    data: plan,
  });
}

/** UC-SR-06 hook — sets an `escalatedAt` marker via AuditLog only. */
export async function escalateServiceRequest(opts: {
  serviceRequestId: string;
  reason: string | null;
  actor: ActorContext;
}) {
  const { serviceRequestId, reason, actor } = opts;
  // We don't have a dedicated column for escalation in Phase 5; the audit
  // row is the marker the manager dashboard can read. Phase 7 cron will fire
  // this on its own.
  await logAudit({
    actorType: actor.actorType,
    actorId: actor.actorUserId ?? null,
    action: "SR_ESCALATE",
    entityType: "ServiceRequest",
    entityId: serviceRequestId,
    after: { reason: reason ?? "Manual escalation", escalatedAt: new Date() },
  });
}
