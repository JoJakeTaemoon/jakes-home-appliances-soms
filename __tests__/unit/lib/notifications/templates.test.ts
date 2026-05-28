import { describe, it, expect } from "vitest";
import {
  TEMPLATES,
  getTemplate,
  pickLocaleBody,
  pickLocaleSubject,
  renderTemplate,
} from "@/lib/notifications/templates";

describe("notifications/templates", () => {
  it("includes every required SMS template code", () => {
    const required = [
      "SMS_PORTAL_WELCOME",
      "SMS_PASSWORD_RESET",
      "SMS_VISIT_REMINDER",
      "SMS_SR_APPROVED",
      "SMS_SR_REJECTED",
      "SMS_PAYMENT_OVERDUE_FINAL",
      "SMS_CONTRACT_RENEWAL_FINAL",
    ];
    for (const code of required) {
      expect(TEMPLATES[code], `${code} missing`).toBeDefined();
      expect(TEMPLATES[code].channels).toContain("SMS");
    }
  });

  it("includes every required email template code", () => {
    const required = [
      "EMAIL_PORTAL_WELCOME",
      "EMAIL_RECEIPT",
      "EMAIL_SR_RECEIVED",
      "EMAIL_SR_APPROVED_DETAILS",
      "EMAIL_FILTER_DUE_D14",
      "EMAIL_PAYMENT_DUE_D7",
      "EMAIL_PAYMENT_DUE_D14",
      "EMAIL_RENTAL_DUE_D60",
      "EMAIL_RENTAL_DUE_D30",
      "EMAIL_VISIT_COMPLETED",
      "EMAIL_TAX_INVOICE",
      "EMAIL_CONTRACT_COPY",
      "EMAIL_RENTAL_COMPLETED",
    ];
    for (const code of required) {
      expect(TEMPLATES[code], `${code} missing`).toBeDefined();
      expect(TEMPLATES[code].channels).toContain("EMAIL");
    }
  });

  it("renders {var} placeholders", () => {
    const body = "Hello {name}, your password is {pwd}.";
    const result = renderTemplate(body, { name: "Lan", pwd: "K7m3Px9Qrt" });
    expect(result).toBe("Hello Lan, your password is K7m3Px9Qrt.");
  });

  it("leaves unknown placeholders intact (non-strict)", () => {
    const result = renderTemplate("Hello {name}, code {missing}", { name: "X" });
    expect(result).toBe("Hello X, code {missing}");
  });

  it("throws on unknown placeholder in strict mode", () => {
    expect(() =>
      renderTemplate("Hello {missing}", {}, { strict: true }),
    ).toThrow(/Missing template variable/);
  });

  it("getTemplate throws on unknown code", () => {
    expect(() => getTemplate("DOES_NOT_EXIST")).toThrow();
  });

  it("pickLocaleBody returns locale body, falls back to vi", () => {
    const t = getTemplate("SMS_PASSWORD_RESET");
    expect(pickLocaleBody(t, "ko")).toContain("비밀번호 초기화");
    expect(pickLocaleBody(t, "vi")).toContain("đặt lại");
    expect(pickLocaleBody(t, "en")).toContain("password reset");
  });

  it("pickLocaleSubject returns email subjects", () => {
    const t = getTemplate("EMAIL_PORTAL_WELCOME");
    expect(pickLocaleSubject(t, "vi")).toContain("Chào mừng");
    expect(pickLocaleSubject(t, "ko")).toContain("환영");
    expect(pickLocaleSubject(t, "en")).toContain("Welcome");
  });

  it("pickLocaleSubject returns undefined for SMS templates", () => {
    const t = getTemplate("SMS_VISIT_REMINDER");
    expect(pickLocaleSubject(t, "vi")).toBeUndefined();
  });

  it("each template has all three locales", () => {
    for (const [code, t] of Object.entries(TEMPLATES)) {
      expect(t.bodies.ko, `${code} missing ko`).toBeTruthy();
      expect(t.bodies.vi, `${code} missing vi`).toBeTruthy();
      expect(t.bodies.en, `${code} missing en`).toBeTruthy();
    }
  });

  it("SMS_PORTAL_WELCOME body matches the canonical doc bodies (key phrases)", () => {
    const t = getTemplate("SMS_PORTAL_WELCOME");
    expect(t.bodies.ko).toContain("환영합니다");
    expect(t.bodies.vi).toContain("Cổng KH");
    expect(t.bodies.en).toContain("Welcome");
  });
});
