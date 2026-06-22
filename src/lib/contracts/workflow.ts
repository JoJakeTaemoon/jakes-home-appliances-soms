/**
 * ContractWorkflow — public façade for the Contract domain (Refactor C).
 *
 * Routes import only this; they never reach into `state.ts`, `amend.ts`,
 * `renewal.ts`, `code.ts`, `access.ts`, or `cron-completion.ts` directly.
 *
 * Internal scope:
 *   - state transitions (via `planTransition`)
 *   - code allocation   (via `allocateContractCode`)
 *   - amendment paths   (B2C in-place, B2B revision row) via `createAmendment`
 *   - renewal           (via `prepareRenewal`)
 *   - cron completion   (via `runRentalCompletionCheck`)
 *   - audit             (via `lib/audit`)
 *   - concurrency guard (`src/lib/db/state-guard.ts`)
 *
 * Sibling files keep their public exports intact for unit tests and any
 * legacy callers — the workflow is layered on top, not a replacement.
 */

import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { updateWithStateGuard } from "@/lib/db/state-guard";
import { renderPdf } from "@/lib/pdf/renderer";
import type { PdfLangPair } from "@/lib/pdf/types";
import {
  IllegalStateTransitionError,
  planTransition,
  type ContractState,
} from "@/lib/contracts/state";
export { IllegalStateTransitionError } from "@/lib/contracts/state";
export type { ContractState } from "@/lib/contracts/state";
import {
  canAmendContract,
  canCreateContract,
  canEditActiveContractNotes,
  canEditDraftContract,
  canEmailContract,
  canRegenerateContractPdf,
  canRenewContract,
  canTransitionContract,
  canViewContract,
} from "@/lib/contracts/access";
import { allocateContractCode } from "@/lib/contracts/code";
import {
  createAmendment,
  type AmendmentInput,
  type AmendmentResult,
} from "@/lib/contracts/amend";
import {
  prepareRenewal,
  type RenewalAdjustments,
} from "@/lib/contracts/renewal";
import {
  runRentalCompletionCheck,
  type RentalCompletionSummary,
} from "@/lib/contracts/cron-completion";
import { NotFoundError, ValidationError, ForbiddenError } from "@/lib/api/error";
import { generateSerialSequence } from "@/lib/validators/equipment";
import type { ContractType } from "@/generated/prisma/client";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ContractActor {
  userId: string;
  role: string;
}

export interface ContractEquipmentLine {
  /** Pre-existing equipment to attach (MAINTENANCE etc.). */
  equipmentId?: string | null;
  /** Catalog model to materialise + install fresh. Mutually exclusive
   *  with `equipmentId` (enforced both by validator + workflow). */
  modelId?: string | null;
  /** Required when modelId is provided AND the customer has ≥2 sites. */
  siteId?: string | null;
  /** Starting serial for the auto-generated sweep. When blank, the
   *  workflow derives it from the customer's existing serials for
   *  the same model + bumps by one. */
  serialStart?: string | null;
  unitPrice?: number | null;
  quantity: number;
  notes?: string | null;
}

export interface CreateContractInput {
  customerId: string;
  type: ContractType;
  equipment: ContractEquipmentLine[];
  signedAt?: Date;
  startDate?: Date | null;
  termMonths?: number | null;
  monthlyMaintenanceFee?: number | null;
  totalContractValue?: number | null;
  /** RENTAL only — required at creation; null/undefined for SALE/MAINTENANCE. */
  deposit?: number | null;
  /** RENTAL only — TRANSFER_OWNERSHIP (default) or RETRIEVE_DEVICE. */
  endOfTermAction?: "TRANSFER_OWNERSHIP" | "RETRIEVE_DEVICE" | null;
}

// ── Mutators ───────────────────────────────────────────────────────────────

