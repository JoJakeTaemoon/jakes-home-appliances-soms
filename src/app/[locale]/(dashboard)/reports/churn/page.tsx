"use client";

/**
 * UC-RP-05 — Customer churn (quarterly).
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { useApi } from "@/lib/api/client";
import { Link } from "@/i18n/navigation";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { formatVnd } from "@/lib/format";

interface ChurnResp {
  year: number;
  quarter: number;
  startedDate: string;
  endedDate: string;
  totalDeactivated: number;
  totalMonthlyValueLost: number;
  rows: Array<{
    customerId: string;
    customerCode: string;
    customerName: string;
    type: "B2C" | "B2B";
    deactivatedAt: string;
    reason: string | null;
    monthlyValueLost: number;
  }>;
  byReason: Array<{ reason: string; count: number; value: number }>;
}

export default function ChurnReportPage() {
  const t = useTranslations("reports.churn");
  const api = useApi();
  const now = new Date();
  const [year, setYear] = useState<number>(now.getUTCFullYear());
  const [quarter, setQuarter] = useState<number>(
    Math.floor(now.getUTCMonth() / 3) + 1,
  );
  const [data, setData] = useState<ChurnResp | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<ChurnResp>(
        `/api/reports/churn?year=${year}&quarter=${quarter}`,
      );
      setData(res.data);
    } catch {
      setData(null);
    }
  }, [api, year, quarter]);
  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

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
          <div className="w-32">
            <FormField label={t("quarter")}>
              <Combobox
                value={String(quarter)}
                onChange={(v) => setQuarter(Number(v ?? "1"))}
                options={[
                  { value: "1", label: "Q1" },
                  { value: "2", label: "Q2" },
                  { value: "3", label: "Q3" },
                  { value: "4", label: "Q4" },
                ]}
                allowClear={false}
                searchable={false}
              />
            </FormField>
          </div>
          <a
            href={`/api/reports/churn?year=${year}&quarter=${quarter}&format=csv`}
            className="inline-flex h-10 items-center rounded-lg border border-[#e5e5e5] bg-white px-3 text-sm text-[#525252] hover:bg-[#fafafa]"
          >
            {t("downloadCsv")}
          </a>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard
          label={t("totals.deactivated")}
          value={String(data?.totalDeactivated ?? 0)}
        />
        <KpiCard
          label={t("totals.monthlyValueLost")}
          value={formatVnd(data?.totalMonthlyValueLost ?? 0)}
          tone="danger"
        />
        <KpiCard
          label={t("totals.range")}
          value={
            data
              ? `${data.startedDate.slice(0, 10)} → ${data.endedDate.slice(0, 10)}`
              : "—"
          }
        />
      </section>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-[#002A4D]">
          {t("byReason")}
        </h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.byReason ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="reason" stroke="#737373" fontSize={11} />
              <YAxis stroke="#737373" fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name={t("count")} fill="#0071BD" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-[#002A4D]">
          {t("deactivations")}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[#737373]">
                <th className="py-2 font-medium">{t("columns.customer")}</th>
                <th className="py-2 font-medium">{t("columns.type")}</th>
                <th className="py-2 font-medium">{t("columns.deactivatedAt")}</th>
                <th className="py-2 font-medium">{t("columns.reason")}</th>
                <th className="py-2 font-medium text-right">
                  {t("columns.valueLost")}
                </th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.customerId} className="border-t border-[#f0f0f0]">
                  <td className="py-2">
                    <Link
                      href={`/customers/${r.customerId}`}
                      className="text-[var(--brand-blue-700)] hover:underline"
                    >
                      {r.customerCode}
                    </Link>
                    <div className="text-xs text-[#737373]">{r.customerName}</div>
                  </td>
                  <td className="py-2">{r.type}</td>
                  <td className="py-2">{r.deactivatedAt.slice(0, 10)}</td>
                  <td className="py-2">{r.reason ?? "—"}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatVnd(r.monthlyValueLost)}
                  </td>
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
  tone?: "danger";
}>) {
  const cls = tone === "danger" ? "border-red-500" : "border-[#e5e5e5]";
  return (
    <div className={`rounded-2xl border-2 ${cls} bg-white p-3`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#737373]">
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold text-[#002A4D]">{value}</div>
    </div>
  );
}
