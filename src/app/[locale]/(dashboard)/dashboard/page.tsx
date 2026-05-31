"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useApi } from "@/lib/api/client";
import { formatVnd } from "@/lib/format";

type RoleKey = "ADMIN" | "MANAGER" | "STAFF" | "TECHNICIAN";

interface DashboardSummary {
  today: { total: number; byState: Record<string, number> };
  pendingHandover: { total: number; stale: number; slaHours: number };
  revenueThisWeek: { total: number; count: number };
  renewals60d: number;
  overduePayments: number;
}

const WIDGET_TONE_BORDER: Record<string, string> = {
  danger: "border-red-500",
  info: "border-[var(--brand-blue-500)]",
  success: "border-emerald-500",
};

function Widget({
  label,
  value,
  hint,
  href,
  tone,
}: Readonly<{
  label: string;
  value: string;
  hint?: string;
  href?: string;
  tone?: "danger" | "info" | "success";
}>) {
  const borderClass = tone
    ? WIDGET_TONE_BORDER[tone] ?? "border-[#e5e5e5]"
    : "border-[#e5e5e5]";
  const inner = (
    <div
      className={`flex h-full flex-col rounded-2xl border-2 ${borderClass} bg-white p-4 transition-colors hover:bg-[#FAFAFA]`}
    >
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-[#737373]">
        {label}
      </div>
      <div className="text-2xl font-semibold text-[#002A4D]">{value}</div>
      <div className="mt-auto pt-1 text-xs text-[#525252]">{hint ?? " "}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tNav = useTranslations("nav");
  const tRoles = useTranslations("roles");
  const { user } = useAuth();
  const api = useApi();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<DashboardSummary>(`/api/dashboard/summary`);
      setSummary(res.data);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (user?.role && user.role !== "TECHNICIAN") {
      load().catch(() => undefined);
    } else {
      setLoading(false);
    }
  }, [load, user?.role]);

  const name = user?.username ?? "";
  const role = user?.role ? tRoles(user.role as RoleKey) : "";

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[#002A4D]">
          {t("greeting", { name })}
        </h1>
        {role && (
          <p className="mt-1 text-sm text-[#525252]">
            {role}
          </p>
        )}
      </header>

      {user?.role && user.role !== "TECHNICIAN" && (
        <section className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Widget
            label={t("todayVisits")}
            value={loading || !summary ? "—" : String(summary.today.total)}
            hint={summary ? Object.entries(summary.today.byState).map(([k, v]) => `${k}:${v}`).join(" · ") : ""}
            href="/visits"
            tone="info"
          />
          <Widget
            label={t("pendingHandover")}
            value={loading || !summary ? "—" : String(summary.pendingHandover.total)}
            hint={
              summary
                ? t("pendingHandoverHint", { stale: summary.pendingHandover.stale })
                : ""
            }
            href="/payments?pendingHandover=true"
            tone={summary && summary.pendingHandover.stale > 0 ? "danger" : "info"}
          />
          <Widget
            label={t("revenueThisWeek")}
            value={loading || !summary ? "—" : formatVnd(summary.revenueThisWeek.total)}
            hint={summary ? `${summary.revenueThisWeek.count} ${tNav("payments")}` : ""}
            href="/payments"
            tone="success"
          />
          <Widget
            label={t("renewalsNext60")}
            value={loading || !summary ? "—" : String(summary.renewals60d)}
            href="/contracts"
            tone="info"
          />
        </section>
      )}

      {summary && summary.overduePayments > 0 && (
        <section className="mb-4 rounded-2xl border-2 border-red-500 bg-red-50 p-4">
          <div className="text-sm font-semibold text-red-700">
            {t("overduePayments")}: {summary.overduePayments}
          </div>
          <Link
            href="/payments?overdueOnly=true"
            className="mt-1 inline-block text-xs text-red-600 hover:underline"
          >
            {t("activityLogLink")}
          </Link>
        </section>
      )}

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
        <h2 className="mb-2 text-base font-semibold text-[#000000]">
          {t("todaySummary")}
        </h2>
        <p className="text-sm text-[#737373]">{t("noUpcomingVisits")}</p>
      </section>
    </div>
  );
}
