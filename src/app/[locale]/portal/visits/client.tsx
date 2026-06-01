"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApi } from "@/lib/api/client";
import { StatusBadge } from "@/components/ui/status-badge";
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
  const api = useApi();
  const [rows, setRows] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<VisitRow[]>(`/api/portal/visits`);
      setRows(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  if (loading) return <p className="text-sm text-[#737373]">Loading…</p>;
  if (rows.length === 0)
    return <p className="text-sm text-[#737373]">{t("noVisits")}</p>;

  return (
    <ul className="space-y-2">
      {rows.map((v) => (
        <li key={v.id}>
          <Link
            href={`/portal/visits/${v.id}`}
            className="block rounded-2xl border border-[#e5e5e5] bg-white p-3 hover:border-[var(--brand-blue-500)]"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[#002A4D]">
                  {v.type}
                </div>
                <div className="text-xs text-[#737373]">
                  {v.equipment
                    ? `${pickModelName(v.equipment.model, locale)} (${pickModelName(v.equipment.model, locale)})`
                    : "—"}
                </div>
              </div>
              <StatusBadge tone={v.state === "COMPLETED" ? "success" : "info"}>
                {v.state}
              </StatusBadge>
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
