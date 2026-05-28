/**
 * Staff self-service password recovery.
 *
 * Two-step flow:
 *   1. `requestRecoveryCode({ phone })` — generates a 6-digit code, hashes
 *      it onto the User row with a 10-minute expiry, fires `SMS_STAFF_RESET_CODE`
 *      via the SMS provider, and returns silently (no enumeration leak).
 *   2. `verifyRecoveryCode({ phone, code })` — validates the code, rotates
 *      `passwordHash` to a fresh 10-char temp password (returned plaintext
 *      to be displayed on-screen ONE TIME), sets `mustChangePassword=true`,
 *      revokes every active Session, and clears the recovery fields.
 *
 * Rate-limit: max 1 request / 60s per phone, 5 verify attempts before the
 * code is invalidated and a fresh request is required.
 */

import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import {
  hashPassword,
  generateRandomPassword,
} from "@/lib/auth/password";
import { getNotificationProvider } from "@/lib/notifications";
import {
  getTemplate,
  pickLocaleBody,
  renderTemplate,
} from "@/lib/notifications/templates";
import { logAudit } from "@/lib/audit";
import type { NotificationLocale } from "@/lib/notifications/types";

export const RECOVERY_CODE_TTL_MS = 10 * 60 * 1000; // 10 min
export const RECOVERY_REQUEST_THROTTLE_MS = 60 * 1000; // 1 min
export const RECOVERY_MAX_ATTEMPTS = 5;

const CODE_SALT_ROUNDS = 8; // cheaper than passwordHash — code is short-lived
const TEMP_PASSWORD_LENGTH = 10;

/** Normalize "+84-90-000-0001" / "0900000001" / " 090 000 0001 " → "0900000001". */
export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

/** Cryptographically random 6-digit numeric code (000000–999999). */
export function generateRecoveryCode(): string {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0] % 1_000_000).toString().padStart(6, "0");
}

