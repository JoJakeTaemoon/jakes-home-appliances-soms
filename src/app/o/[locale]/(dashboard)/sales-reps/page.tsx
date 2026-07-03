"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useApiQuery } from "@/lib/api/hooks";
import { Avatar } from "@/components/ui/avatar";

interface RepRow {
  id: string;
  username: string;
  title: string | null;
  avatarUrl: string | null;
  role: string;
  stats: {
    customerCount: number;
    last30dRevenue: number;
    receivables: number;
  };
}

export default function SalesRepsPage() {
  const t = useTranslations("salesReps");
  const tc = useTranslations("common");
  const router = useRouter();
  const q = useApiQuery<RepRow[]>("/api/sales-reps");
  const reps = q.data ?? [];

  return (
    <div className="flex w-full flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("title")}</h1>
        <p className="text-sm text-gray-500">{t("subtitle")}</p>
      </header>

      {q.isLoading && <div className="text-sm text-gray-500">{tc("loading")}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reps.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => router.push(`/o/sales-reps/${r.id}`)}
            className="flex flex-col gap-3 rounded-lg border-2 border-gray-200 bg-white p-4 text-left transition-all hover:border-blue-300 hover:shadow-sm"
          >
            <div className="flex items-center gap-3">
              <Avatar name={r.username} imageUrl={r.avatarUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-gray-900">{r.username}</div>
                <div className="text-xs text-gray-500">{r.title ?? r.role}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
              <Stat label={t("kpi.customers")} value={String(r.stats.customerCount)} />
              <Stat
                label={t("kpi.last30dRevenue")}
                value={formatMoney(r.stats.last30dRevenue)}
              />
              <Stat
                label={t("kpi.receivables")}
                value={formatMoney(r.stats.receivables)}
                tone={r.stats.receivables > 0 ? "warning" : undefined}
              />
            </div>
          </button>
        ))}
        {!q.isLoading && reps.length === 0 && (
          <div className="col-span-full rounded-md border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
            {t("emptyState")}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: Readonly<{ label: string; value: string; tone?: "warning" }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-gray-400">
        {label}
      </span>
      <span
        className={
          tone === "warning"
            ? "text-sm font-semibold text-red-600"
            : "text-sm font-semibold text-gray-900"
        }
      >
        {value}
      </span>
    </div>
  );
}

function formatMoney(v: number): string {
  if (v === 0) return "—";
  return new Intl.NumberFormat("vi-VN").format(Math.round(v)) + " ₫";
}
