/**
 * VisitWorkflow — public façade for the Visit domain (Refactor C).
 *
 * Routes import only this; they never touch `state.ts`, `complete.ts`,
 * `queries.ts`, `access.ts` directly anymore. The façade owns:
 *
 *   - state transitions (via `planVisitTransition`)
 *   - concurrency guard (`src/lib/db/state-guard.ts`)
 *   - completion orchestration (Payment, PDF, Notification, SR linkage)
 *   - SR linkage on schedule (via ServiceRequestWorkflow.markScheduled)
 *   - audit
 *
 * The validator-shaped inputs are imported from `@/lib/validators/visit` so
 * the façade stays a thin orchestrator (no validation duplication).
 */

import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { updateWithStateGuard } from "@/lib/db/state-guard";
import {
  IllegalVisitTransitionError,
  planVisitTransition,
  type VisitState,
} from "@/lib/visits/state";
export { IllegalVisitTransitionError } from "@/lib/visits/state";
export type { VisitState } from "@/lib/visits/state";
import {
  canAddVisitNotes,
  canCompleteVisit,
  canCreateVisit,
  canEditVisitMeta,
  canFailVisit,
  canReassign,
  canStartVisit,
  canTechnicianViewVisit,
  canViewVisit,
  isCollaborator,
  isLead,
  isOfficeRole,
  technicianVisitWhere,
} from "@/lib/visits/access";
import {
  getVisitOr404,
  loadCollaborators,
} from "@/lib/visits/queries";
import {
  completeVisit,
  type CompleteVisitArgs,
  type CompleteVisitResult,
} from "@/lib/visits/complete";
import { ServiceRequestWorkflow } from "@/lib/service-requests/workflow";
import { NotFoundError, ValidationError } from "@/lib/api/error";
import type { Prisma, VisitType } from "@/generated/prisma/client";

// ── Types ──────────────────────────────────────────────────────────────────

export interface VisitActor {
  userId: string;
  role: string;
}

export interface CreateVisitInput {
  customerId: string;
  siteId?: string | null;
  equipmentId?: string | null;
  type: VisitType;
  scheduledFor: Date;
  scheduledWindow?: string | null;
  expectedAmount?: number | null;
}

export interface ScheduleVisitInput {
  leadTechnicianId: string;
  collaboratorTechnicianIds: string[];
  scheduledFor?: Date | null;
  scheduledWindow?: string | null;
}

export interface ReassignVisitInput {
  leadTechnicianId?: string | null;
  collaboratorTechnicianIds: string[];
  reason?: string | null;
}

export interface RescheduleVisitInput {
  scheduledFor: Date;
  scheduledWindow?: string | null;
  reason?: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function validateTechnicians(leadId: string, collaboratorIds: string[]) {
  const lead = await prisma.user.findUnique({
    where: { id: leadId },
    select: { id: true, role: true, status: true, username: true },
  });
  if (!lead || lead.role !== "TECHNICIAN" || lead.status !== "ACTIVE") {
    throw new ValidationError("Lead must be an active TECHNICIAN user");
  }
  const collab = collaboratorIds.filter((cid) => cid !== leadId);
  if (collab.length > 0) {
    const found = await prisma.user.findMany({
      where: { id: { in: collab }, role: "TECHNICIAN", status: "ACTIVE" },
      select: { id: true },
    });
    if (found.length !== collab.length) {
      throw new ValidationError(
        "One or more collaborators are not active TECHNICIANs",
      );
    }
  }
  return { lead, collab };
}

// ── Mutators ───────────────────────────────────────────────────────────────

async function create(
  input: CreateVisitInput,
  actor: VisitActor,
  request?: NextRequest | null,
) {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, type: true },
  });
  if (!customer) throw new NotFoundError("Customer not found");

  if (input.siteId) {
    const site = await prisma.site.findUnique({
      where: { id: input.siteId },
      select: { customerId: true },
    });
    if (!site || site.customerId !== customer.id) {
      throw new ValidationError("Site does not belong to this customer");
    }
  }
  if (input.equipmentId) {
    const eq = await prisma.equipment.findUnique({
      where: { id: input.equipmentId },
      select: { customerId: true },
    });
    if (!eq || eq.customerId !== customer.id) {
      throw new ValidationError("Equipment does not belong to this customer");
    }
  }

  const visit = await prisma.visit.create({
    data: {
      customerId: input.customerId,
      siteId: input.siteId ?? null,
      equipmentId: input.equipmentId ?? null,
      type: input.type,
      state: "SUGGESTED",
      scheduledFor: input.scheduledFor,
      scheduledWindow: input.scheduledWindow ?? null,
      expectedAmount: input.expectedAmount ?? null,
    },
  });

  await logAudit({
    actorType: "USER",
    actorId: actor.userId,
    action: "VISIT_CREATE",
    entityType: "Visit",
    entityId: visit.id,
    after: {
      customerId: visit.customerId,
      type: visit.type,
      scheduledFor: visit.scheduledFor,
    },
    request: request ?? null,
  });

  return visit;
}

