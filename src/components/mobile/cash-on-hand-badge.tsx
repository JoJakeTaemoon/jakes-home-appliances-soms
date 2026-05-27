"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useApi } from "@/lib/api/client";
import { Link } from "@/i18n/navigation";
import { formatVnd } from "@/lib/format";

interface CashOnHandResp {
  total: number;
  count: number;
  oldestHours: number;
  slaBreach: boolean;
}

/**
 * Sticky badge for /mobile/today that surfaces the technician's currently
 * held cash and the 48h handover SLA. Color levels:
 *   - 0-23h     gray  (informational)
 *   - 24-47h    amber (approaching SLA)
 *   - 48h+      red   (breached — link to handover)
 *
 * Hides when there's nothing collected.
 */
export function CashOnHandBadge() {
  const t = useTranslations("mobile.cashOnHand");
  const api = useApi();
  const [data, setData] = useState<CashOnHandResp | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<CashOnHandResp>(`/api/mobile/cash-on-hand`);
        if (!cancelled) setData(res.data);
      } catch {
        /* silently degrade */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (!data || data.count === 0 || data.total === 0) return null;

  const hours = data.oldestHours;
  const breach = hours >= 48;
  const warn = !breach && hours >= 24;
  const tone = breach
    ? "border-red-500 bg-red-50 text-red-700"
    : warn
      ? "border-amber-500 bg-amber-50 text-amber-800"
      : "border-[var(--brand-blue-500)] bg-[var(--brand-blue-50)] text-[var(--brand-blue-700)]";

  // Deadline = oldest collection + 48h, formatted as locale time
  const deadline = new Date(Date.now() + (48 - hours) * 60 * 60 * 1000);
  const deadlineStr = deadline.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Link
      href="/mobile/profile"
      className={`mb-3 flex flex-col gap-0.5 rounded-md border-2 ${tone} px-3 py-2 text-sm`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold">
          {t("label")}: {formatVnd(data.total)}
        </span>
        <span className="text-xs">
          {breach ? t("breach") : warn ? t("warn") : t("ok")}
        </span>
      </div>
      <div className="text-xs opacity-90">
        {t("oldestAgo", { hours })} · {t("handoverBy", { deadline: deadlineStr })}
      </div>
    </Link>
  );
}
