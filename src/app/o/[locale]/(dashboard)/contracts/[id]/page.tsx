"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApiQuery } from "@/lib/api/hooks";
import { useApi, ApiClientError } from "@/lib/api/client";
import { BreadcrumbLabel } from "@/lib/nav/breadcrumb-context";
import { useAuth } from "@/providers/auth-provider";
import { Tabs, TabsList, Tab, TabPanel } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { FormField } from "@/components/ui/form-field";
import { canAmendContract } from "@/lib/contracts/access";
import {
  ContractStateBadge,
  ContractTypeBadge,
} from "@/components/contracts/contract-state-badge";
import { ContractActions } from "@/components/contracts/contract-actions";
import { ContractPdfPreview } from "@/components/contracts/contract-pdf-preview";
import { BulkInstallEquipmentForm } from "@/components/contracts/bulk-install-equipment-form";
import { canManageEquipment } from "@/lib/customers/access";
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
  /** RENTAL only — deposit collected at installation, refundable on
   *  early termination or RENTAL→SALE conversion. */
  deposit: string | null;
  /** RENTAL only — TRANSFER_OWNERSHIP (default) or RETRIEVE_DEVICE. */
  endOfTermAction: "TRANSFER_OWNERSHIP" | "RETRIEVE_DEVICE" | null;
  notes: string | null;
  amendmentRevision: number;
  amendmentReason: string | null;
  signedByCustomerAt: string | null;
  signedByCompanyAt: string | null;
  activatedAt: string | null;
  terminatedAt: string | null;
  terminationReason: string | null;
  /** Refund returned on mid-term cancellation (set when state=TERMINATED). */
  terminationRefundAmount: string | null;
  /** When non-null, contract was converted from this type (RENTAL→SALE). */
  convertedFromType: "SALE" | "RENTAL" | "MAINTENANCE" | null;
  convertedAt: string | null;
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
  const { user } = useAuth();
  const role = user?.role ?? "STAFF";
  const [installOpen, setInstallOpen] = useState(false);

  const query = useApiQuery<ContractDetail>(
    id ? `/api/contracts/${id}` : null,
  );
  const data = query.data ?? null;
  const loading = query.isLoading;
  const error =
    query.error instanceof Error ? query.error.message : null;
  // `version` was bumped on every successful reload — used as a child-key
  // to remount sub-trees. The query's dataUpdatedAt timestamp serves the
  // same purpose without a setState-in-effect.
  const version = query.dataUpdatedAt;
  const reload = async () => {
    await query.refetch();
  };

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
      <BreadcrumbLabel value={data.contractNumber} />
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
              {data.type === "RENTAL" && data.deposit !== null && (
                <Row label={t("deposit")} value={formatVnd(data.deposit)} />
              )}
              {data.type === "RENTAL" && data.endOfTermAction && (
                <Row
                  label={t("endOfTermAction")}
                  value={t(`endOfTermActions.${data.endOfTermAction}` as never)}
                />
              )}
              {data.convertedFromType && (
                <Row
                  label={t("convertedFrom")}
                  value={t(`types.${data.convertedFromType}`)}
                />
              )}
              {data.terminationRefundAmount !== null && (
                <Row
                  label={t("terminationRefundAmount")}
                  value={formatVnd(data.terminationRefundAmount)}
                />
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
            {data.type === "RENTAL" && data.state === "ACTIVE" && (
              <div className="sm:col-span-2">
                <NotifyRenewalCard contractId={data.id} />
              </div>
            )}
            {data.type === "RENTAL" && data.state === "ACTIVE" && (
              <div className="sm:col-span-2">
                <ConvertToSaleCard
                  contractId={data.id}
                  deposit={data.deposit}
                  monthlyMaintenanceFee={data.monthlyMaintenanceFee}
                  termMonths={data.termMonths}
                  role={role}
                  onConverted={reload}
                />
              </div>
            )}
            {data.state === "ACTIVE" && (
              <div className="sm:col-span-2">
                <TerminateCard
                  contractId={data.id}
                  contractType={data.type}
                  deposit={data.deposit}
                  defaultRequireRetrieval={
                    data.endOfTermAction === "RETRIEVE_DEVICE"
                  }
                  role={role}
                  onTerminated={reload}
                />
              </div>
            )}
          </div>
        </TabPanel>

        <TabPanel value="equipment">
          <div className="mb-3 flex items-center justify-end">
            {canManageEquipment(user?.role ?? "STAFF") && (
              <Button onClick={() => setInstallOpen(true)}>
                {t("install.cta")}
              </Button>
            )}
          </div>
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
          <ContractPaymentsTab contractId={data.id} />
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
      {installOpen && (
        <Modal
          open
          onClose={() => setInstallOpen(false)}
          title={t("install.modalTitle")}
          size="xl"
        >
          <BulkInstallEquipmentForm
            lockedContractId={data.id}
            onSuccess={async () => {
              setInstallOpen(false);
              await reload();
            }}
          />
        </Modal>
      )}
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

// Mid-term RENTAL→SALE conversion. Office-triggered, MANAGER+ only.
// Captures sale price + deposit refund decision + free-text reason; the
// API flips the contract row in place + audits the action.
function ConvertToSaleCard({
  contractId,
  deposit,
  monthlyMaintenanceFee,
  termMonths,
  role,
  onConverted,
}: Readonly<{
  contractId: string;
  deposit: string | null;
  monthlyMaintenanceFee: string | null;
  termMonths: number | null;
  role: string;
  onConverted: () => void;
}>) {
  const t = useTranslations("contracts");
  const tc = useTranslations("common");
  const api = useApi();
  const [open, setOpen] = useState(false);
  if (!canAmendContract(role)) return null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-[#111111]">
            {t("convert.title")}
          </span>
          <span className="text-xs text-[#737373]">{t("convert.hint")}</span>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t("convert.openButton")}
        </Button>
      </div>
      {open && (
        <ConvertModal
          contractId={contractId}
          deposit={deposit}
          monthlyMaintenanceFee={monthlyMaintenanceFee}
          termMonths={termMonths}
          onClose={() => setOpen(false)}
          onConverted={() => {
            setOpen(false);
            onConverted();
          }}
          t={t}
          tc={tc}
          api={api}
        />
      )}
    </>
  );
}

function ConvertModal({
  contractId,
  deposit,
  monthlyMaintenanceFee,
  termMonths,
  onClose,
  onConverted,
  t,
  tc,
  api,
}: Readonly<{
  contractId: string;
  deposit: string | null;
  monthlyMaintenanceFee: string | null;
  termMonths: number | null;
  onClose: () => void;
  onConverted: () => void;
  t: (k: string, vars?: Record<string, string | number>) => string;
  tc: (k: string) => string;
  api: ReturnType<typeof useApi>;
}>) {
  // Suggested sale price = remaining months × monthly fee. The user can
  // override the value; this just primes the input with a reasonable default.
  const suggested =
    monthlyMaintenanceFee && termMonths
      ? Math.max(0, Math.round(Number(monthlyMaintenanceFee) * termMonths * 0.6))
      : 0;
  const [salePrice, setSalePrice] = useState<number>(suggested);
  const [refundDeposit, setRefundDeposit] = useState<boolean>(!!deposit);
  const [refundAmount, setRefundAmount] = useState<number>(
    deposit ? Number(deposit) : 0,
  );
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    if (reason.trim().length < 5) {
      setErr(t("convert.reasonTooShort"));
      return;
    }
    if (refundDeposit && refundAmount <= 0) {
      setErr(t("convert.refundAmountRequired"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/contracts/${contractId}/convert`, {
        targetType: "SALE",
        salePrice,
        refundDeposit,
        refundAmount: refundDeposit ? refundAmount : undefined,
        reason: reason.trim(),
      });
      onConverted();
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("convert.title")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} isLoading={busy}>
            {t("convert.submit")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label={t("convert.salePrice")} required>
          <NumberInput value={salePrice} onChange={setSalePrice} min={0} />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={refundDeposit}
            onChange={(e) => setRefundDeposit(e.target.checked)}
          />
          {t("convert.refundDeposit")}
        </label>
        {refundDeposit && (
          <FormField label={t("convert.refundAmount")} required>
            <NumberInput
              value={refundAmount}
              onChange={setRefundAmount}
              min={0}
            />
          </FormField>
        )}
        <FormField label={t("convert.reason")} required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={t("convert.reasonPlaceholder")}
          />
        </FormField>
        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {err}
          </div>
        )}
      </div>
    </Modal>
  );
}

// Mid-term cancellation — captures reason + optional refund + retrieval
// decision in one modal. Pre-checks the retrieval box when the contract
// was created with endOfTermAction=RETRIEVE_DEVICE so operators don't
// have to remember the original setup.
function TerminateCard({
  contractId,
  contractType,
  deposit,
  defaultRequireRetrieval,
  role,
  onTerminated,
}: Readonly<{
  contractId: string;
  contractType: "SALE" | "RENTAL" | "MAINTENANCE";
  deposit: string | null;
  defaultRequireRetrieval: boolean;
  role: string;
  onTerminated: () => void;
}>) {
  const t = useTranslations("contracts");
  const tc = useTranslations("common");
  const api = useApi();
  const [open, setOpen] = useState(false);
  if (!canAmendContract(role)) return null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-red-800">
            {t("terminate.title")}
          </span>
          <span className="text-xs text-red-600">{t("terminate.hint")}</span>
        </div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          {t("terminate.openButton")}
        </Button>
      </div>
      {open && (
        <TerminateModal
          contractId={contractId}
          contractType={contractType}
          deposit={deposit}
          defaultRequireRetrieval={defaultRequireRetrieval}
          onClose={() => setOpen(false)}
          onTerminated={() => {
            setOpen(false);
            onTerminated();
          }}
          t={t}
          tc={tc}
          api={api}
        />
      )}
    </>
  );
}

function TerminateModal({
  contractId,
  contractType,
  deposit,
  defaultRequireRetrieval,
  onClose,
  onTerminated,
  t,
  tc,
  api,
}: Readonly<{
  contractId: string;
  contractType: "SALE" | "RENTAL" | "MAINTENANCE";
  deposit: string | null;
  defaultRequireRetrieval: boolean;
  onClose: () => void;
  onTerminated: () => void;
  t: (k: string) => string;
  tc: (k: string) => string;
  api: ReturnType<typeof useApi>;
}>) {
  const [reason, setReason] = useState("");
  const [refundAmount, setRefundAmount] = useState<number>(
    deposit ? Number(deposit) : 0,
  );
  const [requireRetrieval, setRequireRetrieval] = useState<boolean>(
    defaultRequireRetrieval,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    if (reason.trim().length < 5) {
      setErr(t("terminate.reasonTooShort"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/contracts/${contractId}/terminate`, {
        reason: reason.trim(),
        refundAmount: refundAmount > 0 ? refundAmount : undefined,
        requireRetrieval,
      });
      onTerminated();
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("terminate.title")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} isLoading={busy}>
            {t("terminate.submit")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label={t("terminate.reason")} required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={t("terminate.reasonPlaceholder")}
          />
        </FormField>
        {contractType === "RENTAL" && (
          <>
            <FormField label={t("terminate.refundAmount")}>
              <NumberInput
                value={refundAmount}
                onChange={setRefundAmount}
                min={0}
              />
            </FormField>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requireRetrieval}
                onChange={(e) => setRequireRetrieval(e.target.checked)}
              />
              {t("terminate.requireRetrieval")}
            </label>
          </>
        )}
        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {err}
          </div>
        )}
      </div>
    </Modal>
  );
}

