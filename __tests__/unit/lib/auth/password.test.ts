import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  comparePassword,
  generateRandomPassword,
} from "@/lib/auth/password";

describe("auth/password", () => {
  it("hashes are non-reversible and verify positively", async () => {
    const pw = "Sup3rSecret!";
    const hash = await hashPassword(pw);
    expect(hash).not.toBe(pw);
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword(pw, hash)).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const hash = await hashPassword("correct-horse");
    expect(await verifyPassword("wrong-horse", hash)).toBe(false);
  });

  it("comparePassword is an alias for verifyPassword", async () => {
    const hash = await hashPassword("alias-check");
    expect(await comparePassword("alias-check", hash)).toBe(true);
  });

  describe("generateRandomPassword", () => {
    it("defaults to length 10", () => {
      const pw = generateRandomPassword();
      expect(pw).toHaveLength(10);
    });

    it("respects custom length", () => {
      expect(generateRandomPassword(16)).toHaveLength(16);
      expect(generateRandomPassword(4)).toHaveLength(4);
    });

    it("uses an unambiguous alphabet (no 0/O/1/l/I)", () => {
      for (let i = 0; i < 50; i++) {
        const pw = generateRandomPassword(20);
        expect(pw).not.toMatch(/[0O1lI]/);
      }
    });

    it("produces different strings across calls", () => {
      const a = generateRandomPassword(20);
      const b = generateRandomPassword(20);
      expect(a).not.toBe(b);
    });

    it("throws for non-positive length", () => {
      expect(() => generateRandomPassword(0)).toThrow();
      expect(() => generateRandomPassword(-1)).toThrow();
    });
  });
});