async function schedule(
  visitId: string,
  input: ScheduleVisitInput,
  actor: VisitActor,
  request?: NextRequest | null,
) {
  const current = await getVisitOr404(visitId);
  const { collab } = await validateTechnicians(
    input.leadTechnicianId,
    input.collaboratorTechnicianIds,
  );

  let plan;
  try {
    plan = planVisitTransition(current.state as VisitState, "SCHEDULED");
  } catch (err) {
    if (err instanceof IllegalVisitTransitionError) {
      throw new ValidationError(err.message);
    }
    throw err;
  }

  const updated = await prisma.visit.update({
    where: { id: visitId },
    data: {
      ...plan,
      leadTechnicianId: input.leadTechnicianId,
      collaboratorTechnicianIds: collab,
      scheduledFor: input.scheduledFor ?? undefined,
      scheduledWindow: input.scheduledWindow ?? undefined,
    },
  });

  if (current.serviceRequestId) {
    try {
      await ServiceRequestWorkflow.markScheduled(current.serviceRequestId);
    } catch (err) {
      console.error("[visits/workflow] SR lift failed:", err);
    }
  }

  await logAudit({
    actorType: "USER",
    actorId: actor.userId,
    action: "VISIT_SCHEDULE",
    entityType: "Visit",
    entityId: visitId,
    before: {
      state: current.state,
      leadTechnicianId: current.leadTechnicianId,
      collaboratorTechnicianIds: current.collaboratorTechnicianIds,
    },
    after: {
      state: updated.state,
      leadTechnicianId: updated.leadTechnicianId,
      collaboratorTechnicianIds: updated.collaboratorTechnicianIds,
      scheduledFor: updated.scheduledFor,
    },
    request: request ?? null,
  });

  return updated;
}

async function reassign(
  visitId: string,
  input: ReassignVisitInput,
  actor: VisitActor,
  request?: NextRequest | null,
) {
  const current = await getVisitOr404(visitId);
  if (
    current.state !== "SCHEDULED" &&
    current.state !== "SUGGESTED" &&
    current.state !== "RESCHEDULED" &&
    current.state !== "FAILED_NO_SHOW"
  ) {
    throw new ValidationError(`Cannot reassign in state ${current.state}`);
  }
  const newLeadId = input.leadTechnicianId ?? current.leadTechnicianId;
  if (!newLeadId) {
    throw new ValidationError("A lead technician is required");
  }
  const { collab } = await validateTechnicians(newLeadId, input.collaboratorTechnicianIds);

  const updated = await prisma.visit.update({
    where: { id: visitId },
    data: {
      leadTechnicianId: newLeadId,
      collaboratorTechnicianIds: collab,
    },
  });

  await logAudit({
    actorType: "USER",
    actorId: actor.userId,
    action: "VISIT_REASSIGN",
    entityType: "Visit",
    entityId: visitId,
    before: {
      leadTechnicianId: current.leadTechnicianId,
      collaboratorTechnicianIds: current.collaboratorTechnicianIds,
    },
    after: {
      leadTechnicianId: updated.leadTechnicianId,
      collaboratorTechnicianIds: updated.collaboratorTechnicianIds,
      reason: input.reason ?? null,
    },
    request: request ?? null,
  });
  return updated;
}