export interface RequestRecoveryInput {
  phone: string;
  /** UI locale of the requester. Drives the SMS body language. Defaults to "vi". */
  locale?: NotificationLocale;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export type RequestRecoveryOutcome =
  | { ok: true; expiresInMinutes: number }
  | { ok: false; reason: "THROTTLED"; retryAfterMs: number }
  | { ok: false; reason: "UNKNOWN" };

/**
 * Generate + dispatch a recovery code. Returns `{ ok: false, reason: "UNKNOWN" }`
 * for unknown phones — but the route handler should still respond 200 to
 * prevent account-enumeration. THROTTLED is also a non-leak (we just delay).
 */
export async function requestRecoveryCode(
  input: RequestRecoveryInput,
): Promise<RequestRecoveryOutcome> {
  const phone = normalizePhone(input.phone);
  const user = await prisma.user.findUnique({
    where: { phone },
    select: {
      id: true,
      username: true,
      phone: true,
      status: true,
      passwordResetLastRequestAt: true,
    },
  });

  if (!user || user.status !== "ACTIVE") {
    return { ok: false, reason: "UNKNOWN" };
  }

  // Throttle: 1 request per minute. Counts against the user, not the IP — an
  // attacker spamming from many IPs still hits the per-user wall.
  if (user.passwordResetLastRequestAt) {
    const elapsed =
      Date.now() - user.passwordResetLastRequestAt.getTime();
    if (elapsed < RECOVERY_REQUEST_THROTTLE_MS) {
      return {
        ok: false,
        reason: "THROTTLED",
        retryAfterMs: RECOVERY_REQUEST_THROTTLE_MS - elapsed,
      };
    }
  }

  const code = generateRecoveryCode();
  const codeHash = await bcrypt.hash(code, CODE_SALT_ROUNDS);
  const expiresAt = new Date(Date.now() + RECOVERY_CODE_TTL_MS);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetCodeHash: codeHash,
      passwordResetCodeExpiresAt: expiresAt,
      passwordResetAttempts: 0,
      passwordResetLastRequestAt: new Date(),
    },
  });

  // Dispatch via SMS provider. Locale comes from the requester's UI
  // (passed by the forgot-password client); falls back to vi if the
  // caller forgot to supply one. Staff don't have a per-user language
  // preference stored on User yet — that's a future enhancement.
  const locale: NotificationLocale = input.locale ?? "vi";
  const tmpl = getTemplate("SMS_STAFF_RESET_CODE");
  const body = renderTemplate(pickLocaleBody(tmpl, locale), {
    code,
    minutes: Math.floor(RECOVERY_CODE_TTL_MS / 60_000).toString(),
  });
  const provider = getNotificationProvider("SMS");
  try {
    await provider.send({
      channel: "SMS",
      to: user.phone,
      templateCode: tmpl.code,
      locale,
      body,
      contactId: null,
      customerId: null,
      vars: { code, minutes: "10" },
    });
  } catch (err) {
    console.error("[recovery] SMS dispatch failed", err);
    // We still proceed — the user can re-request. Don't leak failure to UI.
  }

  await logAudit({
    actorType: "SYSTEM",
    actorId: user.id,
    action: "PASSWORD_RESET_REQUEST",
    entityType: "User",
    entityId: user.id,
    after: {
      phone: user.phone,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  return { ok: true, expiresInMinutes: Math.floor(RECOVERY_CODE_TTL_MS / 60_000) };
}

export interface VerifyRecoveryInput {
  phone: string;
  code: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export type VerifyRecoveryOutcome =
  | { ok: true; tempPassword: string; username: string }
  | { ok: false; reason: "NO_CODE" | "EXPIRED" | "WRONG_CODE" | "EXHAUSTED" };

/**
 * Validate the code. On success: rotate the user's password to a fresh
 * random temp string (returned plaintext for one-time display), flag
 * `mustChangePassword=true`, and kill every active session.
 */
export async function verifyRecoveryCode(
  input: VerifyRecoveryInput,
): Promise<VerifyRecoveryOutcome> {
  const phone = normalizePhone(input.phone);
  const user = await prisma.user.findUnique({
    where: { phone },
    select: {
      id: true,
      username: true,
      status: true,
      passwordResetCodeHash: true,
      passwordResetCodeExpiresAt: true,
      passwordResetAttempts: true,
    },
  });

  if (!user || user.status !== "ACTIVE" || !user.passwordResetCodeHash) {
    return { ok: false, reason: "NO_CODE" };
  }
  if (
    !user.passwordResetCodeExpiresAt ||
    user.passwordResetCodeExpiresAt.getTime() <= Date.now()
  ) {
    return { ok: false, reason: "EXPIRED" };
  }
  if (user.passwordResetAttempts >= RECOVERY_MAX_ATTEMPTS) {
    // Wipe the code so further verify attempts fall through to NO_CODE.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetCodeHash: null,
        passwordResetCodeExpiresAt: null,
        passwordResetAttempts: 0,
      },
    });
    return { ok: false, reason: "EXHAUSTED" };
  }

  const match = await bcrypt.compare(input.code, user.passwordResetCodeHash);
  if (!match) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetAttempts: { increment: 1 } },
    });
    await logAudit({
      actorType: "SYSTEM",
      actorId: user.id,
      action: "PASSWORD_RESET_VERIFY_FAILED",
      entityType: "User",
      entityId: user.id,
      after: {
        attempts: user.passwordResetAttempts + 1,
        ipAddress: input.ipAddress ?? null,
      },
    });
    return { ok: false, reason: "WRONG_CODE" };
  }

  // ── success — rotate password + revoke sessions ─────────────────────
  const tempPassword = generateRandomPassword(TEMP_PASSWORD_LENGTH);
  const newHash = await hashPassword(tempPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        mustChangePassword: true,
        passwordResetCodeHash: null,
        passwordResetCodeExpiresAt: null,
        passwordResetAttempts: 0,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
    prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await logAudit({
    actorType: "SYSTEM",
    actorId: user.id,
    action: "PASSWORD_RESET_COMPLETE",
    entityType: "User",
    entityId: user.id,
    after: {
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  return { ok: true, tempPassword, username: user.username };
}
