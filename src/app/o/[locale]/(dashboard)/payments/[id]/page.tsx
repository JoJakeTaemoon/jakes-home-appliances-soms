"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { useApi } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatDateTime, formatVnd } from "@/lib/format";

interface PaymentDetail {
  id: string;
  state: string;
  method: string;
  expectedAmount: string;
  actualAmount: string;
  carryoverAmount: string;
  dueDate: string | null;
  collectedAt: string | null;
  handedOverAt: string | null;
  reconciledAt: string | null;
  daysOverdue: number;
  reference: string | null;
  notes: string | null;
  customer: { id: string; code: string; name: string; type: "B2C" | "B2B"; taxCode: string | null };
  contract: { id: string; contractNumber: string; type: string } | null;
  visit: { id: string; type: string; scheduledFor: string; completedAt: string | null } | null;
  collectedBy: { id: string; username: string } | null;
  collectedById: string | null;
  taxInvoice: {
    id: string;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    pdfStorageKey: string | null;
  } | null;
  documents: {
    id: string;
    kind: string;
    filename: string;
    storageKey: string;
    generatedAt: string;
  }[];
}

function stateTone(state: string): "success" | "warning" | "danger" | "info" | "muted" | "neutral" {
  if (state === "RECONCILED") return "success";
  if (state === "WRITTEN_OFF") return "muted";
  if (state === "COLLECTED" || state === "HANDED_OVER") return "info";
  if (state.startsWith("OVERDUE_")) return "danger";
  return "neutral";
}

const HOUR_MS = 60 * 60 * 1000;

