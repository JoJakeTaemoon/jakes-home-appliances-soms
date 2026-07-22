"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApi, ApiClientError } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { BreadcrumbLabel } from "@/lib/nav/breadcrumb-context";
import { useAuth } from "@/providers/auth-provider";
import { canManageEquipment } from "@/lib/customers/access";
import { EquipmentEditModal } from "@/components/equipment/equipment-edit-modal";
import { ServiceConfigTable } from "@/components/equipment/service-config-table";
import {
  PurchaseHistoryWidget,
  RecentWorkWidget,
  NextScheduleWidget,
} from "@/components/equipment/equipment-widgets";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Textarea } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField } from "@/components/ui/form-field";
import {
  StatusBadge,
  equipmentOwnershipTone,
  equipmentStatusTone,
} from "@/components/ui/status-badge";
import { formatDate, formatVnd } from "@/lib/format";

interface EquipmentDetail {
  id: string;
  customer: { id: string; code: string; name: string; type: "B2C" | "B2B" };
  site: { id: string; name: string; address: string } | null;
  model: {
    id: string;
    modelCode: string | null;
    nameKo: string | null;
    nameVi: string | null;
    nameEn: string | null;
    category: string;
    description: string | null;
    retailPrice: string | null;
    monthlyRentalPrice: string | null;
    monthlyMaintenancePrice: string | null;
    filterPolicy: { filters?: { type: string; replaceEveryDays: number }[] } | null;
  };
  modelId: string;
  siteId: string | null;
  serialNumber: string | null;
  assetCode: string | null;
  status: string;
  ownership: string;
  installedAt: string | null;
  // Editable equipment-centric fields (WS1).
  serviceType: string | null;
  managementType: string | null;
  deposit: string | null;
  monthlyFee: string | null;
  salePrice: string | null;
  installFee: string | null;
  customInspectionCycleDays: number | null;
  customMaintenanceCycleDays: number | null;
  lastInspectionAtOverride: string | null;
  customDescription: string | null;
  imageUrl: string | null;
  registeredBy: { id: string; username: string } | null;
  installedByTechnician: { id: string; username: string } | null;
  /// Effective deactivation moment (set when status DEACTIVATED). Null otherwise.
  deactivatedAt: string | null;
  /// Effective termination moment (set when status TERMINATED). Null otherwise.
  terminatedAt: string | null;
  /// Physical retrieval moment. Only meaningful while TERMINATED.
  retrievedAt: string | null;
  filterPolicyOverride: { filters?: { type: string; replaceEveryDays: number }[] } | null;
  notes: string | null;
  replacedByEquipmentId: string | null;
}

