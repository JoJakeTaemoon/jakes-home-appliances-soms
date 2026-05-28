"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import { useApi } from "@/lib/api/client";
import { formatVnd, formatDate } from "@/lib/format";

function StatCard({
  label,
  value,
  hint,
  href,
}: Readonly<{
  label: string;
  value: string;
  hint?: string;
  href?: string;
}>) {
  const inner = (
    <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4 shadow-[0_1px_4px_rgba(0,113,189,0.04)] transition-colors hover:border-[var(--brand-blue-500)]">
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-[#737373]">
        {label}
      </div>
      <div className="text-2xl font-semibold text-[#002A4D]">{value}</div>
      {hint && <div className="mt-1 text-xs text-[#525252]">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

interface PortalSummary {
  outstanding: number;
  upcomingVisitDate: string | null;
  pendingRequestCount: number;
  nextFilterDate: string | null;
}

export function DashboardClient() {
  const t = useTranslations("portal.dashboard");
  const locale = useLocale();
  const { contact } = useCustomerAuth();
  const api = useApi();
  const [summary, setSummary] = useState<PortalSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const [payments, visits] = await Promise.all([
        api.get<{ outstanding: number }>("/api/portal/payments"),
        api.get<{ scheduledFor: string; state: string }[]>(
          "/api/portal/visits",
        ),
      ]);
      const upcoming = (visits.data ?? [])
        .filter(
          (v) =>
            v.state === "SCHEDULED" &&
            new Date(v.scheduledFor).getTime() > Date.now(),
        )
        .sort(
          (a, b) =>
            new Date(a.scheduledFor).getTime() -
            new Date(b.scheduledFor).getTime(),
        )[0];
      setSummary({
        outstanding: payments.data?.outstanding ?? 0,
        upcomingVisitDate: upcoming?.scheduledFor ?? null,
        pendingRequestCount: 0,
        nextFilterDate: null,
      });
    } catch {
      setSummary(null);
    }
  }, [api]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#e5e5e5] bg-gradient-to-br from-[var(--brand-blue-50)] to-white p-5">
        <h1 className="text-xl font-semibold text-[#002A4D]">
          {t("welcome", { name: contact?.name ?? "" })}
        </h1>
        <p className="mt-1 text-sm text-[#525252]">{t("welcomeBody")}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[#737373]">{t("loginId")}: </span>
            <span className="font-medium text-[#262626]">
              {contact?.phone1 ?? ""}
            </span>
          </div>
          <div>
            <span className="text-[#737373]">{t("language")}: </span>
            <span className="font-medium text-[#262626]">
              {contact?.language ?? ""}
            </span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={t("nextVisit")}
          value={
            summary?.upcomingVisitDate
              ? formatDate(summary.upcomingVisitDate, locale)
              : "—"
          }
          href="/portal/visits"
        />
        <StatCard
          label={t("pendingRequests")}
          value="—"
          hint={t("phase5")}
          href="/portal/requests"
        />
        <StatCard
          label={t("outstanding")}
          value={summary ? formatVnd(summary.outstanding) : "—"}
          href="/portal/payments"
        />
        <StatCard
          label={t("nextFilter")}
          value="—"
          hint={t("comingSoon")}
          href="/portal/equipment"
        />
      </div>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#737373]">
          {t("recentActivity")}
        </h2>
        <p className="text-sm text-[#525252]">{t("noActivity")}</p>
      </section>
    </div>
  );
}
