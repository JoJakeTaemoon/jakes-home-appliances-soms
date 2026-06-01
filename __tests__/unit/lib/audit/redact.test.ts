/**
 * RED — reader-side redaction for sensitive audit payload fields.
 *
 * `redact()` deep-walks an arbitrary value and replaces sensitive keys
 * (passwordHash / refreshTokenHash / resetCode / accessToken / refreshToken
 *  / recoveryCode + anything matching /Token$|Secret$/i) with the literal
 * mask string. Pure function: must return a new tree, never mutate input.
 */

import { describe, it, expect } from "vitest";
import { redact, REDACTED } from "@/lib/audit/redact";

describe("redact()", () => {
  it("returns primitives unchanged", () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
    expect(redact("hello")).toBe("hello");
    expect(redact(42)).toBe(42);
    expect(redact(true)).toBe(true);
  });

  it("masks known sensitive keys at the top level", () => {
    const input = {
      username: "jake",
      passwordHash: "$2b$10$abc",
      refreshTokenHash: "rt-hash",
      resetCode: "1234",
      accessToken: "jwt.payload.sig",
      refreshToken: "rt-raw",
      recoveryCode: "rec-1",
    };
    const out = redact(input) as Record<string, unknown>;
    expect(out.username).toBe("jake");
    expect(out.passwordHash).toBe(REDACTED);
    expect(out.refreshTokenHash).toBe(REDACTED);
    expect(out.resetCode).toBe(REDACTED);
    expect(out.accessToken).toBe(REDACTED);
    expect(out.refreshToken).toBe(REDACTED);
    expect(out.recoveryCode).toBe(REDACTED);
  });

  it("masks keys matching /Token$/i and /Secret$/i", () => {
    const input = {
      apiToken: "tok",
      authToken: "tok2",
      hmacSecret: "secret",
      clientSecret: "cs",
      tokenValue: "not-masked", // suffix doesn't match
      mySecretSauce: "not-masked", // suffix doesn't match
    };
    const out = redact(input) as Record<string, unknown>;
    expect(out.apiToken).toBe(REDACTED);
    expect(out.authToken).toBe(REDACTED);
    expect(out.hmacSecret).toBe(REDACTED);
    expect(out.clientSecret).toBe(REDACTED);
    expect(out.tokenValue).toBe("not-masked");
    expect(out.mySecretSauce).toBe("not-masked");
  });

  it("recurses into nested objects", () => {
    const input = {
      user: { username: "jake", passwordHash: "$2b$x" },
      meta: { tokens: { refreshToken: "rt" } },
    };
    const out = redact(input) as {
      user: { username: string; passwordHash: string };
      meta: { tokens: { refreshToken: string } };
    };
    expect(out.user.username).toBe("jake");
    expect(out.user.passwordHash).toBe(REDACTED);
    expect(out.meta.tokens.refreshToken).toBe(REDACTED);
  });

  it("recurses into arrays of objects", () => {
    const input = {
      sessions: [
        { id: "s1", refreshToken: "rt1" },
        { id: "s2", refreshToken: "rt2" },
      ],
    };
    const out = redact(input) as {
      sessions: Array<{ id: string; refreshToken: string }>;
    };
    expect(out.sessions).toHaveLength(2);
    expect(out.sessions[0].refreshToken).toBe(REDACTED);
    expect(out.sessions[1].refreshToken).toBe(REDACTED);
    expect(out.sessions[0].id).toBe("s1");
  });

  it("does NOT mutate the input", () => {
    const input = { passwordHash: "secret" };
    const before = JSON.stringify(input);
    redact(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("returns a new object reference", () => {
    const input = { a: 1 };
    expect(redact(input)).not.toBe(input);
  });

  it("preserves null/undefined nested values", () => {
    const input = { passwordHash: null, refreshToken: undefined, name: "x" };
    const out = redact(input) as Record<string, unknown>;
    // null/undefined sensitive values still get masked
    expect(out.passwordHash).toBe(REDACTED);
    expect(out.refreshToken).toBe(REDACTED);
    expect(out.name).toBe("x");
  });

  it("handles empty objects and arrays", () => {
    expect(redact({})).toEqual({});
    expect(redact([])).toEqual([]);
  });
});
