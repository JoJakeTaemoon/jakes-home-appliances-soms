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
  reconciledAt: string | null;
  method: string;
  reference?: string | null;
}

const PAGE_SIZE = 25;

export default function TaxInvoicesListPage() {
  const t = useTranslations("taxInvoices");
  const tc = useTranslations("common");
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
  const [sort, setSort] = useState<{ column: string; direction: "asc" | "desc" } | null>({
    column: "createdAt",
    direction: "desc",
  });

  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("page", String(page));
      qs.set("pageSize", String(PAGE_SIZE));
      if (sort) {
        qs.set("sortBy", sort.column);
        qs.set("sortDir", sort.direction);
      }
      const res = await api.get<InvoiceRow[]>(`/api/tax-invoices?${qs.toString()}`);
      setRows(res.data ?? []);
      setTotal(
        (res as unknown as { pagination?: { total?: number } }).pagination
          ?.total ?? 0,
      );
    } finally {
      setLoading(false);
    }
  }, [api, page, sort]);

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

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useEffect(() => {
    // Surfacing the pending queue on mount + after any successful upload
    // (which fires `load()` → bumps a new `page`-or-`sort` key).
    loadEligible().catch(() => undefined);
  }, [loadEligible, page]);

  const openUpload = (paymentId?: string) => {
    setShowUpload(true);
    setPickedPaymentId(paymentId ?? null);
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
      sortKey: "invoiceNumber",
      cell: (r) => r.invoiceNumber ?? "—",
    },
    {
      key: "invoiceDate",
      header: t("tableInvoiceDate"),
      sortKey: "invoiceDate",
      cell: (r) =>
        r.invoiceDate ? formatDate(r.invoiceDate, locale) : formatDate(r.createdAt, locale),
    },
    {
      key: "customer",
      header: t("tableCustomer"),
      sortKey: "customer",
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
          <Button onClick={() => openUpload()}>{t("newInvoice")}</Button>
        )}
      </header>

      {isManager && eligible.length > 0 && (
        <section className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <header className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-amber-900">
              {t("pendingSectionTitle", { count: eligible.length })}
            </h2>
            <p className="text-xs text-amber-800">{t("pendingSectionHint")}</p>
          </header>
          <ul className="divide-y divide-amber-200 rounded-xl bg-white">
            {eligible.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => openUpload(p.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-amber-50"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-[#262626]">{p.customer.name}</span>
                    <span className="font-mono text-xs text-[#737373]">
                      {p.customer.code}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {p.reconciledAt && (
                      <span className="text-xs text-[#737373]">
                        {formatDate(p.reconciledAt, locale)}
                      </span>
                    )}
                    <span className="font-semibold text-[#002A4D]">
                      {formatVnd(p.actualAmount)}
                    </span>
                    <span className="rounded-md bg-amber-700 px-2 py-1 text-xs font-medium text-white">
                      {t("pendingItemCta")}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

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
        sort={sort}
        onSortChange={setSort}
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
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("border-[var(--brand-blue-500)]", "bg-[var(--brand-blue-50)]");
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove("border-[var(--brand-blue-500)]", "bg-[var(--brand-blue-50)]");
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("border-[var(--brand-blue-500)]", "bg-[var(--brand-blue-50)]");
                const f = e.dataTransfer.files?.[0];
                if (f && f.type === "application/pdf") setUploadFile(f);
              }}
              className="block w-full cursor-pointer rounded-xl border-2 border-dashed border-[#d4d4d4] bg-[#fafafa] p-6 text-center transition-colors hover:border-[var(--brand-blue-500)] hover:bg-[var(--brand-blue-50)]"
            >
              <div className="text-sm font-medium text-[#262626]">
                {uploadFile ? uploadFile.name : t("uploadPickFile")}
              </div>
              <div className="mt-1 text-xs text-[#737373]">
                {uploadFile ? t("uploadFileSize", { kb: Math.round(uploadFile.size / 1024) }) : t("uploadDropHint")}
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="hidden"
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
              {tc("cancel")}
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
