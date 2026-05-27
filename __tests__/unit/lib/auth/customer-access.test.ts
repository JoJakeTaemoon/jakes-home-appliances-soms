import { describe, it, expect } from "vitest";
import {
  canManageContact,
  canEditOwnProfile,
  canViewEquipmentAtSite,
  canSubmitServiceRequest,
  canDownloadInvoice,
} from "@/lib/auth/customer-access";

describe("auth/customer-access", () => {
  const customerId = "cust-1";
  const cp = {
    contactId: "c-cp",
    customerId,
    role: "CONTRACT_PARTY" as const,
    scope: "CUSTOMER" as const,
    siteId: null,
  };
  const primaryOpsSiteA = {
    contactId: "c-opsA",
    customerId,
    role: "OPS_CONTACT" as const,
    scope: "SITE" as const,
    siteId: "site-A",
    isPrimary: true,
  };
  const nonPrimaryOpsSiteA = {
    ...primaryOpsSiteA,
    contactId: "c-opsA2",
    isPrimary: false,
  };
  const opsSiteB = {
    ...primaryOpsSiteA,
    contactId: "c-opsB",
    siteId: "site-B",
  };

  it("CONTRACT_PARTY can manage any OPS in same customer", () => {
    const target = {
      id: "c-opsX",
      customerId,
      role: "OPS_CONTACT" as const,
      scope: "CUSTOMER" as const,
      siteId: null,
    };
    expect(canManageContact(cp, target)).toBe(true);
  });

  it("CONTRACT_PARTY cannot disable other CONTRACT_PARTY rows", () => {
    const other = {
      id: "c-cp2",
      customerId,
      role: "CONTRACT_PARTY" as const,
      scope: "CUSTOMER" as const,
      siteId: null,
    };
    expect(canManageContact(cp, other)).toBe(false);
  });

  it("CONTRACT_PARTY can manage own row (self-edit)", () => {
    expect(
      canManageContact(cp, {
        id: cp.contactId,
        customerId,
        role: "CONTRACT_PARTY",
        scope: "CUSTOMER",
        siteId: null,
      }),
    ).toBe(true);
  });

  it("primary site OPS can manage same-site OPS only", () => {
    const sameSiteOps = {
      id: "c-opsA3",
      customerId,
      role: "OPS_CONTACT" as const,
      scope: "SITE" as const,
      siteId: "site-A",
    };
    expect(canManageContact(primaryOpsSiteA, sameSiteOps)).toBe(true);

    // Different site is denied
    const otherSiteOps = { ...sameSiteOps, id: "c-opsB1", siteId: "site-B" };
    expect(canManageContact(primaryOpsSiteA, otherSiteOps)).toBe(false);
  });

  it("non-primary OPS cannot manage any contact", () => {
    const target = {
      id: "c-other",
      customerId,
      role: "OPS_CONTACT" as const,
      scope: "SITE" as const,
      siteId: "site-A",
    };
    expect(canManageContact(nonPrimaryOpsSiteA, target)).toBe(false);
  });

  it("denies cross-customer management", () => {
    const target = {
      id: "c-foreign",
      customerId: "other-customer",
      role: "OPS_CONTACT" as const,
      scope: "CUSTOMER" as const,
      siteId: null,
    };
    expect(canManageContact(cp, target)).toBe(false);
  });

  it("canEditOwnProfile only allows self", () => {
    expect(
      canEditOwnProfile(cp, {
        id: cp.contactId,
        customerId,
        role: "CONTRACT_PARTY",
        scope: "CUSTOMER",
        siteId: null,
      }),
    ).toBe(true);
    expect(
      canEditOwnProfile(cp, {
        id: "other",
        customerId,
        role: "OPS_CONTACT",
        scope: "CUSTOMER",
        siteId: null,
      }),
    ).toBe(false);
  });

  it("CONTRACT_PARTY can view equipment at any site", () => {
    expect(canViewEquipmentAtSite(cp, "site-A")).toBe(true);
    expect(canViewEquipmentAtSite(cp, null)).toBe(true);
  });

  it("SITE-scoped OPS only sees their site (and site-less equipment)", () => {
    expect(canViewEquipmentAtSite(primaryOpsSiteA, "site-A")).toBe(true);
    expect(canViewEquipmentAtSite(primaryOpsSiteA, "site-B")).toBe(false);
    expect(canViewEquipmentAtSite(primaryOpsSiteA, null)).toBe(true);

    expect(canViewEquipmentAtSite(opsSiteB, "site-A")).toBe(false);
    expect(canViewEquipmentAtSite(opsSiteB, "site-B")).toBe(true);
  });

  it("anyone may submit service request", () => {
    expect(canSubmitServiceRequest(cp)).toBe(true);
    expect(canSubmitServiceRequest(opsSiteB)).toBe(true);
  });

  it("invoice download is B2B-only", () => {
    expect(canDownloadInvoice({ ...cp, customerType: "B2C" })).toBe(false);
    expect(canDownloadInvoice({ ...cp, customerType: "B2B" })).toBe(true);
    expect(canDownloadInvoice({ ...cp })).toBe(true); // unspecified type defaults to allow
  });
});
