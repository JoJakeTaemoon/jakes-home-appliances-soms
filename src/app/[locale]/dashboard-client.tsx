"use client";

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import { useApiQuery } from "@/lib/api/hooks";
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

interface PortalVisit {
  id: string;
  scheduledFor: string;
  completedAt: string | null;
  state: string;
  type: string;
}

interface PortalPayments {
  outstanding: number;
}

interface PortalSr {
  id: string;
  code: string;
  state: string;
  submittedAt: string;
}

export function DashboardClient() {
  const t = useTranslations("portal.dashboard");
  const locale = useLocale();
  const { contact } = useCustomerAuth();

  const payments = useApiQuery<PortalPayments>("/api/portal/payments");
  const visits = useApiQuery<PortalVisit[]>("/api/portal/visits");
  // useApiQuery strips the paginatedResponse envelope down to `data` (the
  // row array), so we cannot read `pagination.total` here. The widget
  // shows raw count, and 500 is the API's pageSize ceiling — customers
  // with more than 500 simultaneous pending requests is unrealistic.
  const pendingSr = useApiQuery<unknown[]>(
    "/api/portal/service-requests?state=PENDING_REVIEW&pageSize=500",
  );
  // Recent activity timeline: just the 5 most recently submitted SRs,
  // regardless of state. Combined with the visits feed below this gives
  // the customer a "what happened recently" view without needing a new
  // dedicated endpoint.
  const recentSr = useApiQuery<PortalSr[]>(
    "/api/portal/service-requests?pageSize=5",
  );

  const upcomingVisitDate = useMemo(() => {
    const list = visits.data ?? [];
    // Date.now() during a useMemo is technically impure under React Compiler.
    // It is required here to separate past vs upcoming visits; the result is
    // a string label, not a hook ordering decision, so re-running on render
    // is harmless. Locally suppressed instead of plumbing a "now" tick.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const future = list
      .filter((v) => v.state === "SCHEDULED" && new Date(v.scheduledFor).getTime() > now)
      .sort(
        (a, b) =>
          new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
      );
    return future[0]?.scheduledFor ?? null;
  }, [visits.data]);

  const nextFilterDate = useMemo(() => {
    const list = visits.data ?? [];
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const future = list
      .filter(
        (v) =>
          v.type === "FILTER_REPLACEMENT" &&
          v.state === "SCHEDULED" &&
          new Date(v.scheduledFor).getTime() > now,
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
      );
    return future[0]?.scheduledFor ?? null;
  }, [visits.data]);

  const pendingSrCount = pendingSr.data?.length ?? 0;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#e5e5e5] bg-gradient-to-br from-[var(--brand-blue-50)] to-white p-5">
        <h1 className="text-xl font-semibold text-[#002A4D]">
          {t("welcome", { name: contact?.name ?? "" })}
        </h1>
        <p className="mt-1 text-sm text-[#525252]">{t("welcomeBody")}</p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={t("nextVisit")}
          value={
            upcomingVisitDate ? formatDate(upcomingVisitDate, locale) : "—"
          }
          href="/visits"
        />
        <StatCard
          label={t("nextFilter")}
          value={nextFilterDate ? formatDate(nextFilterDate, locale) : "—"}
          href="/equipment"
        />
        <StatCard
          label={t("pendingRequests")}
          value={pendingSr.data ? String(pendingSrCount) : "—"}
          href="/requests"
        />
        <StatCard
          label={t("outstanding")}
          value={
            payments.data ? formatVnd(payments.data.outstanding) : "—"
          }
          href="/payments"
        />
      </div>

      <RecentActivity
        visits={visits.data ?? []}
        srs={recentSr.data ?? []}
        locale={locale}
      />
    </div>
  );
}

interface ActivityItem {
  kind: "visit" | "sr";
  at: string;
  href: string;
  title: string;
  subtitle: string;
}

function RecentActivity({
  visits,
  srs,
  locale,
}: Readonly<{
  visits: PortalVisit[];
  srs: PortalSr[];
  locale: string;
}>) {
  const t = useTranslations("portal.dashboard");
  const tv = useTranslations("visits.types");
  const ts = useTranslations("visits.states");
  const trs = useTranslations("serviceRequests.states");
  // Recent visits: completed visits sorted by completedAt desc; if no
  // completedAt fall back to scheduledFor. Cap at 5 each then merge.
  const recentVisits = [...visits]
    .filter((v) => v.completedAt || v.state === "SCHEDULED")
    .sort((a, b) => {
      const ad = a.completedAt ?? a.scheduledFor;
      const bd = b.completedAt ?? b.scheduledFor;
      return new Date(bd).getTime() - new Date(ad).getTime();
    })
    .slice(0, 5)
    .map<ActivityItem>((v) => ({
      kind: "visit",
      at: v.completedAt ?? v.scheduledFor,
      href: `/visits/${v.id}`,
      title: tv(v.type as never),
      subtitle: ts(v.state as never),
    }));
  const recentSrs = [...srs]
    .sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    )
    .slice(0, 5)
    .map<ActivityItem>((s) => ({
      kind: "sr",
      at: s.submittedAt,
      href: `/requests/${s.id}`,
      title: s.code,
      subtitle: trs(s.state as never),
    }));
  const merged = [...recentVisits, ...recentSrs]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 5);

  return (
    <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#737373]">
        {t("recentActivity")}
      </h2>
      {merged.length === 0 ? (
        <p className="text-sm text-[#525252]">{t("noActivity")}</p>
      ) : (
        <ul className="space-y-2">
          {merged.map((a) => (
            <li key={`${a.kind}-${a.href}`}>
              <Link
                href={a.href}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[#f5f5f5]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-[#262626]">
                    {a.title}
                  </div>
                  <div className="truncate text-xs text-[#737373]">
                    {a.subtitle}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-[#737373]">
                  {formatDate(a.at, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
