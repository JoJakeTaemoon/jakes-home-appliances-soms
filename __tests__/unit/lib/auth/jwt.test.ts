import { describe, it, expect, beforeAll } from "vitest";
import {
  signStaffAccessToken,
  signCustomerAccessToken,
  verifyAccessToken,
  signStaffRefreshToken,
  verifyRefreshToken,
  unsafeDecodeJwt,
} from "@/lib/auth/jwt";

beforeAll(() => {
  process.env.JWT_SECRET ??=
    "test-jwt-secret-please-do-not-use-in-real-deployments-0000000000";
  process.env.REFRESH_SECRET ??=
    "test-refresh-secret-please-do-not-use-in-real-deployments-0000000";
});

describe("auth/jwt", () => {
  describe("staff access token", () => {
    it("round-trips with staff audience", async () => {
      const token = await signStaffAccessToken({
        userId: "user-1",
        username: "admin",
        role: "ADMIN",
      });
      const payload = await verifyAccessToken(token, "staff");
      expect(payload.sub).toBe("user-1");
      expect(payload.username).toBe("admin");
      expect(payload.role).toBe("ADMIN");
      expect(payload.aud).toBe("staff");
      expect(typeof payload.iat).toBe("number");
      expect(typeof payload.exp).toBe("number");
    });

    it("rejects when verified as customer audience", async () => {
      const token = await signStaffAccessToken({
        userId: "user-1",
        username: "admin",
        role: "ADMIN",
      });
      await expect(verifyAccessToken(token, "customer")).rejects.toThrow();
    });
  });

  describe("customer access token", () => {
    it("round-trips with customer audience", async () => {
      const token = await signCustomerAccessToken({
        contactId: "contact-1",
        customerId: "cust-1",
        contactRole: "CONTRACT_PARTY",
      });
      const payload = await verifyAccessToken(token, "customer");
      expect(payload.sub).toBe("contact-1");
      expect(payload.customerId).toBe("cust-1");
      expect(payload.contactRole).toBe("CONTRACT_PARTY");
      expect(payload.aud).toBe("customer");
    });

    it("rejects when verified as staff audience", async () => {
      const token = await signCustomerAccessToken({
        contactId: "contact-1",
        customerId: "cust-1",
        contactRole: "OPS_CONTACT",
      });
      await expect(verifyAccessToken(token, "staff")).rejects.toThrow();
    });
  });

  describe("refresh tokens", () => {
    it("round-trips with sessionId claim", async () => {
      const token = await signStaffRefreshToken({
        userId: "user-9",
        sessionId: "sess-9",
      });
      const claims = await verifyRefreshToken(token, "staff");
      expect(claims.sub).toBe("user-9");
      expect(claims.sid).toBe("sess-9");
      expect(claims.aud).toBe("staff");
    });

    it("rejects access token when used as a refresh token", async () => {
      const accessToken = await signStaffAccessToken({
        userId: "user-1",
        username: "admin",
        role: "ADMIN",
      });
      // Different secret → signature verification must fail.
      await expect(verifyRefreshToken(accessToken, "staff")).rejects.toThrow();
    });
  });

  describe("unsafeDecodeJwt", () => {
    it("returns null for malformed input", () => {
      expect(unsafeDecodeJwt("not-a-jwt")).toBeNull();
      expect(unsafeDecodeJwt("")).toBeNull();
    });

    it("decodes payload claims without verification", async () => {
      const token = await signStaffAccessToken({
        userId: "u-1",
        username: "u",
        role: "STAFF",
      });
      const claims = unsafeDecodeJwt<{ aud: string; role: string }>(token);
      expect(claims?.aud).toBe("staff");
      expect(claims?.role).toBe("STAFF");
    });
  });
});
