"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useApi } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Combobox } from "@/components/ui/combobox";
import { formatDate, formatVnd } from "@/lib/format";

interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  createdAt: string;
  pdfStorageKey: string | null;
  emailedAt: string | null;
  payment: {
    id: string;
    actualAmount: string;
    customer: { id: string; code: string; name: string; type: "B2C" | "B2B" };
  } | null;
}

interface EligiblePayment {
  id: string;
  customer: { code: string; name: string };
  actualAmount: string;
}

const PAGE_SIZE = 25;

export default function TaxInvoicesListPage() {
  const t = useTranslations("taxInvoices");
  const locale = useLocale();
  const api = useApi();
  const { user } = useAuth();

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [eligible, setEligible] = useState<EligiblePayment[]>([]);
  const [pickedPaymentId, setPickedPaymentId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<InvoiceRow[]>(
        `/api/tax-invoices?page=${page}&pageSize=${PAGE_SIZE}`,
      );
      setRows(res.data ?? []);
      setTotal(
        (res as unknown as { pagination?: { total?: number } }).pagination
          ?.total ?? 0,
      );
    } finally {
      setLoading(false);
    }
  }, [api, page]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const loadEligible = useCallback(async () => {
    try {
      const res = await api.get<EligiblePayment[]>(
        `/api/payments?state=RECONCILED&pageSize=50`,
      );
      // Filter to B2B customers + payments without a tax invoice
      const list = (res.data ?? []).filter(
        (p: unknown) =>
          (p as { customer?: { type?: string } }).customer?.type === "B2B" &&
          !(p as { taxInvoice?: unknown }).taxInvoice,
      ) as unknown as EligiblePayment[];
      setEligible(list);
    } catch {
      setEligible([]);
    }
  }, [api]);

  const openUpload = () => {
    setShowUpload(true);
    loadEligible().catch(() => undefined);
  };

  const handleUpload = async () => {
    if (!pickedPaymentId || !uploadFile || !invoiceNumber.trim()) {
      setUploadError(t("uploadError"));
      return;
    }
    setUploadError(null);
    setUploadSubmitting(true);
    try {
      const form = new FormData();
      form.set("file", uploadFile);
      form.set("paymentId", pickedPaymentId);
      form.set("invoiceNumber", invoiceNumber);
      form.set("invoiceDate", invoiceDate);
      if (notes) form.set("notes", notes);
      const res = await fetch("/api/tax-invoices", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message ?? "Upload failed");
      }
      setShowUpload(false);
      setPickedPaymentId(null);
      setUploadFile(null);
      setInvoiceNumber("");
      setNotes("");
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("uploadError"));
    } finally {
      setUploadSubmitting(false);
    }
  };

  const columns: Column<InvoiceRow>[] = [
    {
      key: "invoiceNumber",
      header: t("tableInvoiceNo"),
      cell: (r) => r.invoiceNumber ?? "—",
    },
    {
      key: "invoiceDate",
      header: t("tableInvoiceDate"),
      cell: (r) =>
        r.invoiceDate ? formatDate(r.invoiceDate, locale) : formatDate(r.createdAt, locale),
    },
    {
      key: "customer",
      header: t("tableCustomer"),
      cell: (r) => (
        <div>
          <div className="font-medium">{r.payment?.customer.name ?? "—"}</div>
          <div className="text-xs text-[#737373]">
            {r.payment?.customer.code ?? ""}
          </div>
        </div>
      ),
    },
    {
      key: "amount",
      header: t("tableAmount"),
      align: "right",
      cell: (r) =>
        r.payment ? formatVnd(r.payment.actualAmount) : "—",
    },
    {
      key: "actions",
      header: t("tableActions"),
      cell: (r) => (
        <a
          href={`/api/tax-invoices/${r.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--brand-blue-700)] hover:underline"
        >
          {t("detail.download")}
        </a>
      ),
    },
  ];

  const filteredRows = rows.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.invoiceNumber?.toLowerCase().includes(s) ||
      r.payment?.customer.name.toLowerCase().includes(s) ||
      r.payment?.customer.code.toLowerCase().includes(s) ||
      false
    );
  });

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[#002A4D]">{t("listTitle")}</h1>
        {isManager && (
          <Button onClick={openUpload}>{t("newInvoice")}</Button>
        )}
      </header>

      <div className="mb-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="max-w-xs"
        />
      </div>

      <DataTable
        columns={columns}
        rows={filteredRows}
        rowKey={(r) => r.id}
        isLoading={loading}
        emptyText={t("noInvoices")}
        footer={
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        }
      />

      <Modal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        title={t("uploadTitle")}
        size="lg"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">
              {t("uploadPickPayment")}
            </label>
            <Combobox
              value={pickedPaymentId}
              onChange={setPickedPaymentId}
              options={eligible.map((p) => ({
                value: p.id,
                label: `${p.customer.code} ${p.customer.name} — ${formatVnd(p.actualAmount)}`,
              }))}
              placeholder={t("uploadPickPayment")}
              emptyText={t("uploadPickPaymentHint")}
              allowClear
            />
            <p className="mt-1 text-xs text-[#737373]">
              {t("uploadPickPaymentHint")}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              {t("uploadInvoiceNumber")}
            </label>
            <Input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="GTGT-0001234"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              {t("uploadInvoiceDate")}
            </label>
            <Input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              {t("uploadFile")}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="block text-sm"
            />
            <p className="mt-1 text-xs text-[#737373]">{t("uploadFileHint")}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              {t("uploadNotes")}
            </label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {uploadError && (
            <p className="text-sm text-red-600">{uploadError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowUpload(false)}
              disabled={uploadSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleUpload} isLoading={uploadSubmitting}>
              {t("uploadSubmit")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
