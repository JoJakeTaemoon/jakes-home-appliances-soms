"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useApiQuery } from "@/lib/api/hooks";
import { apiErrorText, useApi } from "@/lib/api/client";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDateOrDash as formatDate } from "@/lib/format";

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
  const api = useApi();
  // PENDING → DELIVERED | CANCELLED, confirmed first (both are final).
  const [pending, setPending] = useState<{ order: OrderRow; to: OrderTarget } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyTransition = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/orders/${pending.order.id}`, { state: pending.to });
      await q.refetch();
    } catch (e) {
      setError(apiErrorText(e, t("actions.failed")));
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
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
                const first = r.items[0];
                const firstName = first ? first.customName ?? t(`kinds.${first.productKind}`) : "—";
                const itemSummary =
                  r.items.length > 1 ? `${firstName} +${r.items.length - 1}` : firstName;
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
                      <div className="flex items-center justify-end gap-2">
                        {r.state === "PENDING" && (
                          <>
                            <Button size="sm" onClick={() => setPending({ order: r, to: "DELIVERED" })}>
                              {t("actions.deliver")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPending({ order: r, to: "CANCELLED" })}
                            >
                              {t("actions.cancel")}
                            </Button>
                          </>
                        )}
                        {r.visit && (
                          <Link
                            href={`/o/visits/${r.visit.id}`}
                            className="text-xs font-medium text-[var(--brand-blue-700)] hover:underline"
                          >
                            {t("openVisit")} →
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.to === "CANCELLED" ? t("actions.cancel") : t("actions.deliver")}
        message={
          pending?.to === "CANCELLED"
            ? t("actions.cancelConfirm", { orderNumber: pending.order.orderNumber })
            : t("actions.deliverConfirm", { orderNumber: pending?.order.orderNumber ?? "" })
        }
        confirmLabel={pending?.to === "CANCELLED" ? t("actions.cancel") : t("actions.deliver")}
        cancelLabel={tc("close")}
        variant={pending?.to === "CANCELLED" ? "danger" : "default"}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={applyTransition}
      />
    </div>
  );
}

type OrderTarget = "DELIVERED" | "CANCELLED";

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

function formatMoney(v: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(v)) + " ₫";
}
