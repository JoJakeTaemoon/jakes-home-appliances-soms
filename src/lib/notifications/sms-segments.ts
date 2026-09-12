/**
 * SMS encoding helpers shared by the mock and eSMS adapters so both log the
 * same billing figure.
 *
 * GSM-7 packs 160 characters per segment; a single non-ASCII character
 * forces the whole message to UCS-2 at 70. That is why the eSMS-approved
 * Vietnamese bodies are written without diacritics — see `toAsciiVi()` in
 * `src/lib/format.ts`.
 *
 * The segment count is an approximation on purpose: eSMS bills on its own
 * count and does not return one in the send response, so this figure is for
 * cost audit in `NotificationLog.segmentsUsed`, not for invoicing.
 */

/** True when the body needs UCS-2 — maps to the eSMS `IsUnicode` flag. */
export function isUnicodeSms(body: string): boolean {
  return /[^\x00-\x7F]/.test(body);
}

export function approximateSmsSegments(body: string): number {
  const limit = isUnicodeSms(body) ? 70 : 160;
  return Math.max(1, Math.ceil(body.length / limit));
}
