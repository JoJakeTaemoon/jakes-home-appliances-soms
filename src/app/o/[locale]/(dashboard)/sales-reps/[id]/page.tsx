"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useApiQuery } from "@/lib/api/hooks";
import { Avatar } from "@/components/ui/avatar";
import { KpiCard } from "@/components/ui/kpi-card";
import { Tabs, TabsList, Tab, TabPanel } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";

interface RepDetail {
  id: string;
  username: string;
  title: string | null;
  avatarUrl: string | null;
  role: string;
  email: string | null;
  phone: string;
  stats: {
    customerCount: number;
    last30dRevenue: number;
    receivables: number;
  };
}

interface AssignedCustomer {
  id: string;
  code: string;
  name: string;
  type: "B2B" | "B2C";
  status: string;
  activeContractCount: number;
  activeEquipmentCount: number;
}

interface EquipmentRow {
  id: string;
  serialNumber: string | null;
  customDescription?: string | null;
  monthlyFee: string | null;
  serviceType?: string | null;
  status?: string;
  installedAt?: string | null;
  /** Populated by the revenue endpoint; sum of collected payments +
   *  paid consumable purchases attributed to this equipment in period. */
  revenue?: number;
  model: {
    modelCode: string | null;
    nameKo: string | null;
    nameVi: string | null;
    nameEn: string | null;
  } | null;
}

interface RevenueCustomerGroup {
  id: string;
  code: string;
  name: string;
  type: "B2B" | "B2C";
  equipmentCount: number;
  totalValue: number;
  equipment: EquipmentRow[];
}

interface ReceivablePaymentRow {
  id: string;
  kind: string;
  state: string;
  dueDate: string | null;
  expectedAmount: string;
  actualAmount: string;
  outstanding: number;
  notes: string | null;
  contract: { id: string; contractNumber: string; type: string } | null;
  equipment: EquipmentRow[];
}

interface ReceivableCustomerGroup {
  id: string;
  code: string;
  name: string;
  type: "B2B" | "B2C";
  paymentCount: number;
  outstandingTotal: number;
  payments: ReceivablePaymentRow[];
}

