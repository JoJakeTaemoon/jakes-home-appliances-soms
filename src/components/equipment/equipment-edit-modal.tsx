"use client";

/**
 * 장비 정보 수정 (WS1) — MANAGER+ full-edit modal for the equipment detail
 * page. Edits the equipment's own fields (model, site, install date, service
 * shape, pricing, cycles, last-inspection override, notes). Hard status
 * transitions (ACTIVE/DEACTIVATED/TERMINATED) stay on the dedicated action
 * buttons so the pause-ledger invariants are preserved.
 *
 * Only fields the user actually changed are sent (diff PATCH) so untouched
 * nullable columns are never clobbered.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberInput } from "@/components/ui/number-input";
import { FormField } from "@/components/ui/form-field";
import { ModelPicker } from "@/components/equipment/model-picker";
import { useApi, ApiClientError } from "@/lib/api/client";
import { formatDate } from "@/lib/format";

/** Decimal columns arrive from JSON as strings; forms hold numbers. */
type Moneyish = string | number | null;

export interface EquipmentEditValues {
  id: string;
  modelId: string | null;
  siteId: string | null;
  serialNumber: string | null;
  assetCode: string | null;
  ownership: string;
  installedAt: string | null;
  serviceType: string | null;
  managementType: string | null;
  deposit: Moneyish;
  monthlyFee: Moneyish;
  salePrice: Moneyish;
  installFee: Moneyish;
  customInspectionCycleDays: number | null;
  customMaintenanceCycleDays: number | null;
  lastInspectionAtOverride: string | null;
  notes: string | null;
  customDescription: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  equipment: EquipmentEditValues;
  customerType: "B2C" | "B2B";
  sites: { id: string; name: string }[];
  locale: "ko" | "vi" | "en";
  onSaved: () => void | Promise<void>;
}

/** ISO / null → `YYYY-MM-DD` (VST) for the date pickers, "" when absent. */
function toYmd(v: string | null): string {
  return v ? formatDate(v, "en") : "";
}
function num(v: string | number | null): number {
  if (v === null || v === "") return 0;
  return typeof v === "number" ? v : Number(v);
}

interface FormState {
  modelId: string | null;
  siteId: string | null;
  serialNumber: string;
  assetCode: string;
  ownership: string;
  installedAt: string;
  serviceType: string | null;
  managementType: string | null;
  deposit: number;
  monthlyFee: number;
  salePrice: number;
  installFee: number;
  inspectionCycle: number;
  maintenanceCycle: number;
  lastInspection: string;
  notes: string;
  customDescription: string;
}

/**
 * Build the PATCH body from the diff of `form` vs `initial` — only changed
 * fields are sent so untouched nullable columns are never clobbered. A cycle
 * set to 0 reverts to the catalog default (null); a cleared date clears the
 * override (null). Exported for unit testing.
 */
export function buildEquipmentPatch(
  form: FormState,
  initial: FormState,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const set = <K extends keyof FormState>(key: K, apiKey: string, value: unknown) => {
    if (form[key] !== initial[key]) body[apiKey] = value;
  };
  set("modelId", "modelId", form.modelId);
  set("siteId", "siteId", form.siteId);
  set("serialNumber", "serialNumber", form.serialNumber);
  set("assetCode", "assetCode", form.assetCode);
  set("ownership", "ownership", form.ownership);
  if (form.installedAt !== initial.installedAt && form.installedAt) {
    body.installedAt = form.installedAt;
  }
  set("serviceType", "serviceType", form.serviceType);
  set("managementType", "managementType", form.managementType);
  set("deposit", "deposit", form.deposit);
  set("monthlyFee", "monthlyFee", form.monthlyFee);
  set("salePrice", "salePrice", form.salePrice);
  set("installFee", "installFee", form.installFee);
  // Cycle 0 = "revert to catalog default" → send null.
  set("inspectionCycle", "customInspectionCycleDays", form.inspectionCycle > 0 ? form.inspectionCycle : null);
  set("maintenanceCycle", "customMaintenanceCycleDays", form.maintenanceCycle > 0 ? form.maintenanceCycle : null);
  // Empty date = clear the override → send null.
  set("lastInspection", "lastInspectionAtOverride", form.lastInspection || null);
  set("notes", "notes", form.notes);
  set("customDescription", "customDescription", form.customDescription);
  return body;
}

