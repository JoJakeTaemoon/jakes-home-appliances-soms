"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { pickModelName } from "@/lib/products/name";
import { useApi } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { BreadcrumbLabel } from "@/lib/nav/breadcrumb-context";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Tabs, TabsList, Tab, TabPanel } from "@/components/ui/tabs";
import {
  VisitStateBadge,
  VisitTypeBadge,
} from "@/components/visits/visit-state-badge";
import { SchedulerWidget } from "@/components/visits/scheduler-widget";
import { DocumentIssueCard } from "@/components/visits/document-issue-card";
import { Link } from "@/i18n/navigation";
import {
  formatDate,
  formatTime,
  formatVnd,
  fromVstDateTimeInput,
} from "@/lib/format";
import { DateTimePicker } from "@/components/ui/date-time-picker";

interface VisitDetail {
  id: string;
  type: string;
  additionalTypes: string[];
  pendingDocumentKinds: string[];
  state: string;
  scheduledFor: string;
  expectedAmount: string | null;
  findings: string | null;
  officeNotes: { at: string; authorId: string; authorName: string; text: string }[] | null;
  partsReplaced: unknown;
  photos: unknown;
  customerSignaturePhotoUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  customerId: string;
  siteId: string | null;
  site: { id: string; name: string; region: string | null; address: string | null; addressStreet: string | null } | null;
  equipmentId: string | null;
  leadTechnicianId: string | null;
  collaboratorTechnicianIds: string[];
  collaborators: { id: string; username: string; phone: string | null }[];
  customer: {
    id: string;
    code: string;
    name: string;
    type: "B2C" | "B2B";
    address: string | null;
    district: string | null;
    city: string | null;
    contacts: { id: string; name: string; phone1: string; isPrimary: boolean; scope: string; siteId: string | null }[];
  };
  equipment: {
    id: string;
    serialNumber: string | null;
    model: { modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null };
    site: { id: string; name: string } | null;
  } | null;
  leadTechnician: { id: string; username: string; phone: string | null } | null;
  payments: Array<{
    id: string;
    method: string;
    state: string;
    expectedAmount: string;
    actualAmount: string;
    collectedAt: string | null;
  }>;
  documents: Array<{ id: string; kind: string; filename: string; generatedAt: string }>;
  latestContractType: "RENTAL" | "SALE" | "MAINTENANCE" | null;
  serviceRequest: {
    id: string;
    code: string;
    type: string;
    state: string;
    description: string;
    isPaid: boolean;
    approvedPrice: string | null;
    approvedDate: string | null;
    submittedAt: string;
    preferredVisitAt: string | null;
  } | null;
  orders: Array<{
    id: string;
    orderNumber: string;
    state: string;
    orderedAt: string;
    deliveredAt: string | null;
    notes: string | null;
    serviceRequestId: string | null;
    items: Array<{
      id: string;
      productKind: "EQUIPMENT" | "CONSUMABLE" | "OTHER";
      quantity: number;
      unitPrice: string;
      totalPrice: string;
      customName: string | null;
      purpose: string | null;
      consumable: {
        id: string;
        sku: string | null;
        nameKo: string | null;
        nameVi: string | null;
        nameEn: string | null;
      } | null;
      equipmentModel: {
        id: string;
        modelCode: string | null;
        nameKo: string | null;
        nameVi: string | null;
        nameEn: string | null;
      } | null;
      equipment: {
        id: string;
        serialNumber: string | null;
      } | null;
    }>;
  }>;
}

interface PhotoEntry { storageKey: string }

/**
 * The body of the visit-detail page, extracted so the calendar drawer
 * (`visits-calendar-view`) can render the same content inline when the
 * user picks a visit from the day-list. The route-level page lives at
 * `src/app/o/[locale]/(dashboard)/visits/[id]/page.tsx` and just unwraps
 * the URL param into this prop.
 */
