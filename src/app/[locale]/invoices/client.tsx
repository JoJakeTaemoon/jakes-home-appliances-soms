"use client";

import { useTranslations, useLocale } from "next-intl";
import { ApiClientError } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { formatDate, formatVnd } from "@/lib/format";

interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  pdfStorageKey: string | null;
  payment: { actualAmount: string } | null;
}

export function PortalInvoicesClient() {
  const t = useTranslations("portalExtra.invoices");
  const locale = useLocale();
  const query = useApiQuery<InvoiceRow[]>(`/api/portal/invoices`);

  const isForbidden =
    query.error instanceof ApiClientError && query.error.status === 403;
  const rows = query.data ?? [];

  if (query.isLoading) return <p className="text-sm text-[#737373]">Loading…</p>;
  if (isForbidden) {
    return (
      <div className="rounded-2xl border border-dashed border-[#e5e5e5] bg-white p-8 text-center">
        <p className="text-sm text-[#525252]">{t("b2bOnly")}</p>
      </div>
    );
  }
  if (rows.length === 0)
    return <p className="text-sm text-[#737373]">{t("noInvoices")}</p>;

  return (
    <ul className="space-y-2">
      {rows.map((inv) => (
        <li
          key={inv.id}
          className="flex items-center justify-between rounded-2xl border border-[#e5e5e5] bg-white p-3"
        >
          <div>
            <div className="text-sm font-medium text-[#262626]">
              {inv.invoiceNumber ?? "—"}
            </div>
            <div className="text-xs text-[#737373]">
              {inv.invoiceDate ? formatDate(inv.invoiceDate, locale) : "—"} ·{" "}
              {inv.payment ? formatVnd(inv.payment.actualAmount) : "—"}
            </div>
          </div>
          <a
            href={`/api/portal/invoices/${inv.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-[var(--brand-blue-700)] hover:underline"
          >
            {t("tableDownload")}
          </a>
        </li>
      ))}
    </ul>
  );
}
