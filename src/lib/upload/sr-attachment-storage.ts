/**
 * Service-request attachment storage (Phase 5).
 *
 * Customer portal POSTs photos as part of creating a Service Request.
 * Because the SR row doesn't exist yet when the first photo uploads (the
 * customer hits "Add photo" before "Submit"), uploads land under a
 * caller-generated `tmpId`. After the SR is created the client passes the
 * stored `storageKey` values; the SR record holds them in its `attachments`
 * JSON.
 *
 * Path: `./uploads/service-requests/{customerId}/{tmpId}/{ts}-{slug}.jpg`
 *
 * TODO(Phase 6): swap for Supabase Storage when the host migration lands.
 * Keep this module's interface stable so the API routes don't have to
 * change.
 */

import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import {
  ALLOWED_IMAGE_MIME,
  MAX_UPLOAD_BYTES,
  UploadError,
  sanitizeSlug,
} from "@/lib/upload/photo-storage";

function extensionForMime(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

export function getSrAttachmentDir(customerId: string, tmpId: string): string {
  return path.join(
    process.cwd(),
    "uploads",
    "service-requests",
    customerId,
    tmpId,
  );
}

export interface StoredSrAttachment {
  storageKey: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
  filename: string;
}

export async function storeSrAttachment(opts: {
  customerId: string;
  tmpId: string;
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}): Promise<StoredSrAttachment> {
  if (!ALLOWED_IMAGE_MIME.has(opts.mimeType)) {
    throw new UploadError(
      "UNSUPPORTED_MIME",
      `Unsupported image type: ${opts.mimeType}`,
    );
  }
  if (opts.buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      "TOO_LARGE",
      `Attachment exceeds ${MAX_UPLOAD_BYTES} bytes`,
    );
  }

  const dir = getSrAttachmentDir(opts.customerId, opts.tmpId);
  await fsp.mkdir(dir, { recursive: true });

  const ts = Date.now();
  const slug = sanitizeSlug(opts.originalName ?? "attachment");
  const ext = extensionForMime(opts.mimeType);
  let filename = `${ts}-${slug}.${ext}`;
  let fullPath = path.join(dir, filename);

  if (fs.existsSync(fullPath)) {
    const altName = `${ts}-${slug}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
    filename = altName;
    fullPath = path.join(dir, altName);
  }

  await fsp.writeFile(fullPath, opts.buffer);
  const storageKey = path.relative(process.cwd(), fullPath);
  return {
    storageKey,
    url: `/uploads/service-requests/${opts.customerId}/${opts.tmpId}/${filename}`,
    sizeBytes: opts.buffer.byteLength,
    mimeType: opts.mimeType,
    filename,
  };
}

/** Validate a list of storageKeys all live under the given customer's namespace. */
export function isStorageKeyOwnedByCustomer(
  storageKey: string,
  customerId: string,
): boolean {
  const norm = storageKey.replace(/\\/g, "/");
  return norm.includes(`uploads/service-requests/${customerId}/`);
}
