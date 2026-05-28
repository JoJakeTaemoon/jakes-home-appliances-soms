"use client";

/**
 * Client-side image compression helper.
 *
 *   const compressed = await compressImage(file);
 *
 * Wraps `browser-image-compression`. Defaults: 1080px longest side, ~1MB
 * target, JPEG output. EXIF stripping is on by default in the library;
 * field photos taken in the wild shouldn't carry GPS metadata back to the
 * server.
 *
 * TODO(Phase 6): consider switching to OffscreenCanvas for a leaner
 * runtime; not blocking — typical phones already complete this in < 1s.
 */

import imageCompression from "browser-image-compression";

export interface CompressOptions {
  /** Longest side in CSS pixels. Default 1080. */
  maxWidthOrHeight?: number;
  /** Target size MB. Default 1. */
  maxSizeMB?: number;
  /** MIME type override. Default keeps original (usually image/jpeg). */
  fileType?: string;
}

const DEFAULTS = {
  maxWidthOrHeight: 1080,
  maxSizeMB: 1,
  useWebWorker: true,
  preserveExif: false,
};

export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<File> {
  const merged = {
    ...DEFAULTS,
    maxWidthOrHeight: options.maxWidthOrHeight ?? DEFAULTS.maxWidthOrHeight,
    maxSizeMB: options.maxSizeMB ?? DEFAULTS.maxSizeMB,
    ...(options.fileType ? { fileType: options.fileType } : {}),
  };
  const compressed = await imageCompression(file, merged);
  // browser-image-compression returns a Blob in some pipelines; coerce to
  // File so consumers always have a stable type for FormData.
  if (compressed instanceof File) return compressed;
  return new File([compressed], file.name, {
    type: (compressed as Blob).type || file.type,
    lastModified: Date.now(),
  });
}
