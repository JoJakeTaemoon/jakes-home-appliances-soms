/**
 * GET   /api/contracts/[id] — full contract detail.
 * PATCH /api/contracts/[id] — update DRAFT (basic fields) or ACTIVE notes.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import {
  canViewContract,
  canEditDraftContract,
  canEditActiveContractNotes,
} from "@/lib/contracts/access";
import { updateContractSchema } from "@/lib/validators/contract";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canViewContract(auth.role)) throw new ForbiddenError("Cannot view contracts");
    const { id } = await ctx.params;

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        customer: {
          select: { id: true, code: true, name: true, type: true, shortcode: true },
        },
        equipment: {
          include: {
            equipment: {
              include: {
                model: { select: { id: true, modelCode: true, name: true, category: true } },
                site: { select: { id: true, name: true } },
              },
            },
          },
        },
        parentContract: {
          select: { id: true, contractNumber: true, amendmentRevision: true, state: true },
        },
        amendments: {
          orderBy: { amendmentRevision: "asc" },
          select: {
            id: true,
            contractNumber: true,
            amendmentRevision: true,
            amendmentReason: true,
            state: true,
            createdAt: true,
          },
        },
        documents: {
          where: { kind: "CONTRACT" },
          orderBy: { generatedAt: "desc" },
          select: { id: true, locale: true, filename: true, generatedAt: true, sizeBytes: true },
        },
      },
    });
    if (!contract) throw new NotFoundError("Contract not found");

    const recentAudit = await prisma.auditLog.findMany({
      where: { entityType: "Contract", entityId: id },
      orderBy: { at: "desc" },
      take: 20,
      include: { actorUser: { select: { id: true, username: true, role: true } } },
    });

    return successResponse({ ...contract, recentAudit });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    const { id } = await ctx.params;

    const before = await prisma.contract.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Contract not found");

    const isDraft = before.state === "DRAFT";
    if (isDraft) {
      if (!canEditDraftContract(auth.role)) throw new ForbiddenError("Cannot edit drafts");
    } else if (before.state === "ACTIVE") {
      if (!canEditActiveContractNotes(auth.role)) {
        throw new ForbiddenError("Cannot edit active contracts");
      }
    } else {
      throw new ValidationError(`Cannot edit contract in ${before.state} state`);
    }

    const body = await request.json().catch(() => null);
    const parsed = updateContractSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;

    if (!isDraft) {
      // ACTIVE contracts only allow notes (any other field change requires amendment).
      const allowedKeys = new Set(["notes"]);
      const bad = Object.keys(data).filter((k) => !allowedKeys.has(k) && data[k as keyof typeof data] !== undefined);
      if (bad.length > 0) {
        throw new ValidationError(
          `Field(s) cannot be edited on ACTIVE contract: ${bad.join(", ")} — use Amend instead`,
        );
      }
    }

    const updated = await prisma.contract.update({
      where: { id },
      data: {
        startDate: data.startDate === undefined ? undefined : data.startDate,
        signedByCustomerAt: data.signedAt === undefined ? undefined : data.signedAt,
        termMonths: data.termMonths === undefined ? undefined : data.termMonths,
        monthlyMaintenanceFee:
          data.monthlyMaintenanceFee === undefined ? undefined : data.monthlyMaintenanceFee,
        totalContractValue:
          data.totalContractValue === undefined ? undefined : data.totalContractValue,
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CONTRACT_UPDATE",
      entityType: "Contract",
      entityId: id,
      before,
      after: updated,
      request,
    });

    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
