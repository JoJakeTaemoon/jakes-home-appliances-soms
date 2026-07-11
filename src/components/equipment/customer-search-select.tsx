"use client";

/**
 * Customer search + select widget for Step 1 of the bulk-register wizard
 * (and any other flow that needs "pick or create a customer").
 *
 * Left: search-criteria hint Combobox + query Input + 검색 Button → results
 * table (radio-select) sourced from `GET /api/customers?q=...`.
 * Right: selected-customer detail panel sourced from `GET /api/customers/[id]`.
 * Below: "+ 신규 고객 등록" opens NewCustomerModal.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useApiPageQuery, useApiQuery } from "@/lib/api/hooks";
import { NewCustomerModal } from "@/components/equipment/new-customer-modal";

type SearchCriteria = "name" | "code" | "contact" | "phone";

interface CustomerContactLite {
  id: string;
  role: "CONTRACT_PARTY" | "OPS_CONTACT";
  isPrimary: boolean;
  name: string;
  phone1: string;
  email: string | null;
}

interface CustomerRowBase {
  id: string;
  code: string;
  name: string;
  type: "B2C" | "B2B";
  shortcode?: string | null;
  address?: string | null;
  addressStreet?: string | null;
  addressWardName?: string | null;
  addressProvinceName?: string | null;
  district?: string | null;
  city?: string | null;
  contacts: CustomerContactLite[];
}

type CustomerSearchRow = CustomerRowBase;

interface CustomerDetail extends CustomerRowBase {
  notes?: string | null;
  /** Present on the detail response — used to derive display counts. */
  equipment?: unknown[];
  contracts?: unknown[];
  /** True totals — equipment/contracts above are capped/filtered for display. */
  _count?: { contracts: number; equipment: number };
}

interface Props {
  value: string | null;
  onChange: (customerId: string | null) => void;
  locale?: "vi" | "ko" | "en";
}

/** Primary OPS contact first, CONTRACT_PARTY as fallback. */
function primaryContactOf(c: Pick<CustomerRowBase, "contacts"> | null): CustomerContactLite | null {
  if (!c) return null;
  return (
    c.contacts.find((x) => x.role === "OPS_CONTACT" && x.isPrimary) ??
    c.contacts.find((x) => x.role === "CONTRACT_PARTY") ??
    c.contacts[0] ??
    null
  );
}

/** Joined address line — falls back to the legacy flat columns. */
function addressOf(c: CustomerRowBase | null): string {
  if (!c) return "";
  return [
    c.addressStreet ?? c.address,
    c.addressWardName ?? c.district,
    c.addressProvinceName ?? c.city,
  ]
    .filter(Boolean)
    .join(", ");
}