async function create(input: CreateContractInput, actor: ContractActor, request?: NextRequest | null) {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: {
      id: true,
      code: true,
      type: true,
      shortcode: true,
      sites: { where: { isActive: true }, select: { id: true } },
    },
  });
  if (!customer) throw new NotFoundError("Customer not found");
  if (customer.type === "B2B" && !customer.shortcode) {
    throw new ValidationError("B2B customer needs a shortcode before issuing a contract");
  }

  // Split lines into two modes: attach-existing vs. materialise-new.
  // The validator already enforces XOR; we just route them here.
  const attachLines = input.equipment.filter((l) => l.equipmentId);
  const materialiseLines = input.equipment.filter((l) => l.modelId);

  // ── Attach-mode validation (legacy MAINTENANCE-style picks) ──
  if (attachLines.length > 0) {
    const equipmentIds = attachLines.map((l) => l.equipmentId!) ;
    const equipmentRows = await prisma.equipment.findMany({
      where: { id: { in: equipmentIds } },
      select: { id: true, customerId: true, siteId: true, status: true },
    });
    if (equipmentRows.length !== equipmentIds.length) {
      throw new ValidationError("One or more equipment items not found");
    }
    for (const e of equipmentRows) {
      if (e.customerId !== customer.id) {
        throw new ValidationError("Equipment must belong to the chosen customer");
      }
    }
  }

  // ── Materialise-mode validation: model + site + serial sweep ──
  const validSiteIds = new Set(customer.sites.map((s) => s.id));
  const requireSitePerLine = customer.sites.length >= 2;
  let modelMeta = new Map<
    string,
    { id: string; modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null }
  >();
  if (materialiseLines.length > 0) {
    const modelIds = Array.from(new Set(materialiseLines.map((l) => l.modelId!)));
    const models = await prisma.equipmentModel.findMany({
      where: { id: { in: modelIds } },
      select: { id: true, modelCode: true, nameKo: true, nameVi: true, nameEn: true },
    });
    modelMeta = new Map(models.map((m) => [m.id, m]));
    if (modelMeta.size !== modelIds.length) {
      throw new ValidationError("One or more equipment models not found");
    }
    for (const [i, line] of materialiseLines.entries()) {
      if (requireSitePerLine && !line.siteId) {
        throw new ValidationError(
          `equipment[${i}].siteId — required: customer has multiple sites`,
        );
      }
      if (line.siteId && !validSiteIds.has(line.siteId)) {
        throw new ValidationError(
          `equipment[${i}].siteId — site does not belong to this customer`,
        );
      }
    }
  }

  // ── Auto-derive serial starts when blank: look up the customer's
  // last numeric tail for the same model and bump by 1. Falls back to
  // `${modelCode || MODEL}-000001` when no prior unit exists. ────────────
  async function nextSerialAfter(customerId: string, modelId: string, modelCode: string | null) {
    const last = await prisma.equipment.findFirst({
      where: { customerId, modelId, serialNumber: { not: null } },
      orderBy: { serialNumber: "desc" },
      select: { serialNumber: true },
    });
    if (last?.serialNumber) {
      const m = /^(.*?)(\d+)$/.exec(last.serialNumber);
      if (m) {
        const [, prefix, digits] = m;
        const next = String(Number(digits) + 1).padStart(digits.length, "0");
        return `${prefix}${next}`;
      }
      return `${last.serialNumber}-1`;
    }
    const prefix = modelCode ?? "MODEL";
    return `${prefix}-000001`;
  }

  const signedAt = input.signedAt ?? new Date();
  const contractNumber = allocateContractCode({
    customer: { type: customer.type, code: customer.code, shortcode: customer.shortcode },
    type: input.type,
    signedAt,
  });

  const { endDate, termMonths, monthlyFee, totalValue } = deriveTerm(input);

  // Materialise Equipment rows for every modelId-line BEFORE creating
  // the Contract, so ContractEquipment can reference real ids in one
  // round trip. Wrapped in a tx with the Contract.create below.
  const created = await prisma.$transaction(async (tx) => {
    const ceCreateData: {
      equipmentId: string;
      unitPrice?: number;
      quantity: number;
      notes?: string;
    }[] = [];

    for (const line of attachLines) {
      ceCreateData.push({
        equipmentId: line.equipmentId!,
        unitPrice: line.unitPrice ?? undefined,
        quantity: line.quantity,
        notes: line.notes ?? undefined,
      });
    }

    for (const line of materialiseLines) {
      const modelInfo = modelMeta.get(line.modelId!)!;
      const start =
        line.serialStart && line.serialStart.trim().length > 0
          ? line.serialStart.trim()
          : await nextSerialAfter(customer.id, line.modelId!, modelInfo.modelCode);
      const serials = generateSerialSequence(start, line.quantity);
      for (let i = 0; i < line.quantity; i++) {
        const eq = await tx.equipment.create({
          data: {
            customerId: customer.id,
            siteId: line.siteId ?? null,
            modelId: line.modelId!,
            serialNumber: serials[i],
            ownership: "COMPANY",
            status: "ACTIVE",
            installedAt: input.startDate ?? signedAt,
          },
          select: { id: true },
        });
        ceCreateData.push({
          equipmentId: eq.id,
          unitPrice: line.unitPrice ?? undefined,
          quantity: 1,
          notes: line.notes ?? undefined,
        });
      }
    }

    return tx.contract.create({
      data: {
        contractNumber,
        customerId: customer.id,
        type: input.type,
        state: "DRAFT",
        startDate: input.startDate ?? null,
        endDate,
        termMonths,
        monthlyMaintenanceFee: monthlyFee ?? undefined,
        totalContractValue: totalValue ?? undefined,
        // RENTAL-only fields; NULL for SALE / MAINTENANCE.
        deposit: input.type === "RENTAL" ? input.deposit ?? undefined : null,
        endOfTermAction:
          input.type === "RENTAL"
            ? input.endOfTermAction ?? "TRANSFER_OWNERSHIP"
            : null,
        equipment: { create: ceCreateData },
      },
      include: {
        customer: { select: { id: true, code: true, name: true, type: true, shortcode: true } },
        equipment: { include: { equipment: { include: { model: true } } } },
      },
    });
  });

  await logAudit({
    actorType: "USER",
    actorId: actor.userId,
    action: "CONTRACT_CREATE",
    entityType: "Contract",
    entityId: created.id,
    after: { contractNumber: created.contractNumber, type: created.type, state: created.state },
    request: request ?? null,
  });

  return created;
}

