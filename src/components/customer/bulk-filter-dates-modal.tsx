"use client";

/**
 * 필터 최근 교환일 일괄 입력 — pick the customer's units (a whole model in one
 * click), give each filter a date, save once. A company with 100 units of a
 * model is one form, not 100 edits on the equipment screen.
 */

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { useApi, ApiClientError } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { pickModelName } from "@/lib/products/name";

interface Named {
  nameKo: string | null;
  nameVi: string | null;
  nameEn: string | null;
}
interface Unit {
  id: string;
  assetCode: string | null;
  model: (Named & { id: string; modelCode: string | null }) | null;
  filters: { consumableId: string; lastReplacedAt: string | null }[];
}
interface Payload {
  consumables: (Named & { id: string; sku: string })[];
  units: Unit[];
}
interface Result {
  units: number;
  created: number;
  updated: number;
  skipped: number;
}

/** Today in VST — the server refuses a later date. */
const todayVst = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

export function BulkFilterDatesModal({
  open,
  onClose,
  customerId,
  preselectIds,
  onSaved,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  customerId: string;
  preselectIds?: string[];
  onSaved: () => void;
}>) {
  const t = useTranslations("customers.bulkFilterDates");
  const tc = useTranslations("common");
  const locale = useLocale();
  const api = useApi();
  const q = useApiQuery<Payload>(open ? `/api/customers/${customerId}/equipment-filters` : null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(preselectIds));
  const [dates, setDates] = useState<Record<string, string>>({});
  const [allDate, setAllDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Result | null>(null);

  const units = useMemo(() => q.data?.units ?? [], [q.data]);
  const groups = useMemo(() => {
    const m = new Map<string, Unit[]>();
    for (const u of units) {
      const k = u.model?.id ?? "";
      m.set(k, [...(m.get(k) ?? []), u]);
    }
    return [...m.values()];
  }, [units]);
  // Only the filters the chosen units carry.
  const filters = useMemo(() => {
    const ids = new Set(units.filter((u) => selected.has(u.id)).flatMap((u) => u.filters.map((f) => f.consumableId)));
    return (q.data?.consumables ?? []).filter((c) => ids.has(c.id));
  }, [units, selected, q.data]);
  const entries = filters.filter((f) => dates[f.id]).map((f) => ({ consumableId: f.id, lastReplacedAt: dates[f.id] }));

  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<Result>(`/api/customers/${customerId}/equipment-filters`, {
        equipmentIds: units.filter((u) => selected.has(u.id)).map((u) => u.id),
        entries,
      });
      setDone(r.data);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const name = (n: Named & { sku?: string }) =>
    (locale === "ko" ? n.nameKo : locale === "en" ? n.nameEn : n.nameVi) || n.nameVi || n.nameKo || n.nameEn || n.sku || "—";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t("title")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {done ? tc("close") : tc("cancel")}
          </Button>
          <Button onClick={save} isLoading={busy} disabled={selected.size === 0 || entries.length === 0}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>{t("units")}</span>
            <span className="text-xs text-[#737373]">{t("selectedCount", { count: selected.size })}</span>
          </div>
          {units.length === 0 ? (
            <p className="text-sm text-[#737373]">{q.isLoading ? tc("loading") : t("noUnits")}</p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded border border-[#e5e5e5] p-2 text-sm">
              {groups.map((g) => {
                const ids = g.map((u) => u.id);
                const all = ids.every((id) => selected.has(id));
                return (
                  <div key={g[0].model?.id ?? "none"} className="mb-2">
                    <label className="flex items-center gap-2 font-medium">
                      <input type="checkbox" checked={all} onChange={(e) => toggle(ids, e.target.checked)} />
                      {pickModelName(g[0].model, locale)} ({g.length})
                    </label>
                    <div className="ml-6 flex flex-wrap gap-x-3">
                      {g.map((u) => (
                        <label key={u.id} className="flex items-center gap-1 font-mono text-xs">
                          <input type="checkbox" checked={selected.has(u.id)} onChange={(e) => toggle([u.id], e.target.checked)} />
                          {u.assetCode ?? "—"}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("filters")}</span>
          {filters.length === 0 ? (
            <p className="text-sm text-[#737373]">{t("pickUnits")}</p>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                <DatePicker value={allDate} onChange={setAllDate} max={todayVst()} ariaLabel={t("applyAllLabel")} placeholder={t("applyAllLabel")} />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!allDate}
                  onClick={() => setDates(Object.fromEntries(filters.map((f) => [f.id, allDate])))}
                >
                  {t("applyAll")}
                </Button>
              </div>
              {filters.map((f) => (
                <label key={f.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{name(f)}</span>
                  <DatePicker
                    value={dates[f.id] ?? ""}
                    onChange={(v) => setDates((d) => ({ ...d, [f.id]: v }))}
                    max={todayVst()}
                    ariaLabel={name(f)}
                    className="w-40 shrink-0"
                  />
                </label>
              ))}
            </>
          )}
          <p className="text-xs text-[#737373]">{t("hint")}</p>
        </section>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="mt-3 text-sm text-green-700">
          {t("saved", { ...done })}
        </p>
      )}
    </Modal>
  );
}