export default function EquipmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const locale = useLocale();
  const api = useApi();
  const { user } = useAuth();
  const role = user?.role ?? "STAFF";

  const detailQuery = useApiQuery<EquipmentDetail>(
    id ? `/api/equipment/${id}` : null,
  );
  const data = detailQuery.data ?? null;

  const sitesQuery = useApiQuery<{ id: string; name: string }[]>(
    data && data.customer.type === "B2B"
      ? `/api/customers/${data.customer.id}/sites`
      : null,
  );
  const sites = sitesQuery.data ?? [];

  const modelsQuery = useApiQuery<
    { id: string; modelCode: string; name: string }[]
  >("/api/equipment-models?pageSize=200");
  const models = modelsQuery.data ?? [];

  const [busy, setBusy] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showRelocate, setShowRelocate] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showTerminate, setShowTerminate] = useState(false);
  const [showRetrieval, setShowRetrieval] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);

  const load = async () => {
    await Promise.all([
      detailQuery.refetch(),
      sitesQuery.refetch(),
      modelsQuery.refetch(),
    ]);
  };

  async function changeStatus(status: string, reason?: string) {
    setBusy(true);
    try {
      await api.post(`/api/equipment/${id}/status`, { status, reason });
      await load();
    } catch (e) {
      if (e instanceof ApiClientError) alert(e.message);
    } finally {
      setBusy(false);
      setConfirmReactivate(false);
    }
  }

  if (!data) return <div className="text-sm text-[#737373]">{tc("loading")}</div>;
  const policy = data.filterPolicyOverride ?? data.model.filterPolicy;

  return (
    <div className="flex w-full flex-col gap-6">
      <BreadcrumbLabel
        value={data.serialNumber ?? data.model.modelCode ?? null}
      />
      <header className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <StatusBadge tone={equipmentStatusTone(data.status)}>{data.status}</StatusBadge>
            <StatusBadge tone={equipmentOwnershipTone(data.ownership)}>{data.ownership}</StatusBadge>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-[#002A4D]">
            {pickModelName(data.model, locale)} — {pickModelName(data.model, locale)}
          </h1>
          <p className="text-xs text-[#737373]">
            <Link href={`/o/customers/${data.customer.id}`} className="underline">
              {data.customer.code} {data.customer.name}
            </Link>
            {data.site && <> · {data.site.name}</>}
          </p>
        </div>
        {canManageEquipment(role) && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Full edit is available in any status so admins can correct
                data even on terminated/replaced units. */}
            <Button onClick={() => setShowEdit(true)}>{t("actions.edit")}</Button>
          </div>
        )}
        {canManageEquipment(role) && data.status !== "REPLACED" && data.status !== "TERMINATED" && (
          <div className="flex flex-wrap items-center gap-2">
            {data.customer.type === "B2B" && (
              <Button variant="secondary" onClick={() => setShowRelocate(true)}>
                {t("actions.relocate")}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setShowReplace(true)}>
              {t("actions.replace")}
            </Button>
            {data.status === "ACTIVE" && (
              <Button variant="ghost" onClick={() => setShowDeactivate(true)}>
                {t("actions.deactivate")}
              </Button>
            )}
            {data.status === "DEACTIVATED" && (
              <Button variant="outline" onClick={() => setConfirmReactivate(true)}>
                {t("actions.reactivate")}
              </Button>
            )}
            <Button variant="danger" onClick={() => setShowTerminate(true)}>
              {t("actions.terminate")}
            </Button>
          </div>
        )}
        {canManageEquipment(role) &&
          data.status === "TERMINATED" &&
          !data.retrievedAt && (
            <div>
              <Button variant="secondary" onClick={() => setShowRetrieval(true)}>
                {t("actions.logRetrieval")}
              </Button>
            </div>
          )}
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#737373]">
            {tc("name")}
          </h3>
          <Row label={t("serial")} value={data.serialNumber ?? "—"} mono />
          <Row label={t("installDate")} value={formatDate(data.installedAt, locale)} />
          <Row label={t("model")} value={`${pickModelName(data.model, locale)} — ${pickModelName(data.model, locale)}`} />
          <Row
            label={t("category")}
            value={
              data.model.category
                ? t(`categoryValues.${data.model.category}` as never)
                : "—"
            }
          />
          <Row label={t("ownership")} value={data.ownership} />
          {data.deactivatedAt && (
            <Row
              label={t("deactivatedAt")}
              value={formatDate(data.deactivatedAt, locale)}
            />
          )}
          {data.terminatedAt && (
            <Row
              label={t("terminatedAt")}
              value={formatDate(data.terminatedAt, locale)}
            />
          )}
          {data.retrievedAt && (
            <Row
              label={t("retrievedAt")}
              value={formatDate(data.retrievedAt, locale)}
            />
          )}
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#737373]">
            {t("filterPolicy")}
          </h3>
          {data.filterPolicyOverride ? (
            <StatusBadge tone="warning">{t("filterPolicyOverride")}</StatusBadge>
          ) : (
            <StatusBadge tone="muted">{t("filterPolicyDefault")}</StatusBadge>
          )}
          {policy?.filters && policy.filters.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {policy.filters.map((f, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span>{f.type}</span>
                  <span className="text-xs text-[#737373]">{f.replaceEveryDays}d</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[#737373]">—</p>
          )}
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4 sm:col-span-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#737373]">
            {tc("notes")}
          </h3>
          <p className="whitespace-pre-wrap text-sm text-[#525252]">{data.notes ?? "—"}</p>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4 sm:col-span-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#737373]">
            {t("model")}
          </h3>
          <p className="text-sm text-[#525252]">{data.model.description ?? "—"}</p>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <Row label="Retail" value={formatVnd(data.model.retailPrice)} />
            <Row label="Rental" value={formatVnd(data.model.monthlyRentalPrice)} />
            <Row label="Maintenance" value={formatVnd(data.model.monthlyMaintenancePrice)} />
          </div>
        </div>
        {/* Read-only service / pricing / people — the fields the retired
            inline panel showed, so they stay visible without opening [수정]. */}
        <div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4 sm:col-span-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#737373]">
            {t("detail.title")}
          </h3>
          {data.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded Blob URL, not a bundled asset
            <img
              src={data.imageUrl}
              alt={pickModelName(data.model, locale)}
              className="mb-1 h-32 w-full max-w-xs rounded-md border border-[#e5e5e5] object-contain"
            />
          )}
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <Row label={t("detail.assetCode")} value={data.assetCode ?? "—"} mono />
            <Row label={t("detail.serviceType")} value={data.serviceType ?? "—"} />
            <Row label={t("detail.managementType")} value={data.managementType ?? "—"} />
            <Row label={t("detail.deposit")} value={data.deposit ? formatVnd(data.deposit) : "—"} />
            <Row label={t("detail.monthlyFee")} value={data.monthlyFee ? formatVnd(data.monthlyFee) : "—"} />
            <Row label={t("edit.salePrice")} value={data.salePrice ? formatVnd(data.salePrice) : "—"} />
            <Row label={t("edit.installFee")} value={data.installFee ? formatVnd(data.installFee) : "—"} />
            <Row label={t("detail.technician")} value={data.installedByTechnician?.username ?? "—"} />
            <Row label={t("detail.registeredBy")} value={data.registeredBy?.username ?? "—"} />
          </div>
        </div>
      </div>

      {/* Service-config overview (inspection + filters, next-due) and the
          per-equipment widgets — absorbed from the retired inline panel so
          this dedicated page is the single equipment view (WS4). */}
      <div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-[#737373]">
          {t("serviceConfig.title")}
        </h3>
        <ServiceConfigTable equipmentId={data.id} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <PurchaseHistoryWidget equipmentId={data.id} />
        <RecentWorkWidget equipmentId={data.id} />
        <NextScheduleWidget equipmentId={data.id} />
      </div>

      <EquipmentContractsList equipmentId={data.id} />
      <EquipmentFilterHistory
        equipmentId={data.id}
        canManage={canManageEquipment(role)}
      />
      <EquipmentPaymentsList equipmentId={data.id} />

      {/* Full edit modal (WS1) */}
      <EquipmentEditModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        equipment={{
          id: data.id,
          modelId: data.modelId ?? null,
          siteId: data.siteId,
          serialNumber: data.serialNumber,
          assetCode: data.assetCode,
          ownership: data.ownership,
          installedAt: data.installedAt,
          serviceType: data.serviceType,
          managementType: data.managementType,
          deposit: data.deposit,
          monthlyFee: data.monthlyFee,
          salePrice: data.salePrice,
          installFee: data.installFee,
          customInspectionCycleDays: data.customInspectionCycleDays,
          customMaintenanceCycleDays: data.customMaintenanceCycleDays,
          lastInspectionAtOverride: data.lastInspectionAtOverride,
          notes: data.notes,
          customDescription: data.customDescription,
        }}
        customerType={data.customer.type}
        sites={sites}
        locale={locale as "ko" | "vi" | "en"}
        onSaved={load}
      />

      {/* Relocate modal */}
      {showRelocate && (
        <RelocateModal
          equipment={data}
          sites={sites}
          onClose={() => setShowRelocate(false)}
          onDone={() => {
            setShowRelocate(false);
            void load();
          }}
        />
      )}

      {/* Replace modal */}
      {showReplace && (
        <ReplaceModal
          equipment={data}
          models={models}
          onClose={() => setShowReplace(false)}
          onDone={() => {
            setShowReplace(false);
            void load();
          }}
        />
      )}

      {showDeactivate && (
        <DeactivateModal
          equipmentId={data.id}
          onClose={() => setShowDeactivate(false)}
          onDone={() => {
            setShowDeactivate(false);
            void load();
          }}
        />
      )}
      {showTerminate && (
        <TerminateModal
          equipmentId={data.id}
          deactivatedAt={data.deactivatedAt}
          onClose={() => setShowTerminate(false)}
          onDone={() => {
            setShowTerminate(false);
            void load();
          }}
        />
      )}
      {showRetrieval && (
        <RetrievalLogModal
          equipmentId={data.id}
          terminatedAt={data.terminatedAt}
          onClose={() => setShowRetrieval(false)}
          onDone={() => {
            setShowRetrieval(false);
            void load();
          }}
        />
      )}
      <ConfirmDialog
        open={confirmReactivate}
        title={t("actions.reactivate")}
        message={t("confirm.reactivate")}
        busy={busy}
        onCancel={() => setConfirmReactivate(false)}
        onConfirm={() => changeStatus("ACTIVE")}
      />
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-xs text-[#737373]">{label}</span>
      <span className={mono ? "font-mono text-xs" : "text-[#111111]"}>{value}</span>
    </div>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function DeactivateModal({
  equipmentId,
  onClose,
  onDone,
}: Readonly<{
  equipmentId: string;
  onClose: () => void;
  onDone: () => void;
}>) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const api = useApi();
  const [effectiveAt, setEffectiveAt] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/equipment/${equipmentId}/status`, {
        status: "DEACTIVATED",
        effectiveAt: new Date(effectiveAt).toISOString(),
        reason: reason.trim() || undefined,
      });
      onDone();
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
      title={t("actions.deactivate")}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button variant="danger" onClick={submit} isLoading={busy}>
            {t("actions.deactivate")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t("deactivateModal.billingWarning")}
        </div>
        <FormField label={t("deactivateModal.effectiveAt")} required>
          <Input
            type="date"
            value={effectiveAt}
            onChange={(e) => setEffectiveAt(e.target.value)}
          />
        </FormField>
        <p className="text-xs text-[#737373]">
          {t("deactivateModal.effectiveAtHint")}
        </p>
        <FormField label={tc("reason")}>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={t("deactivateModal.reasonHint")}
          />
        </FormField>
        {err && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}
      </div>
    </Modal>
  );
}

function TerminateModal({
  equipmentId,
  deactivatedAt,
  onClose,
  onDone,
}: Readonly<{
  equipmentId: string;
  deactivatedAt: string | null;
  onClose: () => void;
  onDone: () => void;
}>) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const api = useApi();
  const [effectiveAt, setEffectiveAt] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Termination can't predate the deactivation moment when one exists —
  // the cron / billing logic would otherwise produce negative pause days.
  const minDate = deactivatedAt ? deactivatedAt.slice(0, 10) : undefined;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/equipment/${equipmentId}/status`, {
        status: "TERMINATED",
        effectiveAt: new Date(effectiveAt).toISOString(),
        reason: reason.trim() || undefined,
      });
      onDone();
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
      title={t("actions.terminate")}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button variant="danger" onClick={submit} isLoading={busy}>
            {t("actions.terminate")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {t("terminateModal.finalWarning")}
        </div>
        <FormField label={t("terminateModal.effectiveAt")} required>
          <Input
            type="date"
            value={effectiveAt}
            min={minDate}
            onChange={(e) => setEffectiveAt(e.target.value)}
          />
        </FormField>
        <p className="text-xs text-[#737373]">
          {t("terminateModal.effectiveAtHint")}
        </p>
        <FormField label={tc("reason")}>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={t("terminateModal.reasonHint")}
          />
        </FormField>
        {err && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}
      </div>
    </Modal>
  );
}

function RetrievalLogModal({
  equipmentId,
  terminatedAt,
  onClose,
  onDone,
}: Readonly<{
  equipmentId: string;
  terminatedAt: string | null;
  onClose: () => void;
  onDone: () => void;
}>) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const api = useApi();
  const [retrievedAt, setRetrievedAt] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const minDate = terminatedAt ? terminatedAt.slice(0, 10) : undefined;

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/equipment/${equipmentId}/retrieval`, {
        retrievedAt: new Date(retrievedAt).toISOString(),
        notes: notes.trim() || undefined,
      });
      onDone();
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
      title={t("actions.logRetrieval")}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} isLoading={busy}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[#525252]">{t("retrievalModal.intro")}</p>
        <FormField label={t("retrievalModal.retrievedAt")} required>
          <Input
            type="date"
            value={retrievedAt}
            min={minDate}
            onChange={(e) => setRetrievedAt(e.target.value)}
          />
        </FormField>
        <p className="text-xs text-[#737373]">
          {t("retrievalModal.retrievedAtHint")}
        </p>
        <FormField label={tc("notes")}>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </FormField>
        {err && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}
      </div>
    </Modal>
  );
}

function RelocateModal({
  equipment,
  sites,
  onClose,
  onDone,
}: {
  equipment: EquipmentDetail;
  sites: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const api = useApi();
  const [siteId, setSiteId] = useState<string | null>(equipment.siteId);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/equipment/${equipment.id}/move-site`, {
        siteId,
        reason: reason || undefined,
      });
      onDone();
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
      title={t("relocateTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{tc("cancel")}</Button>
          <Button onClick={submit} isLoading={busy} disabled={siteId === equipment.siteId}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-[#525252]">{t("relocateConfirm")}</p>
      <FormField label={t("site")} required>
        <Combobox
          value={siteId}
          onChange={setSiteId}
          options={sites.map((s) => ({ value: s.id, label: s.name }))}
          placeholder={t("form.pickSite")}
          allowClear={false}
        />
      </FormField>
      <FormField label={tc("notes")} className="mt-3">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </FormField>
      {err && <div className="mt-3 text-sm text-red-700">{err}</div>}
    </Modal>
  );
}

function ReplaceModal({
  equipment,
  models,
  onClose,
  onDone,
}: {
  equipment: EquipmentDetail;
  models: { id: string; modelCode: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const api = useApi();
  const [newModelId, setNewModelId] = useState<string | null>(equipment.modelId);
  const [serial, setSerial] = useState("");
  const [installedAt, setInstalledAt] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/equipment/${equipment.id}/replace`, {
        newModelId,
        newSerialNumber: serial || undefined,
        installedAt: installedAt ? new Date(installedAt).toISOString() : undefined,
        reason: reason || undefined,
      });
      onDone();
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
      title={t("replaceTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{tc("cancel")}</Button>
          <Button onClick={submit} isLoading={busy} disabled={!newModelId}>{tc("save")}</Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-[#525252]">{t("replaceConfirm")}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t("form.pickModel")} required className="sm:col-span-2">
          <Combobox
            value={newModelId}
            onChange={setNewModelId}
            options={models.map((m) => ({
              value: m.id,
              label: `${m.modelCode} — ${m.name}`,
            }))}
            allowClear={false}
          />
        </FormField>
        <FormField label={t("form.serialNumber")}>
          <Input value={serial} onChange={(e) => setSerial(e.target.value)} />
        </FormField>
        <FormField label={t("form.installedAt")}>
          <Input type="date" value={installedAt} onChange={(e) => setInstalledAt(e.target.value)} />
        </FormField>
        <FormField label={tc("notes")} className="sm:col-span-2">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </FormField>
      </div>
      {err && <div className="mt-3 text-sm text-red-700">{err}</div>}
    </Modal>
  );
}

interface EquipmentContractRow {
  id: string;
  contractId: string;
  contract: {
    id: string;
    contractNumber: string;
    type: "SALE" | "RENTAL" | "MAINTENANCE";
    state: string;
    startDate: string | null;
    endDate: string | null;
  };
}

function EquipmentContractsList({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const t = useTranslations("contracts");
  const locale = useLocale();
  const query = useApiQuery<{ contracts: EquipmentContractRow[] }>(
    `/api/equipment/${equipmentId}`,
  );
  const rows = query.data?.contracts ?? [];
  const loading = query.isLoading;

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4">
      <h3 className="text-xs font-medium uppercase tracking-wider text-[#737373]">{t("title")}</h3>
      <ul className="flex flex-col divide-y divide-[#f5f5f5]">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2">
            <Link
              href={`/o/contracts/${r.contract.id}` as never}
              className="font-mono text-xs text-[var(--brand-blue-700)] underline"
            >
              {r.contract.contractNumber}
            </Link>
            <span className="text-xs text-[#737373]">
              {t(`types.${r.contract.type}`)} · {t(`states.${r.contract.state}` as never)}
            </span>
            <span className="text-xs text-[#737373]">
              {formatDate(r.contract.startDate, locale)} – {formatDate(r.contract.endDate, locale) || "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface FilterRow {
  key: string;
  source: "CATALOG" | "OVERRIDE" | "MANUAL";
  overrideId: string | null;
  consumableId: string | null;
  customName: string | null;
  sku: string | null;
  nameKo: string | null;
  nameVi: string | null;
  nameEn: string | null;
  cycleMonths: number | null;
  cycleSource: "OVERRIDE" | "CATALOG" | "CUSTOM_MAINTENANCE" | "NONE";
  quantity: number;
  lastReplacedAt: string | null;
  lastReplacedAtOverride: string | null;
  nextDueAt: string | null;
  daysRemaining: number | null;
  lastUnitPrice: string | null;
  unitPrice: string | null;
  history: { id: string; visitId: string; replacedAt: string; cost: string | null }[];
}

function EquipmentFilterHistory({
  equipmentId,
  canManage,
}: Readonly<{ equipmentId: string; canManage: boolean }>) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const locale = useLocale();
  const query = useApiQuery<{ filters: FilterRow[] }>(
    `/api/equipment/${equipmentId}/filter-history`,
  );
  const filters = query.data?.filters ?? [];
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<FilterRow | null>(null);

  function localizedName(f: FilterRow): string {
    if (f.customName) return f.customName;
    if (locale === "ko") return f.nameKo ?? f.nameVi ?? f.nameEn ?? f.sku ?? "—";
    if (locale === "en") return f.nameEn ?? f.nameVi ?? f.nameKo ?? f.sku ?? "—";
    return f.nameVi ?? f.nameKo ?? f.nameEn ?? f.sku ?? "—";
  }

  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#002A4D]">
          {t("filterHistory.title")}
        </h3>
        {canManage && (
          <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)}>
            {t("filterHistory.addManual")}
          </Button>
        )}
      </header>
      {filters.length === 0 ? (
        <p className="text-xs text-[#737373]">{tc("noData")}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#e5e5e5]">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-xs text-[#525252]">
              <tr>
                <th className="px-3 py-2 text-left">{t("filterHistory.colName")}</th>
                <th className="px-3 py-2 text-left">{t("filterHistory.colCycle")}</th>
                <th className="px-3 py-2 text-left">{t("filterHistory.colLastReplaced")}</th>
                <th className="px-3 py-2 text-left">{t("filterHistory.colNextDue")}</th>
                <th className="px-3 py-2 text-left">{t("filterHistory.colDaysRemaining")}</th>
                <th className="px-3 py-2 text-right">{t("filterHistory.colQuantity")}</th>
                <th className="px-3 py-2 text-right">{t("filterHistory.colCost")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filters.map((f) => (
                <tr key={f.key} className="border-t border-[#f5f5f5]">
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{localizedName(f)}</span>
                      <span className="text-xs text-[#737373]">
                        {f.sku ?? "—"} ·{" "}
                        <span
                          className={
                            f.source === "MANUAL"
                              ? "text-amber-700"
                              : f.source === "OVERRIDE"
                                ? "text-[var(--brand-blue-700)]"
                                : "text-[#737373]"
                          }
                        >
                          {t(`filterHistory.source.${f.source}` as never)}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {f.cycleMonths != null
                      ? t("filterHistory.cycleValue", { months: f.cycleMonths })
                      : "—"}
                    <div className="text-[10px] text-[#a3a3a3]">
                      {t(`filterHistory.cycleSource.${f.cycleSource}` as never)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-sm">{formatDate(f.lastReplacedAt, locale)}</td>
                  <td className="px-3 py-2 text-sm">{formatDate(f.nextDueAt, locale)}</td>
                  <td className="px-3 py-2 text-sm">
                    {f.daysRemaining == null ? (
                      "—"
                    ) : (
                      <span
                        className={
                          f.daysRemaining < 0
                            ? "rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800"
                            : f.daysRemaining <= 30
                              ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
                              : "text-xs text-[#525252]"
                        }
                      >
                        {t("filterHistory.daysValue", { days: f.daysRemaining })}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-sm">{f.quantity}</td>
                  <td className="px-3 py-2 text-right text-sm">
                    {formatVnd(f.unitPrice ?? f.lastUnitPrice)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canManage && (f.overrideId || f.consumableId) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(f)}
                      >
                        {t("filterHistory.editCycle")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && (
        <FilterAddManualModal
          equipmentId={equipmentId}
          onClose={() => setShowAdd(false)}
          onDone={() => {
            setShowAdd(false);
            void query.refetch();
          }}
        />
      )}
      {editing && (
        <FilterEditCycleModal
          equipmentId={equipmentId}
          row={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void query.refetch();
          }}
        />
      )}
    </div>
  );
}

function FilterAddManualModal({
  equipmentId,
  onClose,
  onDone,
}: Readonly<{
  equipmentId: string;
  onClose: () => void;
  onDone: () => void;
}>) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const api = useApi();
  const [customName, setCustomName] = useState("");
  const [cycleMonths, setCycleMonths] = useState<number>(6);
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/equipment/${equipmentId}/consumables`, {
        customName: customName.trim(),
        replaceEveryDays: cycleMonths,
        quantity,
        unitPrice,
      });
      onDone();
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
      title={t("filterHistory.addManual")}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={submit}
            isLoading={busy}
            disabled={customName.trim().length === 0 || cycleMonths < 1}
          >
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label={t("filterHistory.manualName")} required>
          <Input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="예: 타사 RO 멤브레인"
          />
        </FormField>
        <FormField label={t("filterHistory.cycleMonths")} required>
          <Input
            type="number"
            value={cycleMonths}
            onChange={(e) => setCycleMonths(Number(e.target.value))}
            min={1}
            max={3600}
          />
        </FormField>
        <FormField label={t("filterHistory.quantity")}>
          <Input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            min={1}
            max={50}
          />
        </FormField>
        <FormField label={t("filterHistory.unitPrice")}>
          <Input
            type="number"
            value={unitPrice}
            onChange={(e) => setUnitPrice(Number(e.target.value))}
            min={0}
          />
        </FormField>
        {err && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}
      </div>
    </Modal>
  );
}

function FilterEditCycleModal({
  equipmentId,
  row,
  onClose,
  onDone,
}: Readonly<{
  equipmentId: string;
  row: FilterRow;
  onClose: () => void;
  onDone: () => void;
}>) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const api = useApi();
  const [cycleMonths, setCycleMonths] = useState<number>(row.cycleMonths ?? 6);
  const [quantity, setQuantity] = useState<number>(row.quantity);
  const [unitPrice, setUnitPrice] = useState<number>(
    row.unitPrice ? Number(row.unitPrice) : 0,
  );
  // "최근 교체일" admin override (empty = revert to visit-derived date).
  const [lastReplaced, setLastReplaced] = useState<string>(
    row.lastReplacedAtOverride ? formatDate(row.lastReplacedAtOverride, "en") : "",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      // If this is a CATALOG row (no overrideId), we need to create an
      // override first; otherwise PATCH the existing one.
      if (row.overrideId) {
        await api.patch(
          `/api/equipment/${equipmentId}/consumables/${row.overrideId}`,
          {
            replaceEveryDays: cycleMonths,
            quantity,
            unitPrice,
            lastReplacedAtOverride: lastReplaced || null,
          },
        );
      } else if (row.consumableId) {
        await api.post(`/api/equipment/${equipmentId}/consumables`, {
          consumableId: row.consumableId,
          replaceEveryDays: cycleMonths,
          quantity,
          unitPrice,
          lastReplacedAtOverride: lastReplaced || null,
        });
      }
      onDone();
    } catch (e) {
      if (e instanceof ApiClientError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeOverride() {
    if (!row.overrideId) return;
    setBusy(true);
    setErr(null);
    try {
      await api.del(
        `/api/equipment/${equipmentId}/consumables/${row.overrideId}`,
      );
      onDone();
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
      title={t("filterHistory.editCycle")}
      size="md"
      footer={
        <>
          {row.overrideId && (
            <Button variant="danger" onClick={removeOverride} disabled={busy}>
              {row.source === "MANUAL" ? tc("delete") : t("filterHistory.resetCycle")}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} isLoading={busy} disabled={cycleMonths < 1}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label={t("filterHistory.cycleMonths")} required>
          <Input
            type="number"
            value={cycleMonths}
            onChange={(e) => setCycleMonths(Number(e.target.value))}
            min={1}
            max={3600}
          />
        </FormField>
        <FormField label={t("filterHistory.quantity")}>
          <Input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            min={1}
            max={50}
          />
        </FormField>
        <FormField label={t("filterHistory.unitPrice")}>
          <Input
            type="number"
            value={unitPrice}
            onChange={(e) => setUnitPrice(Number(e.target.value))}
            min={0}
          />
        </FormField>
        <FormField
          label={t("filterHistory.lastReplacedOverride")}
          hint={t("filterHistory.lastReplacedHint")}
        >
          <DatePicker
            ariaLabel={t("filterHistory.lastReplacedOverride")}
            value={lastReplaced}
            onChange={setLastReplaced}
          />
        </FormField>
        {err && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}
      </div>
    </Modal>
  );
}

interface EquipmentPaymentRow {
  id: string;
  kind: string;
  state: string;
  method: string;
  expectedAmount: string;
  actualAmount: string;
  collectedAt: string | null;
  reconciledAt: string | null;
  notes: string | null;
  collectedBy: { id: string; username: string } | null;
  visit: { id: string; type: string; scheduledFor: string } | null;
  contract: { id: string; contractNumber: string; type: string } | null;
}

function EquipmentPaymentsList({ equipmentId }: Readonly<{ equipmentId: string }>) {
  const t = useTranslations("equipment");
  const tc = useTranslations("common");
  const locale = useLocale();
  const query = useApiQuery<{
    rows: EquipmentPaymentRow[];
    totals: { byKind: Record<string, number>; byState: Record<string, number> };
  }>(`/api/equipment/${equipmentId}/payments`);
  const rows = query.data?.rows ?? [];
  const byKind = query.data?.totals.byKind ?? {};

  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#002A4D]">
          {t("paymentsList.title")}
        </h3>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(byKind).map(([kind, total]) => (
            <span
              key={kind}
              className="rounded-full bg-[var(--brand-blue-50)] px-2 py-0.5 text-[var(--brand-blue-700)]"
            >
              {kind}: {formatVnd(total)}
            </span>
          ))}
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="text-xs text-[#737373]">{tc("noData")}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#e5e5e5]">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-xs text-[#525252]">
              <tr>
                <th className="px-3 py-2 text-left">{t("paymentsList.colDate")}</th>
                <th className="px-3 py-2 text-left">{t("paymentsList.colKind")}</th>
                <th className="px-3 py-2 text-left">{t("paymentsList.colVisit")}</th>
                <th className="px-3 py-2 text-left">{t("paymentsList.colMethod")}</th>
                <th className="px-3 py-2 text-left">{t("paymentsList.colState")}</th>
                <th className="px-3 py-2 text-right">{t("paymentsList.colAmount")}</th>
                <th className="px-3 py-2 text-left">{t("paymentsList.colCollectedBy")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[#f5f5f5]">
                  <td className="px-3 py-2 text-xs">{formatDate(r.collectedAt, locale)}</td>
                  <td className="px-3 py-2 text-xs">{r.kind}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.visit ? (
                      <Link
                        href={`/o/visits/${r.visit.id}`}
                        className="text-[var(--brand-blue-700)] hover:underline"
                      >
                        {r.visit.type}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.method}</td>
                  <td className="px-3 py-2 text-xs">{r.state}</td>
                  <td className="px-3 py-2 text-right">{formatVnd(r.actualAmount)}</td>
                  <td className="px-3 py-2 text-xs">{r.collectedBy?.username ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
