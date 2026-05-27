/**
 * POST /api/mobile/visits/[id]/notes
 *
 * Both lead and collaborators (and office) can append a note + photos to a
 * visit. Notes are appended to `findings` with a timestamp + author tag;
 * photos are appended to the photos array. Does NOT change state.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import {
  canAddVisitNotes,
  canTechnicianViewVisit,
} from "@/lib/visits/access";
import { addNotesSchema } from "@/lib/validators/visit";
import { logAudit } from "@/lib/audit";
import { getVisitOr404 } from "@/lib/visits/queries";
import type { Prisma } from "@/generated/prisma/client";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (auth.role !== "TECHNICIAN") {
      // Office can use the office detail route to edit; mobile/notes is
      // strictly the technician path.
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }
    const { id } = await ctx.params;
    const current = await getVisitOr404(id);
    if (!canTechnicianViewVisit(auth, current)) {
      throw new NotFoundError("Visit not found");
    }
    if (!canAddVisitNotes(auth, current)) {
      throw new ForbiddenError("Cannot add notes to this visit");
    }

    const body = await request.json().catch(() => null);
    const parsed = addNotesSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid notes payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    if (!parsed.data.note && parsed.data.photos.length === 0) {
      throw new ValidationError("note or photos required");
    }

    const existingPhotos = Array.isArray(current.photos)
      ? (current.photos as unknown[])
      : [];
    const newPhotos = parsed.data.photos.map((p) => ({
      storageKey: p.storageKey,
      takenAt: p.takenAt ? p.takenAt.toISOString() : undefined,
      author: auth.userId,
    }));
    const photosJson = [...existingPhotos, ...newPhotos] as unknown as Prisma.InputJsonValue;

    const tag = `[${new Date().toISOString().slice(0, 16).replace("T", " ")}] ${auth.username}`;
    let updatedFindings = current.findings ?? "";
    if (parsed.data.note) {
      const block = `${tag}: ${parsed.data.note}`;
      updatedFindings = updatedFindings
        ? `${updatedFindings}\n${block}`
        : block;
    }

    const updated = await prisma.visit.update({
      where: { id },
      data: {
        findings: updatedFindings || null,
        photos: photosJson,
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "VISIT_NOTE_ADD",
      entityType: "Visit",
      entityId: id,
      after: {
        addedPhotos: parsed.data.photos.length,
        addedNote: !!parsed.data.note,
      },
      request,
    });

    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
