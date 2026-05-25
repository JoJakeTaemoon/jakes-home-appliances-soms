/**
 * Retry logic for Supabase Supavisor EMAXCONNSESSION / "max clients reached"
 * transient errors.
 *
 * Extracted from `src/lib/prisma.ts` for independent testability.
 */

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 100;

export function isMaxConnError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return msg.includes("EMAXCONNSESSION") || msg.includes("max clients reached");
}

export async function retryOnMaxConn<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isMaxConnError(err) || attempt === RETRY_MAX_ATTEMPTS - 1) {
        throw err;
      }
      const jitter = Math.random() * 50;
      const delay = RETRY_BASE_DELAY_MS * (attempt + 1) + jitter;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // Unreachable: the loop either returns or throws.
  throw new Error("retryOnMaxConn: exhausted without returning");
}
