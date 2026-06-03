"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApi } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { NumberInput } from "@/components/ui/number-input";
import { Combobox } from "@/components/ui/combobox";
import {
  SrStateBadge,
  SrTypeBadge,
} from "@/components/service-requests/sr-state-badge";
import { SrMessageThreadOffice } from "@/components/service-requests/sr-message-thread-office";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatDateTime, formatVnd } from "@/lib/format";

interface SrDetail {
  id: string;
  code: string;
  type: string;
  state: string;
  isPaid: boolean;
  description: string;
  rejectionReason: string | null;
  approvedPrice: string | null;
  approvedDate: string | null;
  preferredVisitAt: string | null;
  submittedAt: string;
  attachments: unknown;
  customer: {
    id: string;
    code: string;
    name: string;
    type: "B2C" | "B2B";
    address: string | null;
    district: string | null;
    city: string | null;
    contacts: {
      id: string;
      name: string;
      phone1: string;
      role: string;
      scope: string;
      isPrimary: boolean;
    }[];
  };
  contact: {
    id: string;
    name: string;
    phone1: string;
    role: string;
  } | null;
  equipment: {
    id: string;
    serialNumber: string | null;
    installedAt: string | null;
    model: { modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null; category: string };
    site: { id: string; name: string } | null;
    contracts: {
      contract: { id: string; contractNumber: string; type: string; state: string };
    }[];
  } | null;
  visit: {
    id: string;
    state: string;
    type: string;
    scheduledFor: string;
    scheduledWindow: string | null;
    leadTechnician: { id: string; username: string; phone: string | null } | null;
  } | null;
  activity: Array<{
    id: string;
    action: string;
    actorType: string;
    at: string;
    after: unknown;
  }>;
  hasUnreadCustomerMessage: boolean;
}

