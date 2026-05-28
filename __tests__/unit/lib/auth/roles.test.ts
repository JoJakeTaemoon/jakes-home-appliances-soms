import { describe, it, expect } from "vitest";
import {
  isStaffRole,
  isOfficeRole,
  isTechnicianRole,
  getRoleLevel,
  getAssignableRoles,
  canAssignRole,
  canResetPassword,
  canResetCustomerPassword,
  canManageStaff,
  canApproveOps,
} from "@/lib/auth/roles";

describe("auth/roles", () => {
  describe("isStaffRole", () => {
    it("accepts ADMIN / MANAGER / STAFF / TECHNICIAN", () => {
      expect(isStaffRole("ADMIN")).toBe(true);
      expect(isStaffRole("MANAGER")).toBe(true);
      expect(isStaffRole("STAFF")).toBe(true);
      expect(isStaffRole("TECHNICIAN")).toBe(true);
    });
    it("rejects unknown roles", () => {
      expect(isStaffRole("DIRECTOR")).toBe(false);
      expect(isStaffRole("")).toBe(false);
    });
  });

  describe("isOfficeRole", () => {
    it("is true for ADMIN/MANAGER/STAFF only", () => {
      expect(isOfficeRole("ADMIN")).toBe(true);
      expect(isOfficeRole("MANAGER")).toBe(true);
      expect(isOfficeRole("STAFF")).toBe(true);
    });
    it("is false for TECHNICIAN (the rule per spec)", () => {
      expect(isOfficeRole("TECHNICIAN")).toBe(false);
    });
    it("is false for unknown roles", () => {
      expect(isOfficeRole("CUSTOMER")).toBe(false);
    });
  });

  describe("isTechnicianRole", () => {
    it("only TECHNICIAN is true", () => {
      expect(isTechnicianRole("TECHNICIAN")).toBe(true);
      expect(isTechnicianRole("ADMIN")).toBe(false);
      expect(isTechnicianRole("STAFF")).toBe(false);
    });
  });

  describe("getRoleLevel", () => {
    it("places ADMIN above MANAGER above STAFF", () => {
      expect(getRoleLevel("ADMIN")).toBeLessThan(getRoleLevel("MANAGER"));
      expect(getRoleLevel("MANAGER")).toBeLessThan(getRoleLevel("STAFF"));
    });
    it("places TECHNICIAN outside the office hierarchy (Infinity)", () => {
      expect(getRoleLevel("TECHNICIAN")).toBe(Infinity);
    });
  });

  describe("getAssignableRoles + canAssignRole", () => {
    it("ADMIN can assign MANAGER / STAFF / TECHNICIAN", () => {
      expect(getAssignableRoles("ADMIN")).toEqual(["MANAGER", "STAFF", "TECHNICIAN"]);
      expect(canAssignRole("ADMIN", "MANAGER")).toBe(true);
      expect(canAssignRole("ADMIN", "STAFF")).toBe(true);
      expect(canAssignRole("ADMIN", "TECHNICIAN")).toBe(true);
      expect(canAssignRole("ADMIN", "ADMIN")).toBe(false);
    });
    it("MANAGER can assign STAFF / TECHNICIAN only", () => {
      expect(getAssignableRoles("MANAGER")).toEqual(["STAFF", "TECHNICIAN"]);
      expect(canAssignRole("MANAGER", "STAFF")).toBe(true);
      expect(canAssignRole("MANAGER", "TECHNICIAN")).toBe(true);
      expect(canAssignRole("MANAGER", "ADMIN")).toBe(false);
      expect(canAssignRole("MANAGER", "MANAGER")).toBe(false);
    });
    it("STAFF and TECHNICIAN cannot assign anyone", () => {
      expect(getAssignableRoles("STAFF")).toEqual([]);
      expect(getAssignableRoles("TECHNICIAN")).toEqual([]);
      expect(canAssignRole("STAFF", "STAFF")).toBe(false);
      expect(canAssignRole("TECHNICIAN", "STAFF")).toBe(false);
    });
  });

  describe("canResetPassword (staff -> staff)", () => {
    it("ADMIN can reset MANAGER/STAFF/TECHNICIAN but not another ADMIN", () => {
      expect(canResetPassword("ADMIN", "MANAGER")).toBe(true);
      expect(canResetPassword("ADMIN", "STAFF")).toBe(true);
      expect(canResetPassword("ADMIN", "TECHNICIAN")).toBe(true);
      expect(canResetPassword("ADMIN", "ADMIN")).toBe(false);
    });
    it("MANAGER can reset STAFF/TECHNICIAN only", () => {
      expect(canResetPassword("MANAGER", "STAFF")).toBe(true);
      expect(canResetPassword("MANAGER", "TECHNICIAN")).toBe(true);
      expect(canResetPassword("MANAGER", "MANAGER")).toBe(false);
      expect(canResetPassword("MANAGER", "ADMIN")).toBe(false);
    });
    it("STAFF and TECHNICIAN cannot reset anyone", () => {
      expect(canResetPassword("STAFF", "STAFF")).toBe(false);
      expect(canResetPassword("TECHNICIAN", "STAFF")).toBe(false);
    });
  });

  describe("canResetCustomerPassword + canApproveOps", () => {
    it("MANAGER+ only", () => {
      expect(canResetCustomerPassword("ADMIN")).toBe(true);
      expect(canResetCustomerPassword("MANAGER")).toBe(true);
      expect(canResetCustomerPassword("STAFF")).toBe(false);
      expect(canResetCustomerPassword("TECHNICIAN")).toBe(false);
      expect(canApproveOps("ADMIN")).toBe(true);
      expect(canApproveOps("MANAGER")).toBe(true);
      expect(canApproveOps("STAFF")).toBe(false);
    });
  });

  describe("canManageStaff", () => {
    it("ADMIN only", () => {
      expect(canManageStaff("ADMIN")).toBe(true);
      expect(canManageStaff("MANAGER")).toBe(false);
      expect(canManageStaff("STAFF")).toBe(false);
      expect(canManageStaff("TECHNICIAN")).toBe(false);
    });
  });
});
