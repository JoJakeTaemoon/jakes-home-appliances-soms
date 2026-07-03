"use client";

import { useLocale, useTranslations } from "next-intl";
import { useApiQuery } from "@/lib/api/hooks";
import { Link } from "@/i18n/navigation";

type VisitType =
  | "INSTALLATION"
  | "FILTER_REPLACEMENT"
  | "CONSUMABLE_DELIVERY"
  | "REPAIR"
  | "PERIODIC_INSPECTION"
  | "RELOCATION"
  | "PAYMENT_COLLECTION"
  | "RETRIEVAL"
  | "OTHER";

interface OrderRow {
  id: string;
  orderNumber: string;
  orderedAt: string;
  deliveredAt: string | null;
  state: "PENDING" | "DELIVERED" | "CANCELLED";
  equipment: { id: string; serialNumber: string | null } | null;
  items: Array<{
    productKind: "EQUIPMENT" | "CONSUMABLE" | "OTHER";
    customName: string | null;
    quantity: number;
    unitPrice: string | number;
    totalPrice: string | number;
    purpose: string | null;
  }>;
  visit: {
    id: string;
    scheduledFor: string;
    state: string;
    type: VisitType;
    additionalTypes: VisitType[];
    leadTechnician: { id: string; username: string } | null;
  } | null;
}

interface Props {
  customerId: string;
  /** EQUIPMENT-only filter for the 주문 내역(판매) tab. */
  productKind?: "EQUIPMENT" | "CONSUMABLE" | "OTHER";
}

export function OrderHistoryTab({ customerId, productKind }: Readonly<Props>) {
  const t = useTranslations("orders");
  const tc = useTranslations("common");
  const tv = useTranslations("visits");
  const locale = useLocale();

  const url = productKind
    ? `/api/customers/${customerId}/orders?productKind=${productKind}`
    : `/api/customers/${customerId}/orders`;
  const q = useApiQuery<OrderRow[]>(url);
  const rows = q.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-max text-sm">
          <thead className="border-b border-gray-200 text-left text-gray-500">
            <tr>
              <th className="px-3 py-2 text-xs uppercase">{t("orderedAt")}</th>
              <th className="px-3 py-2 text-xs uppercase">{t("orderNumber")}</th>
              <th className="px-3 py-2 text-xs uppercase">{t("product")}</th>
              <th className="px-3 py-2 text-xs uppercase">{t("quantity")}</th>
              <th className="px-3 py-2 text-xs uppercase">{t("totalPrice")}</th>
              <th className="px-3 py-2 text-xs uppercase">{t("scheduledFor")}</th>
              <th className="px-3 py-2 text-xs uppercase">{t("state")}</th>
              <th className="px-3 py-2 text-xs uppercase">{t("equipment")}</th>
              <th className="px-3 py-2 text-xs uppercase" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-xs text-gray-400">
                  {tc("noData")}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const itemSummary =
                  r.items.length === 1
                    ? r.items[0].customName ?? r.items[0].productKind
                    : `${r.items[0]?.customName ?? r.items[0]?.productKind} +${r.items.length - 1}`;
                const totalQty = r.items.reduce((a, b) => a + b.quantity, 0);
                const totalAmount = r.items.reduce(
                  (a, b) => a + Number(b.totalPrice),
                  0,
                );
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-gray-700">{formatDate(r.orderedAt, locale)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.orderNumber}</td>
                    <td className="px-3 py-2">{itemSummary}</td>
                    <td className="px-3 py-2">{totalQty}</td>
                    <td className="px-3 py-2">{formatMoney(totalAmount)}</td>
                    <td className="px-3 py-2 text-gray-700">
                      <div className="flex flex-col gap-1">
                        <span>{formatDate(r.visit?.scheduledFor ?? null, locale)}</span>
                        {r.visit && (
                          <div className="flex flex-wrap gap-1">
                            {[r.visit.type, ...r.visit.additionalTypes].map((tp, i) => (
                              <span
                                key={`${tp}-${i}`}
                                className="rounded-full bg-[var(--brand-blue-50)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--brand-blue-700)]"
                              >
                                {tv(`types.${tp}`)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <StateBadge state={r.state} label={t(`states.${r.state}`)} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">
                      {r.equipment?.serialNumber ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.visit && (
                        <Link
                          href={`/o/visits/${r.visit.id}`}
                          className="text-xs font-medium text-[var(--brand-blue-700)] hover:underline"
                        >
                          {t("openVisit")} →
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}

const STATE_TONES: Record<OrderRow["state"], string> = {
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-200 text-gray-600",
  PENDING: "bg-amber-100 text-amber-700",
};

function StateBadge({ state, label }: Readonly<{ state: OrderRow["state"]; label: string }>) {
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] uppercase ${STATE_TONES[state]}`}>
      {label}
    </span>
  );
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (locale === "vi") {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatMoney(v: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(v)) + " ₫";
}