export default function PaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const t = useTranslations("payments");
  const tStates = useTranslations("payments.states");
  const tMethods = useTranslations("payments.methods");
  const locale = useLocale();
  const router = useRouter();
  const api = useApi();
  const { user } = useAuth();

  const [tab, setTab] = useState<"overview" | "taxInvoice" | "receipt" | "activity">("overview");
  const [actionLoading, setActionLoading] = useState(false);
  const [showWriteOff, setShowWriteOff] = useState(false);
  const [writeOffReason, setWriteOffReason] = useState("");
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");

  const query = useApiQuery<PaymentDetail>(
    id ? `/api/payments/${id}` : null,
  );
  const data = query.data ?? null;
  const loading = query.isLoading;
  const load = async () => {
    await query.refetch();
  };

  if (loading) {
    return <p className="text-sm text-[#737373]">Loading…</p>;
  }
  if (!data) {
    return <p className="text-sm text-[#737373]">Not found.</p>;
  }

  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";
  const isOffice = isManager || user?.role === "STAFF";

  // SLA badge: time-dependent comparison — Date.now() recomputed each
  // render is correct, the badge updates as time advances.
  const slaBreach =
    data.state === "COLLECTED" &&
    data.collectedAt &&
    // eslint-disable-next-line react-hooks/purity
    Date.now() - new Date(data.collectedAt).getTime() > 48 * HOUR_MS;

  const handleHandOver = async () => {
    setActionLoading(true);
    try {
      await api.post(`/api/payments/${id}/hand-over`, {});
      await load();
    } finally {
      setActionLoading(false);
    }
  };
  const handleReconcile = async () => {
    setActionLoading(true);
    try {
      await api.post(`/api/payments/${id}/reconcile`, {});
      await load();
    } finally {
      setActionLoading(false);
    }
  };
  const handleWriteOff = async () => {
    if (!writeOffReason.trim()) return;
    setActionLoading(true);
    try {
      await api.post(`/api/payments/${id}/write-off`, { reason: writeOffReason });
      setShowWriteOff(false);
      setWriteOffReason("");
      await load();
    } finally {
      setActionLoading(false);
    }
  };
  const handlePartial = async () => {
    const amount = Number(partialAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setActionLoading(true);
    try {
      await api.post(`/api/payments/${id}/partial`, { partialAmount: amount });
      setShowPartial(false);
      setPartialAmount("");
      await load();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-[var(--brand-blue-700)] hover:underline"
        >
          ← Back
        </button>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[#002A4D]">
              {t("detail.title", { receiptNumber: data.id.slice(-12).toUpperCase() })}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge tone={stateTone(data.state)}>
                {tStates(data.state as "EXPECTED")}
              </StatusBadge>
              <span className="text-sm text-[#737373]">
                {tMethods(data.method as "CASH")}
              </span>
            </div>
          </div>
          <div className="text-right text-3xl font-bold text-[#0C6BA8]">
            {formatVnd(data.actualAmount)}
          </div>
        </div>
      </header>

      {slaBreach && (
        <div className="mb-4 rounded-md border-2 border-red-500 bg-red-50 p-3 text-sm text-red-700">
          {t("slaBreachWarning")}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div role="tablist" className="flex flex-wrap gap-1 border-b border-[#e5e5e5]">
            {(
              [
                { value: "overview", label: t("detail.overview") },
                { value: "taxInvoice", label: t("detail.taxInvoice") },
                { value: "receipt", label: t("detail.receipt") },
                { value: "activity", label: t("detail.activity") },
              ] as const
            ).map((it) => (
              <button
                key={it.value}
                type="button"
                role="tab"
                onClick={() => setTab(it.value)}
                aria-selected={tab === it.value}
                className={
                  tab === it.value
                    ? "border-b-2 border-[var(--brand-blue-500)] px-3 py-2 text-sm font-medium text-[var(--brand-blue-700)]"
                    : "px-3 py-2 text-sm text-[#525252] hover:text-[#111]"
                }
              >
                {it.label}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-[#e5e5e5] bg-white p-4">
            {tab === "overview" && (
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <Row label="Customer" value={
                  <Link href={`/o/customers/${data.customer.id}`} className="text-[var(--brand-blue-700)] hover:underline">
                    {data.customer.name} ({data.customer.code})
                  </Link>
                } />
                {data.contract && (
                  <Row label="Contract" value={
                    <Link href={`/o/contracts/${data.contract.id}`} className="text-[var(--brand-blue-700)] hover:underline">
                      {data.contract.contractNumber}
                    </Link>
                  } />
                )}
                {data.visit && (
                  <Row label="Visit" value={
                    <Link href={`/o/visits/${data.visit.id}`} className="text-[var(--brand-blue-700)] hover:underline">
                      {data.visit.type} — {formatDate(data.visit.scheduledFor, locale)}
                    </Link>
                  } />
                )}
                <Row label="Expected" value={formatVnd(data.expectedAmount)} />
                <Row label="Actual" value={formatVnd(data.actualAmount)} />
                {Number(data.carryoverAmount) > 0 && (
                  <Row label="Carryover" value={
                    <span className="font-semibold text-amber-700">
                      {formatVnd(data.carryoverAmount)}
                    </span>
                  } />
                )}
                {data.dueDate && (
                  <Row label="Due date" value={formatDate(data.dueDate, locale)} />
                )}
                {data.collectedAt && (
                  <Row label="Collected at" value={formatDateTime(data.collectedAt, locale)} />
                )}
                {data.handedOverAt && (
                  <Row label="Handed over at" value={formatDateTime(data.handedOverAt, locale)} />
                )}
                {data.reconciledAt && (
                  <Row label="Reconciled at" value={formatDateTime(data.reconciledAt, locale)} />
                )}
                {data.reference && (
                  <Row label="Reference" value={data.reference} />
                )}
                {data.collectedBy && (
                  <Row label="Collected by" value={data.collectedBy.username} />
                )}
                {data.notes && (
                  <div className="sm:col-span-2">
                    <Row label="Notes" value={<span className="whitespace-pre-wrap">{data.notes}</span>} />
                  </div>
                )}
              </div>
            )}

            {tab === "taxInvoice" && (
              <div>
                {data.taxInvoice ? (
                  <div className="text-sm">
                    <Row label="Invoice no." value={data.taxInvoice.invoiceNumber ?? "(tombstoned)"} />
                    {data.taxInvoice.invoiceDate && (
                      <Row label="Invoice date" value={formatDate(data.taxInvoice.invoiceDate, locale)} />
                    )}
                    <div className="mt-3">
                      <a
                        href={`/api/tax-invoices/${data.taxInvoice.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--brand-blue-700)] hover:underline"
                      >
                        Download PDF
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[#737373]">
                    No tax invoice. Upload via Tax Invoices page.
                  </p>
                )}
              </div>
            )}

            {tab === "receipt" && (
              <div className="text-sm">
                <a
                  href={`/api/payments/${data.id}/receipt-pdf?locale=${locale}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--brand-blue-700)] hover:underline"
                >
                  {t("detail.downloadReceipt")}
                </a>
              </div>
            )}

            {tab === "activity" && (
              <ul className="space-y-2 text-sm">
                {data.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between">
                    <span>{d.kind} — {d.filename}</span>
                    <span className="text-xs text-[#737373]">
                      {formatDateTime(d.generatedAt, locale)}
                    </span>
                  </li>
                ))}
                {data.documents.length === 0 && (
                  <li className="text-[#737373]">No documents.</li>
                )}
              </ul>
            )}
          </div>
        </div>

        <aside className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#002A4D]">
            {t("detail.actionsTitle")}
          </h3>
          <div className="flex flex-col gap-2">
            {isOffice && data.state === "COLLECTED" && (
              <Button onClick={handleHandOver} isLoading={actionLoading}>
                {t("detail.handOver")}
              </Button>
            )}
            {isManager &&
              (data.state === "COLLECTED" ||
                data.state === "HANDED_OVER") && (
                <Button onClick={handleReconcile} isLoading={actionLoading}>
                  {t("detail.reconcile")}
                </Button>
              )}
            {isOffice && data.state === "EXPECTED" && (
              <Button
                variant="secondary"
                onClick={() => setShowPartial(true)}
                disabled={actionLoading}
              >
                {t("detail.partial")}
              </Button>
            )}
            {isManager &&
              data.state !== "RECONCILED" &&
              data.state !== "WRITTEN_OFF" && (
                <Button
                  variant="danger"
                  onClick={() => setShowWriteOff(true)}
                  disabled={actionLoading}
                >
                  {t("detail.writeOff")}
                </Button>
              )}
            <a
              href={`/api/payments/${data.id}/receipt-pdf?locale=${locale}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md px-3 py-2 text-center text-sm font-medium text-[var(--brand-blue-700)] ring-1 ring-[var(--brand-blue-200)] hover:bg-[var(--brand-blue-50)]"
            >
              {t("detail.downloadReceipt")}
            </a>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={showWriteOff}
        title={t("detail.writeOff")}
        confirmLabel={t("detail.writeOff")}
        variant="danger"
        busy={actionLoading}
        onCancel={() => setShowWriteOff(false)}
        onConfirm={handleWriteOff}
        message={
          <div className="space-y-2">
            <label className="text-sm">{t("writeOffPrompt")}</label>
            <Input
              value={writeOffReason}
              onChange={(e) => setWriteOffReason(e.target.value)}
              placeholder={t("writeOffPrompt")}
            />
          </div>
        }
      />

      <Modal
        open={showPartial}
        onClose={() => setShowPartial(false)}
        title={t("detail.partial")}
      >
        <div className="space-y-3">
          <label className="block text-sm">{t("partialPrompt")}</label>
          <Input
            type="number"
            value={partialAmount}
            onChange={(e) => setPartialAmount(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowPartial(false)}>
              Cancel
            </Button>
            <Button onClick={handlePartial} isLoading={actionLoading}>
              {t("detail.partial")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="w-28 shrink-0 text-xs uppercase tracking-wider text-[#737373]">
        {label}
      </span>
      <span className="text-sm text-[#111]">{value}</span>
    </div>
  );
}
