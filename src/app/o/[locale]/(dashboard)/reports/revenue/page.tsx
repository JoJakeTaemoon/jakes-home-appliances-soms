"use client";

/**
 * UC-RP-02 — Monthly revenue.
 *
 * Month picker (year + 1-12) + 12-month line chart + per-bucket table.
 * Revenue here = sum of `Payment.actualAmount` where state is COLLECTED /
 * HANDED_OVER / RECONCILED, bucketed by the originating contract type.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useApiQuery } from "@/lib/api/hooks";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { formatVnd } from "@/lib/format";

interface RevenueResp {
  year: number;
  month: number;
  total: number;
  byType: Record<string, number>;
  byMonth: Array<{
    year: number;
    month: number;
    total: number;
    byType: Record<string, number>;
  }>;
}

export default function RevenueReportPage() {
  const t = useTranslations("reports.revenue");
  const now = new Date();
  const [year, setYear] = useState<number>(now.getUTCFullYear());
  const [month, setMonth] = useState<number>(now.getUTCMonth() + 1);
  const query = useApiQuery<RevenueResp>(
    `/api/reports/revenue?year=${year}&month=${month}`,
  );
  const data = query.data ?? null;
  const loading = query.isLoading;

  const chartData = (data?.byMonth ?? []).map((m) => ({
    period: `${m.year}-${String(m.month).padStart(2, "0")}`,
    total: m.total,
    sale: m.byType.SALE,
    rental: m.byType.RENTAL,
    maintenance: m.byType.MAINTENANCE,
    serviceRequestFee: m.byType.SERVICE_REQUEST_FEE,
  }));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[#525252]">{t("description")}</p>
        </div>
        <div className="flex items-end gap-2">
          <FormField label={t("year")}>
            <Input
              type="number"
              value={year}
              min={2020}
              max={2100}
              onChange={(e) => setYear(Number(e.target.value || now.getUTCFullYear()))}
            />
          </FormField>
          <FormField label={t("month")}>
            <Input
              type="number"
              value={month}
              min={1}
              max={12}
              onChange={(e) =>
                setMonth(
                  Math.min(12, Math.max(1, Number(e.target.value || 1))),
                )
              }
            />
          </FormField>
          <a
            href={`/api/reports/revenue?year=${year}&month=${month}&format=csv`}
            className="inline-flex h-10 items-center rounded-lg border border-[#e5e5e5] bg-white px-3 text-sm text-[#525252] hover:bg-[#fafafa]"
          >
            {t("downloadCsv")}
          </a>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <KpiCard
          label={t("totals.total")}
          value={formatVnd(data?.total ?? 0)}
          tone="success"
        />
        <KpiCard
          label={t("totals.sale")}
          value={formatVnd(data?.byType.SALE ?? 0)}
        />
        <KpiCard
          label={t("totals.rental")}
          value={formatVnd(data?.byType.RENTAL ?? 0)}
        />
        <KpiCard
          label={t("totals.maintenance")}
          value={formatVnd(data?.byType.MAINTENANCE ?? 0)}
        />
        <KpiCard
          label={t("totals.serviceRequestFee")}
          value={formatVnd(data?.byType.SERVICE_REQUEST_FEE ?? 0)}
        />
      </section>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-[#002A4D]">
          {t("trend12m")}
        </h2>
        {loading && <p className="text-sm text-[#737373]">Loading…</p>}
        {!loading && (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="period" stroke="#737373" fontSize={11} />
                <YAxis
                  stroke="#737373"
                  fontSize={11}
                  tickFormatter={(v: number) =>
                    new Intl.NumberFormat(undefined, { notation: "compact" }).format(v)
                  }
                />
                <Tooltip
                  formatter={(v) => formatVnd(Number(v ?? 0))}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total"
                  name={t("totals.total")}
                  stroke="#0071BD"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-[#002A4D]">
          {t("monthlyBreakdown")}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[#737373]">
                <th className="py-2 font-medium">{t("period")}</th>
                <th className="py-2 font-medium text-right">{t("totals.total")}</th>
                <th className="py-2 font-medium text-right">{t("totals.sale")}</th>
                <th className="py-2 font-medium text-right">{t("totals.rental")}</th>
                <th className="py-2 font-medium text-right">{t("totals.maintenance")}</th>
                <th className="py-2 font-medium text-right">
                  {t("totals.serviceRequestFee")}
                </th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((r) => (
                <tr key={r.period} className="border-t border-[#f0f0f0]">
                  <td className="py-2 font-mono">{r.period}</td>
                  <td className="py-2 text-right tabular-nums">{formatVnd(r.total)}</td>
                  <td className="py-2 text-right tabular-nums">{formatVnd(r.sale)}</td>
                  <td className="py-2 text-right tabular-nums">{formatVnd(r.rental)}</td>
                  <td className="py-2 text-right tabular-nums">{formatVnd(r.maintenance)}</td>
                  <td className="py-2 text-right tabular-nums">{formatVnd(r.serviceRequestFee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: Readonly<{
  label: string;
  value: string;
  tone?: "success";
}>) {
  const cls = tone === "success" ? "border-emerald-500" : "border-[#e5e5e5]";
  return (
    <div className={`rounded-2xl border-2 ${cls} bg-white p-3`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#737373]">
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold text-[#002A4D]">
        {value}
      </div>
    </div>
  );
}
