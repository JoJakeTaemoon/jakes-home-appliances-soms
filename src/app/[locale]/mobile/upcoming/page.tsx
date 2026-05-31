"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useApi } from "@/lib/api/client";
import { MobileWrapper } from "@/components/mobile/mobile-wrapper";
import { VisitTypeBadge } from "@/components/visits/visit-state-badge";
import { formatDate } from "@/lib/format";

interface VisitCard {
  id: string;
  type: string;
  state: string;
  scheduledFor: string;
  scheduledWindow: string | null;
  leadTechnicianId: string | null;
  customer: { code: string; name: string };
  equipment: {
    serialNumber: string | null;
    model: { modelCode: string; name: string };
  } | null;
}

export default function MobileUpcomingPage() {
  return (
    <MobileWrapper>
      <MobileUpcomingContent />
    </MobileWrapper>
  );
}

function MobileUpcomingContent() {
  const t = useTranslations("mobile");
  const locale = useLocale();
  const api = useApi();
  const [grouped, setGrouped] = useState<Record<string, VisitCard[]>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ grouped: Record<string, VisitCard[]>; total: number }>(
        `/api/mobile/visits/upcoming`,
      );
      setGrouped(res.data.grouped ?? {});
      setTotal(res.data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  if (loading) return <p className="text-sm text-[#737373]">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[#002A4D]">{t("upcomingTitle")}</h1>
      {total === 0 ? (
        <p className="text-sm text-[#737373]">{t("noVisitsUpcoming")}</p>
      ) : (
        Object.keys(grouped)
          .sort()
          .map((dateKey) => (
            <section key={dateKey} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-[#525252]">
                {formatDate(dateKey, locale)}
              </h2>
              <ul className="flex flex-col gap-2">
                {grouped[dateKey].map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/mobile/visits/${v.id}`}
                      className="block rounded-xl border border-[#e5e5e5] bg-white p-3 shadow-sm active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#002A4D]">
                          {v.customer.name}
                        </span>
                        <span className="font-mono text-xs text-[#737373]">
                          {v.scheduledFor.slice(11, 16)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <VisitTypeBadge type={v.type} />
                        {v.equipment && (
                          <span className="font-mono text-xs text-[#737373]">
                            {v.equipment.model.name}
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}
