/**
 * POST /api/portal/uploads
 *
 * Multipart photo upload from the customer portal. Body:
 *   - file: image blob (jpeg / png / webp)
 *   - tmpId: client-generated identifier so all files for one in-progress
 *           SR submission land under the same folder (storage namespace).
 *
 * Returns the stored attachment descriptor (`storageKey` + url + size +
 * mimeType + filename). The client passes those storageKeys back when
 * posting `/api/portal/service-requests` so they get persisted on the SR
 * row's `attachments` JSON.
 *
 * Files are written under `./uploads/service-requests/{customerId}/{tmpId}/`.
 * 10MB cap. Image MIME only. EXIF stripping is client-side via
 * `compressImage`.
 */

import { NextRequest } from "next/server";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import {
  ALLOWED_IMAGE_MIME,
  MAX_UPLOAD_BYTES,
  UploadError,
} from "@/lib/upload/photo-storage";
import { storeSrAttachment } from "@/lib/upload/sr-attachment-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeTmpId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^[a-zA-Z0-9_-]{4,80}$/.test(trimmed)) return null;
  return trimmed;
}

export async function POST(request: NextRequest) {
  try {
    const caller = await requireCustomerAuth(request);

    const form = await request.formData().catch(() => null);
    if (!form) throw new ValidationError("Expected multipart/form-data");

    const rawTmpId = form.get("tmpId");
    if (typeof rawTmpId !== "string") {
      throw new ValidationError("tmpId is required");
    }
    const tmpId = sanitizeTmpId(rawTmpId);
    if (!tmpId) {
      throw new ValidationError("Invalid tmpId");
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
      stored = await storeSrAttachment({
        customerId: caller.customerId,
        tmpId,
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
