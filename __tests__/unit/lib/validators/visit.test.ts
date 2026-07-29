import { describe, it, expect } from "vitest";
import {
  createVisitSchema,
  scheduleVisitSchema,
  completeVisitSchema,
  failVisitSchema,
  rescheduleVisitSchema,
  cancelVisitSchema,
  addNotesSchema,
  recommendQuerySchema,
  issueDocumentSchema,
} from "@/lib/validators/visit";

describe("createVisitSchema", () => {
  it("accepts a minimal valid payload", () => {
    const parsed = createVisitSchema.parse({
      customerId: "c1",
      type: "PERIODIC_INSPECTION",
      scheduledFor: "2026-06-15T14:00:00.000Z",
    });
    expect(parsed.type).toBe("PERIODIC_INSPECTION");
    expect(parsed.scheduledFor).toBeInstanceOf(Date);
  });
  it("rejects unknown type", () => {
    expect(() =>
      createVisitSchema.parse({
        customerId: "c1",
        type: "GHOST_INSPECTION",
        scheduledFor: new Date().toISOString(),
      }),
    ).toThrow();
  });
});

describe("scheduleVisitSchema", () => {
  it("requires leadTechnicianId", () => {
    expect(() => scheduleVisitSchema.parse({})).toThrow();
  });
  it("dedupes collaborators", () => {
    const parsed = scheduleVisitSchema.parse({
      leadTechnicianId: "u1",
      collaboratorTechnicianIds: ["u2", "u2", "u3"],
    });
    expect(parsed.collaboratorTechnicianIds.sort()).toEqual(["u2", "u3"]);
  });
});

describe("completeVisitSchema", () => {
  it("requires findings + signature", () => {
    expect(() => completeVisitSchema.parse({})).toThrow();
  });
  it("accepts a populated form", () => {
    const parsed = completeVisitSchema.parse({
      findings: "Replaced filter X.",
      partsReplaced: ["Sediment", "Carbon"],
      photos: [{ storageKey: "uploads/visits/v1/p1.jpg" }],
      customerSignaturePhotoStorageKey: "uploads/visits/v1/sig.jpg",
      collectedAmount: 350000,
      paymentMethod: "CASH",
    });
    expect(parsed.partsReplaced).toHaveLength(2);
    expect(parsed.photos).toHaveLength(1);
  });
  it("treats negative collectedAmount as invalid", () => {
    expect(() =>
      completeVisitSchema.parse({
        findings: "x",
        customerSignaturePhotoStorageKey: "sig.jpg",
        collectedAmount: -10,
      }),
    ).toThrow();
  });
});

describe("failVisitSchema", () => {
  it("requires a 3+ char reason", () => {
    expect(() => failVisitSchema.parse({ reason: "no" })).toThrow();
    expect(failVisitSchema.parse({ reason: "Customer absent" }).reason).toBe(
      "Customer absent",
    );
  });
});

describe("rescheduleVisitSchema", () => {
  it("requires both new date + reason", () => {
    expect(() =>
      rescheduleVisitSchema.parse({ reason: "Customer asked" }),
    ).toThrow();
    expect(() =>
      rescheduleVisitSchema.parse({ scheduledFor: new Date().toISOString() }),
    ).toThrow();
  });
});

describe("cancelVisitSchema", () => {
  it("requires reason", () => {
    expect(() => cancelVisitSchema.parse({ reason: "" })).toThrow();
  });
});

describe("addNotesSchema", () => {
  it("accepts empty body (caller validates note OR photos)", () => {
    const parsed = addNotesSchema.parse({});
    expect(parsed.photos).toEqual([]);
  });
});

describe("issueDocumentSchema — edit-before-print notes (요청 #4)", () => {
  it("keeps an empty-string notes as a deliberate clear (not coerced to undefined)", () => {
    const parsed = issueDocumentSchema.parse({ kind: "DELIVERY_RECEIPT", notes: "" });
    // "" must survive so the renderer clears the block; undefined would instead
    // fall back to visit.findings.
    expect(parsed.notes).toBe("");
  });
  it("omitting notes leaves it undefined (keep visit.findings)", () => {
    const parsed = issueDocumentSchema.parse({ kind: "DELIVERY_RECEIPT" });
    expect(parsed.notes).toBeUndefined();
  });
  it("passes through edited notes text", () => {
    const parsed = issueDocumentSchema.parse({ kind: "PERIODIC_CHECK_B2B", notes: "Đã vệ sinh lõi" });
    expect(parsed.notes).toBe("Đã vệ sinh lõi");
  });
  it("rejects notes longer than 4000 chars", () => {
    expect(() =>
      issueDocumentSchema.parse({ kind: "DELIVERY_RECEIPT", notes: "x".repeat(4001) }),
    ).toThrow();
  });
});

describe("recommendQuerySchema", () => {
  it("coerces scheduledFor to Date", () => {
    const parsed = recommendQuerySchema.parse({
      customerId: "c1",
      scheduledFor: "2026-06-15T14:00:00.000Z",
    });
    expect(parsed.scheduledFor).toBeInstanceOf(Date);
  });
  it("requires customerId", () => {
    expect(() =>
      recommendQuerySchema.parse({ scheduledFor: new Date().toISOString() }),
    ).toThrow();
  });
});
