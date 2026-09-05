/**
 * POST /api/portal/auth/password-reset — UC-AU-07.
 *
 * Self-service password reset for portal users. Phone + name combo identifies
 * the contact (name match guards against random-phone enumeration). On success
 * we generate a 10-char password, hash it, set `mustChangePassword=true`, and
 * fire SMS_PASSWORD_RESET via the mock provider. Response is always generic
 * ("if account exists, SMS sent") so attackers can't enumerate phones.
 *
 * Per the channel matrix (CLAUDE.md), password reset is intentionally
 * SMS-only — even if email is set, this template is category=SYSTEM and uses
 * the no-fallback flag in `router.ts`.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  generateRandomPassword,
  hashPassword,
} from "@/lib/auth/password";
import { portalForgotPasswordSchema } from "@/lib/validators/portalAuth";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications/send";
import type { NotificationLocale } from "@/lib/notifications/types";
import { HQ_PHONE } from "@/lib/config/company";

const PORTAL_URL = "portal.jakeshomeappliances.com.vn";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = portalForgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const { phone, name } = parsed.data;

    // We deliberately return generic success regardless of match — this is
    // the standard "no enumeration" pattern.
    const genericResponse = successResponse({
      ok: true,
      message: "If a portal account exists for this phone, an SMS has been sent.",
    });

    const matches = await prisma.customerContact.findMany({
      where: { phone1: phone, portalEnabled: true },
      select: {
        id: true,
        customerId: true,
        name: true,
        phone1: true,
        email: true,
        language: true,
        smsOptOut: true,
        emailOptOut: true,
      },
    });

    // Loose name match — strip whitespace, casefold. Vietnamese names with
    // diacritics keep their case-folded form intact; this is good enough for
    // a self-service reset (the real validation is "they got the SMS").
    const target = matches.find(
      (m) => m.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );

    if (!target) {
      await logAudit({
        actorType: "SYSTEM",
        action: "PORTAL_PASSWORD_RESET_REQUEST_FAILED",
        entityType: "CustomerContact",
        after: { phone, reason: "NO_MATCH" },
        request,
      });
      return genericResponse;
    }

    const newPassword = generateRandomPassword(10);
    const passwordHash = await hashPassword(newPassword);

    await prisma.customerContact.update({
      where: { id: target.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    // Revoke all existing sessions — any device holding an old token loses
    // its session immediately. Customer must re-login with new pw.
    await prisma.customerSession.updateMany({
      where: { contactId: target.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await sendNotification({
      templateCode: "SMS_PASSWORD_RESET",
      contactOverride: {
        customerId: target.customerId,
        contactId: target.id,
        phone1: target.phone1,
        email: target.email,
        smsOptOut: target.smsOptOut,
        emailOptOut: target.emailOptOut,
        language: target.language as NotificationLocale,
      },
      vars: {
        name: target.name,
        pwd: newPassword,
        url: PORTAL_URL,
        hq_phone: HQ_PHONE,
      },
      actorType: "SYSTEM",
    });

    await logAudit({
      actorType: "SYSTEM",
      actorId: target.id,
      action: "PORTAL_PASSWORD_RESET_REQUESTED",
      entityType: "CustomerContact",
      entityId: target.id,
      after: { byCustomer: true },
      request,
    });

    return genericResponse;
  } catch (err) {
    return toErrorResponse(err);
  }
}
