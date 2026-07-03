"use client";

/**
 * Order-create modal — single entry point for "[+ 새 주문 등록]" from
 * both the customer-detail 구매 이력 tab and the service-request detail
 * page. Every submit creates the Order AND a SUGGESTED Visit in the
 * same POST /api/orders transaction; the office user picks the
 * visit date (default = earliestVisitDate — tomorrow, skip Sunday).
 *
 * Caller passes initial values for fields known by the parent — when
 * triggered from a SR, all of customer/equipment/site come pre-filled
 * and locked.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { NumberInput } from "@/components/ui/number-input";
import { FormField } from "@/components/ui/form-field";
import { useApi, ApiClientError } from "@/lib/api/client";
import { useApiPageQuery, useApiQuery } from "@/lib/api/hooks";
import { earliestVisitDateString } from "@/lib/visits/earliest-date";
import {
  formatDate,
  formatTime,
  fromVstDateTimeInput,
  toVstDateTimeInput,
} from "@/lib/format";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { DatePicker } from "@/components/ui/date-picker";

type ProductKind = "EQUIPMENT" | "CONSUMABLE" | "OTHER";
type VisitType =
  | "INSTALLATION"
  | "FILTER_REPLACEMENT"
  | "REPAIR"
  | "PERIODIC_INSPECTION"
  | "RELOCATION"
  | "PAYMENT_COLLECTION"
  | "RETRIEVAL"
  | "CONSUMABLE_DELIVERY"
  | "OTHER";

type VisitMode = "new" | "attach";

interface UpcomingVisit {
  id: string;
  type: VisitType;
  additionalTypes: VisitType[];
  state: string;
  scheduledFor: string;
  leadTechnician: { id: string; username: string } | null;
  site: { id: string; name: string } | null;
}

interface LineState {
  id: string;
  productKind: ProductKind;
  /**
   * Optional per-line link to one of the customer's installed
   * equipment rows. When set, the consumable dropdown for this line
   * filters to only the parts compatible with that equipment's model
   * — otherwise the picker shows the full catalog.
   */
  linkedEquipmentId: string | null;
  consumableId: string | null;
  equipmentModelId: string | null;
  customName: string;
  quantity: number;
  unitPrice: number;
  purpose: string;
}

function newLine(): LineState {
  return {
    id: `l-${Math.random().toString(36).slice(2, 9)}`,
    productKind: "CONSUMABLE",
    linkedEquipmentId: null,
    consumableId: null,
    equipmentModelId: null,
    customName: "",
    quantity: 1,
    unitPrice: 0,
    purpose: "",
  };
}

interface CustomerDetail {
  id: string;
  code: string;
  name: string;
  type: "B2C" | "B2B";
  sites: Array<{ id: string; name: string }>;
  equipment: Array<{
    id: string;
    serialNumber: string | null;
    model: {
      id: string;
      modelCode: string | null;
      nameKo: string | null;
      nameVi: string | null;
      nameEn: string | null;
    } | null;
  }>;
  preferredTechnicianId: string | null;
}
interface ConsumableLite {
  id: string;
  sku: string;
  nameKo: string | null;
  nameVi: string | null;
  nameEn: string | null;
  retailPrice: string | number | null;
  /** Populated by /api/admin/products/consumables list route. */
  compatibleModels?: Array<{ modelId: string }>;
}
interface EquipmentModelLite {
  id: string;
  modelCode: string | null;
  nameKo: string | null;
  nameVi: string | null;
  nameEn: string | null;
  retailPrice: string | number | null;
}
interface TechLite { id: string; username: string }

interface InitialValues {
  customerId: string;
  /** Lock the customer field when set — used by both entry points. */
  lockCustomer?: boolean;
  equipmentId?: string | null;
  siteId?: string | null;
  serviceRequestId?: string | null;
  /** Free-text seed for the notes field, e.g. SR description excerpt. */
  notesSeed?: string;
  /** Seed the visit date (e.g. SR.preferredVisitAt). Falls back to
   *  earliestVisitDate when absent. */
  preferredVisitAt?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  initial: InitialValues;
  /** Fires after a successful POST with the created order id. */
  onCreated?: (orderId: string) => void;
}

