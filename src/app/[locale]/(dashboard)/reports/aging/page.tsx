"use client";

/**
 * UC-RP-04 — A/R aging.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useApi } from "@/lib/api/client";
import { Link } from "@/i18n/navigation";
import { formatVnd } from "@/lib/format";

type Bucket = "current" | "1-7" | "8-14" | "15-30" | "30+";

interface AgingResp {
  asOf: string;
  buckets: Record<Bucket, { count: number; total: number }>;
  rows: Array<{
    customerId: string;
    customerCode: string;
    customerName: string;
    paymentId: string;
    expectedAmount: number;
    actualAmount: number;
    outstanding: number;
    dueDate: string | null;
    daysOverdue: number;
    bucket: Bucket;
  }>;
  total: number;
}

const BUCKET_COLORS: Record<Bucket, string> = {
  current: "#10b981",
  "1-7": "#f59e0b",
  "8-14": "#f97316",
  "15-30": "#ef4444",
  "30+": "#7f1d1d",
};

export default function AgingReportPage() {
  const t = useTranslations("reports.aging");
  const api = useApi();
  const [data, setData] = useState<AgingResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Bucket | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<AgingResp>(`/api/reports/aging`);
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const pieData = (["current", "1-7", "8-14", "15-30", "30+"] as Bucket[]).map(
    (b) => ({
      name: t(`buckets.${b}` as `buckets.${Bucket}`),
      key: b,
      value: data?.buckets[b].total ?? 0,
      count: data?.buckets[b].count ?? 0,
    }),
  );

  const filteredRows =
    filter === "all"
      ? (data?.rows ?? [])
      : (data?.rows ?? []).filter((r) => r.bucket === filter);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[#525252]">{t("description")}</p>
        </div>
        <a
          href={`/api/reports/aging?format=csv`}
          className="inline-flex h-10 items-center rounded-lg border border-[#e5e5e5] bg-white px-3 text-sm text-[#525252] hover:bg-[#fafafa]"
        >
          {t("downloadCsv")}
        </a>
      </header>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr,1.4fr]">
        <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-[#002A4D]">
            {t("totalOutstanding")}
          </h2>
          <div className="mb-3 text-2xl font-semibold text-[#002A4D]">
            {formatVnd(data?.total ?? 0)}
          </div>
          {loading && <p className="text-sm text-[#737373]">Loading…</p>}
          {!loading && (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.key} fill={BUCKET_COLORS[d.key]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => formatVnd(Number(v ?? 0))}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={
                filter === "all"
                  ? "rounded-md border-2 border-[var(--brand-blue-500)] bg-[var(--brand-blue-50)] px-2 py-1 text-xs font-medium text-[var(--brand-blue-700)]"
                  : "rounded-md border border-[#e5e5e5] bg-white px-2 py-1 text-xs text-[#525252] hover:bg-[#fafafa]"
              }
            >
              {t("filters.all")}
            </button>
            {pieData.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setFilter(d.key)}
                className={
                  filter === d.key
                    ? "rounded-md border-2 px-2 py-1 text-xs font-medium"
                    : "rounded-md border border-[#e5e5e5] bg-white px-2 py-1 text-xs text-[#525252] hover:bg-[#fafafa]"
                }
                style={
                  filter === d.key
                    ? {
                        borderColor: BUCKET_COLORS[d.key],
                        backgroundColor: BUCKET_COLORS[d.key] + "22",
                        color: BUCKET_COLORS[d.key],
                      }
                    : undefined
                }
              >
                {d.name} ({d.count})
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[#737373]">
                  <th className="py-2 font-medium">{t("columns.customer")}</th>
                  <th className="py-2 font-medium text-right">
                    {t("columns.outstanding")}
                  </th>
                  <th className="py-2 font-medium text-right">
                    {t("columns.daysOverdue")}
                  </th>
                  <th className="py-2 font-medium">{t("columns.bucket")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.paymentId} className="border-t border-[#f0f0f0]">
                    <td className="py-2">
                      <Link
                        href={`/customers/${r.customerId}`}
                        className="text-[var(--brand-blue-700)] hover:underline"
                      >
                        {r.customerCode}
                      </Link>
                      <div className="text-xs text-[#737373]">
                        {r.customerName}
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatVnd(r.outstanding)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {r.daysOverdue}
                    </td>
                    <td className="py-2">
                      <span
                        className="rounded-md px-2 py-0.5 text-xs"
                        style={{
                          color: BUCKET_COLORS[r.bucket],
                          backgroundColor: BUCKET_COLORS[r.bucket] + "22",
                        }}
                      >
                        {t(`buckets.${r.bucket}` as `buckets.${Bucket}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
