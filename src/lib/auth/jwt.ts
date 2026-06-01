/**
 * JWT signing + verification using jose (Edge-compatible).
 *
 * Three audiences:
 *   - `aud='staff'`    — Office HQ staff (ADMIN / MANAGER / STAFF). The legacy
 *                       name `staff` is kept for backward-compat during the
 *                       3-realm migration; it will be renamed to `office` in
 *                       a follow-up commit once the page tree + middleware
 *                       are also moved.
 *   - `aud='field'`    — Field technicians (TECHNICIAN). Mobile-first realm.
 *   - `aud='customer'` — CustomerContact portal accounts.
 *
 * Access tokens use JWT_SECRET, refresh tokens use REFRESH_SECRET. Keeping
 * the secrets separate means a leaked access token cannot be used to forge
 * a refresh and vice-versa.
 *
 * TTLs (per CLAUDE.md / SPEC):
 *   - Staff (office) : access 15min, refresh 7d
 *   - Field          : access 15min, refresh 7d
 *   - Customer       : access 15min, refresh 30d
 */

import { SignJWT, jwtVerify } from "jose";

export type JwtAudience = "staff" | "field" | "customer";

export interface StaffJwtPayload {
  sub: string;            // User.id
  username: string;
  role: string;           // StaffRole — ADMIN | MANAGER | STAFF
  aud: "staff";
  iat?: number;
  exp?: number;
}

export interface FieldJwtPayload {
  sub: string;            // User.id
  username: string;
  role: string;           // StaffRole — TECHNICIAN only
  aud: "field";
  iat?: number;
  exp?: number;
}

export interface CustomerJwtPayload {
  sub: string;            // CustomerContact.id
  customerId: string;
  contactRole: string;    // CONTRACT_PARTY | OPS_CONTACT
  aud: "customer";
  iat?: number;
  exp?: number;
}

export type AnyJwtPayload =
  | StaffJwtPayload
  | FieldJwtPayload
  | CustomerJwtPayload;

// ── secret helpers ─────────────────────────────────────────────────────

function getSecret(kind: "access" | "refresh"): Uint8Array {
  const envName = kind === "access" ? "JWT_SECRET" : "REFRESH_SECRET";
  const secret = process.env[envName];
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`${envName} is not set`);
    }
    console.warn(`[auth/jwt] ${envName} not set — using dev fallback`);
    return new TextEncoder().encode(`dev-fallback-${kind}-secret-do-not-use-in-production`);
  }
  return new TextEncoder().encode(secret);
}

async function importHmacKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// ── TTL constants ──────────────────────────────────────────────────────

export const STAFF_ACCESS_TTL = "15m";
export const STAFF_REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;        // 7 days
export const FIELD_ACCESS_TTL = "15m";
export const FIELD_REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;        // 7 days
export const CUSTOMER_ACCESS_TTL = "15m";
export const CUSTOMER_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;    // 30 days

// ── Access tokens ──────────────────────────────────────────────────────

export async function signStaffAccessToken(payload: {
  userId: string;
  username: string;
  role: string;
}): Promise<string> {
  const key = await importHmacKey(getSecret("access"));
  return new SignJWT({ username: payload.username, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setAudience("staff")
    .setIssuedAt()
    .setExpirationTime(STAFF_ACCESS_TTL)
    .sign(key);
}

export async function signFieldAccessToken(payload: {
  userId: string;
  username: string;
  role: string;
}): Promise<string> {
  const key = await importHmacKey(getSecret("access"));
  return new SignJWT({ username: payload.username, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setAudience("field")
    .setIssuedAt()
    .setExpirationTime(FIELD_ACCESS_TTL)
    .sign(key);
}

export async function signCustomerAccessToken(payload: {
  contactId: string;
  customerId: string;
  contactRole: string;
}): Promise<string> {
  const key = await importHmacKey(getSecret("access"));
  return new SignJWT({
    customerId: payload.customerId,
    contactRole: payload.contactRole,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.contactId)
    .setAudience("customer")
    .setIssuedAt()
    .setExpirationTime(CUSTOMER_ACCESS_TTL)
    .sign(key);
}

type PayloadByAudience<A extends JwtAudience> =
  A extends "staff" ? StaffJwtPayload :
  A extends "field" ? FieldJwtPayload :
  CustomerJwtPayload;

export async function verifyAccessToken<A extends JwtAudience>(
  token: string,
  audience: A,
): Promise<PayloadByAudience<A>> {
  const key = await importHmacKey(getSecret("access"));
  const { payload } = await jwtVerify(token, key, { audience });

  if (audience === "staff") {
    return {
      sub: payload.sub as string,
      username: payload.username as string,
      role: payload.role as string,
      aud: "staff",
      iat: payload.iat,
      exp: payload.exp,
    } as PayloadByAudience<A>;
  }
  if (audience === "field") {
    return {
      sub: payload.sub as string,
      username: payload.username as string,
      role: payload.role as string,
      aud: "field",
      iat: payload.iat,
      exp: payload.exp,
    } as PayloadByAudience<A>;
  }
  return {
    sub: payload.sub as string,
    customerId: payload.customerId as string,
    contactRole: payload.contactRole as string,
    aud: "customer",
    iat: payload.iat,
    exp: payload.exp,
  } as PayloadByAudience<A>;
}

// ── Refresh tokens ─────────────────────────────────────────────────────
//
// Refresh tokens are opaque to clients but we still sign them as JWTs so a
// stolen cookie can't be forged. The DB Session row is the source of truth
// for revocation — we always look it up before honouring a refresh.

export async function signStaffRefreshToken(payload: {
  userId: string;
  sessionId: string;
}): Promise<string> {
  const key = await importHmacKey(getSecret("refresh"));
  return new SignJWT({ sid: payload.sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setAudience("staff")
    .setIssuedAt()
    .setExpirationTime(`${STAFF_REFRESH_TTL_SECONDS}s`)
    .sign(key);
}

export async function signFieldRefreshToken(payload: {
  userId: string;
  sessionId: string;
}): Promise<string> {
  const key = await importHmacKey(getSecret("refresh"));
  return new SignJWT({ sid: payload.sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setAudience("field")
    .setIssuedAt()
    .setExpirationTime(`${FIELD_REFRESH_TTL_SECONDS}s`)
    .sign(key);
}

export async function signCustomerRefreshToken(payload: {
  contactId: string;
  sessionId: string;
}): Promise<string> {
  const key = await importHmacKey(getSecret("refresh"));
  return new SignJWT({ sid: payload.sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.contactId)
    .setAudience("customer")
    .setIssuedAt()
    .setExpirationTime(`${CUSTOMER_REFRESH_TTL_SECONDS}s`)
    .sign(key);
}

export interface RefreshTokenClaims {
  sub: string;
  sid: string;
  aud: JwtAudience;
  exp?: number;
  iat?: number;
}

export async function verifyRefreshToken(
  token: string,
  audience: JwtAudience,
): Promise<RefreshTokenClaims> {
  const key = await importHmacKey(getSecret("refresh"));
  const { payload } = await jwtVerify(token, key, { audience });
  return {
    sub: payload.sub as string,
    sid: payload.sid as string,
    aud: audience,
    exp: payload.exp,
    iat: payload.iat,
  };
}

// ── Convenience: shallow JWT decode without verification ──────────────
// Used by middleware to read aud without paying the verify cost when we'll
// re-verify downstream anyway. Returns null on any parse failure.

export function unsafeDecodeJwt<T = Record<string, unknown>>(token: string): T | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const padded = payload + "===".slice((payload.length + 3) % 4);
    const json = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