export default function ServiceRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const t = useTranslations("serviceRequests");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const api = useApi();
  const { user } = useAuth();
  const role = user?.role ?? "STAFF";

  const query = useApiQuery<SrDetail>(
    id ? `/api/service-requests/${id}` : null,
  );
  const data = query.data ?? null;
  const loading = query.isLoading;
  const error = query.error instanceof Error ? query.error.message : null;

  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  // Approve modal state
  const [price, setPrice] = useState<number>(0);
  const [approvedDate, setApprovedDate] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [approveNotes, setApproveNotes] = useState("");
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveSubmitting, setApproveSubmitting] = useState(false);

  // Seed approve-modal defaults whenever it opens:
  // - approvedDate → today (yyyy-mm-dd)
  // - scheduledFor → customer's preferred visit time, falling back to "today
  //   at 09:00" so the office still has a sensible starting value.
  const handleOpenApprove = () => {
    const now = new Date();
    setApprovedDate(now.toISOString().slice(0, 10));
    if (data?.preferredVisitAt) {
      const d = new Date(data.preferredVisitAt);
      const tzOffsetMs = d.getTimezoneOffset() * 60_000;
      setScheduledFor(new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16));
    } else {
      const d = new Date(now);
      d.setHours(9, 0, 0, 0);
      const tzOffsetMs = d.getTimezoneOffset() * 60_000;
      setScheduledFor(new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16));
    }
    setApproveError(null);
    setShowApprove(true);
  };

  // The "Operations contact" the office should call to negotiate the
  // visit slot. Primary OPS first (we already ordered server-side);
  // fall back to the submitter contact when no OPS_CONTACT exists.
  const opsContact =
    data?.customer.contacts.find((c) => c.isPrimary) ??
    data?.customer.contacts[0] ??
    null;

  const techsQuery = useApiQuery<
    { id: string; username: string; preferredRegion: string | null }[]
  >(showApprove ? `/api/users?role=TECHNICIAN&pageSize=100` : null);
  const techs = techsQuery.data ?? [];

  // Reject modal state
  const [rejectReason, setRejectReason] = useState("");
  const [rejectMessage, setRejectMessage] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  // Cancel modal
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const reload = async () => {
    await query.refetch();
  };

  async function doApprove() {
    // Visible validation — previously this early-returned silently and
    // also rejected 0, so a manager couldn't waive the fee. 0 is a valid
    // "free service" outcome (the server schema already allows it).
    if (!Number.isFinite(price) || price < 0) {
      setApproveError(t("approveErrorPrice"));
      return;
    }
    if (!approvedDate) {
      setApproveError(t("approveErrorDate"));
      return;
    }
    setApproveSubmitting(true);
    setApproveError(null);
    try {
      await api.post(`/api/service-requests/${id}/approve`, {
        approvedPrice: price,
        approvedDate: new Date(approvedDate).toISOString(),
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
        leadTechnicianId: leadId || undefined,
        notes: approveNotes.trim() || undefined,
      });
      setShowApprove(false);
      setApproveNotes("");
      await reload();
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : t("approveError"));
    } finally {
      setApproveSubmitting(false);
    }
  }

  async function doReject() {
    if (rejectReason.trim().length < 3) return;
    setRejectSubmitting(true);
    setRejectError(null);
    try {
      await api.post(`/api/service-requests/${id}/reject`, {
        reason: rejectReason.trim(),
        customerMessage: rejectMessage.trim() || undefined,
      });
      setShowReject(false);
      await reload();
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : t("rejectError"));
    } finally {
      setRejectSubmitting(false);
    }
  }

  async function doCancel() {
    setCancelSubmitting(true);
    setCancelError(null);
    try {
      await api.post(`/api/service-requests/${id}/cancel`, {
        reason: cancelReason.trim() || undefined,
      });
      setShowCancel(false);
      await reload();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : t("cancelError"));
    } finally {
      setCancelSubmitting(false);
    }
  }

  if (loading) {
    return <p className="py-6 text-sm text-[#737373]">{tCommon("loading")}</p>;
  }
  if (error) {
    return (
      <p role="alert" className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
        {error}
      </p>
    );
  }
  if (!data) return null;

  const canApprove =
    data.state === "PENDING_REVIEW" && (role === "ADMIN" || role === "MANAGER");
  const canReject = data.state === "PENDING_REVIEW";
  const canCancel =
    data.state !== "REJECTED" &&
    data.state !== "COMPLETED" &&
    data.state !== "CANCELLED";

  const attachments = Array.isArray(data.attachments)
    ? (data.attachments as { url?: string; storageKey: string; filename: string }[])
    : [];

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => router.push("/o/service-requests")}
          className="text-xs text-[var(--brand-blue-700)] underline-offset-2 hover:underline"
        >
          ← {t("title")}
        </button>

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-[#002A4D]">
              {t("detailTitle", { code: data.code })}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <SrTypeBadge type={data.type} />
              <SrStateBadge state={data.state} />
              <StatusBadge tone={data.isPaid ? "warning" : "success"}>
                {data.isPaid ? t("yes") : t("no")} · {t("isPaid")}
              </StatusBadge>
            </div>
          </div>
          {(canApprove || canReject || canCancel) && (
            <div className="flex flex-wrap items-center gap-2">
              {canApprove && (
                <Button onClick={handleOpenApprove}>
                  {t("actionApprove")}
                </Button>
              )}
              {canReject && (
                <Button variant="outline" onClick={() => setShowReject(true)}>
                  {t("actionReject")}
                </Button>
              )}
              {canCancel && (
                <Button variant="ghost" onClick={() => setShowCancel(true)}>
                  {t("actionCancel")}
                </Button>
              )}
            </div>
          )}
        </header>

        <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#002A4D]">
            {t("panelOverview")}
          </h2>
          <dl className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("labelCustomer")}>
              <Link
                href={`/o/customers/${data.customer.id}`}
                className="text-[var(--brand-blue-700)] underline-offset-2 hover:underline"
              >
                {data.customer.name} ({data.customer.code})
              </Link>
            </Field>
            <Field label={t("labelSubmitter")}>
              {data.contact ? `${data.contact.name} · ${data.contact.phone1}` : "—"}
            </Field>
            <Field label={t("labelSubmittedAt")}>
              {formatDateTime(data.submittedAt, locale)}
            </Field>
            <Field label={t("preferredVisitAt")}>
              {data.preferredVisitAt
                ? formatDateTime(data.preferredVisitAt, locale)
                : t("preferredVisitAtNone")}
            </Field>
            <Field label={t("labelEquipment")}>
              {data.equipment
                ? `${pickModelName(data.equipment.model, locale)} · ${pickModelName(data.equipment.model, locale)}`
                : "—"}
            </Field>
            {opsContact && (
              <Field label={t("approveOpsContact")}>
                {opsContact.name} ·{" "}
                <a
                  href={`tel:${opsContact.phone1}`}
                  className="text-[var(--brand-blue-700)] underline-offset-2 hover:underline"
                >
                  {opsContact.phone1}
                </a>
              </Field>
            )}
            {data.approvedPrice && (
              <Field label={t("labelApprovedPrice")}>
                {formatVnd(data.approvedPrice)}
              </Field>
            )}
            {data.approvedDate && (
              <Field label={t("labelScheduledFor")}>
                {formatDate(data.approvedDate, locale)}
              </Field>
            )}
            {data.rejectionReason && (
              <Field label={t("labelRejectionReason")}>{data.rejectionReason}</Field>
            )}
          </dl>
        </section>

        <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#002A4D]">
            {t("panelDescription")}
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[#262626]">
            {data.description}
          </p>
        </section>

        {data.visit && (
          <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#002A4D]">
              {t("linkedVisit")}
            </h2>
            <div className="mt-2 space-y-1 text-sm">
              <div>{formatDateTime(data.visit.scheduledFor, locale)}</div>
              {data.visit.leadTechnician && (
                <div className="text-xs text-[#737373]">
                  {data.visit.leadTechnician.username}
                </div>
              )}
              <Link
                href={`/o/visits/${data.visit.id}`}
                className="block text-xs text-[var(--brand-blue-700)] underline-offset-2 hover:underline"
              >
                {t("actionViewVisit")}
              </Link>
            </div>
          </section>
        )}

        {attachments.length > 0 && (
          <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#002A4D]">
              {t("panelAttachments")}
            </h2>
            <ul className="mt-2 grid grid-cols-4 gap-2">
              {attachments.map((a) => (
                <li
                  key={a.storageKey}
                  className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-[#fafafa]"
                >
                  {a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.url}
                      alt={a.filename}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center text-xs text-[#a3a3a3]">
                      {a.filename}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#002A4D]">
            {t("panelActivity")}
          </h2>
          <ul className="mt-2 flex flex-col divide-y divide-[#f5f5f5]">
            {data.activity.length === 0 && (
              <li className="px-3 py-3 text-center text-sm text-[#a3a3a3]">
                {tCommon("noData")}
              </li>
            )}
            {data.activity.map((a) => (
              <li key={a.id} className="px-3 py-2 text-xs">
                <span className="font-mono text-[#525252]">{a.action}</span>
                <span className="ml-2 text-[#a3a3a3]">
                  {formatDateTime(a.at, locale)} · {a.actorType}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <SrMessageThreadOffice
          srId={data.id}
          hasUnread={data.hasUnreadCustomerMessage}
          onMarkedRead={async () => {
            await query.refetch();
          }}
        />
      </div>


      {/* Approve modal */}
      <Modal
        open={showApprove}
        onClose={() => setShowApprove(false)}
        title={t("approveTitle")}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowApprove(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={doApprove} disabled={approveSubmitting}>
              {approveSubmitting ? tCommon("saving") : t("approveSubmit")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-[#525252]">{t("approveSubtitle")}</p>

          {/* Read-only context the office reviewer needs at hand */}
          <section className="space-y-2 rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3 text-xs">
            <div>
              <span className="text-[#737373]">{t("labelType")}</span>
              <span className="ml-2 font-medium text-[#262626]">
                {t(`types.${data.type}` as never)}
              </span>
            </div>
            <div>
              <span className="text-[#737373]">{t("preferredVisitAt")}</span>
              <span className="ml-2 font-medium text-[#262626]">
                {data.preferredVisitAt
                  ? formatDateTime(data.preferredVisitAt, locale)
                  : t("preferredVisitAtNone")}
              </span>
            </div>
            <div>
              <span className="text-[#737373]">{t("approveOpsContact")}</span>
              <span className="ml-2 font-medium text-[#262626]">
                {opsContact
                  ? `${opsContact.name} · `
                  : ""}
                {opsContact ? (
                  <a
                    href={`tel:${opsContact.phone1}`}
                    className="text-[var(--brand-blue-700)] underline-offset-2 hover:underline"
                  >
                    {opsContact.phone1}
                  </a>
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div>
              <span className="block text-[#737373]">
                {t("panelDescription")}
              </span>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[#262626]">
                {data.description}
              </p>
            </div>
          </section>

          <FormField
            label={t("approvePrice")}
            hint={price === 0 ? t("approvePriceFreeHint") : t("approvePriceHint")}
          >
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <NumberInput value={price} onChange={setPrice} min={0} />
              </div>
              <button
                type="button"
                onClick={() => setPrice(0)}
                className={[
                  "h-10 rounded-md border px-3 text-xs font-medium transition-colors",
                  price === 0
                    ? "border-[var(--brand-blue-500)] bg-[var(--brand-blue-50)] text-[var(--brand-blue-700)]"
                    : "border-[#e5e5e5] bg-white text-[#525252] hover:border-[#a3a3a3]",
                ].join(" ")}
              >
                {t("approvePriceFreeButton")}
              </button>
            </div>
          </FormField>
          <FormField label={t("approveDate")}>
            <Input
              type="date"
              value={approvedDate}
              onChange={(e) => setApprovedDate(e.target.value)}
            />
          </FormField>
          <FormField
            label={t("approveScheduledFor")}
            hint={
              data.preferredVisitAt
                ? t("approveScheduledForHint")
                : undefined
            }
          >
            <Input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
            />
          </FormField>
          <FormField label={t("approveLead")} hint={t("approveLeadHint")}>
            <Combobox
              value={leadId}
              onChange={setLeadId}
              options={techs.map((u) => ({
                value: u.id,
                label: u.username,
                description: u.preferredRegion ?? undefined,
              }))}
              placeholder={
                techsQuery.isLoading ? tCommon("loading") : t("approveLead")
              }
              searchable
              emptyText={tCommon("noData")}
            />
          </FormField>
          <FormField
            label={t("approveNotes")}
            hint={t("approveNotesHint")}
          >
            <textarea
              value={approveNotes}
              onChange={(e) => setApproveNotes(e.target.value)}
              rows={3}
              placeholder={t("approveNotesPlaceholder")}
              className="w-full rounded-md border border-[#e5e5e5] bg-white p-2 text-sm text-[#262626] outline-none focus:border-[var(--brand-blue-500)]"
            />
          </FormField>
          {approveError && (
            <p role="alert" className="text-xs text-[#b91c1c]">{approveError}</p>
          )}
        </div>
      </Modal>

      {/* Reject modal */}
      <Modal
        open={showReject}
        onClose={() => setShowReject(false)}
        title={t("rejectTitle")}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowReject(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={doReject} disabled={rejectSubmitting}>
              {rejectSubmitting ? tCommon("saving") : t("rejectSubmit")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label={t("rejectReason")}>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-[#e5e5e5] bg-white p-2 text-sm text-[#262626] outline-none focus:border-[var(--brand-blue-500)]"
            />
          </FormField>
          <FormField label={t("rejectCustomerMessage")}>
            <textarea
              value={rejectMessage}
              onChange={(e) => setRejectMessage(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-[#e5e5e5] bg-white p-2 text-sm text-[#262626] outline-none focus:border-[var(--brand-blue-500)]"
            />
          </FormField>
          {rejectError && (
            <p role="alert" className="text-xs text-[#b91c1c]">{rejectError}</p>
          )}
        </div>
      </Modal>

      {/* Cancel modal */}
      <Modal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        title={t("cancelTitle")}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCancel(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={doCancel} disabled={cancelSubmitting}>
              {cancelSubmitting ? tCommon("saving") : t("cancelSubmit")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label={t("cancelReason")}>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-[#e5e5e5] bg-white p-2 text-sm text-[#262626] outline-none focus:border-[var(--brand-blue-500)]"
            />
          </FormField>
          {cancelError && (
            <p role="alert" className="text-xs text-[#b91c1c]">{cancelError}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div>
      <dt className="text-xs text-[#737373]">{label}</dt>
      <dd className="mt-0.5 text-sm text-[#262626]">{children}</dd>
    </div>
  );
}