function deriveTerm(input: CreateContractInput): {
  endDate: Date | null;
  termMonths: number | null;
  monthlyFee: number | null;
  totalValue: number | null;
} {
  const start = input.startDate ?? null;
  if (input.type === "RENTAL") {
    const term = input.termMonths ?? null;
    if (term === null) {
      throw new ValidationError("RENTAL contract requires termMonths");
    }
    const end = start
      ? new Date(start.getTime() + term * 30 * 24 * 60 * 60 * 1000)
      : null;
    return {
      endDate: end,
      termMonths: term,
      monthlyFee: input.monthlyMaintenanceFee ?? null,
      totalValue: null,
    };
  }
  if (input.type === "MAINTENANCE") {
    const term = input.termMonths ?? null;
    const end = start && term
      ? new Date(start.getTime() + term * 30 * 24 * 60 * 60 * 1000)
      : null;
    return {
      endDate: end,
      termMonths: term,
      monthlyFee: input.monthlyMaintenanceFee ?? null,
      totalValue: null,
    };
  }
  return {
    endDate: null,
    termMonths: null,
    monthlyFee: null,
    totalValue: input.totalContractValue ?? null,
  };
}

/**
 * Drive a state transition with role-check, plan, concurrency guard, audit.
 * Used by `/api/contracts/[id]/state`.
 */
async function transition(args: {
  contractId: string;
  to: ContractState;
  reason?: string | null;
  actor: ContractActor;
  request?: NextRequest | null;
}) {
  const current = await prisma.contract.findUnique({ where: { id: args.contractId } });
  if (!current) throw new NotFoundError("Contract not found");

  if (!canTransitionContract(args.actor.role, current.state as ContractState, args.to)) {
    throw new ForbiddenError(`Role ${args.actor.role} cannot move contract to ${args.to}`);
  }

  let plan;
  try {
    plan = planTransition(
      {
        state: current.state as ContractState,
        activatedAt: current.activatedAt,
        signedByCustomerAt: current.signedByCustomerAt,
        signedByCompanyAt: current.signedByCompanyAt,
        terminatedAt: current.terminatedAt,
      },
      args.to,
      { reason: args.reason ?? null },
    );
  } catch (err) {
    if (err instanceof IllegalStateTransitionError) {
      throw new ValidationError(err.message);
    }
    throw err;
  }

  type ContractRow = Awaited<ReturnType<typeof prisma.contract.update>>;
  const updated = (await updateWithStateGuard(prisma.contract, {
    id: args.contractId,
    expectedPriorState: current.state,
    data: plan as unknown as Record<string, unknown>,
    entityName: "Contract",
  })) as ContractRow;

  await logAudit({
    actorType: "USER",
    actorId: args.actor.userId,
    action: `CONTRACT_STATE_${args.to}`,
    entityType: "Contract",
    entityId: args.contractId,
    before: { state: current.state },
    after: { state: updated.state, reason: args.reason ?? null },
    request: args.request ?? null,
  });

  return updated;
}

