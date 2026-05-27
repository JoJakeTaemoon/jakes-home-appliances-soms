/**
 * POST /api/mobile/uploads
 *
 * Multipart photo upload from a technician's phone. Body:
 *   - file: image blob (jpeg / png / webp)
 *   - visitId: string (technician must be lead OR collaborator)
 *
 * Returns the stored photo descriptor (storageKey + url) for inclusion in
 * the subsequent complete / fail / notes calls.
 *
 * Files are written under `./uploads/visits/{visitId}/{ts}-{slug}.jpg`.
 * 10MB cap. Image MIME only. EXIF is expected to be stripped client-side.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import {
  canTechnicianViewVisit,
} from "@/lib/visits/access";
import {
  ALLOWED_IMAGE_MIME,
  MAX_UPLOAD_BYTES,
  UploadError,
  storeVisitPhoto,
} from "@/lib/upload/photo-storage";
import { getVisitOr404 } from "@/lib/visits/queries";

export const runtime = "nodejs";
// Disable Next's parser; we read the FormData ourselves.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile uploads are technician-only");
    }

    const form = await request.formData().catch(() => null);
    if (!form) throw new ValidationError("Expected multipart/form-data");

    const visitId = form.get("visitId");
    if (typeof visitId !== "string" || !visitId) {
      throw new ValidationError("visitId is required");
    }
    const visit = await getVisitOr404(visitId);
    if (!canTechnicianViewVisit(auth, visit)) {
      throw new NotFoundError("Visit not found");
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("file field missing or not a File");
    }
    if (!ALLOWED_IMAGE_MIME.has(file.type)) {
      throw new ValidationError(`Unsupported file type: ${file.type}`);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ValidationError(
        `File too large (max ${MAX_UPLOAD_BYTES} bytes)`,
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let stored;
    try {
      stored = await storeVisitPhoto({
        visitId,
        buffer,
        mimeType: file.type,
        originalName: file.name,
      });
    } catch (err) {
      if (err instanceof UploadError) {
        throw new ValidationError(err.message);
      }
      throw err;
    }

    return successResponse(stored, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
