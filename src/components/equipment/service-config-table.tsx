"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useApiQuery } from "@/lib/api/hooks";
import { useApi, ApiClientError } from "@/lib/api/client";
import { formatDateOrDash as formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Row {
  kind: "INSPECTION" | "FILTER";
  key: string;
  sourceKind?: "CATALOG" | "OVERRIDE" | "MANUAL";
  overrideId: string | null;
  consumableId: string | null;
  name: { ko: string | null; vi: string | null; en: string | null } | string;
  sku: string | null;
  defaultCycleMonths: number | null;
  userCycleMonths: number | null;
  effectiveCycleMonths: number | null;
  quantity: number;
  previousAt: string | null;
  lastAt: string | null;
  nextDueAt: string | null;
  daysRemaining: number | null;
  lastUnitPrice: number | null;
  status: "NORMAL" | "SCHEDULED" | "REPLACE_DUE" | "OVERDUE" | "UNKNOWN";
}

interface Props {
  equipmentId: string;
}

/** The open row's values. Strings so an empty box means "clear" and a
 *  half-typed number never becomes NaN. */
interface Draft {
  name: string;
  cycle: string;
  qty: string;
  last: string;
  next: string;
}

/**
 * 서비스 구성 — the unit's inspection cycle and its filters.
 *
 * Every row has its own 수정 / 삭제. 수정 opens that row's boxes and swaps in
 * 저장 / 취소; nothing reaches the server before 저장. 삭제 (after a confirm)
 * takes a filter off this unit, stored the way that filter is kept: a filter
 * added to this unit alone is deleted; a catalog filter (one the model lists)
 * is marked excluded for this unit, so the model and every other unit keep it.
 * 기본 주기 is the catalog's, and 과거 수행일 / 잔여일 / 상태 are computed, so
 * those columns stay read-only.
 */
export function ServiceConfigTable({ equipmentId }: Readonly<Props>) {
  const t = useTranslations("equipment.serviceConfig");
  const tc = useTranslations("common");
  const locale = useLocale();
  const api = useApi();
  const q = useApiQuery<{ rows: Row[] }>(
    `/api/equipment/${equipmentId}/service-config`,
  );
  const rows = q.data?.rows ?? [];
  const [editing, setEditing] = useState<{ key: string; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/equipment/${equipmentId}`;

  // A whole cycle has passed with no change recorded, so the due date is only
  // a guess from the install date (typical after a data migration). A new
  // install inside its first cycle is fine — its filter is new.
  const missingLast = (r: Row) => r.kind === "FILTER" && r.lastAt === null && r.status === "OVERDUE";
  const missingCount = rows.filter(missingLast).length;

  function pickName(name: Row["name"]): string {
    if (typeof name === "string") return name;
    return (locale === "ko" ? name.ko : locale === "en" ? name.en : name.vi) ?? "—";
  }

  const draftOf = (r: Row): Draft => ({
    name: pickName(r.name),
    cycle: String(r.userCycleMonths ?? r.defaultCycleMonths ?? ""),
    qty: String(r.quantity),
    last: toYmd(r.lastAt),
    next: toYmd(r.nextDueAt),
  });

  function startEdit(r: Row) {
    setError(null);
    setEditing({ key: r.key, draft: draftOf(r) });
  }

  function patchDraft(patch: Partial<Draft>) {
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));
  }

  /** The request that stores the open row; null when nothing changed. */
  function requestFor(r: Row, d: Draft): (() => Promise<unknown>) | null {
    const o = draftOf(r);
    const cycle = d.cycle.trim() === "" ? null : Number(d.cycle);
    if (cycle !== null && !(Number.isInteger(cycle) && cycle >= 1 && cycle <= 3600)) throw new Error(t("cycleInvalid"));
    const last = d.last !== o.last ? { v: d.last || null } : null;
    const next = d.next !== o.next ? { v: d.next || null } : null;
    const cycleChanged = d.cycle !== o.cycle;

    if (r.kind === "INSPECTION") {
      const body = {
        ...(cycleChanged ? { customInspectionCycleDays: cycle } : {}),
        ...(last ? { lastInspectionAtOverride: last.v } : {}),
        ...(next ? { nextInspectionAtOverride: next.v } : {}),
      };
      return Object.keys(body).length ? () => api.patch(base, body) : null;
    }

    const qty = Number(d.qty);
    if (!(Number.isInteger(qty) && qty >= 1 && qty <= 50)) throw new Error(t("quantityInvalid"));
    if (r.sourceKind === "MANUAL" && cycleChanged && cycle === null) throw new Error(t("cycleRequired"));
    const name = d.name.trim();
    if (r.sourceKind === "MANUAL" && !name) throw new Error(t("nameRequired"));
    const fields = {
      ...(r.sourceKind === "MANUAL" && name !== o.name ? { customName: name } : {}),
      ...(qty !== r.quantity ? { quantity: qty } : {}),
      ...(cycleChanged ? { replaceEveryDays: cycle } : {}),
      ...(last ? { lastReplacedAtOverride: last.v } : {}),
      ...(next ? { nextReplaceAtOverride: next.v } : {}),
    };
    if (!Object.keys(fields).length) return null;
    if (r.overrideId) return () => api.patch(`${base}/consumables/${r.overrideId}`, fields);
    // A catalog filter with nothing stored for this unit yet — create its row.
    return () => api.post(`${base}/consumables`, { consumableId: r.consumableId, quantity: qty, ...fields });
  }

  async function run(send: () => Promise<unknown>, after: () => void) {
    setBusy(true);
    setError(null);
    try {
      await send();
      after();
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : String(err));
    } finally {
      await q.refetch();
      setBusy(false);
    }
  }

  function save(r: Row) {
    if (!editing) return;
    let send: (() => Promise<unknown>) | null;
    try {
      send = requestFor(r, editing.draft);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    if (!send) return setEditing(null);
    void run(send, () => setEditing(null));
  }

  function remove(r: Row) {
    const send =
      r.sourceKind === "MANUAL" && r.overrideId
        ? () => api.del(`${base}/consumables/${r.overrideId}`)
        : r.overrideId
          ? () => api.patch(`${base}/consumables/${r.overrideId}`, { excluded: true })
          : () => api.post(`${base}/consumables`, { consumableId: r.consumableId, quantity: r.quantity, excluded: true });
    void run(send, () => setDeleting(null));
  }

  const box = "rounded border border-gray-300 px-1.5 py-0.5 text-xs";

  return (
    <div>
      {missingCount > 0 && (
        <p
          role="status"
          className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          {t("missingLastWarning", { count: missingCount })}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">{t("kindHeader")}</th>
              <th className="py-2">{t("name")}</th>
              <th className="py-2">{t("defaultCycle")}</th>
              <th className="py-2">{t("userCycle")}</th>
              <th className="py-2">{t("quantity")}</th>
              <th className="py-2">{t("previousAt")}</th>
              <th className="py-2">{t("lastAt")}</th>
              <th className="py-2">{t("nextDueAt")}</th>
              <th className="py-2">{t("daysRemaining")}</th>
              <th className="py-2">{t("status.header")}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const d = editing?.key === r.key ? editing.draft : null;
              const name = pickName(r.name);
              return (
                <tr key={r.key} className={d ? "bg-blue-50" : "hover:bg-blue-50"}>
                  <td className="py-2">
                    <KindChip kind={r.kind} />
                  </td>
                  <td className="py-2 font-medium text-gray-900">
                    {d && r.sourceKind === "MANUAL" ? (
                      <input
                        aria-label={`${name} ${t("name")}`}
                        value={d.name}
                        onChange={(e) => patchDraft({ name: e.target.value.slice(0, 200) })}
                        className={`w-36 ${box}`}
                      />
                    ) : (
                      name
                    )}
                  </td>
                  <td className="py-2 text-gray-500">
                    {r.defaultCycleMonths ?? "—"} {r.defaultCycleMonths ? t("monthsShort") : ""}
                  </td>
                  <td className="py-2">
                    {d ? (
                      <input
                        inputMode="numeric"
                        aria-label={`${name} ${t("userCycle")}`}
                        value={d.cycle}
                        onChange={(e) => patchDraft({ cycle: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                        className={`w-16 ${box}`}
                      />
                    ) : (
                      (r.userCycleMonths ?? r.defaultCycleMonths ?? "—")
                    )}
                  </td>
                  <td className="py-2">
                    {d && r.kind === "FILTER" ? (
                      <input
                        inputMode="numeric"
                        aria-label={`${name} ${t("quantity")}`}
                        value={d.qty}
                        onChange={(e) => patchDraft({ qty: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                        className={`w-12 ${box}`}
                      />
                    ) : (
                      r.quantity
                    )}
                  </td>
                  <td className="py-2 text-gray-500">{formatDate(r.previousAt, locale)}</td>
                  <td className={`py-2 ${missingLast(r) ? "rounded bg-amber-50" : ""}`}>
                    {d ? (
                      <DateCell value={d.last} label={`${name} ${t("lastAt")}`} onChange={(v) => patchDraft({ last: v })} />
                    ) : (
                      formatDate(r.lastAt, locale)
                    )}
                  </td>
                  <td className="py-2">
                    {d ? (
                      <DateCell value={d.next} label={`${name} ${t("nextDueAt")}`} onChange={(v) => patchDraft({ next: v })} />
                    ) : (
                      formatDate(r.nextDueAt, locale)
                    )}
                  </td>
                  <td className="py-2 text-gray-700">
                    {r.daysRemaining !== null ? `${r.daysRemaining} ${tc("daysRemaining")}` : "—"}
                  </td>
                  <td className="py-2">
                    <StatusChip status={r.status} t={t} />
                  </td>
                  <td className="whitespace-nowrap py-2 text-right">
                    <div className="flex justify-end gap-1">
                      {d ? (
                        <>
                          <Button size="sm" onClick={() => save(r)} isLoading={busy}>
                            {tc("save")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
                            {tc("cancel")}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => startEdit(r)} disabled={busy || !!editing}>
                            {tc("edit")}
                          </Button>
                          {r.kind === "FILTER" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600"
                              title={t(r.sourceKind === "MANUAL" ? "deleteHintManual" : "deleteHintCatalog")}
                              onClick={() => setDeleting(r)}
                              disabled={busy || !!editing}
                            >
                              {tc("delete")}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && (
        <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </div>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={t("deleteTitle")}
        message={
          deleting
            ? `${pickName(deleting.name)} — ${t(deleting.sourceKind === "MANUAL" ? "deleteHintManual" : "deleteHintCatalog")}`
            : ""
        }
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        variant="danger"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove(deleting);
        }}
      />
    </div>
  );
}

function KindChip({ kind }: Readonly<{ kind: "INSPECTION" | "FILTER" }>) {
  const t = useTranslations("equipment.serviceConfig.kind");
  if (kind === "INSPECTION") {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
        {t("INSPECTION")}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
      {t("FILTER")}
    </span>
  );
}

function StatusChip({
  status,
  t,
}: Readonly<{
  status: Row["status"];
  t: (k: string) => string;
}>) {
  const map: Record<Row["status"], { label: string; bg: string; fg: string }> = {
    NORMAL: { label: t("status.NORMAL"), bg: "bg-green-100", fg: "text-green-700" },
    SCHEDULED: { label: t("status.SCHEDULED"), bg: "bg-blue-100", fg: "text-blue-700" },
    REPLACE_DUE: {
      label: t("status.REPLACE_DUE"),
      bg: "bg-orange-100",
      fg: "text-orange-700",
    },
    OVERDUE: { label: t("status.OVERDUE"), bg: "bg-red-100", fg: "text-red-700" },
    UNKNOWN: { label: "—", bg: "bg-gray-100", fg: "text-gray-500" },
  };
  const s = map[status];
  return (
    <span className={`rounded-full ${s.bg} px-2 py-0.5 text-[10px] font-medium ${s.fg}`}>
      {s.label}
    </span>
  );
}

/** ISO → YYYY-MM-DD by slicing the date part directly — no Date/timezone
 *  round-trip, so overrides stored as UTC midnight edit back to the same day
 *  regardless of the viewer's local offset. */
function toYmd(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/** Date box for 최근수행일 / 다음예정일 on the open row. Empty = clear the override. */
function DateCell({
  value,
  label,
  onChange,
}: Readonly<{
  value: string;
  label: string;
  onChange: (v: string) => void;
}>) {
  return (
    <input
      type="date"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-32 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
    />
  );
}
