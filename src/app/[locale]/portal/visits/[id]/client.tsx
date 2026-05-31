"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useApi } from "@/lib/api/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatDateTime } from "@/lib/format";

interface VisitDetail {
  id: string;
  type: string;
  state: string;
  scheduledFor: string;
  completedAt: string | null;
  findings: string | null;
  customerSignaturePhotoUrl: string | null;
  equipment: {
    serialNumber: string | null;
    model: { name: string; modelCode: string };
  } | null;
  leadTechnician: { username: string } | null;
  documents: {
    id: string;
    kind: string;
    filename: string;
    storageKey: string;
    generatedAt: string;
  }[];
}

export function PortalVisitDetailClient({ id }: Readonly<{ id: string }>) {
  const t = useTranslations("portalExtra.visits");
  const locale = useLocale();
  const api = useApi();
  const [data, setData] = useState<VisitDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<VisitDetail>(`/api/portal/visits/${id}`);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  if (loading) return <p className="text-sm text-[#737373]">Loading…</p>;
  if (!data) return <p className="text-sm text-[#737373]">{t("loadError")}</p>;

  const wc = data.documents.find((d) => d.kind === "WORK_CONFIRMATION" || d.kind === "PERIODIC_INSPECTION");

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[#002A4D]">{data.type}</h1>
          <StatusBadge tone={data.state === "COMPLETED" ? "success" : "info"}>
            {data.state}
          </StatusBadge>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-[#737373]">Scheduled</dt>
          <dd>{formatDate(data.scheduledFor, locale)}</dd>
          {data.completedAt && (
            <>
              <dt className="text-[#737373]">{t("completed")}</dt>
              <dd>{formatDateTime(data.completedAt, locale)}</dd>
            </>
          )}
          {data.leadTechnician && (
            <>
              <dt className="text-[#737373]">{t("technician")}</dt>
              <dd>{data.leadTechnician.username}</dd>
            </>
          )}
          {data.equipment && (
            <>
              <dt className="text-[#737373]">Equipment</dt>
              <dd>
                {data.equipment.model.name} ({data.equipment.model.name})
              </dd>
            </>
          )}
        </dl>
        {data.findings && (
          <div className="mt-3 rounded-md bg-[#FAFAFA] p-3 text-sm">
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-[#737373]">
              Findings
            </div>
            <p className="whitespace-pre-wrap text-[#262626]">{data.findings}</p>
          </div>
        )}
      </div>

      {wc && (
        <a
          href={`/${wc.storageKey}`}
          target="_blank"
          rel="noreferrer"
          className="block rounded-2xl border border-[var(--brand-blue-200)] bg-[var(--brand-blue-50)] p-4 text-center text-sm font-medium text-[var(--brand-blue-700)] hover:bg-[var(--brand-blue-100)]"
        >
          {t("viewPdf")}
        </a>
      )}
    </div>
  );
}
