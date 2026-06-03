"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApiQuery } from "@/lib/api/hooks";
import {
  VisitStateBadge,
  VisitTypeBadge,
} from "@/components/visits/visit-state-badge";
import { formatDate } from "@/lib/format";

interface VisitRow {
  id: string;
  type: string;
  state: string;
  scheduledFor: string;
  completedAt: string | null;
  equipment: {
    serialNumber: string | null;
    model: { modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null };
  } | null;
  leadTechnician: { username: string } | null;
}

export function PortalVisitsClient() {
  const t = useTranslations("portalExtra.visits");
  const locale = useLocale();
  const query = useApiQuery<VisitRow[]>(`/api/portal/visits`);
  const rows = query.data ?? [];

  if (query.isLoading) return <p className="text-sm text-[#737373]">{t("loading")}</p>;
  if (rows.length === 0)
    return <p className="text-sm text-[#737373]">{t("noVisits")}</p>;

  return (
    <ul className="space-y-2">
      {rows.map((v) => (
        <li key={v.id}>
          <Link
            href={`/visits/${v.id}`}
            className="block rounded-2xl border border-[#e5e5e5] bg-white p-3 hover:border-[var(--brand-blue-500)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <VisitTypeBadge type={v.type} />
                  <VisitStateBadge state={v.state} />
                </div>
                <div className="mt-1 text-xs text-[#737373]">
                  {v.equipment ? pickModelName(v.equipment.model, locale) : "—"}
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-[#525252]">
              <span>{formatDate(v.scheduledFor, locale)}</span>
              <span>
                {t("technician")}: {v.leadTechnician?.username ?? "—"}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
