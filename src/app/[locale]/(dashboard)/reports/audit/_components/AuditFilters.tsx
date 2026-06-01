"use client";

/**
 * Audit log filter panel.
 *
 *   - entityType select (translated names)
 *   - action select (filtered by entityType when one is chosen)
 *   - actor text input (no autocomplete in v1 — see plan §"비범위")
 *   - date range (start / end)
 *   - free-text q (action / entityType / entityId)
 *
 * State is fully lifted to the parent so URL params + pagination logic
 * live in one place.
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { useAuditRowFormatter } from "@/lib/audit/use-audit-row-formatter";

const ENTITY_TYPE_OPTIONS = [
  "Customer",
  "Site",
  "CustomerContact",
  "Contract",
  "Visit",
  "ServiceRequest",
  "Payment",
  "TaxInvoice",
  "User",
  "Equipment",
  "EquipmentModel",
  "Brand",
  "ProductCategory",
  "Consumable",
  "Accessory",
  "ChargePolicy",
  "NotificationTemplate",
  "NotificationLog",
  "ScheduledJob",
  "SystemSetting",
] as const;

/** Maps entityType → list of actions. Edits live here so the action
 * dropdown can offer the right subset when a type is selected. */
const ACTIONS_BY_ENTITY: Record<string, string[]> = {
  Customer: [
    "CUSTOMER_CREATE",
    "CUSTOMER_UPDATE",
    "CUSTOMER_DEACTIVATE",
    "CUSTOMER_REACTIVATE",
    "CUSTOMER_MERGE",
  ],
  CustomerContact: ["CUSTOMER_CONTACT_DISABLE"],
  Site: ["SITE_UPDATE", "SITE_DEACTIVATE"],
  Contract: [
    "CONTRACT_CREATE",
    "CONTRACT_UPDATE",
    "CONTRACT_AMEND",
    "CONTRACT_EMAILED",
    "CONTRACT_PDF_REGENERATED",
    "CONTRACT_RENEW_PREPARED",
  ],
  Visit: [
    "VISIT_CREATE",
    "VISIT_UPDATE",
    "VISIT_SCHEDULE",
    "VISIT_RESCHEDULE",
    "VISIT_REASSIGN",
    "VISIT_START",
    "VISIT_COMPLETE",
    "VISIT_FAIL",
    "VISIT_CANCEL",
    "VISIT_NOTE_ADD",
    "VISIT_OFFICE_NOTE_ADD",
  ],
  ServiceRequest: [
    "SR_CREATE",
    "SR_APPROVE",
    "SR_REJECT",
    "SR_CANCEL",
    "SR_ESCALATE",
    "SR_MESSAGE",
  ],
  Payment: [
    "PAYMENT_CREATE",
    "PAYMENT_COLLECT_CASH",
    "PAYMENT_BANK_TRANSFER",
    "PAYMENT_PARTIAL",
    "PAYMENT_HAND_OVER",
    "PAYMENT_HANDOVER_SLA_BREACH",
    "PAYMENT_RECONCILE",
    "PAYMENT_WRITE_OFF",
    "PAYMENT_OVERDUE",
  ],
  TaxInvoice: ["TAX_INVOICE_REISSUE"],
  User: ["USER_CREATE", "USER_UPDATE", "USER_DISABLE", "USER_PHONE_UPDATE"],
  Equipment: [
    "EQUIPMENT_UPDATE",
    "EQUIPMENT_MOVE_SITE",
    "EQUIPMENT_REPLACE",
  ],
  EquipmentModel: ["EQUIPMENT_MODEL_UPDATE"],
  Brand: ["BRAND_UPDATE", "BRAND_DEACTIVATE"],
  ProductCategory: ["PRODUCT_CATEGORY_UPDATE", "PRODUCT_CATEGORY_DEACTIVATE"],
  Consumable: ["CONSUMABLE_UPDATE", "CONSUMABLE_DEACTIVATE"],
  Accessory: ["ACCESSORY_UPDATE", "ACCESSORY_DEACTIVATE"],
  ChargePolicy: ["CHARGE_POLICY_UPDATE", "CHARGE_POLICY_DELETE"],
  NotificationTemplate: [
    "NOTIFICATION_TEMPLATE_UPSERT",
    "NOTIFICATION_TEMPLATE_DELETE",
  ],
};

