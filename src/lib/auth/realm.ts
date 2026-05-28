/**
 * AuthRealm — the parameterised seam between staff auth and customer auth.
 *
 * Refactor B (architectural deepening) collapsed two mirror modules into
 * one shared core. The four things that actually differ between staff and
 * customer auth — cookie names, JWT audience, refresh TTL, and the DB
 * resolver / lockout / session storage — are captured by this interface.
 *
 * Two concrete realms ship in `realms/`:
 *   - `staffRealm`    — backed by `User` + `Session` + `LoginAttempt`
 *   - `customerRealm` — backed by `CustomerContact` + `CustomerSession`
 *                       (no LoginAttempt equivalent — counter on the row).
 *
 * All other mechanics (token signing, sliding-window lockout, session
 * rotation, refresh flow, cookie attributes) are realm-agnostic and live
 * in `core/`. A single bug fix or policy change now applies to both
 * audiences automatically.
 */

import type { NextResponse } from "next/server";
import type { JwtAudience } from "@/lib/auth/jwt";

/** Discriminator for which authentication audience a realm represents. */
export type Audience = JwtAudience;

/**
 * Lockout numerics — currently identical for both realms (5 fails / 15min
 * window / 15min lock). Codified here so the core helpers don't have to
 * import realm-side constants.
 */
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/**
 * Lockout counters live on the actor row itself (User.failedLoginCount /
 * CustomerContact.failedLoginCount) — same shape across realms.
 */
export interface LockoutCounters {
  failedLoginCount: number;
  lockedUntil: Date | null;
}

/**
 * Forensic context passed to lockout / session helpers. Optional; the realm
 * decides whether to persist any of it (staff persists to LoginAttempt;
 * customer relies on AuditLog at the route level).
 */
export interface AttemptContext {
  identifier: string; // username or phone — used for forensics
  actorId: string | null; // null when identifier is unknown
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Validated session row as the core needs to see it. */
export interface SessionRecord {
  id: string;
  actorId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Per-realm session storage adapter. */
export interface AuthRealmSession {
  /**
   * Insert a new session row with the given refresh token, returning the
   * persisted id. Implementations can do their own two-step (placeholder
   * insert → real refresh-token update) to keep cuid generation DB-side.
   */
  create(args: {
    actorId: string;
    refreshToken: string;
    userAgent?: string | null;
    ipAddress?: string | null;
    expiresAt: Date;
  }): Promise<{ id: string }>;
  /** Update the refresh-token value on an existing row (used by two-step create). */
  updateRefreshToken(sessionId: string, refreshToken: string): Promise<void>;
  /** Return non-expired, non-revoked session by refresh token, or null. */
  findValid(refreshToken: string): Promise<SessionRecord | null>;
  /** Mark a session revoked. Returns true iff a row was updated. */
  revoke(refreshToken: string): Promise<boolean>;
  /** Mass-revoke all active sessions for an actor. Returns affected count. */
  revokeAllForActor(actorId: string): Promise<number>;
  /**
   * Composite "rotate" so each realm can do the revoke + create atomically
   * in a single $transaction. Returns the new session row id + actorId.
   */
  rotate(args: {
    oldSessionId: string;
    actorId: string;
    placeholder: string;
    userAgent?: string | null;
    ipAddress?: string | null;
    expiresAt: Date;
  }): Promise<{ id: string; actorId: string }>;
}

/** Per-realm lockout storage adapter. */
export interface AuthRealmLockout {
  /**
   * Increment the failure counter and lock the account if threshold met.
   * Returns the post-update counters so callers can decide whether to
   * surface ACCOUNT_LOCKED instead of INVALID_CREDENTIALS on this attempt.
   *
   * Realm decides whether the counter is a sliding-window count (staff —
   * LoginAttempt rows within LOCKOUT_WINDOW_MS) or a naive increment
   * (customer — column on CustomerContact).
   */
  recordFailure(ctx: AttemptContext): Promise<LockoutCounters | null>;
  /**
   * Reset the failure counter, clear lockout, stamp last-login. Returns
   * after the write completes.
   */
  recordSuccess(ctx: AttemptContext): Promise<void>;
  /**
   * Load the live counter row by actor id (used by hot-path lockout checks
   * after a failed password verify, before we know if this attempt tripped
   * the threshold).
   */
  loadCounters(actorId: string): Promise<LockoutCounters | null>;
}

/**
 * An AuthRealm bundles every realm-specific knob the core needs.
 *
 * @typeParam TActor - The shape of the hydrated actor returned to guards.
 *                     Staff returns AuthenticatedStaff; customer returns
 *                     AuthenticatedCustomer. Both extend their respective
 *                     JWT payloads with fresh DB fields.
 */
export interface AuthRealm<TActor> {
  readonly audience: Audience;

  /** Cookie name for the (short-lived) access token. */
  readonly accessCookie: string;
  /** Cookie name for the long-lived refresh token. */
  readonly refreshCookie: string;

  /** Access cookie max-age in seconds (matches the JWT exp). */
  readonly accessTtlSec: number;
  /** Refresh cookie max-age in seconds (matches the JWT exp + Session.expiresAt). */
  readonly refreshTtlSec: number;

  /** Mint a fresh access token for an actor — wraps the realm-specific JWT signer. */
  signAccessToken(actor: TActor): Promise<string>;

  /** Mint a fresh refresh token bound to a sessionId. */
  signRefreshToken(args: { actorId: string; sessionId: string }): Promise<string>;

  /**
   * Verify an access token and hydrate the actor from the DB. Returns null
   * if the token is invalid, the actor disabled, or anything else that
   * should produce 401. Throwing is fine too — the guard catches both.
   */
  hydrateFromAccessToken(token: string): Promise<TActor | null>;

  /**
   * After a successful refresh-rotate we re-hydrate the actor from the
   * session row. Returns null if the actor became inactive (e.g. portal
   * disabled while a refresh was in flight) so the route can clear cookies.
   */
  hydrateFromSessionId(sessionId: string): Promise<TActor | null>;

  /** Storage adapters. */
  readonly lockout: AuthRealmLockout;
  readonly session: AuthRealmSession;

  /**
   * Build response cookies for this realm. Pulled out so the core cookie
   * helpers don't have to know about realm-specific cookie names / TTLs.
   */
  setCookies(
    response: NextResponse,
    tokens: { accessToken: string; refreshToken: string },
  ): void;
  clearCookies(response: NextResponse): void;
}
