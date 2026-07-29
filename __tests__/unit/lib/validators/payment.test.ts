import { describe, it, expect } from "vitest";
import { updatePaymentNotesSchema } from "@/lib/validators/payment";

describe("updatePaymentNotesSchema — editable receipt notes (요청 #4)", () => {
  it("accepts notes text", () => {
    const parsed = updatePaymentNotesSchema.parse({ notes: "Thu đủ tiền mặt" });
    expect(parsed.notes).toBe("Thu đủ tiền mặt");
  });

  it("accepts empty string (clears the printed notes block)", () => {
    expect(updatePaymentNotesSchema.parse({ notes: "" }).notes).toBe("");
  });

  it("accepts null (also clears)", () => {
    expect(updatePaymentNotesSchema.parse({ notes: null }).notes).toBeNull();
  });

  it("requires the notes key (undefined is rejected — this is a full replace)", () => {
    expect(() => updatePaymentNotesSchema.parse({})).toThrow();
  });

  it("rejects notes longer than 2000 chars", () => {
    expect(() => updatePaymentNotesSchema.parse({ notes: "x".repeat(2001) })).toThrow();
  });
});