export function OrderCreateModal({ open, onClose, initial, onCreated }: Readonly<Props>) {
  const t = useTranslations("orders");
  const tc = useTranslations("common");
  const tv = useTranslations("visits");
  const locale = useLocale();
  const api = useApi();

  const [customerId, setCustomerId] = useState<string | null>(initial.customerId);
  const [siteId, setSiteId] = useState<string | null>(initial.siteId ?? null);
  const [orderedAt, setOrderedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(initial.notesSeed ?? "");
  const [lines, setLines] = useState<LineState[]>([newLine()]);

  const [visitMode, setVisitMode] = useState<VisitMode>("new");
  // Visit date input is a datetime-local (YYYY-MM-DDTHH:mm) in VST wall
  // clock. When we don't have a preferred visit time, seed with the
  // earliest allowed date at 09:00 VST so the picker isn't stuck at
  // midnight.
  const [visitDate, setVisitDate] = useState<string>(
    initial.preferredVisitAt
      ? toVstDateTimeInput(initial.preferredVisitAt)
      : `${earliestVisitDateString()}T09:00`,
  );
  const [visitType, setVisitType] = useState<VisitType>("OTHER");
  const [leadTechnicianId, setLeadTechnicianId] = useState<string | null>(null);
  const [visitNotes, setVisitNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever the modal opens with fresh seed values.
  useEffect(() => {
    if (!open) return;
    setCustomerId(initial.customerId);
    setSiteId(initial.siteId ?? null);
    setOrderedAt(new Date().toISOString().slice(0, 10));
    setNotes(initial.notesSeed ?? "");
    // Seed the first line with the initial equipment link when the
    // caller provides one (e.g. from a service-request that already
    // targets a specific device). Extra lines the user adds start
    // unlinked, so an order can span multiple devices.
    setLines([
      {
        ...newLine(),
        linkedEquipmentId: initial.equipmentId ?? null,
      },
    ]);
    setVisitMode("new");
    setVisitDate(
      initial.preferredVisitAt
        ? toVstDateTimeInput(initial.preferredVisitAt)
        : `${earliestVisitDateString()}T09:00`,
    );
    setVisitType("OTHER");
    setLeadTechnicianId(null);
    setVisitNotes("");
    setError(null);
  }, [open, initial]);

  const customerQuery = useApiQuery<CustomerDetail>(
    open && customerId ? `/api/customers/${customerId}` : null,
  );
  const customer = customerQuery.data ?? null;

  const consumablesQuery = useApiPageQuery<ConsumableLite[]>(
    open ? "/api/admin/products/consumables?pageSize=200" : null,
  );
  const consumables = consumablesQuery.data?.data ?? [];

  const modelsQuery = useApiPageQuery<EquipmentModelLite[]>(
    open ? "/api/equipment-models?isActive=true&pageSize=200" : null,
  );
  const models = modelsQuery.data?.data ?? [];

  const techsQuery = useApiPageQuery<TechLite[]>(
    open ? "/api/users?role=TECHNICIAN&pageSize=100" : null,
  );
  const techs = techsQuery.data?.data ?? [];

  // The customer's next SUGGESTED/SCHEDULED visit — powers the
  // "attach to existing visit" option so the office can piggy-back a
  // consumable order onto a trip that's already on the schedule.
  // staleTime:0 so opening the modal after a prior failure retries the
  // fetch instead of serving the cached error state from the global
  // 5-min staleTime (which is fine for list data but wrong here — a
  // cached error means the user sees "no upcoming visit" and can't
  // pick the attach option).
  const upcomingQuery = useApiQuery<UpcomingVisit | null>(
    open && customerId ? `/api/customers/${customerId}/upcoming-visit` : null,
    { staleTime: 0, retry: 1 },
  );
  const upcomingVisit = upcomingQuery.data ?? null;
  const upcomingErrored = upcomingQuery.isError;

  // Auto-suggest the visit type from line items. Consumables-only orders
  // default to CONSUMABLE_DELIVERY (per 2026-07 spec — the office asked
  // for a dedicated visit type for parts drops); equipment orders default
  // to INSTALLATION; mixed baskets fall back to OTHER. Office user can
  // still override.
  useEffect(() => {
    if (!open) return;
    if (lines.some((l) => l.productKind === "EQUIPMENT")) {
      setVisitType("INSTALLATION");
    } else if (lines.every((l) => l.productKind === "CONSUMABLE")) {
      setVisitType("CONSUMABLE_DELIVERY");
    } else {
      setVisitType("OTHER");
    }
  }, [lines, open]);

  // Default the lead tech to the customer's preferred technician once the
  // customer detail lands.
  useEffect(() => {
    if (customer?.preferredTechnicianId && !leadTechnicianId) {
      setLeadTechnicianId(customer.preferredTechnicianId);
    }
  }, [customer, leadTechnicianId]);

  const total = useMemo(
    () => lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0),
    [lines],
  );

  function updateLine(id: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function removeLine(id: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.id !== id)));
  }
  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function modelLabel(m: EquipmentModelLite): string {
    if (locale === "ko") return m.nameKo ?? m.nameEn ?? m.nameVi ?? m.modelCode ?? m.id;
    if (locale === "en") return m.nameEn ?? m.nameKo ?? m.nameVi ?? m.modelCode ?? m.id;
    return m.nameVi ?? m.nameEn ?? m.nameKo ?? m.modelCode ?? m.id;
  }

  const canSubmit =
    !!customerId &&
    (visitMode === "new" || !!upcomingVisit) &&
    lines.length > 0 &&
    lines.every((l) => {
      if (l.productKind === "EQUIPMENT") return !!l.equipmentModelId && l.quantity > 0;
      if (l.productKind === "CONSUMABLE") return !!l.consumableId && l.quantity > 0;
      return !!l.customName.trim() && l.quantity > 0;
    });

  async function handleSubmit() {
    if (!customerId) return;
    setSubmitting(true);
    setError(null);
    try {
      const items = lines.map((l) => ({
        productKind: l.productKind,
        consumableId: l.productKind === "CONSUMABLE" ? l.consumableId : undefined,
        equipmentModelId: l.productKind === "EQUIPMENT" ? l.equipmentModelId : undefined,
        customName: l.productKind === "OTHER" ? l.customName : undefined,
        equipmentId: l.linkedEquipmentId || undefined,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        totalPrice: l.quantity * l.unitPrice,
        purpose: l.purpose || undefined,
      }));
      // If every line links to the same equipment, promote it to
      // Order.equipmentId too so the equipment-detail purchase-history
      // widget still surfaces the order without traversing items.
      const linkedIds = new Set(
        lines.map((l) => l.linkedEquipmentId).filter((v): v is string => !!v),
      );
      const orderEquipmentId =
        linkedIds.size === 1 && linkedIds.size === lines.length
          ? [...linkedIds][0]
          : undefined;
      const attach = visitMode === "attach" && upcomingVisit;
      const res = await api.post<{ id: string }>("/api/orders", {
        customerId,
        siteId: siteId || undefined,
        equipmentId: orderEquipmentId,
        orderedAt,
        state: "PENDING",
        notes: notes.trim() || undefined,
        items,
        // Two mutually-exclusive visit modes — the API enforces this too.
        ...(attach
          ? { attachToVisitId: upcomingVisit.id }
          : {
              visit: {
                scheduledFor: fromVstDateTimeInput(visitDate),
                type: visitType,
                leadTechnicianId: leadTechnicianId || undefined,
                notes: visitNotes.trim() || undefined,
              },
            }),
        serviceRequestId: initial.serviceRequestId || undefined,
      });
      onCreated?.(res.data.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("createTitle")}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} isLoading={submitting}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Customer + site + equipment */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label={t("customer")}>
            <div className="flex h-10 items-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-3 text-sm text-gray-700">
              {customer ? `${customer.name} (${customer.code})` : tc("loading")}
            </div>
          </FormField>
          {customer && customer.sites.length > 0 && (
            <FormField label={t("site")}>
              <Combobox
                value={siteId}
                onChange={(v) => setSiteId(v as string | null)}
                options={customer.sites.map((s) => ({ value: s.id, label: s.name }))}
                placeholder={tc("none")}
                searchable
              />
            </FormField>
          )}
          <FormField label={t("orderedAt")}>
            <DatePicker value={orderedAt} onChange={setOrderedAt} />
          </FormField>
        </section>

        {/* Items */}
        <section className="rounded-lg border-2 border-gray-200 bg-white p-3">
          <header className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">{t("items")}</h3>
            <Button variant="secondary" onClick={addLine}>
              {t("addItem")}
            </Button>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-2 py-2">{t("kind")}</th>
                  <th className="px-2 py-2">{t("linkedEquipment")}</th>
                  <th className="px-2 py-2">{t("product")}</th>
                  <th className="px-2 py-2 text-left">{t("quantity")}</th>
                  <th className="px-2 py-2 text-left">{t("unitPrice")}</th>
                  <th className="px-2 py-2 text-right">{t("totalPrice")}</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l) => {
                  // Per-line "linked equipment" narrows the consumable
                  // picker to only the parts compatible with that
                  // device's model. Empty selection → full catalog.
                  const linkedEq = l.linkedEquipmentId
                    ? customer?.equipment.find((e) => e.id === l.linkedEquipmentId) ?? null
                    : null;
                  const linkedModelId = linkedEq?.model?.id ?? null;
                  const consumablesForLine = linkedModelId
                    ? consumables.filter((c) =>
                        (c.compatibleModels ?? []).some(
                          (cm) => cm.modelId === linkedModelId,
                        ),
                      )
                    : consumables;
                  return (
                  <tr key={l.id} className="align-top">
                    <td className="px-2 py-2 w-36">
                      <Combobox
                        value={l.productKind}
                        onChange={(v) =>
                          updateLine(l.id, { productKind: (v ?? "CONSUMABLE") as ProductKind })
                        }
                        options={(["EQUIPMENT", "CONSUMABLE", "OTHER"] as const).map((v) => ({
                          value: v,
                          label: t(`kinds.${v}`),
                        }))}
                        searchable={false}
                      />
                    </td>
                    <td className="px-2 py-2 min-w-[14rem]">
                      <Combobox
                        value={l.linkedEquipmentId}
                        onChange={(v) => {
                          // Reset the consumable id when the linked
                          // equipment changes — the previously picked
                          // consumable might not be compatible with the
                          // newly-linked device's model.
                          updateLine(l.id, {
                            linkedEquipmentId: (v as string | null) ?? null,
                            consumableId:
                              l.productKind === "CONSUMABLE" ? null : l.consumableId,
                          });
                        }}
                        options={(customer?.equipment ?? []).map((e) => ({
                          value: e.id,
                          label: `${pickEquipmentLabel(e.model, locale)} · ${e.serialNumber ?? "—"}`,
                        }))}
                        placeholder={tc("none")}
                        searchable
                      />
                    </td>
                    <td className="px-2 py-2 min-w-[18rem]">
                      {l.productKind === "EQUIPMENT" && (
                        <Combobox
                          value={l.equipmentModelId}
                          onChange={(v) => {
                            const m = models.find((x) => x.id === v);
                            updateLine(l.id, {
                              equipmentModelId: v as string | null,
                              unitPrice:
                                m?.retailPrice != null ? Number(m.retailPrice) : l.unitPrice,
                            });
                          }}
                          options={models.map((m) => ({
                            value: m.id,
                            label: modelLabel(m),
                          }))}
                          placeholder={t("pickModel")}
                          searchable
                        />
                      )}
                      {l.productKind === "CONSUMABLE" && (
                        <Combobox
                          value={l.consumableId}
                          onChange={(v) => {
                            const c = consumables.find((x) => x.id === v);
                            updateLine(l.id, {
                              consumableId: v as string | null,
                              unitPrice:
                                c?.retailPrice != null
                                  ? Number(c.retailPrice)
                                  : l.unitPrice,
                            });
                          }}
                          options={consumablesForLine.map((c) => ({
                            value: c.id,
                            label: pickConsumableLabel(c, locale),
                            description: c.sku,
                          }))}
                          placeholder={t("pickConsumable")}
                          searchable
                          emptyText={
                            linkedModelId ? t("noConsumableForEquipment") : undefined
                          }
                        />
                      )}
                      {l.productKind === "OTHER" && (
                        <Input
                          value={l.customName}
                          onChange={(e) => updateLine(l.id, { customName: e.target.value })}
                          placeholder={t("customNamePlaceholder")}
                        />
                      )}
                    </td>
                    <td className="px-2 py-2 w-24">
                      <NumberInput
                        value={l.quantity}
                        onChange={(v) => updateLine(l.id, { quantity: v ?? 1 })}
                        min={1}
                        fallback={1}
                      />
                    </td>
                    <td className="px-2 py-2 w-40">
                      <NumberInput
                        value={l.unitPrice}
                        onChange={(v) => updateLine(l.id, { unitPrice: v ?? 0 })}
                        min={0}
                        fallback={0}
                        variant="money"
                      />
                    </td>
                    <td className="px-2 py-2 w-32 text-right font-medium tabular-nums">
                      {formatMoney(l.quantity * l.unitPrice)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeLine(l.id)}
                        disabled={lines.length === 1}
                        className="text-xs text-red-600 disabled:text-gray-300"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                  <td colSpan={5} className="px-2 py-2 text-right">
                    {t("orderTotal")}
                  </td>
                  <td className="px-2 py-2 text-right">{formatMoney(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Visit — attach to an existing upcoming visit or spawn a new one */}
        <section className="rounded-lg border-2 border-blue-200 bg-blue-50/30 p-3">
          <header className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#002A4D]">{t("visitSectionTitle")}</h3>
            <span className="text-xs text-gray-500">{t("visitSectionHint")}</span>
          </header>

          {/* Mode picker — "attach" is only available when an upcoming
              visit exists for this customer. */}
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <label
              className={
                "flex flex-1 cursor-pointer gap-3 rounded-md border-2 p-3 " +
                (visitMode === "attach"
                  ? "border-[var(--brand-blue-500)] bg-white"
                  : "border-transparent bg-white/40") +
                (upcomingVisit ? "" : " cursor-not-allowed opacity-50")
              }
            >
              <input
                type="radio"
                name="visit-mode"
                className="mt-0.5"
                checked={visitMode === "attach"}
                disabled={!upcomingVisit}
                onChange={() => setVisitMode("attach")}
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">
                  {t("visitModeAttach")}
                </div>
                {(() => {
                  if (upcomingVisit) {
                    return (
                      <UpcomingVisitSummary v={upcomingVisit} locale={locale} tv={tv} />
                    );
                  }
                  if (upcomingQuery.isLoading) {
                    return <p className="mt-1 text-xs text-gray-500">{tc("loading")}</p>;
                  }
                  if (upcomingErrored) {
                    return (
                      <p className="mt-1 flex items-center gap-2 text-xs text-red-600">
                        <span>{t("upcomingFetchError")}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            void upcomingQuery.refetch();
                          }}
                          className="rounded border border-red-300 bg-white px-2 py-0.5 text-red-700 hover:bg-red-50"
                        >
                          {tc("retry")}
                        </button>
                      </p>
                    );
                  }
                  return (
                    <p className="mt-1 text-xs text-gray-500">{t("noUpcomingVisit")}</p>
                  );
                })()}
              </div>
            </label>
            <label
              className={
                "flex flex-1 cursor-pointer gap-3 rounded-md border-2 p-3 " +
                (visitMode === "new"
                  ? "border-[var(--brand-blue-500)] bg-white"
                  : "border-transparent bg-white/40")
              }
            >
              <input
                type="radio"
                name="visit-mode"
                className="mt-0.5"
                checked={visitMode === "new"}
                onChange={() => setVisitMode("new")}
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">
                  {t("visitModeNew")}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {t("visitModeNewHint")}
                </p>
              </div>
            </label>
          </div>

          {visitMode === "new" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label={t("visitScheduledFor")}>
                <DateTimePicker
                  value={visitDate}
                  onChange={setVisitDate}
                />
              </FormField>
              <FormField label={t("visitType")}>
                <Combobox
                  value={visitType}
                  onChange={(v) => setVisitType((v ?? "OTHER") as VisitType)}
                  options={(
                    [
                      "INSTALLATION",
                      "FILTER_REPLACEMENT",
                      "CONSUMABLE_DELIVERY",
                      "REPAIR",
                      "PERIODIC_INSPECTION",
                      "RELOCATION",
                      "PAYMENT_COLLECTION",
                      "RETRIEVAL",
                      "OTHER",
                    ] as const
                  ).map((v) => ({ value: v, label: tv(`types.${v}`) }))}
                  searchable={false}
                />
              </FormField>
              <FormField label={t("visitTechnician")}>
                <Combobox
                  value={leadTechnicianId}
                  onChange={(v) => setLeadTechnicianId(v as string | null)}
                  options={techs.map((u) => ({ value: u.id, label: u.username }))}
                  placeholder={tc("none")}
                  searchable
                />
              </FormField>
              <FormField label={t("visitNotes")} className="sm:col-span-2">
                <Textarea
                  value={visitNotes}
                  onChange={(e) => setVisitNotes(e.target.value)}
                  rows={2}
                  placeholder={t("visitNotesPlaceholder")}
                />
              </FormField>
            </div>
          ) : (
            upcomingVisit && (
              <p className="rounded-md bg-white px-3 py-2 text-xs text-gray-600">
                {t("visitAttachHint")}
              </p>
            )
          )}
        </section>

        <FormField label={t("notes")}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </FormField>

        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
      </div>
    </Modal>
  );
}

