"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useApiQuery } from "@/lib/api/hooks";
import { useApi, ApiClientError } from "@/lib/api/client";

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

export function ServiceConfigTable({ equipmentId }: Readonly<Props>) {
  const t = useTranslations("equipment.serviceConfig");
  const tc = useTranslations("common");
  const locale = useLocale();
  const api = useApi();
  const q = useApiQuery<{ rows: Row[] }>(
    `/api/equipment/${equipmentId}/service-config`,
  );
  const rows = q.data?.rows ?? [];
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateUserCycle(row: Row, value: number | null) {
    setBusyKey(row.key);
    setError(null);
    try {
      if (row.kind === "INSPECTION") {
        await api.patch(`/api/equipment/${equipmentId}`, {
          customInspectionCycle: value,
        });
      } else if (row.overrideId) {
        if (value === null) {
          await api.del(`/api/equipment/${equipmentId}/consumables/${row.overrideId}`);
        } else {
          await api.patch(
            `/api/equipment/${equipmentId}/consumables/${row.overrideId}`,
            { replaceEveryMonths: value },
          );
        }
      } else {
        // CATALOG row without an override yet — create one.
        await api.post(`/api/equipment/${equipmentId}/consumables`, {
          consumableId: row.consumableId,
          replaceEveryMonths: value,
          quantity: row.quantity,
        });
      }
      await q.refetch();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  function pickName(name: Row["name"]): string {
    if (typeof name === "string") return name;
    return (locale === "ko" ? name.ko : locale === "en" ? name.en : name.vi) ?? "—";
  }

  return (
    <div>
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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.key} className="hover:bg-blue-50">
                <td className="py-2">
                  <KindChip kind={r.kind} />
                </td>
                <td className="py-2 font-medium text-gray-900">{pickName(r.name)}</td>
                <td className="py-2 text-gray-500">
                  {r.defaultCycleMonths ?? "—"} {r.defaultCycleMonths ? t("monthsShort") : ""}
                </td>
                <td className="py-2">
                  <UserCycleInput
                    value={r.userCycleMonths ?? r.defaultCycleMonths ?? null}
                    busy={busyKey === r.key}
                    onChange={(v) => updateUserCycle(r, v)}
                  />
                </td>
                <td className="py-2">{r.quantity}</td>
                <td className="py-2 text-gray-500">{formatDate(r.previousAt, locale)}</td>
                <td className="py-2 text-gray-500">{formatDate(r.lastAt, locale)}</td>
                <td className="py-2 text-gray-900">{formatDate(r.nextDueAt, locale)}</td>
                <td className="py-2 text-gray-700">
                  {r.daysRemaining !== null ? `${r.daysRemaining} ${tc("daysRemaining")}` : "—"}
                </td>
                <td className="py-2">
                  <StatusChip status={r.status} t={t} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && (
        <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
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

function UserCycleInput({
  value,
  busy,
  onChange,
}: Readonly<{
  value: number | null;
  busy: boolean;
  onChange: (v: number | null) => void;
}>) {
  const [local, setLocal] = useState(value === null ? "" : String(value));

  function commit() {
    const n = local.trim() === "" ? null : Number(local);
    if (n !== null && (Number.isNaN(n) || n <= 0 || n > 120)) {
      setLocal(value === null ? "" : String(value));
      return;
    }
    if (n !== value) onChange(n);
  }

  return (
    <input
      type="number"
      min={1}
      max={120}
      value={local}
      disabled={busy}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-xs"
    />
  );
}

function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (locale === "vi") {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