/** Auth + portal actions that have no associated entity. */
const STANDALONE_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_RESET_REQUEST",
  "PASSWORD_RESET_COMPLETE",
  "PASSWORD_RESET_VERIFY_FAILED",
  "PORTAL_ENABLED",
  "PORTAL_LOGIN_SUCCESS",
  "PORTAL_LOGIN_FAILED",
  "PORTAL_LOGOUT",
  "PORTAL_PASSWORD_CHANGED",
  "PORTAL_PASSWORD_CHANGE_FAILED",
  "PORTAL_PASSWORD_RESET_BY_STAFF",
  "PORTAL_PASSWORD_RESET_REQUESTED",
  "PORTAL_PASSWORD_RESET_REQUEST_FAILED",
  "PORTAL_SELF_UPDATE",
  "SCHEDULER_WEIGHTS_UPDATE",
  "CRON_RUN",
  "COMPANY_HQ_PHONE_UPDATE",
  "COMPANY_TAX_INFO_UPDATE",
];

export interface AuditFilterState {
  entityType: string;
  action: string;
  actor: string;
  rangeStart: string;
  rangeEnd: string;
  q: string;
}

export const EMPTY_FILTERS: AuditFilterState = {
  entityType: "",
  action: "",
  actor: "",
  rangeStart: "",
  rangeEnd: "",
  q: "",
};

interface Props {
  draft: AuditFilterState;
  onDraftChange: (next: AuditFilterState) => void;
  onSubmit: () => void;
  onReset: () => void;
  loading: boolean;
}

export function AuditFilters({
  draft,
  onDraftChange,
  onSubmit,
  onReset,
  loading,
}: Readonly<Props>) {
  const t = useTranslations("reports.audit");
  const fmt = useAuditRowFormatter();

  const entityOptions: ComboboxOption[] = useMemo(
    () =>
      ENTITY_TYPE_OPTIONS.map((et) => ({
        value: et,
        label: fmt.entityTypeLabel(et),
      })),
    [fmt],
  );

  const actionOptions: ComboboxOption[] = useMemo(() => {
    const codes = draft.entityType
      ? ACTIONS_BY_ENTITY[draft.entityType] ?? []
      : [
          ...Object.values(ACTIONS_BY_ENTITY).flat(),
          ...STANDALONE_ACTIONS,
        ];
    return codes
      .map((code) => {
        const { verb } = fmt.action(code);
        return {
          value: code,
          label: verb || code,
          description: code,
        };
      })
      // Stable alphabetical for predictable scanning.
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [draft.entityType, fmt]);

  const set = <K extends keyof AuditFilterState>(
    key: K,
    value: AuditFilterState[K],
  ) => onDraftChange({ ...draft, [key]: value });

  return (
    <section className="rounded-2xl border-2 border-[#e5e5e5] bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FormField label={t("filters.entityType")}>
          <Combobox
            value={draft.entityType || null}
            onChange={(v) => {
              onDraftChange({
                ...draft,
                entityType: v ?? "",
                // Clear action when entityType changes — it might not apply.
                action: "",
              });
            }}
            options={entityOptions}
            placeholder={t("filters.all")}
            allowClear
            ariaLabel={t("filters.entityType")}
          />
        </FormField>

        <FormField label={t("filters.action")}>
          <Combobox
            value={draft.action || null}
            onChange={(v) => set("action", v ?? "")}
            options={actionOptions}
            placeholder={t("filters.all")}
            allowClear
            ariaLabel={t("filters.action")}
          />
        </FormField>

        <FormField label={t("filters.actor")}>
          <Input
            value={draft.actor}
            onChange={(e) => set("actor", e.target.value)}
            placeholder={t("filters.actorPlaceholder")}
          />
        </FormField>

        <FormField label={t("filters.rangeStart")}>
          <Input
            type="date"
            value={draft.rangeStart}
            onChange={(e) => set("rangeStart", e.target.value)}
          />
        </FormField>

        <FormField label={t("filters.rangeEnd")}>
          <Input
            type="date"
            value={draft.rangeEnd}
            onChange={(e) => set("rangeEnd", e.target.value)}
          />
        </FormField>

        <FormField label={t("filters.q")}>
          <Input
            value={draft.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder={t("filters.qPlaceholder")}
          />
        </FormField>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={onSubmit} disabled={loading}>
          {t("search")}
        </Button>
        <Button variant="secondary" onClick={onReset} disabled={loading}>
          {t("filters.reset")}
        </Button>
      </div>
    </section>
  );
}