// Renewal SMS — explicit, one-click action for office staff to ping the
// CONTRACT_PARTY contact about an upcoming RENTAL term end. We deliberately
// don't auto-send these (per the 2026-06 plan); the office decides when.
function NotifyRenewalCard({ contractId }: Readonly<{ contractId: string }>) {
  const t = useTranslations("contracts");
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    if (busy) return;
    if (!window.confirm(t("notify.confirm"))) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/contracts/${contractId}/notify-renewal`, {});
      setSentAt(new Date());
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-[#111111]">
            {t("notify.renewalTitle")}
          </span>
          <span className="text-xs text-[#737373]">
            {t("notify.renewalHint")}
          </span>
        </div>
        <Button onClick={send} isLoading={busy}>
          {t("notify.sendRenewalSms")}
        </Button>
      </div>
      {sentAt && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {t("notify.sentAt", { time: sentAt.toLocaleString() })}
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {err}
        </div>
      )}
    </div>
  );
}

// Per-contract payment history. Hits the new
// GET /api/contracts/[id]/payments endpoint and renders kind-grouped
// total chips above a chronological table.
interface PaymentRow {
  id: string;
  kind:
    | "DEPOSIT"
    | "RENTAL_FEE"
    | "SALE_PAYMENT"
    | "MAINTENANCE_FEE"
    | "SERVICE_FEE"
    | "DEPOSIT_REFUND";
  method: "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER";
  state: string;
  expectedAmount: string;
  actualAmount: string;
  collectedAt: string | null;
  notes: string | null;
  collectedBy: { id: string; username: string } | null;
  visit: { id: string; type: string; scheduledFor: string } | null;
}

interface PaymentsResponse {
  rows: PaymentRow[];
  totals: {
    byKind: Record<string, number>;
    byState: Record<string, number>;
  };
}

function ContractPaymentsTab({ contractId }: Readonly<{ contractId: string }>) {
  const t = useTranslations("contracts");
  const tc = useTranslations("common");
  const locale = useLocale();
  const query = useApiQuery<PaymentsResponse>(
    `/api/contracts/${contractId}/payments`,
  );

  if (query.isLoading) {
    return <div className="text-sm text-[#737373]">{tc("loading")}</div>;
  }
  if (!query.data) {
    return (
      <div className="rounded-xl border border-[#e5e5e5] bg-white p-4 text-sm text-[#737373]">
        {tc("noData")}
      </div>
    );
  }
  const { rows, totals } = query.data;
  const kindEntries = Object.entries(totals.byKind);

  return (
    <div className="flex flex-col gap-4">
      {kindEntries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {kindEntries.map(([k, sum]) => (
            <div
              key={k}
              className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs"
            >
              <span className="text-[#737373]">
                {t(`paymentKinds.${k}` as never)}
              </span>
              <span className="font-medium text-[#111111]">
                {formatVnd(sum)}
              </span>
            </div>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-4 text-sm text-[#737373]">
          {t("payments.empty")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-left text-xs text-[#737373]">
              <tr>
                <th className="px-3 py-2">{t("payments.collectedAt")}</th>
                <th className="px-3 py-2">{t("payments.kind")}</th>
                <th className="px-3 py-2">{t("payments.method")}</th>
                <th className="px-3 py-2 text-right">{t("payments.expected")}</th>
                <th className="px-3 py-2 text-right">{t("payments.actual")}</th>
                <th className="px-3 py-2">{t("payments.state")}</th>
                <th className="px-3 py-2">{t("payments.collectedBy")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f5f5f5]">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-[#525252]">
                    {r.collectedAt ? formatDate(r.collectedAt, locale) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {t(`paymentKinds.${r.kind}` as never)}
                  </td>
                  <td className="px-3 py-2 text-[#525252]">
                    {t(`payments.methods.${r.method}` as never)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatVnd(r.expectedAmount)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatVnd(r.actualAmount)}
                  </td>
                  <td className="px-3 py-2 text-[#525252]">
                    {t(`payments.states.${r.state}` as never)}
                  </td>
                  <td className="px-3 py-2 text-[#525252]">
                    {r.collectedBy?.username ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
