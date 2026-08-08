"use client";

/**
 * Shared per-equipment list blocks — contracts, filter-replacement history,
 * and collected-payment history. Extracted from the dedicated
 * /o/equipment/[id] page so the master-detail panel
 * (EquipmentDetailPanel) and the dedicated page render the exact same
 * blocks without duplication (WS-4).
 */

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useApi, ApiClientError } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField } from "@/components/ui/form-field";
import { formatDate, formatVnd } from "@/lib/format";

interface EquipmentContractRow {
  id: string;
  contractId: string;
  contract: {
    id: string;
    contractNumber: string;
    type: "SALE" | "RENTAL" | "MAINTENANCE";
    state: string;
    startDate: string | null;
    endDate: string | null;
  };
}

export function EquipmentContractsList({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const t = useTranslations("contracts");
  const locale = useLocale();
  const query = useApiQuery<{ contracts: EquipmentContractRow[] }>(
    `/api/equipment/${equipmentId}`,
  );
  const rows = query.data?.contracts ?? [];
  const loading = query.isLoading;

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4">
      <h3 className="text-xs font-medium uppercase tracking-wider text-[#737373]">{t("title")}</h3>
      <ul className="flex flex-col divide-y divide-[#f5f5f5]">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2">
            <Link
              href={`/o/contracts/${r.contract.id}` as never}
              className="font-mono text-xs text-[var(--brand-blue-700)] underline"
            >
              {r.contract.contractNumber}
            </Link>
            <span className="text-xs text-[#737373]">
              {t(`types.${r.contract.type}`)} · {t(`states.${r.contract.state}` as never)}
            </span>
            <span className="text-xs text-[#737373]">
              {formatDate(r.contract.startDate, locale)} – {formatDate(r.contract.endDate, locale) || "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface FilterRow {
  key: string;
  source: "CATALOG" | "OVERRIDE" | "MANUAL";
  overrideId: string | null;
  consumableId: string | null;
  customName: string | null;
  sku: string | null;
  nameKo: string | null;
  nameVi: string | null;
  nameEn: string | null;
  cycleMonths: number | null;
  cycleSource: "OVERRIDE" | "CATALOG" | "CUSTOM_MAINTENANCE" | "NONE";
  quantity: number;
  lastReplacedAt: string | null;
  lastReplacedAtOverride: string | null;
  nextDueAt: string | null;
  daysRemaining: number | null;
  lastUnitPrice: string | null;
  unitPrice: string | null;
  history: { id: string; visitId: string; replacedAt: string; cost: string | null }[];
}

export function EquipmentFilterHistory({
  equipmentId,
  canManage,
}: Readonly<{ equipmentId: string; canManage: boolean }>) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const locale = useLocale();
  const query = useApiQuery<{ filters: FilterRow[] }>(
    `/api/equipment/${equipmentId}/filter-history`,
  );
  const filters = query.data?.filters ?? [];
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<FilterRow | null>(null);

  function localizedName(f: FilterRow): string {
    if (f.customName) return f.customName;
    if (locale === "ko") return f.nameKo ?? f.nameVi ?? f.nameEn ?? f.sku ?? "—";
    if (locale === "en") return f.nameEn ?? f.nameVi ?? f.nameKo ?? f.sku ?? "—";
    return f.nameVi ?? f.nameKo ?? f.nameEn ?? f.sku ?? "—";
  }

  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#002A4D]">
          {t("filterHistory.title")}
        </h3>
        {canManage && (
          <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)}>
            {t("filterHistory.addManual")}
          </Button>
        )}
      </header>
      {filters.length === 0 ? (
        <p className="text-xs text-[#737373]">{tc("noData")}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#e5e5e5]">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-xs text-[#525252]">
              <tr>
                <th className="px-3 py-2 text-left">{t("filterHistory.colName")}</th>
                <th className="px-3 py-2 text-left">{t("filterHistory.colCycle")}</th>
                <th className="px-3 py-2 text-left">{t("filterHistory.colLastReplaced")}</th>
                <th className="px-3 py-2 text-left">{t("filterHistory.colNextDue")}</th>
                <th className="px-3 py-2 text-left">{t("filterHistory.colDaysRemaining")}</th>
                <th className="px-3 py-2 text-right">{t("filterHistory.colQuantity")}</th>
                <th className="px-3 py-2 text-right">{t("filterHistory.colCost")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filters.map((f) => (
                <tr key={f.key} className="border-t border-[#f5f5f5]">
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{localizedName(f)}</span>
                      <span className="text-xs text-[#737373]">
                        {f.sku ?? "—"} ·{" "}
                        <span
                          className={
                            f.source === "MANUAL"
                              ? "text-amber-700"
                              : f.source === "OVERRIDE"
                                ? "text-[var(--brand-blue-700)]"
                                : "text-[#737373]"
                          }
                        >
                          {t(`filterHistory.source.${f.source}` as never)}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {f.cycleMonths != null
                      ? t("filterHistory.cycleValue", { months: f.cycleMonths })
                      : "—"}
                    <div className="text-[10px] text-[#a3a3a3]">
                      {t(`filterHistory.cycleSource.${f.cycleSource}` as never)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-sm">{formatDate(f.lastReplacedAt, locale)}</td>
                  <td className="px-3 py-2 text-sm">{formatDate(f.nextDueAt, locale)}</td>
                  <td className="px-3 py-2 text-sm">
                    {f.daysRemaining == null ? (
                      "—"
                    ) : (
                      <span
                        className={
                          f.daysRemaining < 0
                            ? "rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800"
                            : f.daysRemaining <= 30
                              ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
                              : "text-xs text-[#525252]"
                        }
                      >
                        {t("filterHistory.daysValue", { days: f.daysRemaining })}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-sm">{f.quantity}</td>
                  <td className="px-3 py-2 text-right text-sm">
                    {formatVnd(f.unitPrice ?? f.lastUnitPrice)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canManage && (f.overrideId || f.consumableId) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(f)}
                      >
                        {t("filterHistory.editCycle")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && (
        <FilterAddManualModal
          equipmentId={equipmentId}
          onClose={() => setShowAdd(false)}
          onDone={() => {
            setShowAdd(false);
            void query.refetch();
          }}
        />
      )}
      {editing && (
        <FilterEditCycleModal
          equipmentId={equipmentId}
          row={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void query.refetch();
          }}
        />
      )}
    </div>
  );
}

function FilterAddManualModal({
  equipmentId,
  onClose,
  onDone,
}: Readonly<{
  equipmentId: string;
  onClose: () => void;
  onDone: () => void;
}>) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const api = useApi();
  const [customName, setCustomName] = useState("");
  const [cycleMonths, setCycleMonths] = useState<number>(6);
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/equipment/${equipmentId}/consumables`, {
        customName: customName.trim(),
        replaceEveryDays: cycleMonths,
        quantity,
        unitPrice,
      });
      onDone();
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("filterHistory.addManual")}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={submit}
            isLoading={busy}
            disabled={customName.trim().length === 0 || cycleMonths < 1}
          >
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label={t("filterHistory.manualName")} required>
          <Input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="예: 타사 RO 멤브레인"
          />
        </FormField>
        <FormField label={t("filterHistory.cycleMonths")} required>
          <Input
            type="number"
            value={cycleMonths}
            onChange={(e) => setCycleMonths(Number(e.target.value))}
            min={1}
            max={3600}
          />
        </FormField>
        <FormField label={t("filterHistory.quantity")}>
          <Input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            min={1}
            max={50}
          />
        </FormField>
        <FormField label={t("filterHistory.unitPrice")}>
          <Input
            type="number"
            value={unitPrice}
            onChange={(e) => setUnitPrice(Number(e.target.value))}
            min={0}
          />
        </FormField>
        {err && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}
      </div>
    </Modal>
  );
}

function FilterEditCycleModal({
  equipmentId,
  row,
  onClose,
  onDone,
}: Readonly<{
  equipmentId: string;
  row: FilterRow;
  onClose: () => void;
  onDone: () => void;
}>) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const api = useApi();
  const [cycleMonths, setCycleMonths] = useState<number>(row.cycleMonths ?? 6);
  const [quantity, setQuantity] = useState<number>(row.quantity);
  const [unitPrice, setUnitPrice] = useState<number>(
    row.unitPrice ? Number(row.unitPrice) : 0,
  );
  // "최근 교체일" admin override (empty = revert to visit-derived date).
  const [lastReplaced, setLastReplaced] = useState<string>(
    row.lastReplacedAtOverride ? formatDate(row.lastReplacedAtOverride, "en") : "",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      // If this is a CATALOG row (no overrideId), we need to create an
      // override first; otherwise PATCH the existing one.
      if (row.overrideId) {
        await api.patch(
          `/api/equipment/${equipmentId}/consumables/${row.overrideId}`,
          {
            replaceEveryDays: cycleMonths,
            quantity,
            unitPrice,
            lastReplacedAtOverride: lastReplaced || null,
          },
        );
      } else if (row.consumableId) {
        await api.post(`/api/equipment/${equipmentId}/consumables`, {
          consumableId: row.consumableId,
          replaceEveryDays: cycleMonths,
          quantity,
          unitPrice,
          lastReplacedAtOverride: lastReplaced || null,
        });
      }
      onDone();
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeOverride() {
    if (!row.overrideId) return;
    setBusy(true);
    setErr(null);
    try {
      await api.del(
        `/api/equipment/${equipmentId}/consumables/${row.overrideId}`,
      );
      onDone();
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("filterHistory.editCycle")}
      size="md"
      footer={
        <>
          {row.overrideId && (
            <Button variant="danger" onClick={removeOverride} disabled={busy}>
              {row.source === "MANUAL" ? tc("delete") : t("filterHistory.resetCycle")}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} isLoading={busy} disabled={cycleMonths < 1}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label={t("filterHistory.cycleMonths")} required>
          <Input
            type="number"
            value={cycleMonths}
            onChange={(e) => setCycleMonths(Number(e.target.value))}
            min={1}
            max={3600}
          />
        </FormField>
        <FormField label={t("filterHistory.quantity")}>
          <Input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            min={1}
            max={50}
          />
        </FormField>
        <FormField label={t("filterHistory.unitPrice")}>
          <Input
            type="number"
            value={unitPrice}
            onChange={(e) => setUnitPrice(Number(e.target.value))}
            min={0}
          />
        </FormField>
        <FormField
          label={t("filterHistory.lastReplacedOverride")}
          hint={t("filterHistory.lastReplacedHint")}
        >
          <DatePicker
            ariaLabel={t("filterHistory.lastReplacedOverride")}
            value={lastReplaced}
            onChange={setLastReplaced}
          />
        </FormField>
        {err && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}
      </div>
    </Modal>
  );
}

interface EquipmentPaymentRow {
  id: string;
  kind: string;
  state: string;
  method: string;
  expectedAmount: string;
  actualAmount: string;
  collectedAt: string | null;
  reconciledAt: string | null;
  notes: string | null;
  collectedBy: { id: string; username: string } | null;
  visit: { id: string; type: string; scheduledFor: string } | null;
  contract: { id: string; contractNumber: string; type: string } | null;
}

export function EquipmentPaymentsList({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const locale = useLocale();
  const query = useApiQuery<{
    rows: EquipmentPaymentRow[];
    totals: { byKind: Record<string, number>; byState: Record<string, number> };
  }>(`/api/equipment/${equipmentId}/payments`);
  const rows = query.data?.rows ?? [];
  const byKind = query.data?.totals.byKind ?? {};

  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#002A4D]">
          {t("paymentsList.title")}
        </h3>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(byKind).map(([kind, total]) => (
            <span
              key={kind}
              className="rounded-full bg-[var(--brand-blue-50)] px-2 py-0.5 text-[var(--brand-blue-700)]"
            >
              {kind}: {formatVnd(total)}
            </span>
          ))}
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="text-xs text-[#737373]">{tc("noData")}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#e5e5e5]">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-xs text-[#525252]">
              <tr>
                <th className="px-3 py-2 text-left">{t("paymentsList.colDate")}</th>
                <th className="px-3 py-2 text-left">{t("paymentsList.colKind")}</th>
                <th className="px-3 py-2 text-left">{t("paymentsList.colVisit")}</th>
                <th className="px-3 py-2 text-left">{t("paymentsList.colMethod")}</th>
                <th className="px-3 py-2 text-left">{t("paymentsList.colState")}</th>
                <th className="px-3 py-2 text-right">{t("paymentsList.colAmount")}</th>
                <th className="px-3 py-2 text-left">{t("paymentsList.colCollectedBy")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[#f5f5f5]">
                  <td className="px-3 py-2 text-xs">{formatDate(r.collectedAt, locale)}</td>
                  <td className="px-3 py-2 text-xs">{r.kind}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.visit ? (
                      <Link
                        href={`/o/visits/${r.visit.id}`}
                        className="text-[var(--brand-blue-700)] hover:underline"
                      >
                        {r.visit.type}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.method}</td>
                  <td className="px-3 py-2 text-xs">{r.state}</td>
                  <td className="px-3 py-2 text-right">{formatVnd(r.actualAmount)}</td>
                  <td className="px-3 py-2 text-xs">{r.collectedBy?.username ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
