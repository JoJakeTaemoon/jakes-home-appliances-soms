"use client";

/**
 * UC-RP-03 — Technician productivity.
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
  Legend,
} from "recharts";
import { useApi } from "@/lib/api/client";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

interface Resp {
  start: string;
  end: string;
  rows: Array<{
    techId: string;
    name: string;
    visitsCompleted: number;
    avgDurationMinutes: number | null;
    lateHandoversCount: number;
  }>;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function TechnicianProductivityReportPage() {
  const t = useTranslations("reports.productivity");
  const api = useApi();
  const today = new Date();
  const thirtyAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [start, setStart] = useState(isoDate(thirtyAgo));
  const [end, setEnd] = useState(isoDate(today));
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Resp>(
        `/api/reports/technician-productivity?start=${start}&end=${end}`,
      );
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, [api, start, end]);
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
          <FormField label={t("start")}>
            <Input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value || isoDate(thirtyAgo))}
            />
          </FormField>
          <FormField label={t("end")}>
            <Input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value || isoDate(today))}
            />
          </FormField>
          <a
            href={`/api/reports/technician-productivity?start=${start}&end=${end}&format=csv`}
            className="inline-flex h-10 items-center rounded-lg border border-[#e5e5e5] bg-white px-3 text-sm text-[#525252] hover:bg-[#fafafa]"
          >
            {t("downloadCsv")}
          </a>
        </div>
      </header>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        {loading && <p className="text-sm text-[#737373]">Loading…</p>}
        {!loading && (data?.rows?.length ?? 0) === 0 && (
          <p className="text-sm text-[#737373]">{t("noData")}</p>
        )}
        {!loading && (data?.rows?.length ?? 0) > 0 && (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.rows ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" stroke="#737373" fontSize={12} />
                  <YAxis stroke="#737373" fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="visitsCompleted"
                    name={t("columns.visitsCompleted")}
                    fill="#0071BD"
                  />
                  <Bar
                    dataKey="lateHandoversCount"
                    name={t("columns.lateHandovers")}
                    fill="#ef4444"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[#737373]">
                  <th className="py-2 font-medium">{t("columns.technician")}</th>
                  <th className="py-2 font-medium text-right">
                    {t("columns.visitsCompleted")}
                  </th>
                  <th className="py-2 font-medium text-right">
                    {t("columns.avgDuration")}
                  </th>
                  <th className="py-2 font-medium text-right">
                    {t("columns.lateHandovers")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((r) => (
                  <tr key={r.techId} className="border-t border-[#f0f0f0]">
                    <td className="py-2">{r.name}</td>
                    <td className="py-2 text-right tabular-nums">
                      {r.visitsCompleted}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {r.avgDurationMinutes != null
                        ? `${r.avgDurationMinutes}m`
                        : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {r.lateHandoversCount}
                    </td>
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
