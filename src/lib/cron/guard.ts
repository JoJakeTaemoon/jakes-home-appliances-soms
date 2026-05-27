/**
 * Cron endpoint guard.
 *
 * Vercel Cron sets `Authorization: Bearer ${CRON_SECRET}` on scheduled
 * invocations. Local-first development bypasses the check when CRON_SECRET
 * is unset (so `curl localhost:3000/api/cron/*` works for manual runs).
 */

import type { NextRequest } from "next/server";
import { UnauthorizedError } from "@/lib/api/error";

let productionWarningEmitted = false;

export function requireCronAuth(request: NextRequest): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Production must set CRON_SECRET. Refuse rather than silently pass.
    if (process.env.NODE_ENV === "production") {
      if (!productionWarningEmitted) {
        console.error(
          "[CRON GUARD] CRON_SECRET is unset in production — refusing cron invocation. " +
            "Set CRON_SECRET in your environment.",
        );
        productionWarningEmitted = true;
      }
      throw new UnauthorizedError("Cron auth not configured");
    }
    return; // local dev — no enforcement
  }
  const header = request.headers.get("authorization") ?? "";
  if (header !== `Bearer ${secret}`) {
    throw new UnauthorizedError("Invalid cron secret");
  }
}
