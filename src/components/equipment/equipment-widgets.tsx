"use client";

/**
 * Per-equipment summary widgets — purchase history, recent work, next
 * schedule. Extracted from the retired inline master-detail panel
 * (EquipmentDetailContent) so the canonical /equipment/[id] page can host
 * them after the two entry points were unified onto it (WS4).
 */

import { useLocale, useTranslations } from "next-intl";
import { useApiQuery } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";

interface VisitLite {
  id: string;
  type: string;
  state: string;
  scheduledFor: string;
  completedAt: string | null;
}

interface OrderLite {
  id: string;
  orderNumber: string;
  orderedAt: string;
}

export function PurchaseHistoryWidget({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const t = useTranslations("equipment");
  const locale = useLocale();
  const q = useApiQuery<OrderLite[]>(`/api/equipment/${equipmentId}/orders`);
  const orders = q.data ?? [];
  return (
    <section className="rounded-lg border-2 border-gray-200 bg-white p-3">
      <h4 className="mb-2 text-xs font-semibold text-gray-700">{t("widgets.purchaseHistory")}</h4>
      {orders.length === 0 ? (
        <p className="text-xs text-gray-400">—</p>
      ) : (
        <ul className="space-y-1.5">
          {orders.slice(0, 5).map((o) => (
            <li key={o.id} className="flex justify-between text-xs">
              <span className="text-gray-700">{formatDate(o.orderedAt, locale)}</span>
              <span className="font-mono text-gray-500">{o.orderNumber}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RecentWorkWidget({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const t = useTranslations("equipment");
  const locale = useLocale();
  const q = useApiQuery<VisitLite[]>(`/api/visits?equipmentId=${equipmentId}&pageSize=5`);
  const visits = q.data ?? [];
  return (
    <section className="rounded-lg border-2 border-gray-200 bg-white p-3">
      <h4 className="mb-2 text-xs font-semibold text-gray-700">{t("widgets.recentWork")}</h4>
      {visits.length === 0 ? (
        <p className="text-xs text-gray-400">—</p>
      ) : (
        <ul className="space-y-1.5">
          {visits.slice(0, 5).map((v) => (
            <li key={v.id} className="flex justify-between text-xs">
              <span className="text-gray-700">{formatDate(v.completedAt ?? v.scheduledFor, locale)}</span>
              <span className="text-gray-500">{v.type}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function NextScheduleWidget({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const t = useTranslations("equipment");
  const locale = useLocale();
  const q = useApiQuery<VisitLite[]>(
    `/api/visits?equipmentId=${equipmentId}&state=SUGGESTED,SCHEDULED&pageSize=1`,
  );
  const next = q.data?.[0] ?? null;
  return (
    <section className="rounded-lg border-2 border-gray-200 bg-white p-3">
      <h4 className="mb-2 text-xs font-semibold text-gray-700">{t("widgets.nextSchedule")}</h4>
      {!next ? (
        <p className="text-xs text-gray-400">—</p>
      ) : (
        <div className="text-xs">
          <div className="font-medium text-gray-900">{formatDate(next.scheduledFor, locale)}</div>
          <div className="mt-0.5 text-gray-500">{next.type}</div>
        </div>
      )}
    </section>
  );
}
