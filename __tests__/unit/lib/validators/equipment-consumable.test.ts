import { describe, it, expect } from "vitest";
import {
  createEquipmentConsumableSchema,
  updateEquipmentConsumableSchema,
} from "@/lib/validators/equipmentConsumable";

describe("equipment consumable — removing a filter from one unit", () => {
  it("excludes a catalog filter without asking for a cycle", () => {
    const r = createEquipmentConsumableSchema.safeParse({ consumableId: "c1", excluded: true });
    expect(r.success).toBe(true);
    expect(r.success && r.data.excluded).toBe(true);
  });

  it("refuses to exclude a free-text part — that row is simply deleted", () => {
    expect(
      createEquipmentConsumableSchema.safeParse({ customName: "타사 필터", replaceEveryDays: 90, excluded: true })
        .success,
    ).toBe(false);
  });

  it("lets a patch exclude or restore a filter", () => {
    expect(updateEquipmentConsumableSchema.parse({ excluded: true }).excluded).toBe(true);
    expect(updateEquipmentConsumableSchema.parse({ excluded: false }).excluded).toBe(false);
    expect(updateEquipmentConsumableSchema.parse({}).excluded).toBeUndefined();
  });
});
