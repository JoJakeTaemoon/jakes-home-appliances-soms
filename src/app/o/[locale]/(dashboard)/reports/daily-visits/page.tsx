"use client";

/**
 * UC-RP-01 — Daily visit summary.
 *
 * Date picker + Recharts bar chart of completions per technician + a state
 * breakdown card row. CSV export pulls the same data.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useApi } from "@/lib/api/client";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

interface SummaryResp {
  date: string;
  scheduled: number;
  inProgress: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
  byTechnician: Array<{
    techId: string;
    name: string;
    total: number;
    completed: number;
  }>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyVisitsReportPage() {
  const t = useTranslations("reports.daily");
  const api = useApi();
  const [date, setDate] = useState<string>(todayIso());
  const [data, setData] = useState<SummaryResp | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<SummaryResp>(
        `/api/reports/daily-visits?date=${date}`,
      );
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, [api, date]);
  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const chartData = useMemo(() => data?.byTechnician ?? [], [data]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[#525252]">{t("description")}</p>
        </div>
        <div className="flex items-end gap-2">
          <FormField label={t("date")}>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayIso())}
            />
          </FormField>
          <a
            href={`/api/reports/daily-visits?date=${date}&format=csv`}
            className="inline-flex h-10 items-center rounded-lg border border-[#e5e5e5] bg-white px-3 text-sm text-[#525252] hover:bg-[#fafafa]"
          >
            {t("downloadCsv")}
          </a>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <KpiCard label={t("totals.total")} value={data?.total ?? 0} />
        <KpiCard label={t("totals.scheduled")} value={data?.scheduled ?? 0} />
        <KpiCard label={t("totals.inProgress")} value={data?.inProgress ?? 0} />
        <KpiCard
          label={t("totals.completed")}
          value={data?.completed ?? 0}
          tone="success"
        />
        <KpiCard
          label={t("totals.failed")}
          value={data?.failed ?? 0}
          tone="danger"
        />
      </section>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-[#002A4D]">
          {t("byTechnician")}
        </h2>
        {loading && <p className="text-sm text-[#737373]">Loading…</p>}
        {!loading && chartData.length === 0 && (
          <p className="text-sm text-[#737373]">{t("noTechnicianData")}</p>
        )}
        {!loading && chartData.length > 0 && (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" stroke="#737373" fontSize={12} />
                  <YAxis stroke="#737373" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total" name={t("totals.total")} fill="#0071BD" />
                  <Bar
                    dataKey="completed"
                    name={t("totals.completed")}
                    fill="#10b981"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[#737373]">
                  <th className="py-2 font-medium">{t("technician")}</th>
                  <th className="py-2 font-medium text-right">
                    {t("totals.total")}
                  </th>
                  <th className="py-2 font-medium text-right">
                    {t("totals.completed")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((r) => (
                  <tr key={r.techId} className="border-t border-[#f0f0f0]">
                    <td className="py-2">{r.name}</td>
                    <td className="py-2 text-right tabular-nums">{r.total}</td>
                    <td className="py-2 text-right tabular-nums">{r.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) {
  const cls =
    tone === "success"
      ? "border-emerald-500"
      : tone === "danger"
        ? "border-red-500"
        : "border-[#e5e5e5]";
  return (
    <div className={`rounded-2xl border-2 ${cls} bg-white p-3`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#737373]">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold text-[#002A4D] tabular-nums">
        {value}
      </div>
    </div>
  );
}
