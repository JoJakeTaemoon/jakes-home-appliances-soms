"use client";

/**
 * Convenience hook that bundles label resolvers + the next-intl
 * `useTranslations` calls used across the audit log UI components.
 *
 * Splitting these into a hook keeps `<AuditRow>` / `<AuditDetailDrawer>` /
 * `<DiffTable>` from each re-instantiating their own translators.
 */

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import { getActionLabel } from "@/lib/audit/labels";
import { getFieldLabel } from "@/lib/audit/field-labels";
import { formatValue, type FormatHint } from "@/lib/audit/value-format";

export interface AuditRowFormatter {
  locale: "ko" | "en" | "vi";
  /** Returns localised entity-type label, or the raw key if unknown. */
  entityTypeLabel: (entityType: string) => string;
  /** Returns localised role badge text. */
  roleBadge: (role: string | null | undefined) => string;
  /** Returns an `{verb, isUnknown}` triplet for the action code. */
  action: (action: string) => ReturnType<typeof getActionLabel>;
  /** Returns localised field label (3-step fallback). */
  fieldLabel: (entityType: string, field: string) => string;
  /** Formats a single value cell with locale + optional hint. */
  formatValue: (value: unknown, hint?: FormatHint) => string;
  /** Localised "(uncatalogued)" marker. */
  unknownActionMarker: string;
}

function safeLocale(loc: string): "ko" | "en" | "vi" {
  if (loc === "en" || loc === "vi" || loc === "ko") return loc;
  return "ko";
}

export function useAuditRowFormatter(): AuditRowFormatter {
  const rawLocale = useLocale();
  const locale = safeLocale(rawLocale);
  const tEntity = useTranslations("reports.audit.entityTypes");
  const tRole = useTranslations("reports.audit.roleBadge");
  const tAudit = useTranslations("reports.audit");

  const entityTypeLabel = useCallback(
    (entityType: string) => {
      if (!entityType) return "";
      try {
        return tEntity(entityType);
      } catch {
        return entityType;
      }
    },
    [tEntity],
  );

  const roleBadge = useCallback(
    (role: string | null | undefined) => {
      if (!role) return "";
      try {
        return tRole(role);
      } catch {
        return role;
      }
    },
    [tRole],
  );

  const action = useCallback(
    (code: string) => getActionLabel(code, locale),
    [locale],
  );

  const fieldLabel = useCallback(
    (entityType: string, field: string) =>
      getFieldLabel(entityType, field, locale),
    [locale],
  );

  const fmt = useCallback(
    (value: unknown, hint?: FormatHint) => formatValue(value, locale, hint),
    [locale],
  );

  return useMemo(
    () => ({
      locale,
      entityTypeLabel,
      roleBadge,
      action,
      fieldLabel,
      formatValue: fmt,
      unknownActionMarker: tAudit("unknownAction"),
    }),
    [locale, entityTypeLabel, roleBadge, action, fieldLabel, fmt, tAudit],
  );
}