export function VisitDetailContent({ visitId }: Readonly<{ visitId: string }>) {
  const id = visitId;
  const t = useTranslations("visits");
  const tc = useTranslations("common");
  const locale = useLocale();
  const api = useApi();
  const { user } = useAuth();
  const role = user?.role ?? "STAFF";

  const query = useApiQuery<VisitDetail>(id ? `/api/visits/${id}` : null);
  const data = query.data ?? null;
  const loading = query.isLoading;
  const error =
    query.error instanceof Error ? query.error.message : null;
  const reload = async () => {
    await query.refetch();
  };

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showResched, setShowResched] = useState(false);
  const [reschedFor, setReschedFor] = useState("");
  const [reschedReason, setReschedReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const doCancel = async () => {
    if (!data) return;
    setActionError(null);
    try {
      await api.post(`/api/visits/${id}/cancel`, { reason: cancelReason });
      setShowCancel(false);
      setCancelReason("");
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };
  const doReschedule = async () => {
    if (!data || !reschedFor || !reschedReason) return;
    setActionError(null);
    try {
      await api.post(`/api/visits/${id}/reschedule`, {
        scheduledFor: fromVstDateTimeInput(reschedFor),
        reason: reschedReason,
      });
      setShowResched(false);
      setReschedFor("");
      setReschedReason("");
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading && !data) {
    return <div className="text-sm text-[#737373]">{tc("loading")}</div>;
  }
  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {error ?? "Not found"}
      </div>
    );
  }

  const isOffice = role === "ADMIN" || role === "MANAGER" || role === "STAFF";
  const canCancel = isOffice && !["COMPLETED", "CANCELLED"].includes(data.state);
  const canReschedule =
    isOffice && ["SCHEDULED", "FAILED_NO_SHOW", "RESCHEDULED"].includes(data.state);

  // Seed/legacy photo entries occasionally lack `storageKey` (or are bare
  // strings) — filter defensively so a single malformed row can't blow up
  // the whole detail page.
  const photos = (Array.isArray(data.photos) ? data.photos : []).filter(
    (p): p is PhotoEntry =>
      p != null &&
      typeof p === "object" &&
      typeof (p as PhotoEntry).storageKey === "string",
  );
  const parts = Array.isArray(data.partsReplaced)
    ? (data.partsReplaced as string[])
    : [];
  const officeNotes = data.officeNotes ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <BreadcrumbLabel value={data.customer.name} />
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-[#737373]">
              #{data.id.slice(-8)}
            </span>
            <VisitTypeBadge type={data.type} />
            {data.additionalTypes.map((t) => (
              <VisitTypeBadge key={t} type={t} />
            ))}
            <VisitStateBadge state={data.state} />
            {data.pendingDocumentKinds.map((k) => (
              <span
                key={`pending-${k}`}
                className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800"
                title={t("pendingDocsTooltip")}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {t("pendingDocPrefix")} {t(`docKinds.${k}` as const)}
              </span>
            ))}
          </div>
          <h1 className="text-xl font-semibold text-[#002A4D]">
            {data.customer.name}
            <span className="ml-2 font-mono text-xs text-[#737373]">
              {data.customer.code}
            </span>
          </h1>
          <p className="text-sm text-[#525252]">
            {formatDate(data.scheduledFor, locale)} ·{" "}
            {formatTime(data.scheduledFor)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReschedule && (
            <Button variant="secondary" onClick={() => setShowResched(true)}>
              {t("reschedule")}
            </Button>
          )}
          {canCancel && (
            <Button variant="danger" onClick={() => setShowCancel(true)}>
              {t("cancel")}
            </Button>
          )}
        </div>
      </header>

      {data.state === "SUGGESTED" && (
        <SchedulerWidget
          visitId={data.id}
          customerId={data.customerId}
          siteId={data.siteId}
          scheduledFor={data.scheduledFor}
          state={data.state}
          leadTechnicianId={data.leadTechnicianId}
          collaboratorTechnicianIds={data.collaboratorTechnicianIds}
          onScheduled={() => {
            reload().catch(() => undefined);
          }}
        />
      )}

      {isOffice && (
        <DocumentIssueCard
          visitId={data.id}
          state={data.state}
          leadTechnicianId={data.leadTechnicianId}
          visitType={data.type}
          additionalTypes={data.additionalTypes}
          customerType={data.customer.type}
          contractType={data.latestContractType}
          documents={data.documents}
          onIssued={() => reload()}
        />
      )}

      {data.serviceRequest && (
        <RelatedServiceRequestCard sr={data.serviceRequest} locale={locale} />
      )}
      {data.orders.length > 0 && (
        <RelatedOrdersCard orders={data.orders} locale={locale} />
      )}

      <Tabs defaultValue="details">
        <TabsList>
          <Tab value="details">{t("tabs.details")}</Tab>
          <Tab value="photos">{t("tabs.photos")}</Tab>
          <Tab value="payments">{t("tabs.payments")}</Tab>
        </TabsList>
        <TabPanel value="details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailCard label={t("lead")}>
              {data.leadTechnician?.username ?? "—"}
            </DetailCard>
            <DetailCard label={t("collaborators")}>
              {data.collaborators.length === 0
                ? "—"
                : data.collaborators.map((c) => c.username).join(", ")}
            </DetailCard>
            <DetailCard label={t("equipment")}>
              {data.equipment
                ? `${pickModelName(data.equipment.model, locale)} · ${data.equipment.serialNumber ?? "—"}`
                : "—"}
            </DetailCard>
            <DetailCard label={t("site")}>
              {data.site?.name ?? data.equipment?.site?.name ?? "—"}
            </DetailCard>
            <DetailCard label={t("expectedAmount")}>
              {formatVnd(data.expectedAmount) || "—"}
            </DetailCard>
            <DetailCard label={tc("address")}>
              {[data.customer.address, data.customer.district, data.customer.city]
                .filter(Boolean)
                .join(", ") || "—"}
            </DetailCard>
            <DetailCard label={t("findings")}>
              <span className="whitespace-pre-line">{data.findings || "—"}</span>
            </DetailCard>
            <DetailCard label={t("partsReplaced")}>
              {parts.length > 0 ? parts.join(", ") : "—"}
            </DetailCard>
          </div>
          <div className="mt-4 rounded-md border border-[var(--brand-blue-200)] bg-[var(--brand-blue-50)] p-3">
            <p className="text-xs uppercase tracking-wide text-[var(--brand-blue-700)]">
              {t("officeNotes")}
            </p>
            {officeNotes.length === 0 ? (
              <p className="mt-1 text-sm text-[#737373]">—</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {officeNotes.map((n, i) => (
                  <li key={`${n.at}-${i}`} className="rounded border border-[#e5e5e5] bg-white p-2 text-sm text-[#262626]">
                    <span className="block whitespace-pre-wrap">{n.text}</span>
                    <span className="mt-1 block text-[10px] text-[#737373]">
                      {n.authorName} · {formatDate(n.at, locale)} {formatTime(n.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabPanel>
        <TabPanel value="photos">
          {photos.length === 0 ? (
            <p className="text-sm text-[#737373]">{tc("noData")}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {photos.map((p, i) => (
                <li
                  key={`${p.storageKey}-${i}`}
                  className="aspect-square overflow-hidden rounded border border-[#e5e5e5] bg-[#fafafa]"
                >
                  <span className="block break-all p-2 font-mono text-[10px] text-[#737373]">
                    {p.storageKey.split("/").pop()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabPanel>
        <TabPanel value="payments">
          {data.payments.length === 0 ? (
            <p className="text-sm text-[#737373]">{tc("noData")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[#f5f5f5] text-left text-xs">
                <tr>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2 text-right">Expected</th>
                  <th className="px-3 py-2 text-right">Actual</th>
                  <th className="px-3 py-2">Collected</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id} className="border-b border-[#eee]">
                    <td className="px-3 py-2">{p.method}</td>
                    <td className="px-3 py-2">{p.state}</td>
                    <td className="px-3 py-2 text-right">{formatVnd(p.expectedAmount)}</td>
                    <td className="px-3 py-2 text-right">{formatVnd(p.actualAmount)}</td>
                    <td className="px-3 py-2">{formatDate(p.collectedAt, locale) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabPanel>
      </Tabs>

      <Modal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        title={t("cancel")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCancel(false)}>
              {tc("cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={doCancel}
              disabled={cancelReason.length < 3}
            >
              {t("confirm")}
            </Button>
          </>
        }
      >
        <FormField label={t("reasonRequired")} required>
          <Input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
        </FormField>
        {actionError && <p className="mt-2 text-xs text-red-600">{actionError}</p>}
      </Modal>

      <Modal
        open={showResched}
        onClose={() => setShowResched(false)}
        title={t("reschedule")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowResched(false)}>
              {tc("cancel")}
            </Button>
            <Button
              onClick={doReschedule}
              disabled={!reschedFor || reschedReason.length < 3}
            >
              {t("confirm")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3" lang={locale}>
          <FormField label={t("scheduledFor")} required>
            <DateTimePicker value={reschedFor} onChange={setReschedFor} />
          </FormField>
          <FormField label={t("reasonRequired")} required>
            <Input
              value={reschedReason}
              onChange={(e) => setReschedReason(e.target.value)}
            />
          </FormField>
          {actionError && <p className="text-xs text-red-600">{actionError}</p>}
        </div>
      </Modal>
    </div>
  );
}

function DetailCard({
  label,
  children,
}: Readonly<{ label: React.ReactNode; children: React.ReactNode }>) {
  return (
    <div className="rounded-md border border-[#e5e5e5] bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-[#737373]">{label}</p>
      <div className="mt-1 text-sm text-[#111]">{children}</div>
    </div>
  );
}

type RelatedServiceRequest = NonNullable<VisitDetail["serviceRequest"]>;
type RelatedOrder = VisitDetail["orders"][number];

/** Service request that triggered this visit (via `Visit.serviceRequestId`).
 *  Rendered above the tabs so office + techs immediately see what the
 *  customer originally asked for and whether it was paid. */
function RelatedServiceRequestCard({
  sr,
  locale,
}: Readonly<{ sr: RelatedServiceRequest; locale: string }>) {
  const t = useTranslations("visits.relatedSr");
  const tSr = useTranslations("serviceRequests");
  return (
    <div className="rounded-xl border border-[var(--brand-blue-200)] bg-[var(--brand-blue-50)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-[var(--brand-blue-700)]">
            {t("title")}
          </span>
          <Link
            href={`/o/service-requests/${sr.id}`}
            className="font-mono text-sm font-semibold text-[var(--brand-blue-700)] underline"
          >
            {sr.code}
          </Link>
          <span className="rounded-full border border-[#d4d4d4] bg-white px-2 py-0.5 text-[10px] text-[#525252]">
            {tSr(`types.${sr.type}` as never)}
          </span>
          <span className="rounded-full border border-[#d4d4d4] bg-white px-2 py-0.5 text-[10px] text-[#525252]">
            {tSr(`states.${sr.state}` as never)}
          </span>
          {sr.isPaid ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
              {t("paid")}
              {sr.approvedPrice ? ` · ${formatVnd(sr.approvedPrice)}` : ""}
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700">
              {t("free")}
            </span>
          )}
        </div>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-[#262626]">
        {sr.description}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#525252]">
        <span>
          {t("submittedAt")}: {formatDate(sr.submittedAt, locale)}{" "}
          {formatTime(sr.submittedAt)}
        </span>
        {sr.preferredVisitAt && (
          <span>
            {t("preferredVisitAt")}: {formatDate(sr.preferredVisitAt, locale)}{" "}
            {formatTime(sr.preferredVisitAt)}
          </span>
        )}
      </div>
    </div>
  );
}

/** Orders whose delivery / installation is fulfilled by this visit. Usually
 *  0..1, but the schema allows several so we render a list. Each row shows
 *  the order number (linkable) + all line items with per-line quantity/price. */
function RelatedOrdersCard({
  orders,
  locale,
}: Readonly<{ orders: RelatedOrder[]; locale: string }>) {
  const t = useTranslations("visits.relatedOrders");
  const totalAll = orders.reduce(
    (sum, o) =>
      sum + o.items.reduce((s, it) => s + Number(it.totalPrice), 0),
    0,
  );
  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#002A4D]">
          {t("title")}{" "}
          <span className="ml-1 text-xs font-normal text-[#737373]">
            ({orders.length})
          </span>
        </h3>
        <span className="text-xs text-[#525252]">
          {t("totalLabel")}: <span className="font-semibold text-[#111]">{formatVnd(totalAll)}</span>
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {orders.map((o) => (
          <li key={o.id} className="rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-[var(--brand-blue-700)]">
                  {o.orderNumber}
                </span>
                <span className="rounded-full border border-[#d4d4d4] bg-white px-2 py-0.5 text-[10px] text-[#525252]">
                  {t(`states.${o.state}` as const)}
                </span>
                {o.serviceRequestId && (
                  <span className="rounded-full bg-[var(--brand-blue-50)] px-2 py-0.5 text-[10px] text-[var(--brand-blue-700)]">
                    {t("fromServiceRequest")}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-[#737373]">
                {formatDate(o.orderedAt, locale)}
              </span>
            </div>
            <div className="mt-2 overflow-hidden rounded border border-[#e5e5e5] bg-white">
              <table className="w-full text-xs">
                <thead className="bg-[#f5f5f5] text-left text-[10px] text-[#737373]">
                  <tr>
                    <th className="px-2 py-1">{t("colProduct")}</th>
                    <th className="px-2 py-1 text-right">{t("colQty")}</th>
                    <th className="px-2 py-1 text-right">{t("colUnitPrice")}</th>
                    <th className="px-2 py-1 text-right">{t("colTotal")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f5f5f5]">
                  {o.items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-col">
                          <span className="text-[#262626]">
                            {pickOrderItemName(it, locale)}
                          </span>
                          {it.equipment?.serialNumber && (
                            <span className="text-[10px] text-[#737373]">
                              {t("forEquipment")}: {it.equipment.serialNumber}
                            </span>
                          )}
                          {it.purpose && (
                            <span className="text-[10px] text-[#737373]">
                              {it.purpose}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right">{it.quantity}</td>
                      <td className="px-2 py-1.5 text-right">
                        {formatVnd(it.unitPrice)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium">
                        {formatVnd(it.totalPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {o.notes && (
              <p className="mt-2 whitespace-pre-wrap text-[11px] text-[#525252]">
                {o.notes}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function pickOrderItemName(
  it: RelatedOrder["items"][number],
  locale: string,
): string {
  if (it.customName) return it.customName;
  if (it.consumable) {
    return (
      pickModelName(
        {
          modelCode: it.consumable.sku,
          nameKo: it.consumable.nameKo,
          nameVi: it.consumable.nameVi,
          nameEn: it.consumable.nameEn,
        },
        locale,
      ) || it.consumable.sku || "—"
    );
  }
  if (it.equipmentModel) {
    return pickModelName(it.equipmentModel, locale) || it.equipmentModel.modelCode || "—";
  }
  return "—";
}
