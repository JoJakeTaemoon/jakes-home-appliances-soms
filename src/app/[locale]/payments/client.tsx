"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useApi } from "@/lib/api/client";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatVnd } from "@/lib/format";

interface PortalPaymentsResponse {
  outstanding: number;
  payments: {
    id: string;
    state: string;
    expectedAmount: string;
    actualAmount: string;
    dueDate: string | null;
    collectedAt: string | null;
    daysOverdue: number;
    contract: { contractNumber: string; type: string } | null;
  }[];
}

export function PortalPaymentsClient() {
  const t = useTranslations("portalExtra.payments");
  const locale = useLocale();
  const api = useApi();
  const [data, setData] = useState<PortalPaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<PortalPaymentsResponse>(`/api/portal/payments`);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  if (loading) return <p className="text-sm text-[#737373]">Loading…</p>;
  if (!data) return <p className="text-sm text-[#737373]">{t("loadError")}</p>;
  if (data.payments.length === 0)
    return <p className="text-sm text-[#737373]">{t("noPayments")}</p>;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border-2 border-[var(--brand-blue-500)] bg-[var(--brand-blue-50)] p-4">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--brand-blue-700)]">
          {t("outstanding")}
        </div>
        <div className="mt-1 text-2xl font-semibold text-[var(--brand-blue-700)]">
          {formatVnd(data.outstanding)}
        </div>
      </div>

      <ul className="space-y-2">
        {data.payments.map((p) => (
          <li
            key={p.id}
            className="rounded-2xl border border-[#e5e5e5] bg-white p-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[#262626]">
                  {p.contract?.contractNumber ?? "—"}
                </div>
                <div className="text-xs text-[#737373]">
                  {p.dueDate ? formatDate(p.dueDate, locale) : "—"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-[#111]">
                  {formatVnd(p.actualAmount)}
                </div>
                <StatusBadge
                  tone={
                    p.state === "RECONCILED"
                      ? "success"
                      : p.state.startsWith("OVERDUE")
                        ? "danger"
                        : "info"
                  }
                >
                  {p.state}
                </StatusBadge>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
