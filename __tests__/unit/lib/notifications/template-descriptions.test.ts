/**
 * The 알림 서식 page shows each template's description in the UI language,
 * so every registered template needs a non-empty ko / vi / en description.
 */
import { describe, it, expect } from "vitest";
import { TEMPLATE_CODES } from "@/lib/notifications/templates";
import { TEMPLATE_DESCRIPTIONS } from "@/lib/notifications/template-descriptions";

describe("template descriptions", () => {
  it.each(TEMPLATE_CODES)("%s has a description in ko, vi and en", (code) => {
    for (const locale of ["ko", "vi", "en"] as const) {
      expect(TEMPLATE_DESCRIPTIONS[code]?.[locale]?.trim()).toBeTruthy();
    }
  });
});