export function EquipmentEditModal({
  open,
  onClose,
  equipment,
  customerType,
  sites,
  locale,
  onSaved,
}: Readonly<Props>) {
  const t = useTranslations("equipment.edit");
  const api = useApi();

  // Initial snapshot — the diff baseline. Rebuilt whenever a fresh equipment
  // object arrives (e.g. after a save + refetch reopens the modal).
  const initial = useMemo(
    () => ({
      modelId: equipment.modelId,
      siteId: equipment.siteId,
      serialNumber: equipment.serialNumber ?? "",
      assetCode: equipment.assetCode ?? "",
      ownership: equipment.ownership,
      installedAt: toYmd(equipment.installedAt),
      serviceType: equipment.serviceType,
      managementType: equipment.managementType,
      deposit: num(equipment.deposit),
      monthlyFee: num(equipment.monthlyFee),
      salePrice: num(equipment.salePrice),
      installFee: num(equipment.installFee),
      inspectionCycle: equipment.customInspectionCycleDays ?? 0,
      maintenanceCycle: equipment.customMaintenanceCycleDays ?? 0,
      lastInspection: toYmd(equipment.lastInspectionAtOverride),
      notes: equipment.notes ?? "",
      customDescription: equipment.customDescription ?? "",
    }),
    [equipment],
  );

  const [form, setForm] = useState(initial);
  // Model picker's own brand/category filter state (seeded empty; the picker
  // back-fills them when a model is chosen).
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form every time the modal opens (false→true) so a previous
  // Cancel is truly discarded — reopening always starts from the latest DB
  // snapshot, never from abandoned edits.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(initial);
      setBrandFilter(null);
      setCategoryFilter(null);
    }
  }

  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body = buildEquipmentPatch(form, initial);
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
      await api.patch(`/api/equipment/${equipment.id}`, body);
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const serviceTypeOpts = (["RENTAL", "SALE", "MAINTENANCE"] as const).map((v) => ({
    value: v,
    label: t(`serviceType.${v}`),
  }));
  const managementOpts = (["FULL_SERVICE", "SELF_MANAGED", "OTHER"] as const).map((v) => ({
    value: v,
    label: t(`managementType.${v}`),
  }));
  const ownershipOpts = (["COMPANY", "CUSTOMER"] as const).map((v) => ({
    value: v,
    label: t(`ownership.${v}`),
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("title")}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} isLoading={busy}>
            {t("save")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* 기본 정보 */}
        <ModelPicker
          brandFilter={brandFilter}
          categoryFilter={categoryFilter}
          modelId={form.modelId}
          onBrand={(v) => {
            setBrandFilter(v);
            setCategoryFilter(null);
          }}
          onCategory={setCategoryFilter}
          onModel={(v, meta) => {
            patch({ modelId: v });
            if (v) {
              setBrandFilter(meta?.brandId ?? null);
              setCategoryFilter(meta?.categoryId ?? null);
            }
          }}
          locale={locale}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {customerType === "B2B" && (
            <FormField label={t("site")}>
              <Combobox
                value={form.siteId}
                onChange={(v) => patch({ siteId: v })}
                options={sites.map((s) => ({ value: s.id, label: s.name }))}
                placeholder={t("sitePlaceholder")}
                searchable
              />
            </FormField>
          )}
          <FormField label={t("installedAt")}>
            <DatePicker
              ariaLabel={t("installedAt")}
              value={form.installedAt}
              onChange={(v) => patch({ installedAt: v })}
            />
          </FormField>
          <FormField label={t("serialNumber")}>
            <Input value={form.serialNumber} onChange={(e) => patch({ serialNumber: e.target.value })} />
          </FormField>
          <FormField label={t("assetCode")}>
            <Input value={form.assetCode} onChange={(e) => patch({ assetCode: e.target.value })} />
          </FormField>
          <FormField label={t("ownership.label")}>
            <Combobox value={form.ownership} onChange={(v) => patch({ ownership: v ?? "COMPANY" })} options={ownershipOpts} />
          </FormField>
        </div>

        {/* 서비스 · 계약 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label={t("serviceType.label")}>
            <Combobox value={form.serviceType} onChange={(v) => patch({ serviceType: v })} options={serviceTypeOpts} placeholder="—" />
          </FormField>
          <FormField label={t("managementType.label")}>
            <Combobox value={form.managementType} onChange={(v) => patch({ managementType: v })} options={managementOpts} placeholder="—" />
          </FormField>
          <FormField label={t("deposit")}>
            <NumberInput variant="money" ariaLabel={t("deposit")} value={form.deposit} onChange={(v) => patch({ deposit: v })} min={0} />
          </FormField>
          <FormField label={t("monthlyFee")}>
            <NumberInput variant="money" ariaLabel={t("monthlyFee")} value={form.monthlyFee} onChange={(v) => patch({ monthlyFee: v })} min={0} />
          </FormField>
          <FormField label={t("salePrice")}>
            <NumberInput variant="money" ariaLabel={t("salePrice")} value={form.salePrice} onChange={(v) => patch({ salePrice: v })} min={0} />
          </FormField>
          <FormField label={t("installFee")}>
            <NumberInput variant="money" ariaLabel={t("installFee")} value={form.installFee} onChange={(v) => patch({ installFee: v })} min={0} />
          </FormField>
        </div>

        {/* 주기 · 최근 점검일 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label={t("inspectionCycleDays")}>
            <NumberInput ariaLabel={t("inspectionCycleDays")} value={form.inspectionCycle} onChange={(v) => patch({ inspectionCycle: v })} min={0} />
          </FormField>
          <FormField label={t("maintenanceCycleDays")}>
            <NumberInput ariaLabel={t("maintenanceCycleDays")} value={form.maintenanceCycle} onChange={(v) => patch({ maintenanceCycle: v })} min={0} />
          </FormField>
          <FormField label={t("lastInspectionOverride")} hint={t("lastInspectionHint")}>
            <DatePicker
              ariaLabel={t("lastInspectionOverride")}
              value={form.lastInspection}
              onChange={(v) => patch({ lastInspection: v })}
            />
          </FormField>
        </div>

        {/* 메모 */}
        <FormField label={t("customDescription")}>
          <Textarea rows={2} value={form.customDescription} onChange={(e) => patch({ customDescription: e.target.value })} />
        </FormField>
        <FormField label={t("notes")}>
          <Textarea rows={2} value={form.notes} onChange={(e) => patch({ notes: e.target.value })} />
        </FormField>

        <p className="text-xs text-[#737373]">{t("statusNote")}</p>

        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      </div>
    </Modal>
  );
}