async function reschedule(
  visitId: string,
  input: RescheduleVisitInput,
  actor: VisitActor,
  request?: NextRequest | null,
) {
  const current = await getVisitOr404(visitId);
  const ALLOWED_FROM = ["SCHEDULED", "FAILED_NO_SHOW", "RESCHEDULED"] as const;
  if (!(ALLOWED_FROM as readonly string[]).includes(current.state)) {
    throw new ValidationError(`Cannot reschedule in state ${current.state}`);
  }
  const updated = await prisma.visit.update({
    where: { id: visitId },
    data: {
      state: "SCHEDULED",
      scheduledFor: input.scheduledFor,
      scheduledWindow: input.scheduledWindow ?? null,
      failureReason: null,
    },
  });
  await logAudit({
    actorType: "USER",
    actorId: actor.userId,
    action: "VISIT_RESCHEDULE",
    entityType: "Visit",
    entityId: visitId,
    before: {
      state: current.state,
      scheduledFor: current.scheduledFor,
      scheduledWindow: current.scheduledWindow,
    },
    after: {
      state: updated.state,
      scheduledFor: updated.scheduledFor,
      scheduledWindow: updated.scheduledWindow,
      reason: input.reason ?? null,
    },
    request: request ?? null,
  });
  return updated;
}

async function cancel(
  visitId: string,
  reason: string,
  actor: VisitActor,
  request?: NextRequest | null,
) {
  const current = await getVisitOr404(visitId);
  let plan;
  try {
    plan = planVisitTransition(current.state as VisitState, "CANCELLED", { reason });
  } catch (err) {
    if (err instanceof IllegalVisitTransitionError) {
      throw new ValidationError(err.message);
    }
    throw err;
  }
  const updated = await prisma.visit.update({
    where: { id: visitId },
    data: { ...plan, failureReason: reason },
  });
  await logAudit({
    actorType: "USER",
    actorId: actor.userId,
    action: "VISIT_CANCEL",
    entityType: "Visit",
    entityId: visitId,
    before: { state: current.state },
    after: { state: updated.state, reason },
    request: request ?? null,
  });
  return updated;
}

async function start(
  visitId: string,
  actor: VisitActor,
  request?: NextRequest | null,
) {
  const current = await getVisitOr404(visitId);
  let plan;
  try {
    plan = planVisitTransition(current.state as VisitState, "IN_PROGRESS");
  } catch (err) {
    if (err instanceof IllegalVisitTransitionError) {
      throw new ValidationError(err.message);
    }
    throw err;
  }
  type VisitRow = Awaited<ReturnType<typeof prisma.visit.update>>;
  const updated = (await updateWithStateGuard(prisma.visit, {
    id: visitId,
    expectedPriorState: current.state,
    data: plan as unknown as Record<string, unknown>,
    entityName: "Visit",
  })) as VisitRow;
  await logAudit({
    actorType: "USER",
    actorId: actor.userId,
    action: "VISIT_START",
    entityType: "Visit",
    entityId: visitId,
    before: { state: current.state },
    after: { state: updated.state, startedAt: updated.startedAt },
    request: request ?? null,
  });
  return updated;
}

async function complete(args: CompleteVisitArgs): Promise<CompleteVisitResult> {
  return completeVisit(args);
}

