"use client";

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import { useApiQuery } from "@/lib/api/hooks";
import { formatVnd, formatDate, formatWeekday } from "@/lib/format";

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
  // The hint row always renders (non-breaking space when absent) so
  // tiles in the same grid row keep identical heights regardless of
  // whether some have a hint and others don't.
  const inner = (
    <div className="flex h-full flex-col rounded-2xl border border-[#e5e5e5] bg-white p-4 shadow-[0_1px_4px_rgba(0,113,189,0.04)] transition-colors hover:border-[var(--brand-blue-500)]">
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-[#737373]">
        {label}
      </div>
      <div className="text-2xl font-semibold text-[#002A4D]">{value}</div>
      <div className="mt-1 text-xs text-[#525252]">{hint || " "}</div>
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

interface PortalVisit {
  id: string;
  equipmentId: string | null;
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
  type: string;
  state: string;
  submittedAt: string;
}

interface PortalConsumable {
  id: string;
  sku: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
  replaceEveryMonths: number | null;
  isActive: boolean;
}
interface PortalEquipment {
  id: string;
  installedAt: string | null;
  model: {
    filterPolicy: { filters?: { type: string; replaceEveryDays: number }[] } | null;
    consumables?: { quantity: number; consumable: PortalConsumable }[];
  };
}

function pickConsumableName(
  c: PortalConsumable,
  locale: string,
): string {
  if (locale === "ko") return c.nameKo;
  if (locale === "en") return c.nameEn;
  return c.nameVi;
}

// "Open" visit states — the ones the customer expects to see a date for
// in the "next visit" / "next filter replacement" tile. A visit that is
// SUGGESTED (not yet confirmed by office) is still a meaningful "next"
// date for them, and SCHEDULED visits whose clock time has already
// passed today still count until they are explicitly marked completed.
const OPEN_VISIT_STATES = new Set([
  "SUGGESTED",
  "SCHEDULED",
  "IN_PROGRESS",
  "RESCHEDULED",
]);

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
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
  // Equipment list is the fallback source for the "next filter
  // replacement" tile when there is no SCHEDULED FILTER_REPLACEMENT
  // visit yet — we then compute the next due date from the model's
  // filterPolicy (same logic as the equipment detail page).
  const equipment = useApiQuery<{ equipment: PortalEquipment[] } | PortalEquipment[]>(
    "/api/portal/equipment",
  );

  const upcomingVisitDate = useMemo(() => {
    const list = visits.data ?? [];
    // Date.now() during a useMemo is technically impure under React Compiler.
    // It is required here to separate past vs upcoming visits; the result is
    // a string label, not a hook ordering decision, so re-running on render
    // is harmless. Locally suppressed instead of plumbing a "now" tick.
    // eslint-disable-next-line react-hooks/purity
    const todayMs = startOfTodayMs();
    const future = list
      .filter(
        (v) =>
          OPEN_VISIT_STATES.has(v.state) &&
          new Date(v.scheduledFor).getTime() >= todayMs,
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
      );
    return future[0]?.scheduledFor ?? null;
  }, [visits.data]);

  const nextFilter = useMemo<{ date: string; name: string } | null>(() => {
    const list = visits.data ?? [];
    // eslint-disable-next-line react-hooks/purity
    const todayMs = startOfTodayMs();
    const MS_PER_MONTH = 30 * 24 * 60 * 60 * 1000;

    // First choice: an open FILTER_REPLACEMENT visit on the schedule —
    // the customer's date is whatever the office confirmed. We don't
    // know which filter without joining VisitConsumableLog, so leave
    // the name blank when sourced from a visit.
    const future = list
      .filter(
        (v) =>
          v.type === "FILTER_REPLACEMENT" &&
          OPEN_VISIT_STATES.has(v.state) &&
          new Date(v.scheduledFor).getTime() >= todayMs,
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
      );
    if (future[0]) return { date: future[0].scheduledFor, name: "" };

    // Fallback: derive from the model's Consumable catalog. For each
    // equipment + consumable pair we advance the cycle from the
    // baseline (the later of installedAt and the last completed
    // filter-touching visit on this equipment) until we land past
    // today; that's the next real-world due date for that filter.
    const eqList: PortalEquipment[] = (() => {
      const d = equipment.data;
      if (Array.isArray(d)) return d;
      if (d && Array.isArray(d.equipment)) return d.equipment;
      return [];
    })();
    // Last completed FILTER_REPLACEMENT / PERIODIC_INSPECTION visit
    // per equipment — this is the customer's true cycle baseline.
    const lastTouchByEq = new Map<string, number>();
    for (const v of list) {
      if (!v.equipmentId) continue;
      if (v.state !== "COMPLETED") continue;
      if (v.type !== "FILTER_REPLACEMENT" && v.type !== "PERIODIC_INSPECTION")
        continue;
      const at = v.completedAt
        ? new Date(v.completedAt).getTime()
        : new Date(v.scheduledFor).getTime();
      const prev = lastTouchByEq.get(v.equipmentId);
      if (prev === undefined || at > prev) lastTouchByEq.set(v.equipmentId, at);
    }

    let earliest: { due: number; name: string } | null = null;
    for (const e of eqList) {
      if (!e.installedAt) continue;
      const installed = new Date(e.installedAt).getTime();
      if (Number.isNaN(installed)) continue;
      const baseline = Math.max(installed, lastTouchByEq.get(e.id) ?? 0);
      const items = e.model.consumables ?? [];
      for (const c of items) {
        if (!c.consumable.isActive) continue;
        const cycleMonths = c.consumable.replaceEveryMonths;
        if (!cycleMonths || cycleMonths <= 0) continue;
        const cycleMs = cycleMonths * MS_PER_MONTH;
        let due = baseline + cycleMs;
        while (due < todayMs) due += cycleMs;
        if (earliest === null || due < earliest.due) {
          earliest = {
            due,
            name: pickConsumableName(c.consumable, locale),
          };
        }
      }
    }
    if (earliest === null) return null;
    return {
      date: new Date(earliest.due).toISOString(),
      name: earliest.name,
    };
  }, [visits.data, equipment.data, locale]);

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
            upcomingVisitDate
              ? `${formatDate(upcomingVisitDate, locale)} (${formatWeekday(upcomingVisitDate, locale)})`
              : "—"
          }
          href="/visits"
        />
        <StatCard
          label={t("nextFilter")}
          value={
            nextFilter
              ? `${formatDate(nextFilter.date, locale)} (${formatWeekday(nextFilter.date, locale)})`
              : "—"
          }
          hint={nextFilter?.name || undefined}
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
  const trt = useTranslations("serviceRequests.types");
  const trs = useTranslations("serviceRequests.states");
  // Recent visits: completed visits sorted by completedAt desc; if no
  // completedAt fall back to scheduledFor. Cap at 5 each then merge.
  // Title leads with the activity kind ("방문" / "요청") so the customer
  // can tell at a glance whether it was a tech visit or a request they
  // submitted; the type and code are appended for context.
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
      title: `${t("activityVisit")} · ${tv(v.type as never)}`,
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
      title: `${t("activityRequest")} · ${trt(s.type as never)}`,
      subtitle: `${s.code} · ${trs(s.state as never)}`,
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
