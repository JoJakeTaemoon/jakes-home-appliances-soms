/**
 * POST /api/auth/password-reset/verify
 *
 * Validates a recovery code. On success returns a one-time plaintext
 * temp password the UI shows on screen; the user then logs in with it
 * and is force-changed via `mustChangePassword=true`. Every active
 * session for the user is revoked at the same time.
 */

import { NextRequest } from "next/server";
import { passwordResetVerifySchema } from "@/lib/validators/auth";
import { verifyRecoveryCode } from "@/lib/auth/recovery";
import {
  successResponse,
  errorResponse,
  toErrorResponse,
} from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = passwordResetVerifySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const outcome = await verifyRecoveryCode({
      phone: parsed.data.phone,
      code: parsed.data.code,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    if (!outcome.ok) {
      switch (outcome.reason) {
        case "NO_CODE":
          return errorResponse(
            "No active recovery code. Request a new one.",
            400,
            "NO_CODE",
          );
        case "EXPIRED":
          return errorResponse(
            "Recovery code has expired. Request a new one.",
            400,
            "EXPIRED",
          );
        case "EXHAUSTED":
          return errorResponse(
            "Too many wrong attempts. Request a new code.",
            429,
            "EXHAUSTED",
          );
        case "WRONG_CODE":
          return errorResponse(
            "Incorrect code.",
            400,
            "WRONG_CODE",
          );
      }
    }

    return successResponse({
      tempPassword: outcome.tempPassword,
      username: outcome.username,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
