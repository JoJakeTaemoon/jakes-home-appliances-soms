"use client";

import { useEffect, useState, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useApi } from "@/lib/api/client";
import { formatDate, formatVnd } from "@/lib/format";

type RoleKey = "ADMIN" | "MANAGER" | "STAFF" | "TECHNICIAN";

interface OpenServiceRequest {
  id: string;
  code: string;
  type: string;
  state: string;
  submittedAt: string;
  customer: { id: string; code: string; name: string };
}

interface DashboardSummary {
  today: { total: number; byState: Record<string, number> };
  pendingHandover: { total: number; stale: number; slaHours: number };
  revenueThisWeek: { total: number; count: number };
  renewals60d: number;
  overduePayments: number;
  taxInvoicePending: number;
  openServiceRequests: { count: number; recent: OpenServiceRequest[] };
}

// Only "danger" earns a colored border — that's an actionable alert
// (stale handovers, etc). info + success use the neutral border so the
// KPI strip doesn't read as a decorative card mosaic. Color = signal.
const WIDGET_TONE_BORDER: Record<string, string> = {
  danger: "border-red-500",
  info: "border-[#e5e5e5]",
  success: "border-[#e5e5e5]",
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
    <Link href={href} className="block h-full no-underline">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tNav = useTranslations("nav");
  const tSr = useTranslations("serviceRequests");
  const tRoles = useTranslations("roles");
  const locale = useLocale();
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

  const role = user?.role ? tRoles(user.role as RoleKey) : "";

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[#002A4D]">
          {t("greeting")}
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
            href="/o/visits"
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
            href="/o/payments?pendingHandover=true"
            tone={summary && summary.pendingHandover.stale > 0 ? "danger" : "info"}
          />
          <Widget
            label={t("revenueThisWeek")}
            value={loading || !summary ? "—" : formatVnd(summary.revenueThisWeek.total)}
            hint={summary ? `${summary.revenueThisWeek.count} ${tNav("payments")}` : ""}
            href="/o/payments"
            tone="success"
          />
          <Widget
            label={t("renewalsNext60")}
            value={loading || !summary ? "—" : String(summary.renewals60d)}
            href="/o/contracts"
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
            href="/o/payments?overdueOnly=true"
            className="mt-1 inline-block text-xs text-red-600 hover:underline"
          >
            {t("activityLogLink")}
          </Link>
        </section>
      )}

      {user?.role && user.role !== "TECHNICIAN" && summary && summary.openServiceRequests.count > 0 && (
        <section className="mb-4 rounded-2xl border-2 border-[var(--brand-blue-300)] bg-white p-4">
          <header className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-[#002A4D]">
              {t("openSrTitle", { count: summary.openServiceRequests.count })}
            </h2>
            <Link
              href="/o/service-requests"
              className="text-xs font-medium text-[var(--brand-blue-700)] hover:underline"
            >
              {t("openSrCta")}
            </Link>
          </header>
          {summary.openServiceRequests.recent.length === 0 ? (
            <p className="text-xs text-[#a3a3a3]">{tSr("noRequests")}</p>
          ) : (
            <ul className="divide-y divide-[#f0f0f0]">
              {summary.openServiceRequests.recent.map((sr) => (
                <li key={sr.id}>
                  <Link
                    href={`/o/service-requests/${sr.id}` as never}
                    className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-[#fafafa]"
                  >
                    <div className="flex flex-col">
                      <span className="font-mono text-xs text-[var(--brand-blue-700)] underline">
                        {sr.code}
                      </span>
                      <span className="text-xs text-[#262626]">
                        {sr.customer.name}{" "}
                        <span className="text-[#a3a3a3]">· {sr.customer.code}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#525252]">
                      <span>{tSr(`types.${sr.type}` as never)}</span>
                      <span className="rounded-md bg-[#f5f5f5] px-2 py-0.5">
                        {tSr(`states.${sr.state}` as never)}
                      </span>
                      <span className="text-[#737373]">
                        {formatDate(sr.submittedAt, locale)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {user?.role && user.role !== "TECHNICIAN" && summary && summary.taxInvoicePending > 0 && (
        <section className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-amber-900">
                {t("taxInvoicePendingTitle")}
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                {t("taxInvoicePendingHint", { count: summary.taxInvoicePending })}
              </p>
            </div>
            <Link
              href="/o/tax-invoices"
              className="shrink-0 rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-800"
            >
              {t("taxInvoicePendingCta")}
            </Link>
          </div>
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