async function fail(
  visitId: string,
  input: {
    reason: string;
    photos?: { storageKey: string; takenAt?: Date | null }[];
  },
  actor: VisitActor,
  request?: NextRequest | null,
) {
  const current = await getVisitOr404(visitId);
  let plan;
  try {
    plan = planVisitTransition(current.state as VisitState, "FAILED_NO_SHOW", { reason: input.reason });
  } catch (err) {
    if (err instanceof IllegalVisitTransitionError) {
      throw new ValidationError(err.message);
    }
    throw err;
  }

  const updateData: Prisma.VisitUpdateInput = {
    ...plan,
    failureReason: input.reason,
  };
  if (input.photos && input.photos.length > 0) {
    const existing = Array.isArray(current.photos) ? (current.photos as unknown[]) : [];
    const merged = [
      ...existing,
      ...input.photos.map((p) => ({
        storageKey: p.storageKey,
        takenAt: p.takenAt ? p.takenAt.toISOString() : undefined,
      })),
    ];
    updateData.photos = merged as unknown as Prisma.InputJsonValue;
  }

  const updated = await prisma.visit.update({
    where: { id: visitId },
    data: updateData,
  });
  await logAudit({
    actorType: "USER",
    actorId: actor.userId,
    action: "VISIT_FAIL",
    entityType: "Visit",
    entityId: visitId,
    before: { state: current.state },
    after: { state: updated.state, reason: input.reason },
    request: request ?? null,
  });
  return updated;
}

async function addNotes(
  visitId: string,
  input: {
    note?: string | null;
    photos?: { storageKey: string; takenAt?: Date | null }[];
    authorLabel: string; // "[2026-05-27 09:00] alice" style; usually built by caller from auth
  },
  actor: VisitActor,
  request?: NextRequest | null,
) {
  const current = await getVisitOr404(visitId);
  const data: Prisma.VisitUpdateInput = {};

  if (input.note) {
    const block = `${input.authorLabel}: ${input.note}`;
    const updatedFindings = current.findings ? `${current.findings}\n${block}` : block;
    data.findings = updatedFindings;
  }
  if (input.photos && input.photos.length > 0) {
    const existing = Array.isArray(current.photos)
      ? (current.photos as unknown[])
      : [];
    const merged = [
      ...existing,
      ...input.photos.map((p) => ({
        storageKey: p.storageKey,
        takenAt: p.takenAt ? p.takenAt.toISOString() : undefined,
        author: actor.userId,
      })),
    ];
    data.photos = merged as unknown as Prisma.InputJsonValue;
  }
  const updated = await prisma.visit.update({ where: { id: visitId }, data });
  await logAudit({
    actorType: "USER",
    actorId: actor.userId,
    action: "VISIT_NOTE_ADD",
    entityType: "Visit",
    entityId: visitId,
    after: {
      addedNote: !!input.note,
      addedPhotos: input.photos?.length ?? 0,
    },
    request: request ?? null,
  });
  return updated;
}

// ── Queries ────────────────────────────────────────────────────────────────

async function getById(visitId: string) {
  return getVisitOr404(visitId);
}

async function list(args: Parameters<typeof prisma.visit.findMany>[0] = {}) {
  return prisma.visit.findMany(args);
}

async function forTechnician(technicianId: string) {
  return prisma.visit.findMany({
    where: {
      OR: [
        { leadTechnicianId: technicianId },
        { collaboratorTechnicianIds: { has: technicianId } },
      ],
    },
    orderBy: { scheduledFor: "asc" },
  });
}

// ── Public façade ──────────────────────────────────────────────────────────

/** Role-check helpers re-exposed so routes only import the workflow. */
const access = {
  canAddNotes: canAddVisitNotes,
  canComplete: canCompleteVisit,
  canCreate: canCreateVisit,
  canEditMeta: canEditVisitMeta,
  canFail: canFailVisit,
  canReassign,
  canStart: canStartVisit,
  canTechnicianView: canTechnicianViewVisit,
  canView: canViewVisit,
  isCollaborator,
  isLead,
  isOfficeRole,
  technicianVisitWhere,
} as const;

export const VisitWorkflow = {
  // mutators
  create,
  schedule,
  reassign,
  reschedule,
  cancel,
  start,
  complete,
  fail,
  addNotes,
  // queries
  getById,
  list,
  forTechnician,
  loadCollaborators,
  access,
} as const;

export type VisitWorkflowType = typeof VisitWorkflow;