function pickEquipmentLabel(
  model: CustomerDetail["equipment"][number]["model"],
  locale: string,
): string {
  if (!model) return "—";
  if (locale === "ko") return model.nameKo ?? model.nameEn ?? model.nameVi ?? model.modelCode ?? "—";
  if (locale === "en") return model.nameEn ?? model.nameKo ?? model.nameVi ?? model.modelCode ?? "—";
  return model.nameVi ?? model.nameEn ?? model.nameKo ?? model.modelCode ?? "—";
}

function pickConsumableLabel(c: ConsumableLite, locale: string): string {
  if (locale === "ko") return c.nameKo ?? c.nameEn ?? c.nameVi ?? c.sku;
  if (locale === "en") return c.nameEn ?? c.nameKo ?? c.nameVi ?? c.sku;
  return c.nameVi ?? c.nameEn ?? c.nameKo ?? c.sku;
}

function formatMoney(v: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(v)) + " ₫";
}

/**
 * Compact summary card for the "attach to existing" mode — shows the
 * upcoming visit's date + all types (primary + secondary) + technician.
 * Rendered inside the radio label so the office sees exactly what
 * they're piggy-backing on before they submit.
 */
function UpcomingVisitSummary({
  v,
  locale,
  tv,
}: Readonly<{
  v: UpcomingVisit;
  locale: string;
  tv: ReturnType<typeof useTranslations>;
}>) {
  // VST calendar date + 24h time via the shared helpers — never the
  // browser's own timezone.
  const dateLabel = formatDate(v.scheduledFor, locale);
  const timeLabel = formatTime(v.scheduledFor);
  const allTypes = [v.type, ...v.additionalTypes];
  return (
    <div className="mt-1 flex flex-col gap-1 text-xs text-gray-600">
      <div className="flex items-center gap-2">
        <span className="font-medium text-gray-900">{dateLabel}</span>
        <span>· {timeLabel}</span>
        <span>· {v.leadTechnician?.username ?? "—"}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {allTypes.map((tp, i) => (
          <span
            key={`${tp}-${i}`}
            className="rounded-full bg-[var(--brand-blue-50)] px-2 py-0.5 text-[10px] font-medium text-[var(--brand-blue-700)]"
          >
            {tv(`types.${tp}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
