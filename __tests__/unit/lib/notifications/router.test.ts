import { describe, it, expect } from "vitest";
import { route } from "@/lib/notifications/router";

describe("notifications/router", () => {
  const contactBoth = {
    phone1: "0901234567",
    email: "lan@example.com",
    smsOptOut: false,
    emailOptOut: false,
  };
  const contactPhoneOnly = { ...contactBoth, email: null };
  const contactEmailOnly = { ...contactBoth, phone1: "" };

  it("picks SMS for SMS-only templates when phone present", () => {
    const r = route({ templateCode: "SMS_VISIT_REMINDER", contact: contactBoth });
    expect(r).toEqual([{ channel: "SMS", recipient: "0901234567" }]);
  });

  it("picks EMAIL for EMAIL-only templates when email present", () => {
    const r = route({ templateCode: "EMAIL_FILTER_DUE_D14", contact: contactBoth });
    expect(r).toEqual([{ channel: "EMAIL", recipient: "lan@example.com" }]);
  });

  it("falls back from email to SMS for transactional EMAIL-only when no email", () => {
    const r = route({
      templateCode: "EMAIL_FILTER_DUE_D14",
      contact: contactPhoneOnly,
    });
    expect(r).toEqual([
      { channel: "SMS", recipient: "0901234567", fallback: true },
    ]);
  });

  it("falls back from SMS to email for transactional SMS-only when no phone", () => {
    const r = route({
      templateCode: "SMS_VISIT_REMINDER",
      contact: contactEmailOnly,
    });
    expect(r).toEqual([
      { channel: "EMAIL", recipient: "lan@example.com", fallback: true },
    ]);
  });

  it("returns [] when no deliverable channel available", () => {
    const r = route({
      templateCode: "SMS_VISIT_REMINDER",
      contact: { phone1: "", email: null, smsOptOut: false, emailOptOut: false },
    });
    expect(r).toEqual([]);
  });

  it("respects smsOptOut for transactional templates", () => {
    const r = route({
      templateCode: "SMS_VISIT_REMINDER",
      contact: { ...contactBoth, smsOptOut: true },
    });
    // With email present, falls back to email since SMS was opted out.
    expect(r).toEqual([
      { channel: "EMAIL", recipient: "lan@example.com", fallback: true },
    ]);
  });

  it("respects emailOptOut for transactional templates", () => {
    const r = route({
      templateCode: "EMAIL_FILTER_DUE_D14",
      contact: { ...contactBoth, emailOptOut: true },
    });
    expect(r).toEqual([
      { channel: "SMS", recipient: "0901234567", fallback: true },
    ]);
  });

  it("ignores opt-out for SYSTEM category (password reset)", () => {
    const r = route({
      templateCode: "SMS_PASSWORD_RESET",
      contact: { ...contactBoth, smsOptOut: true, emailOptOut: true },
    });
    expect(r).toEqual([{ channel: "SMS", recipient: "0901234567" }]);
  });

  it("ignores opt-out for SYSTEM category (portal welcome SMS)", () => {
    const r = route({
      templateCode: "SMS_PORTAL_WELCOME",
      contact: { ...contactBoth, smsOptOut: true },
    });
    expect(r).toEqual([{ channel: "SMS", recipient: "0901234567" }]);
  });

  it("ignores opt-out for SYSTEM category (receipt email)", () => {
    const r = route({
      templateCode: "EMAIL_RECEIPT",
      contact: { ...contactBoth, emailOptOut: true },
    });
    expect(r).toEqual([{ channel: "EMAIL", recipient: "lan@example.com" }]);
  });

  it("never falls back to email for SMS_PASSWORD_RESET (no-fallback list)", () => {
    const r = route({
      templateCode: "SMS_PASSWORD_RESET",
      contact: contactEmailOnly,
    });
    expect(r).toEqual([]);
  });

  it("throws on unknown template code", () => {
    expect(() =>
      route({ templateCode: "UNKNOWN_CODE", contact: contactBoth }),
    ).toThrow(/Unknown notification template/);
  });
});
