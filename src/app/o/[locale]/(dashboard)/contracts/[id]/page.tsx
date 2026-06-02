"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApi } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";
import { Tabs, TabsList, Tab, TabPanel } from "@/components/ui/tabs";
import {
  ContractStateBadge,
  ContractTypeBadge,
} from "@/components/contracts/contract-state-badge";
import { ContractActions } from "@/components/contracts/contract-actions";
import { ContractPdfPreview } from "@/components/contracts/contract-pdf-preview";
import { formatDate, formatVnd } from "@/lib/format";

interface ContractDetail {
  id: string;
  contractNumber: string;
  type: "SALE" | "RENTAL" | "MAINTENANCE";
  state: string;
  startDate: string | null;
  endDate: string | null;
  termMonths: number | null;
  monthlyMaintenanceFee: string | null;
  totalContractValue: string | null;
  notes: string | null;
  amendmentRevision: number;
  amendmentReason: string | null;
  signedByCustomerAt: string | null;
  signedByCompanyAt: string | null;
  activatedAt: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
  updatedAt: string;
  customer: { id: string; code: string; name: string; type: "B2C" | "B2B"; shortcode: string | null };
  equipment: Array<{
    id: string;
    equipmentId: string;
    unitPrice: string | null;
    quantity: number;
    notes: string | null;
    equipment: {
      id: string;
      serialNumber: string | null;
      model: { id: string; modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null; category: string };
      site: { id: string; name: string } | null;
    };
  }>;
  parentContract: { id: string; contractNumber: string; amendmentRevision: number; state: string } | null;
  amendments: Array<{
    id: string;
    contractNumber: string;
    amendmentRevision: number;
    amendmentReason: string | null;
    state: string;
    createdAt: string;
  }>;
  documents: Array<{ id: string; locale: string; filename: string; generatedAt: string; sizeBytes: number | null }>;
  recentAudit: Array<{ id: string; action: string; at: string; actorUser: { username: string; role: string } | null }>;
}

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const t = useTranslations("contracts");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const api = useApi();
  const { user } = useAuth();
  const role = user?.role ?? "STAFF";

  const [data, setData] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ContractDetail>(`/api/contracts/${id}`);
      setData(res.data);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => {
    if (!id) return;
    void reload();
  }, [id, reload]);

  if (loading && !data) return <div className="text-sm text-[#737373]">{tc("loading")}</div>;
  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {error ?? "Not found"}
      </div>
    );
  }

  // We can't (currently) read contract-party email from the detail payload;
  // assume it's available unless the contract is brand-new and unsigned.
  const hasContractPartyEmail = true;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-[#737373]">{data.contractNumber}</span>
            <ContractTypeBadge type={data.type} />
            <ContractStateBadge state={data.state} />
            {data.amendmentRevision > 0 && (
              <span className="text-xs text-[#737373]">
                {t("appendixBadge", { n: data.amendmentRevision })}
              </span>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-[#002A4D]">
            <Link href={`/o/customers/${data.customer.id}`} className="underline">
              {data.customer.name}
            </Link>
          </h1>
          <p className="text-xs text-[#737373]">
            {data.customer.code} · {data.customer.type}
            {data.customer.shortcode ? ` · ${data.customer.shortcode}` : ""}
          </p>
        </div>
        <ContractActions
          id={data.id}
          state={data.state}
          type={data.type}
          contractNumber={data.contractNumber}
          hasContractPartyEmail={hasContractPartyEmail}
          role={role}
          onChanged={reload}
        />
      </header>

      <Tabs defaultValue="overview">
        <TabsList>
          <Tab value="overview">{t("tabs.overview")}</Tab>
          <Tab value="equipment">{t("tabs.equipment")}</Tab>
          <Tab value="amendments">{t("tabs.amendments")}</Tab>
          <Tab value="payments">{t("tabs.payments")}</Tab>
          <Tab value="activity">{t("tabs.activity")}</Tab>
        </TabsList>

        <TabPanel value="overview">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-[#737373]">{t("title")}</h3>
              <Row label={t("type")} value={t(`types.${data.type}`)} />
              <Row label={t("state")} value={<ContractStateBadge state={data.state} />} />
              {data.startDate && <Row label={t("startDate")} value={formatDate(data.startDate, locale)} />}
              {data.endDate && <Row label={t("endDate")} value={formatDate(data.endDate, locale)} />}
              {data.termMonths !== null && <Row label={t("termMonths")} value={data.termMonths} />}
              {data.monthlyMaintenanceFee !== null && (
                <Row label={t("monthlyFee")} value={formatVnd(data.monthlyMaintenanceFee)} />
              )}
              {data.totalContractValue !== null && (
                <Row label={t("totalValue")} value={formatVnd(data.totalContractValue)} />
              )}
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-[#737373]">
                {t("tabs.activity")}
              </h3>
              {data.signedByCustomerAt && (
                <Row label="Customer signed" value={formatDate(data.signedByCustomerAt, locale)} />
              )}
              {data.signedByCompanyAt && (
                <Row label="Company signed" value={formatDate(data.signedByCompanyAt, locale)} />
              )}
              {data.activatedAt && (
                <Row label="Activated" value={formatDate(data.activatedAt, locale)} />
              )}
              {data.terminatedAt && (
                <Row label="Terminated" value={formatDate(data.terminatedAt, locale)} />
              )}
              {data.terminationReason && (
                <p className="text-xs text-[#737373]">{data.terminationReason}</p>
              )}
            </div>
            {data.parentContract && (
              <div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4 sm:col-span-2">
                <h3 className="text-xs font-medium uppercase tracking-wider text-[#737373]">
                  {t("parentContract")}
                </h3>
                <Link
                  href={`/o/contracts/${data.parentContract.id}`}
                  className="font-mono text-sm text-[var(--brand-blue-700)] underline"
                >
                  {data.parentContract.contractNumber}
                </Link>
                {data.amendmentReason && (
                  <p className="text-sm text-[#525252]">{data.amendmentReason}</p>
                )}
              </div>
            )}
            {data.notes && (
              <div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4 sm:col-span-2">
                <h3 className="text-xs font-medium uppercase tracking-wider text-[#737373]">
                  {tc("notes")}
                </h3>
                <p className="whitespace-pre-wrap text-sm text-[#525252]">{data.notes}</p>
              </div>
            )}
            <div className="sm:col-span-2">
              <ContractPdfPreview contractId={data.id} cacheBuster={version} />
            </div>
          </div>
        </TabPanel>

        <TabPanel value="equipment">
          <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[#fafafa] text-xs text-[#525252]">
                <tr>
                  <th className="px-3 py-2 text-left">Model</th>
                  <th className="px-3 py-2 text-left">Serial</th>
                  {data.customer.type === "B2B" && (
                    <th className="px-3 py-2 text-left">Site</th>
                  )}
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit price</th>
                  <th className="px-3 py-2 text-right">Line total</th>
                </tr>
              </thead>
              <tbody>
                {data.equipment.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-[#a3a3a3]">
                      {tc("noData")}
                    </td>
                  </tr>
                )}
                {data.equipment.map((ce) => {
                  const total = ce.unitPrice !== null ? Number(ce.unitPrice) * ce.quantity : null;
                  return (
                    <tr
                      key={ce.id}
                      onClick={() => router.push(`/o/equipment/${ce.equipment.id}`)}
                      className="cursor-pointer border-t border-[#f5f5f5] hover:bg-[#fafafa]"
                    >
                      <td className="px-3 py-2">
                        <div className="flex flex-col">
                          <span className="font-medium">{pickModelName(ce.equipment.model, locale)}</span>
                          <span className="text-xs text-[#737373]">{pickModelName(ce.equipment.model, locale)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{ce.equipment.serialNumber ?? "—"}</td>
                      {data.customer.type === "B2B" && (
                        <td className="px-3 py-2">{ce.equipment.site?.name ?? "—"}</td>
                      )}
                      <td className="px-3 py-2 text-right">{ce.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatVnd(ce.unitPrice)}</td>
                      <td className="px-3 py-2 text-right">{formatVnd(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabPanel>

        <TabPanel value="amendments">
          {data.amendments.length === 0 && !data.parentContract && (
            <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-6 text-center text-sm text-[#737373]">
              {tc("noData")}
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {data.amendments.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-lg border border-[#e5e5e5] bg-white p-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs">A{a.amendmentRevision}</span>
                  <Link href={`/o/contracts/${a.id}`} className="text-sm text-[var(--brand-blue-700)] underline">
                    {a.contractNumber}
                  </Link>
                  {a.amendmentReason && <span className="text-xs text-[#737373]">{a.amendmentReason}</span>}
                </div>
                <ContractStateBadge state={a.state} />
              </li>
            ))}
          </ul>
        </TabPanel>

        <TabPanel value="payments">
          <div className="rounded-xl border border-dashed border-[var(--brand-blue-200)] bg-[var(--brand-blue-50)] p-4 text-sm text-[var(--brand-blue-700)]">
            Phase 6 will surface payments here.
          </div>
        </TabPanel>

        <TabPanel value="activity">
          <ul className="flex flex-col divide-y divide-[#f5f5f5] overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
            {data.recentAudit.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-[#a3a3a3]">{tc("noData")}</li>
            )}
            {data.recentAudit.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium">{a.action}</span>
                <span className="text-xs text-[#737373]">
                  {a.actorUser?.username ?? "system"} · {formatDate(a.at, locale)}
                </span>
              </li>
            ))}
          </ul>
        </TabPanel>
      </Tabs>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-xs text-[#737373]">{label}</span>
      <span className="text-[#111111]">{value}</span>
    </div>
  );
}
