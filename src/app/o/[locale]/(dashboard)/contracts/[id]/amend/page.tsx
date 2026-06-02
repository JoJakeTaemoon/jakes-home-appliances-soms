"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations , useLocale} from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApi, ApiClientError } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";

type ChangeType = "FEE_ADJUST" | "ADD_EQUIPMENT" | "REMOVE_EQUIPMENT" | "SCOPE_CHANGE";

interface ContractRow {
  id: string;
  contractNumber: string;
  type: "SALE" | "RENTAL" | "MAINTENANCE";
  state: string;
  monthlyMaintenanceFee: string | null;
  customer: { id: string; type: "B2C" | "B2B"; code: string; name: string };
  equipment: Array<{ equipmentId: string; equipment: { id: string; model: { modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null }; serialNumber: string | null } }>;
}

export default function AmendContractPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const locale = useLocale();
  const t = useTranslations("contracts");
  const tc = useTranslations("common");
  const router = useRouter();
  const api = useApi();

  const contractQuery = useApiQuery<ContractRow>(
    id ? `/api/contracts/${id}` : null,
  );
  const contract = contractQuery.data ?? null;

  const [changeType, setChangeType] = useState<ChangeType>("FEE_ADJUST");
  const [monthlyFeeOverride, setMonthlyFeeOverride] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [equipmentLinesOverride, setEquipmentLinesOverride] = useState<
    Array<{ equipmentId: string; unitPrice: number; quantity: number }> | null
  >(null);

  // Defaults come from the loaded contract; the user's overrides win.
  const monthlyFee =
    monthlyFeeOverride ??
    (contract?.monthlyMaintenanceFee !== null && contract?.monthlyMaintenanceFee !== undefined
      ? Number(contract.monthlyMaintenanceFee)
      : 0);
  const equipmentLines = useMemo(
    () =>
      equipmentLinesOverride ??
      (contract?.equipment ?? []).map((ce) => ({
        equipmentId: ce.equipmentId,
        unitPrice: 0,
        quantity: 1,
      })),
    [equipmentLinesOverride, contract],
  );
  const setMonthlyFee = (v: number) => setMonthlyFeeOverride(v);
  type Line = { equipmentId: string; unitPrice: number; quantity: number };
  const setEquipmentLines = (
    v: Line[] | ((prev: Line[]) => Line[]),
  ) => {
    setEquipmentLinesOverride((prev) => {
      const current = prev ?? equipmentLines;
      return typeof v === "function" ? v(current) : v;
    });
  };

  if (!contract) return <div className="text-sm text-[#737373]">{tc("loading")}</div>;

  const isB2B = contract.customer.type === "B2B";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { changeType, reason };
      if (changeType === "FEE_ADJUST") {
        payload.monthlyMaintenanceFee = monthlyFee;
      } else {
        payload.equipment = equipmentLines;
        if (changeType !== "REMOVE_EQUIPMENT") payload.monthlyMaintenanceFee = monthlyFee;
      }
      const res = await api.post<{ contract: { id: string; contractNumber: string }; isNewRevision: boolean }>(
        `/api/contracts/${id}/amend`,
        payload,
      );
      router.push(`/o/contracts/${res.data.contract.id}`);
    } catch (e) {
      if (e instanceof ApiClientError) setError(e.message);
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // B2C can only do FEE_ADJUST.
  const changeOptions = isB2B
    ? [
        { value: "FEE_ADJUST", label: t("amend.feeAdjust") },
        { value: "ADD_EQUIPMENT", label: t("amend.addEquipment") },
        { value: "REMOVE_EQUIPMENT", label: t("amend.removeEquipment") },
        { value: "SCOPE_CHANGE", label: t("amend.scopeChange") },
      ]
    : [{ value: "FEE_ADJUST", label: t("amend.feeAdjust") }];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("amend.title")}</h1>
        <p className="text-xs text-[#737373]">{contract.contractNumber} · {contract.customer.code} {contract.customer.name}</p>
      </header>

      <div
        className={
          isB2B
            ? "rounded-lg border border-[var(--brand-blue-200)] bg-[var(--brand-blue-50)] p-3 text-xs text-[var(--brand-blue-700)]"
            : "rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700"
        }
      >
        {isB2B ? t("amend.b2bNote") : t("amend.b2cNote")}
      </div>

      <FormField label={t("amend.changeType")} required>
        <Combobox
          value={changeType}
          onChange={(v) => v && setChangeType(v as ChangeType)}
          options={changeOptions}
          searchable={false}
          allowClear={false}
        />
      </FormField>

      {(changeType === "FEE_ADJUST" ||
        changeType === "ADD_EQUIPMENT" ||
        changeType === "SCOPE_CHANGE") && (
        <FormField label={t("monthlyFee")} required={changeType === "FEE_ADJUST"}>
          <NumberInput value={monthlyFee} onChange={setMonthlyFee} min={0} />
        </FormField>
      )}

      {(changeType === "ADD_EQUIPMENT" ||
        changeType === "REMOVE_EQUIPMENT" ||
        changeType === "SCOPE_CHANGE") && (
        <FormField label={t("wizard.pickEquipment")}>
          <div className="flex flex-col gap-1">
            {contract.equipment.map((ce) => {
              const checked = equipmentLines.some((l) => l.equipmentId === ce.equipmentId);
              return (
                <label key={ce.equipmentId} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(ev) => {
                      if (ev.target.checked) {
                        setEquipmentLines((prev) => [
                          ...prev,
                          { equipmentId: ce.equipmentId, unitPrice: 0, quantity: 1 },
                        ]);
                      } else {
                        setEquipmentLines((prev) => prev.filter((l) => l.equipmentId !== ce.equipmentId));
                      }
                    }}
                  />
                  <span>
                    {pickModelName(ce.equipment.model, locale)} — {pickModelName(ce.equipment.model, locale)}
                    {ce.equipment.serialNumber ? ` (${ce.equipment.serialNumber})` : ""}
                  </span>
                </label>
              );
            })}
          </div>
        </FormField>
      )}

      <FormField label={t("amend.reason")} required>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
      </FormField>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <footer className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()} disabled={busy}>
          {tc("cancel")}
        </Button>
        <Button onClick={submit} isLoading={busy} disabled={!reason.trim()}>
          {t("amend.submit")}
        </Button>
      </footer>
    </div>
  );
}
