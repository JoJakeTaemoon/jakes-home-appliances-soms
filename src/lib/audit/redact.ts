/**
 * Reader-side redaction for audit log payloads.
 *
 * `logAudit()` callers occasionally include sensitive fields (a fresh
 * passwordHash on USER_CREATE, a refreshTokenHash on session ops, etc).
 * Rather than chase down every writer, we mask values at the API boundary
 * so that even legacy rows are safe to display.
 *
 * Pure: returns a NEW tree, never mutates input. The mask value is exposed
 * so UI assertions can `expect(...).toBe(REDACTED)` reliably.
 */

export const REDACTED = "••••";

/** Keys that always get masked, regardless of suffix rules. */
const ALWAYS_MASK = new Set<string>([
  "passwordHash",
  "refreshTokenHash",
  "resetCode",
  "accessToken",
  "refreshToken",
  "recoveryCode",
  "apiKey",
]);

/** Suffix matchers — case-insensitive. e.g. `apiToken`, `clientSecret`, `signatureHash`. */
const TOKEN_SUFFIX = /Token$/i;
const SECRET_SUFFIX = /Secret$/i;
const HASH_SUFFIX = /Hash$/i;

function shouldMask(key: string): boolean {
  if (ALWAYS_MASK.has(key)) return true;
  if (TOKEN_SUFFIX.test(key)) return true;
  if (SECRET_SUFFIX.test(key)) return true;
  if (HASH_SUFFIX.test(key)) return true;
  return false;
}

/**
 * Deep-walk `value` and mask any key flagged by `shouldMask()`.
 *
 *   redact({ username: "jake", passwordHash: "x" })
 *     // → { username: "jake", passwordHash: "••••" }
 *
 * Arrays + nested objects are recursed. Primitives are returned as-is.
 *
 * **Caller contract.** Masking is keyed on the property name, so a
 * sensitive value passed as a top-level primitive (e.g.
 * `redact(user.passwordHash)`) is returned UNCHANGED. Always wrap secrets
 * in an object so the key carries the signal:
 *   ✅  redact({ passwordHash: user.passwordHash })
 *   ❌  redact(user.passwordHash)
 */
export function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (typeof value !== "object") return value;

  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    if (shouldMask(key)) {
      out[key] = REDACTED;
    } else {
      out[key] = redact(src[key]);
    }
  }
  return out;
}