export function CustomerSearchSelect({ value, onChange, locale = "vi" }: Readonly<Props>) {
  const t = useTranslations("equipment.customerSearch");
  const tc = useTranslations("common");

  const [criteria, setCriteria] = useState<SearchCriteria>("name");
  const [queryText, setQueryText] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const searchQuery = useApiPageQuery<CustomerSearchRow[]>(
    submittedQuery
      ? `/api/customers?q=${encodeURIComponent(submittedQuery)}&status=ACTIVE&pageSize=50`
      : null,
  );
  const results = searchQuery.data?.data ?? [];

  const detailQuery = useApiQuery<CustomerDetail>(value ? `/api/customers/${value}` : null);
  const customer = detailQuery.data ?? null;

  function handleSearch() {
    setSubmittedQuery(queryText.trim());
  }

  const criteriaOptions = (["name", "code", "contact", "phone"] as const).map((c) => ({
    value: c,
    label: t(`criteria.${c}`),
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ─── Left: search + results ─────────────────────────────── */}
        <div className="rounded border-2 border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-36">
              {/* ponytail: criteria only scopes the placeholder text — the server `q` searches all fields regardless of this selection */}
              <Combobox
                value={criteria}
                onChange={(v) => setCriteria((v as SearchCriteria) ?? "name")}
                options={criteriaOptions}
                searchable={false}
                allowClear={false}
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <Input
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                placeholder={t(`criteria.${criteria}Placeholder`)}
                aria-label={t("searchInput")}
              />
            </div>
            <Button type="button" onClick={handleSearch}>
              {tc("search")}
            </Button>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="w-8 py-1.5"></th>
                  <th className="py-1.5 tabular-nums">{t("columns.code")}</th>
                  <th className="py-1.5">{t("columns.name")}</th>
                  <th className="py-1.5">{t("columns.contact")}</th>
                  <th className="py-1.5 tabular-nums">{t("columns.phone")}</th>
                  <th className="py-1.5">{t("columns.address")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {searchQuery.isLoading && (
                  <tr>
                    <td colSpan={6} className="py-3 text-center text-xs text-gray-400">
                      {tc("loading")}
                    </td>
                  </tr>
                )}
                {!searchQuery.isLoading && submittedQuery && results.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-3 text-center text-xs text-gray-400">
                      {tc("noResults")}
                    </td>
                  </tr>
                )}
                {results.map((row) => {
                  const contact = primaryContactOf(row);
                  const selected = value === row.id;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => onChange(row.id)}
                      className={`cursor-pointer ${selected ? "bg-[var(--brand-blue-50)]" : "hover:bg-gray-50"}`}
                    >
                      <td className="py-1.5 text-center">
                        <input
                          type="radio"
                          name="customer-search-select"
                          checked={selected}
                          onChange={() => onChange(row.id)}
                          aria-label={row.name}
                        />
                      </td>
                      <td className="py-1.5 tabular-nums">{row.code}</td>
                      <td className="py-1.5">{row.name}</td>
                      <td className="py-1.5">{contact?.name ?? "—"}</td>
                      <td className="py-1.5 tabular-nums">{contact?.phone1 ?? "—"}</td>
                      <td className="py-1.5 text-xs text-gray-600">{addressOf(row) || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3">
            <Button type="button" variant="secondary" size="sm" onClick={() => setModalOpen(true)}>
              + {t("addNew")}
            </Button>
          </div>
        </div>

        {/* ─── Right: selected customer detail ────────────────────── */}
        <div className="rounded border-2 border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("detailTitle")}</h3>
          {!customer ? (
            <p className="text-sm text-gray-400">{t("noSelection")}</p>
          ) : (
            <CustomerDetailPanel customer={customer} t={t} tc={tc} />
          )}
        </div>
      </div>

      <NewCustomerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(c) => {
          onChange(c.id);
          setModalOpen(false);
        }}
        locale={locale}
      />
    </div>
  );
}

function CustomerDetailPanel({
  customer,
  t,
  tc,
}: Readonly<{
  customer: CustomerDetail;
  t: (k: string) => string;
  tc: (k: string) => string;
}>) {
  const contact = primaryContactOf(customer);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div>
        <span className="font-semibold text-gray-900">{customer.name}</span>{" "}
        <span className="tabular-nums text-gray-500">({customer.code})</span>
      </div>
      <DetailRow label={t("columns.contact")} value={contact?.name ?? "—"} />
      <DetailRow label={tc("phone")} value={contact?.phone1 ?? "—"} tabular />
      <DetailRow label={tc("email")} value={contact?.email ?? "—"} />
      <DetailRow label={tc("address")} value={addressOf(customer) || "—"} />
      <DetailRow label={t("columns.type")} value={customer.type} />
      {(customer._count || customer.equipment) && (
        <DetailRow
          label={t("equipmentCount")}
          value={String(customer._count?.equipment ?? customer.equipment?.length ?? 0)}
          tabular
        />
      )}
      {(customer._count || customer.contracts) && (
        <DetailRow
          label={t("contractCount")}
          value={String(customer._count?.contracts ?? customer.contracts?.length ?? 0)}
          tabular
        />
      )}
      {customer.notes && <DetailRow label={tc("notes")} value={customer.notes} />}
    </div>
  );
}

function DetailRow({
  label,
  value,
  tabular = false,
}: Readonly<{ label: string; value: string; tabular?: boolean }>) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-right text-gray-800 ${tabular ? "tabular-nums" : ""}`}>{value}</span>
    </div>
  );
}