export default function SalesRepDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const t = useTranslations("salesReps");
  const tc = useTranslations("common");
  const locale = useLocale();

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const [from, setFrom] = useState(firstOfMonth.toISOString().slice(0, 10));
  const [to, setTo] = useState(lastDayOfMonth.toISOString().slice(0, 10));

  const repQuery = useApiQuery<RepDetail>(id ? `/api/sales-reps/${id}` : null);
  const customersQuery = useApiQuery<{ data: AssignedCustomer[] }>(
    id ? `/api/customers?salesRepId=${id}&pageSize=100` : null,
  );
  const contractsQuery = useApiQuery<{
    customers: RevenueCustomerGroup[];
    totalValue: number;
    totalEquipment: number;
    totalCustomers: number;
  }>(id ? `/api/sales-reps/${id}/contracts?from=${from}&to=${to}` : null);
  const receivablesQuery = useApiQuery<{
    customers: ReceivableCustomerGroup[];
    totalReceivable: number;
    totalPayments: number;
    totalCustomers: number;
  }>(id ? `/api/sales-reps/${id}/receivables?from=${from}&to=${to}` : null);

  const rep = repQuery.data ?? null;
  const customers = (customersQuery.data?.data ?? []) as AssignedCustomer[];
  const contracts = contractsQuery.data;
  const receivables = receivablesQuery.data;

  if (!rep) {
    return <div className="text-sm text-gray-500">{tc("loading")}</div>;
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <header className="flex items-center gap-3 rounded-lg border-2 border-gray-200 bg-white p-4">
        <Avatar name={rep.username} imageUrl={rep.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-[#002A4D]">{rep.username}</h1>
          <p className="text-xs text-gray-500">
            {rep.title ?? rep.role} · {rep.phone}{" "}
            {rep.email ? `· ${rep.email}` : ""}
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <KpiCard label={t("kpi.customers")} value={rep.stats.customerCount} />
        <KpiCard
          label={t("kpi.last30dRevenue")}
          value={formatMoney(rep.stats.last30dRevenue)}
          variant="money"
        />
        <KpiCard
          label={t("kpi.receivables")}
          value={formatMoney(rep.stats.receivables)}
          variant="warning"
        />
      </section>

      <section className="rounded-xl border-2 border-gray-200 bg-white">
        <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-700">
            {t("tabs.customers")}
          </h2>
          <span className="text-xs text-gray-500">
            {customers.length} {t("type")}
          </span>
        </header>
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">{tc("name")}</th>
              <th className="px-3 py-2">{t("type")}</th>
              <th className="px-3 py-2">{t("equipmentCount")}</th>
              <th className="px-3 py-2">{t("contractCount")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {customers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-xs text-gray-400">
                  {tc("noData")}
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 font-mono text-xs text-gray-500">
                      {c.code}
                    </span>
                  </td>
                  <td className="px-3 py-2">{c.type}</td>
                  <td className="px-3 py-2">{c.activeEquipmentCount}</td>
                  <td className="px-3 py-2">{c.activeContractCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/*
        Period filter applies only to the contracts + receivables tabs —
        the assigned-customer section above is the full roster regardless
        of date and shouldn't be re-filtered when the date pickers move.
      */}
      <div className="flex items-center gap-3 rounded-md border-2 border-gray-200 bg-white p-3 text-sm">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
          {t("periodLabel")}
        </span>
        <label className="flex items-center gap-2">
          <span className="text-gray-500">{t("periodFrom")}</span>
          <div className="w-40">
            <DatePicker value={from} onChange={setFrom} clearable={false} />
          </div>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-gray-500">{t("periodTo")}</span>
          <div className="w-40">
            <DatePicker value={to} onChange={setTo} clearable={false} />
          </div>
        </label>
        <Button
          variant="secondary"
          onClick={() => {
            void contractsQuery.refetch();
            void receivablesQuery.refetch();
          }}
        >
          {tc("refresh")}
        </Button>
      </div>

      <Tabs defaultValue="contracts">
        <TabsList>
          <Tab value="contracts">{t("tabs.contracts")}</Tab>
          <Tab value="receivables">{t("tabs.receivables")}</Tab>
        </TabsList>

        <TabPanel value="contracts">
          <RevenueByCustomer
            data={contracts}
            locale={locale}
            t={t}
            tc={tc}
          />
        </TabPanel>

        <TabPanel value="receivables">
          <ReceivablesByCustomer
            data={receivables}
            locale={locale}
            t={t}
            tc={tc}
          />
        </TabPanel>
      </Tabs>
    </div>
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

function pickModelName(
  m: EquipmentRow["model"],
  customDescription: string | null | undefined,
  locale: string,
): string {
  if (!m) return customDescription ?? "—";
  if (locale === "ko") return m.nameKo ?? m.nameEn ?? m.nameVi ?? m.modelCode ?? "—";
  if (locale === "en") return m.nameEn ?? m.nameKo ?? m.nameVi ?? m.modelCode ?? "—";
  return m.nameVi ?? m.nameEn ?? m.nameKo ?? m.modelCode ?? "—";
}

type Tn = ReturnType<typeof useTranslations>;

/**
 * Revenue tab: one card per customer, each card lists every piece of
 * equipment that received revenue in the selected period, with the
 * model, serial, install date, service type, monthly fee (context), and
 * per-device revenue = sum of collected rental / equipment-sale payments
 * plus paid CONSUMABLE order-item totals attributed to that device
 * (2026-07-03 policy — replaces the earlier deposit + monthlyFee × 12
 * first-year book value).
 */
function RevenueByCustomer({
  data,
  locale,
  t,
  tc,
}: Readonly<{
  data:
    | {
        customers: RevenueCustomerGroup[];
        totalValue: number;
        totalEquipment: number;
        totalCustomers: number;
      }
    | undefined;
  locale: string;
  t: Tn;
  tc: Tn;
}>) {
  if (!data || data.customers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
        {tc("noData")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <SummaryStat label={t("revenue.customerCount")} value={String(data.totalCustomers)} />
        <SummaryStat label={t("revenue.equipmentCount")} value={String(data.totalEquipment)} />
        <SummaryStat
          label={t("totalSum")}
          value={formatMoney(data.totalValue)}
          emphasis
        />
      </div>
      <p className="text-xs text-gray-500">{t("revenue.formulaHint")}</p>

      {data.customers.map((cust) => (
        <article
          key={cust.id}
          className="overflow-hidden rounded-xl border-2 border-gray-200 bg-white"
        >
          <header className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="rounded bg-white px-2 py-0.5 font-mono text-xs text-gray-500">
                {cust.code}
              </span>
              <span className="text-base font-semibold text-gray-900">{cust.name}</span>
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] uppercase text-gray-600">
                {cust.type}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>
                {t("revenue.equipmentCount")} <b className="text-gray-900">{cust.equipmentCount}</b>
              </span>
              <span className="text-sm font-semibold text-[#002A4D]">
                {formatMoney(cust.totalValue)}
              </span>
            </div>
          </header>

          <div className="overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">{t("revenue.modelName")}</th>
                  <th className="px-3 py-2">{t("revenue.serial")}</th>
                  <th className="px-3 py-2">{t("revenue.installedAt")}</th>
                  <th className="px-3 py-2">{t("revenue.serviceType")}</th>
                  <th className="px-3 py-2 text-right">{t("revenue.monthlyFee")}</th>
                  <th className="px-3 py-2 text-right">{t("revenue.perEquipmentRevenue")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cust.equipment.map((eq) => (
                  <tr key={eq.id}>
                    <td className="px-3 py-2 text-gray-700">
                      {pickModelName(eq.model, eq.customDescription, locale)}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-500">
                      {eq.serialNumber ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {formatDate(eq.installedAt ?? null, locale)}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {eq.serviceType ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700 tabular-nums">
                      {eq.monthlyFee ? formatMoney(Number(eq.monthlyFee)) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-[#002A4D] tabular-nums">
                      {formatMoney(eq.revenue ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </div>
  );
}

/**
 * Receivables tab: one card per customer, each card lists every open
 * payment plus the equipment that the unpaid fee is for (direct link
 * via Payment.equipmentId, else the contract's equipment fallback). The
 * office uses this view to call/dunning a specific device.
 */
function ReceivablesByCustomer({
  data,
  locale,
  t,
  tc,
}: Readonly<{
  data:
    | {
        customers: ReceivableCustomerGroup[];
        totalReceivable: number;
        totalPayments: number;
        totalCustomers: number;
      }
    | undefined;
  locale: string;
  t: Tn;
  tc: Tn;
}>) {
  if (!data || data.customers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
        {tc("noData")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <SummaryStat label={t("revenue.customerCount")} value={String(data.totalCustomers)} />
        <SummaryStat label={t("receivables.paymentCount")} value={String(data.totalPayments)} />
        <SummaryStat
          label={t("totalReceivable")}
          value={formatMoney(data.totalReceivable)}
          emphasis="warning"
        />
      </div>

      {data.customers.map((cust) => (
        <article
          key={cust.id}
          className="overflow-hidden rounded-xl border-2 border-gray-200 bg-white"
        >
          <header className="flex items-center justify-between border-b border-gray-100 bg-red-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="rounded bg-white px-2 py-0.5 font-mono text-xs text-gray-500">
                {cust.code}
              </span>
              <span className="text-base font-semibold text-gray-900">{cust.name}</span>
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] uppercase text-gray-600">
                {cust.type}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>
                {t("receivables.paymentCount")} <b className="text-gray-900">{cust.paymentCount}</b>
              </span>
              <span className="text-sm font-semibold text-red-700">
                {formatMoney(cust.outstandingTotal)}
              </span>
            </div>
          </header>

          <div className="divide-y divide-gray-100">
            {cust.payments.map((p) => (
              <section key={p.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-3">
                    <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] uppercase text-red-700">
                      {p.state}
                    </span>
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] uppercase text-gray-600">
                      {p.kind}
                    </span>
                    <span className="font-mono text-xs text-gray-500">
                      {p.contract?.contractNumber ?? "—"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {t("dueDate")} {formatDate(p.dueDate, locale)}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-red-700">
                    {formatMoney(p.outstanding)}
                  </span>
                </div>

                {p.equipment.length === 0 ? (
                  <p className="mt-2 text-xs text-gray-400">{t("receivables.noEquipment")}</p>
                ) : (
                  <div className="mt-2 overflow-hidden rounded-md border border-gray-100">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-left uppercase text-gray-500">
                        <tr>
                          <th className="px-2 py-1.5">{t("revenue.modelName")}</th>
                          <th className="px-2 py-1.5">{t("revenue.serial")}</th>
                          <th className="px-2 py-1.5 text-right">{t("revenue.monthlyFee")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {p.equipment.map((eq) => (
                          <tr key={eq.id}>
                            <td className="px-2 py-1.5 text-gray-700">
                              {pickModelName(eq.model, eq.customDescription, locale)}
                            </td>
                            <td className="px-2 py-1.5 font-mono text-gray-500">
                              {eq.serialNumber ?? "—"}
                            </td>
                            <td className="px-2 py-1.5 text-right text-gray-700">
                              {eq.monthlyFee ? formatMoney(Number(eq.monthlyFee)) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  emphasis,
}: Readonly<{ label: string; value: string; emphasis?: "warning" | boolean }>) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div
        className={
          emphasis === "warning"
            ? "text-base font-semibold text-red-700"
            : emphasis
              ? "text-base font-semibold text-[#002A4D]"
              : "text-base font-semibold text-gray-900"
        }
      >
        {value}
      </div>
    </div>
  );
}
