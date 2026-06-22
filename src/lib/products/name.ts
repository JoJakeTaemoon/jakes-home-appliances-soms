/**
 * Locale-aware EquipmentModel name resolver.
 *
 * After the `displayName{En,Ko,Vi}` → `name{En,Ko,Vi}` rename and the drop of
 * the legacy single-language `name` column, every UI / API site that used to
 * render `model.name` must now pick the right localized field. This module is
 * the single source of truth for that fallback chain so we don't reinvent it
 * in every component.
 *
 * Fallback order: current locale → VI (default primary) → KO → EN → modelCode → "—".
 */

export interface NameableModel {
  nameKo: string | null;
  nameVi: string | null;
  nameEn: string | null;
  modelCode?: string | null;
}

export function pickModelName(
  model: NameableModel | null | undefined,
  locale: string | undefined,
): string {
  // Null-safe: off-catalog ("external") devices ship with `model = null`
  // and a `customDescription` instead. Callers that want the description
  // should use `pickEquipmentLabel(equipment, locale)` — `pickModelName`
  // is the wrong tool there, and returning "—" is a soft fallback that
  // prevents a hard runtime crash everywhere it's called.
  if (!model) return "—";
  const ko = model.nameKo;
  const vi = model.nameVi;
  const en = model.nameEn;
  const code = model.modelCode ?? null;
  if (locale === "ko") return ko || vi || en || code || "—";
  if (locale === "en") return en || vi || ko || code || "—";
  // Default + explicit "vi" both fall back through Vietnamese first.
  return vi || ko || en || code || "—";
}

/**
 * Equipment-level label resolver that handles off-catalog ("external")
 * devices. Use this anywhere a UI needs to label an Equipment row — list
 * cards, contract line items, visit cards, etc. — so external devices
 * show their customDescription instead of an awkward dash.
 */
export interface EquipmentLikeForLabel {
  model?: NameableModel | null;
  customDescription?: string | null;
  serialNumber?: string | null;
}

export function pickEquipmentLabel(
  eq: EquipmentLikeForLabel,
  locale: string | undefined,
): string {
  if (eq.model) return pickModelName(eq.model, locale);
  return eq.customDescription || eq.serialNumber || "—";
}
