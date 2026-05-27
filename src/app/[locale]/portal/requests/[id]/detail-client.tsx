"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import { SrStateBadge, SrTypeBadge } from "@/components/service-requests/sr-state-badge";
import { Modal } from "@/components/ui/modal";
import { formatDateTime } from "@/lib/format";
import { SrMessageThread } from "@/components/portal/sr-message-thread";

interface SrDetail {
  id: string;
  code: string;
  type: string;
  state: string;
  isPaid: boolean;
  description: string;
  rejectionReason: string | null;
  submittedAt: string;
  approvedPrice: string | null;
  approvedDate: string | null;
  equipment: {
    id: string;
    serialNumber: string | null;
    installedAt: string | null;
    model: { modelCode: string; name: string };
    site: { id: string; name: string } | null;
  } | null;
  visit: {
    id: string;
    state: string;
    scheduledFor: string;
    scheduledWindow: string | null;
    leadTechnician: { id: string; username: string; phone: string | null } | null;
  } | null;
  attachments: unknown;
}

export function PortalRequestDetailClient({ id }: Readonly<{ id: string }>) {
  const t = useTranslations("portal.requests");
  const locale = useLocale();
  const router = useRouter();
  const { accessToken } = useCustomerAuth();
  const [sr, setSr] = useState<SrDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`/api/portal/service-requests/${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) {
        setError(json?.error?.message ?? t("loadError"));
        return;
      }
      setSr(json.data as SrDetail);
    } catch {
      setError(t("loadError"));
    }
  }, [accessToken, id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/portal/service-requests/${id}/cancel`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({ reason: cancelReason.trim() || undefined }),
      });
      const json = await res.json();
      if (!json.success) {
        setCancelError(json?.error?.message ?? t("cancelError"));
        return;
      }
      setShowCancel(false);
      await load();
    } catch {
      setCancelError(t("cancelError"));
    } finally {
      setCancelling(false);
    }
  }

  if (error) {
    return (
      <p role="alert" className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
        {error}
      </p>
    );
  }
  if (!sr) {
    return <p className="py-6 text-center text-sm text-[#737373]">…</p>;
  }

  const canCancel = ["PENDING_REVIEW", "APPROVED", "SCHEDULED"].includes(sr.state);
  const attachments = Array.isArray(sr.attachments)
    ? (sr.attachments as { url?: string; storageKey: string; filename: string }[])
    : [];

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => router.push("/portal/requests")}
        className="text-xs text-[var(--brand-blue-700)] underline-offset-2 hover:underline"
      >
        ← {t("viewList")}
      </button>

      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-[#002A4D]">
          {t("detailTitle", { code: sr.code })}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <SrTypeBadge type={sr.type} portal />
          <SrStateBadge state={sr.state} portal />
        </div>
      </header>

      <section className="space-y-2 rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <Row label={t("submittedAt")} value={formatDateTime(sr.submittedAt, locale)} />
        {sr.equipment && (
          <Row
            label={t("detailEquipment")}
            value={`${sr.equipment.model.modelCode} · ${sr.equipment.model.name}`}
          />
        )}
        {sr.approvedPrice && (
          <Row
            label={t("estimatedCost")}
            value={`${sr.approvedPrice} VND`}
          />
        )}
        {sr.rejectionReason && (
          <Row label="—" value={sr.rejectionReason} />
        )}
        <div>
          <span className="text-xs text-[#737373]">{t("detailDescription")}</span>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[#262626]">
            {sr.description}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#002A4D]">
          {t("detailVisit")}
        </h2>
        {sr.visit ? (
          <div className="mt-2 space-y-1">
            <p className="text-sm text-[#262626]">
              {formatDateTime(sr.visit.scheduledFor, locale)}
              {sr.visit.scheduledWindow ? ` · ${sr.visit.scheduledWindow}` : ""}
            </p>
            {sr.visit.leadTechnician && (
              <p className="text-xs text-[#737373]">
                {sr.visit.leadTechnician.username}
              </p>
            )}
            <Link
              href={`/portal/visits/${sr.visit.id}`}
              className="text-xs text-[var(--brand-blue-700)] underline-offset-2 hover:underline"
            >
              {t("detailVisitView")}
            </Link>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#737373]">{t("detailVisitNone")}</p>
        )}
      </section>

      {attachments.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-[#e5e5e5] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#002A4D]">
            {t("stepPhotos")}
          </h2>
          <ul className="grid grid-cols-3 gap-2">
            {attachments.map((a) => (
              <li
                key={a.storageKey}
                className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-[#fafafa]"
              >
                {a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.filename} className="aspect-square w-full object-cover" />
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

      <SrMessageThread srId={sr.id} />

      {canCancel && (
        <button
          type="button"
          onClick={() => setShowCancel(true)}
          className="w-full rounded-md border border-[#fecaca] bg-white px-3 h-10 text-sm font-semibold text-[#b91c1c] outline-none hover:bg-[#fef2f2]"
        >
          {t("detailCancel")}
        </button>
      )}

      <Modal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        title={t("cancelTitle")}
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowCancel(false)}
              className="rounded-md border border-[#e5e5e5] bg-white px-3 h-9 text-xs font-medium text-[#525252] outline-none hover:border-[#a3a3a3]"
            >
              {t("cancelKeep")}
            </button>
            <button
              type="button"
              disabled={cancelling}
              onClick={confirmCancel}
              className="rounded-md border border-[#b91c1c] bg-[#b91c1c] px-3 h-9 text-xs font-semibold text-white outline-none disabled:opacity-50"
            >
              {cancelling ? "…" : t("cancelConfirm")}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[#525252]">{t("cancelHint")}</p>
          <label className="block text-xs font-medium text-[#525252]">
            {t("cancelReason")}
          </label>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-[#e5e5e5] bg-white p-2 text-sm text-[#262626] outline-none focus:border-[var(--brand-blue-500)]"
          />
          {cancelError && (
            <p role="alert" className="text-xs text-[#b91c1c]">{cancelError}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#f5f5f5] pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs text-[#737373]">{label}</span>
      <span className="text-right text-sm text-[#262626]">{value}</span>
    </div>
  );
}
