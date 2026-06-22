"use client";

/**
 * Contract-scoped equipment installation form (added 2026-06).
 *
 * - Contract is selected FIRST (either via the picker below or supplied
 *   externally as `lockedContractId`). Equipment cannot be installed
 *   without an enclosing contract.
 * - Per-row inputs: model, quantity, optional siteId, optional serial
 *   start string, ownership.
 * - Customers with ≥2 sites force a siteId per row (mirrored server-side).
 * - Serial numbers are generated on the server using
 *   `generateSerialSequence(serialStart, quantity)` — the form just
 *   collects the starting value and the count.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useApi, ApiClientError } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
import { NumberInput } from "@/components/ui/number-input";
import { pickModelName } from "@/lib/products/name";

interface ContractOpt {
  id: string;
  contractNumber: string;
  type: "RENTAL" | "SALE" | "MAINTENANCE";
  state: string;
  customer: { id: string; code: string; name: string; type: "B2C" | "B2B" };
}

interface ContractDetail {
  id: string;
  contractNumber: string;
  customer: {
    id: string;
    code: string;
    name: string;
    type: "B2C" | "B2B";
    sites: { id: string; name: string }[];
  };
}

interface ModelOpt {
  id: string;
  modelCode: string;
  nameKo: string | null;
  nameVi: string | null;
  nameEn: string | null;
}

interface SiteOpt {
  id: string;
  name: string;
}

interface RowState {
  modelId: string | null;
  quantity: number;
  serialStart: string;
  siteId: string | null;
  ownership: "COMPANY" | "CUSTOMER";
}

function emptyRow(): RowState {
  return {
    modelId: null,
    quantity: 1,
    serialStart: "",
    siteId: null,
    ownership: "COMPANY",
  };
}

export function BulkInstallEquipmentForm({
  lockedContractId,
  onSuccess,
}: Readonly<{
  lockedContractId?: string;
  onSuccess: (result: { contractId: string; count: number }) => void;
}>) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const tcontracts = useTranslations("contracts");
  const locale = useLocale();
  const api = useApi();

  const [contractId, setContractId] = useState<string | null>(
    lockedContractId ?? null,
  );
  const [rows, setRows] = useState<RowState[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const contractsQuery = useApiQuery<ContractOpt[]>(
    lockedContractId
      ? null
      : `/api/contracts?pageSize=200&state=ACTIVE,AMENDED,DRAFT,PENDING_SIGNATURE`,
  );
  const contracts = contractsQuery.data ?? [];

  const contractDetail = useApiQuery<ContractDetail>(
    contractId ? `/api/contracts/${contractId}` : null,
  );

  const modelsQuery = useApiQuery<ModelOpt[]>(
    "/api/equipment-models?pageSize=200&isActive=true",
  );
  const models = modelsQuery.data ?? [];

  const sitesQuery = useApiQuery<SiteOpt[]>(
    contractDetail.data?.customer?.type === "B2B" &&
      contractDetail.data?.customer?.id
      ? `/api/customers/${contractDetail.data.customer.id}/sites`
      : null,
  );
  const sites = sitesQuery.data ?? contractDetail.data?.customer?.sites ?? [];
  const requireSite = sites.length >= 2;

  // Clear stale site values when changing to a contract whose customer has
  // a different site set (or no sites at all).
  useEffect(() => {
    if (!requireSite) {
      setRows((rs) => rs.map((r) => ({ ...r, siteId: null })));
    }
  }, [requireSite, contractId]);

  const modelOptions = useMemo(
    () =>
      models.map((m) => ({
        value: m.id,
        label: `${m.modelCode} — ${pickModelName(m, locale)}`,
      })),
    [models, locale],
  );

  const siteOptions = sites.map((s) => ({ value: s.id, label: s.name }));

  const contractOptions = contracts.map((c) => ({
    value: c.id,
    label: `${c.contractNumber} — ${c.customer.code} ${c.customer.name}`,
    description: `${c.type} · ${c.state}`,
  }));

  function updateRow(idx: number, patch: Partial<RowState>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
  }

  function removeRow(idx: number) {
    setRows((rs) => (rs.length <= 1 ? rs : rs.filter((_, i) => i !== idx)));
  }

  function canSubmit(): boolean {
    if (!contractId) return false;
    if (rows.length === 0) return false;
    for (const r of rows) {
      if (!r.modelId) return false;
      if (r.quantity < 1) return false;
      if (requireSite && !r.siteId) return false;
    }
    return true;
  }

  async function submit() {
    if (!contractId) return;
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        items: rows.map((r) => ({
          modelId: r.modelId!,
          quantity: r.quantity,
          serialStart: r.serialStart.trim() || undefined,
          siteId: r.siteId || undefined,
          ownership: r.ownership,
        })),
      };
      const res = await api.post<{ contractId: string; count: number }>(
        `/api/contracts/${contractId}/equipment/bulk-install`,
        payload,
      );
      onSuccess({ contractId: res.data.contractId, count: res.data.count });
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!lockedContractId && (
        <FormField label={tcontracts("install.pickContract")} required>
          <Combobox
            value={contractId}
            onChange={setContractId}
            options={contractOptions}
            placeholder={tcontracts("install.pickContractPlaceholder")}
          />
        </FormField>
      )}

      {contractDetail.data && requireSite && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {tcontracts("install.siteRequiredNotice", {
            count: sites.length,
          })}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((row, idx) => (
          <div
            key={idx}
            className="rounded-2xl border border-[#e5e5e5] bg-white p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#002A4D]">
                {tcontracts("install.itemTitle", { idx: idx + 1 })}
              </h3>
              {rows.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(idx)}
                  disabled={busy}
                >
                  {tc("remove")}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label={t("model")} required className="sm:col-span-2">
                <Combobox
                  value={row.modelId}
                  onChange={(v) => updateRow(idx, { modelId: v })}
                  options={modelOptions}
                  placeholder={t("form.pickModel")}
                />
              </FormField>
              <FormField label={tcontracts("install.quantity")} required>
                <NumberInput
                  value={row.quantity}
                  onChange={(v) => updateRow(idx, { quantity: v ?? 1 })}
                  min={1}
                  max={50}
                />
              </FormField>
              <FormField
                label={tcontracts("install.serialStart")}
                hint={tcontracts("install.serialStartHint")}
              >
                <Input
                  value={row.serialStart}
                  onChange={(e) =>
                    updateRow(idx, { serialStart: e.target.value })
                  }
                  placeholder="PTS-2100-000010"
                />
              </FormField>
              {sites.length > 0 && (
                <FormField
                  label={t("form.pickSite")}
                  required={requireSite}
                  className="sm:col-span-2"
                >
                  <Combobox
                    value={row.siteId}
                    onChange={(v) => updateRow(idx, { siteId: v })}
                    options={siteOptions}
                    placeholder={t("form.pickSite")}
                  />
                </FormField>
              )}
              <FormField label={t("ownership")} className="sm:col-span-2">
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`ownership-${idx}`}
                      checked={row.ownership === "COMPANY"}
                      onChange={() => updateRow(idx, { ownership: "COMPANY" })}
                    />
                    {t("ownershipValues.COMPANY")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`ownership-${idx}`}
                      checked={row.ownership === "CUSTOMER"}
                      onChange={() =>
                        updateRow(idx, { ownership: "CUSTOMER" })
                      }
                    />
                    {t("ownershipValues.CUSTOMER")}
                  </label>
                </div>
              </FormField>
            </div>
          </div>
        ))}

        <div>
          <Button variant="ghost" onClick={addRow} disabled={busy}>
            {tcontracts("install.addRow")}
          </Button>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={submit} isLoading={busy} disabled={!canSubmit()}>
          {tcontracts("install.installCta", {
            total: rows.reduce((acc, r) => acc + r.quantity, 0),
          })}
        </Button>
      </div>
    </div>
  );
}
