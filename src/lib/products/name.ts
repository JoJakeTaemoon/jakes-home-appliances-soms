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

export function pickModelName(model: NameableModel, locale: string | undefined): string {
  const ko = model.nameKo;
  const vi = model.nameVi;
  const en = model.nameEn;
  const code = model.modelCode ?? null;
  if (locale === "ko") return ko || vi || en || code || "—";
  if (locale === "en") return en || vi || ko || code || "—";
  // Default + explicit "vi" both fall back through Vietnamese first.
  return vi || ko || en || code || "—";
}
