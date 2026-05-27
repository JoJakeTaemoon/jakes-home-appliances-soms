/**
 * Photo storage helpers for the mobile-side visit flow.
 *
 * Phase 4 local-disk: write under `./uploads/visits/{visitId}/{ts}-{slug}.jpg`.
 *
 * TODO(Phase 6): swap for Supabase Storage; keep this module's interface
 * stable so the API routes don't have to change.
 *
 * - 10MB hard cap (client pre-compresses to ~1080p so a typical upload is
 *   well under 2MB).
 * - Image MIME only (image/jpeg, image/png, image/webp).
 * - EXIF stripping happens client-side via `browser-image-compression`;
 *   server is not responsible for re-stripping.
 */

import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export class UploadError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "UploadError";
  }
}

export function getVisitUploadDir(visitId: string): string {
  return path.join(process.cwd(), "uploads", "visits", visitId);
}

export function sanitizeSlug(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}+/gu, "")
      .replace(/[^a-z0-9.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "photo"
  );
}

function extensionForMime(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

export interface StoredPhoto {
  storageKey: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
}

export async function storeVisitPhoto(opts: {
  visitId: string;
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}): Promise<StoredPhoto> {
  if (!ALLOWED_IMAGE_MIME.has(opts.mimeType)) {
    throw new UploadError(
      "UNSUPPORTED_MIME",
      `Unsupported image type: ${opts.mimeType}`,
    );
  }
  if (opts.buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      "TOO_LARGE",
      `Photo exceeds ${MAX_UPLOAD_BYTES} bytes`,
    );
  }

  const dir = getVisitUploadDir(opts.visitId);
  await fsp.mkdir(dir, { recursive: true });

  const ts = Date.now();
  const slug = sanitizeSlug(opts.originalName ?? "photo");
  const ext = extensionForMime(opts.mimeType);
  const filename = `${ts}-${slug}.${ext}`;
  const fullPath = path.join(dir, filename);

  if (fs.existsSync(fullPath)) {
    // extremely unlikely race; salt with a counter.
    const altName = `${ts}-${slug}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
    await fsp.writeFile(path.join(dir, altName), opts.buffer);
    const altStorageKey = path.relative(
      process.cwd(),
      path.join(dir, altName),
    );
    return {
      storageKey: altStorageKey,
      url: `/uploads/visits/${opts.visitId}/${altName}`,
      sizeBytes: opts.buffer.byteLength,
      mimeType: opts.mimeType,
    };
  }

  await fsp.writeFile(fullPath, opts.buffer);
  const storageKey = path.relative(process.cwd(), fullPath);
  return {
    storageKey,
    url: `/uploads/visits/${opts.visitId}/${filename}`,
    sizeBytes: opts.buffer.byteLength,
    mimeType: opts.mimeType,
  };
}
