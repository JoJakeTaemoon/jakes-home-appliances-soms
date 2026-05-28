/**
 * photo-storage unit test — exercises the validation branches without
 * actually writing to disk by passing a buffer that exceeds the cap.
 *
 * The "happy path" write is exercised in the integration test, where we
 * actually flush a few bytes and verify the returned storageKey resolves.
 */

import { describe, it, expect } from "vitest";
import {
  ALLOWED_IMAGE_MIME,
  MAX_UPLOAD_BYTES,
  UploadError,
  sanitizeSlug,
  storeVisitPhoto,
} from "@/lib/upload/photo-storage";

describe("sanitizeSlug", () => {
  it("lowercases + strips diacritics + replaces spaces", () => {
    expect(sanitizeSlug("Hình Ảnh Mặt Trước.jpg")).toMatch(/^hinh-anh-mat-truoc.jpg$/);
  });
  it("falls back to 'photo' for empty input", () => {
    expect(sanitizeSlug("")).toBe("photo");
  });
  it("clips to 40 chars", () => {
    const s = sanitizeSlug("a".repeat(100));
    expect(s.length).toBeLessThanOrEqual(40);
  });
});

describe("storeVisitPhoto", () => {
  it("rejects unsupported MIME", async () => {
    await expect(
      storeVisitPhoto({
        visitId: "v1",
        buffer: Buffer.alloc(8),
        mimeType: "application/pdf",
      }),
    ).rejects.toBeInstanceOf(UploadError);
  });

  it("rejects payloads > MAX_UPLOAD_BYTES", async () => {
    await expect(
      storeVisitPhoto({
        visitId: "v1",
        buffer: Buffer.alloc(MAX_UPLOAD_BYTES + 1),
        mimeType: "image/jpeg",
      }),
    ).rejects.toBeInstanceOf(UploadError);
  });

  it("ALLOWED_IMAGE_MIME contains the expected types", () => {
    expect(ALLOWED_IMAGE_MIME.has("image/jpeg")).toBe(true);
    expect(ALLOWED_IMAGE_MIME.has("image/png")).toBe(true);
    expect(ALLOWED_IMAGE_MIME.has("image/webp")).toBe(true);
    expect(ALLOWED_IMAGE_MIME.has("image/gif")).toBe(false);
  });
});