/** Convenience wrappers around `transition()` for the named state moves. */
async function activate(contractId: string, actor: ContractActor, request?: NextRequest | null) {
  return transition({ contractId, to: "ACTIVE", actor, request });
}

async function cancel(contractId: string, reason: string | null, actor: ContractActor, request?: NextRequest | null) {
  return transition({ contractId, to: "CANCELLED", reason, actor, request });
}

async function terminate(contractId: string, reason: string | null, actor: ContractActor, request?: NextRequest | null) {
  return transition({ contractId, to: "TERMINATED", reason, actor, request });
}

async function amend(
  parentContractId: string,
  changes: AmendmentInput,
  actor: ContractActor,
  request?: NextRequest | null,
): Promise<AmendmentResult> {
  const result = await createAmendment(parentContractId, changes);
  await logAudit({
    actorType: "USER",
    actorId: actor.userId,
    action: "CONTRACT_AMEND",
    entityType: "Contract",
    entityId: result.isNewRevision ? result.contract.id : parentContractId,
    before: (result.before as Record<string, unknown> | undefined) ?? undefined,
    after: (result.after as Record<string, unknown> | undefined) ?? undefined,
    request: request ?? null,
  });
  return result;
}

async function renew(
  parentContractId: string,
  adjustments: RenewalAdjustments,
  actor: ContractActor,
  request?: NextRequest | null,
) {
  const result = await prepareRenewal(parentContractId, adjustments);
  await logAudit({
    actorType: "USER",
    actorId: actor.userId,
    action: "CONTRACT_RENEW_PREPARED",
    entityType: "Contract",
    entityId: result.contract.id,
    after: {
      newContractNumber: result.contract.contractNumber,
      parentContractNumber: result.parent.contractNumber,
    },
    request: request ?? null,
  });
  return result;
}

/** Render a fresh contract PDF (UC-CT-10 regenerate). Bilingual (vi + secondary). */
async function regeneratePdf(args: {
  contractId: string;
  actor: ContractActor;
  langPair: PdfLangPair;
}) {
  return renderPdf({
    kind: "CONTRACT",
    refId: args.contractId,
    langPair: args.langPair,
    generatedById: args.actor.userId,
  });
}

/** Cron entry point — invoked by the ScheduledJob runner. */
async function completeRentals(now?: Date): Promise<RentalCompletionSummary> {
  return runRentalCompletionCheck(now ?? new Date());
}

// ── Queries ────────────────────────────────────────────────────────────────

async function getById(contractId: string) {
  return prisma.contract.findUnique({ where: { id: contractId } });
}

async function list(args: Parameters<typeof prisma.contract.findMany>[0] = {}) {
  return prisma.contract.findMany(args);
}

// ── Public façade ──────────────────────────────────────────────────────────

/** Role-check helpers re-exposed so routes only import the workflow. */
const access = {
  canAmend: canAmendContract,
  canCreate: canCreateContract,
  canEditDraft: canEditDraftContract,
  canEditActiveNotes: canEditActiveContractNotes,
  canEmail: canEmailContract,
  canRegeneratePdf: canRegenerateContractPdf,
  canRenew: canRenewContract,
  canTransition: canTransitionContract,
  canView: canViewContract,
} as const;

export const ContractWorkflow = {
  create,
  transition,
  activate,
  cancel,
  terminate,
  amend,
  renew,
  regeneratePdf,
  completeRentals,
  getById,
  list,
  access,
} as const;

export type ContractWorkflowType = typeof ContractWorkflow;
