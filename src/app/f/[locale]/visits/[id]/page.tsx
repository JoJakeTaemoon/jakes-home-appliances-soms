"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { pickModelName } from "@/lib/products/name";
import { useApi } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { useFieldAuth } from "@/providers/field-auth-provider";
import { Button } from "@/components/ui/button";
import { MobileWrapper } from "@/components/mobile/mobile-wrapper";
import {
  VisitStateBadge,
  VisitTypeBadge,
} from "@/components/visits/visit-state-badge";
import { formatDate } from "@/lib/format";
import { HQ_PHONE } from "@/lib/config/company";
import { Phone, MapPin, CheckCircle2, AlertTriangle, Play, Send } from "lucide-react";

interface OfficeNoteEntry {
  at: string;
  authorId: string;
  authorName: string;
  text: string;
}

interface ConsumableOnModel {
  quantity: number;
  consumable: {
    id: string;
    sku: string;
    nameKo: string;
    nameVi: string;
    nameEn: string;
    replaceEveryMonths: number | null;
    cleanEveryMonths: number | null;
    cleanOnEveryVisit: boolean;
    isActive: boolean;
  };
}

interface VisitDetail {
  id: string;
  type: string;
  state: string;
  scheduledFor: string;
  scheduledWindow: string | null;
  expectedAmount: string | null;
  findings: string | null;
  officeNotes: OfficeNoteEntry[] | null;
  leadTechnicianId: string | null;
  collaboratorTechnicianIds: string[];
  hqPhone: string | null;
  customer: {
    name: string;
    code: string;
    address: string | null;
    district: string | null;
    city: string | null;
    contacts: { name: string; isPrimary: boolean; scope: string; siteId: string | null }[];
  };
  equipment: {
    serialNumber: string | null;
    installedAt: string | null;
    model: {
      modelCode: string | null;
      nameKo: string | null;
      nameVi: string | null;
      nameEn: string | null;
      category?: string;
      consumables?: ConsumableOnModel[];
    };
    site: { id: string; name: string } | null;
  } | null;
  leadTechnician: { username: string } | null;
  serviceRequest: {
    id: string;
    code: string;
    type: string;
    description: string;
    isPaid: boolean;
  } | null;
  signatureDocs: string[];
  contract: { id: string; contractNumber: string } | null;
}

export default function MobileVisitDetailPage() {
  return (
    <MobileWrapper>
      <MobileVisitDetailContent />
    </MobileWrapper>
  );
}

function MobileVisitDetailContent() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const t = useTranslations("mobile");
  const tv = useTranslations("visits");
  const locale = useLocale();
  const router = useRouter();
  const api = useApi();
  const { user } = useFieldAuth();
  const query = useApiQuery<VisitDetail>(id ? `/api/mobile/visits/${id}` : null);
  const data = query.data;
  const error =
    query.error instanceof Error ? query.error.message : null;
  const reload = async () => {
    await query.refetch();
  };

  const [actionError, setActionError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  if (query.isLoading && !data) return <p className="text-sm text-[#737373]">Loading…</p>;
  if (error || !data) {
    return <p className="text-sm text-red-600">{error ?? "Not found"}</p>;
  }

  const isLead = !!user && data.leadTechnicianId === user.id;

  const addressStr = [data.customer.address, data.customer.district, data.customer.city]
    .filter(Boolean)
    .join(", ");
  const mapsUrl = addressStr
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressStr)}`
    : null;
  const primaryOps =
    data.customer.contacts.find((c) => c.isPrimary) ?? data.customer.contacts[0];

  const start = async () => {
    setActionError(null);
    try {
      await api.post(`/api/mobile/visits/${id}/start`);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const submitOfficeNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    setActionError(null);
    setNoteSaving(true);
    try {
      await api.post(`/api/mobile/visits/${id}/office-note`, { text });
      setNoteText("");
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setNoteSaving(false);
    }
  };

  const officeNotes = data.officeNotes ?? [];
  const hqPhone = data.hqPhone ?? HQ_PHONE;
  const hqPhoneTel = hqPhone.replace(/[^\d+]/g, "");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <VisitTypeBadge type={data.type} />
          <VisitStateBadge state={data.state} />
        </div>
        <h1 className="text-lg font-semibold text-[#002A4D]">{data.customer.name}</h1>
        <p className="text-sm text-[#525252]">
          {formatDate(data.scheduledFor, locale)} · {data.scheduledFor.slice(11, 16)}
          {data.scheduledWindow ? ` · ${data.scheduledWindow}` : ""}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-2">
        <a
          href={`tel:${hqPhoneTel}`}
          className="flex h-16 items-center justify-between rounded-xl border border-[#e5e5e5] bg-white px-4 text-sm font-medium text-[#002A4D] shadow-sm active:scale-[0.99]"
        >
          <span className="flex items-center gap-2">
            <Phone className="size-5 text-[var(--brand-blue-500)]" />
            {t("callHq")}
          </span>
          <span className="text-xs text-[#737373]">{hqPhone}</span>
        </a>
        {primaryOps && (
          <p className="px-1 text-xs text-[#737373]">
            {t("contactLabel")}: {primaryOps.name}
          </p>
        )}
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-16 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-4 text-sm font-medium text-[#002A4D] shadow-sm active:scale-[0.99]"
          >
            <MapPin className="size-5 text-[var(--brand-blue-500)]" />
            {t("openMaps")}
          </a>
        )}
      </div>

      <section className="rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-[#737373]">{tv("equipment")}</h2>
        {data.equipment ? (
          <div className="mt-1 space-y-1">
            <p className="text-sm font-medium text-[#262626]">
              {pickModelName(data.equipment.model, locale)}
            </p>
            <p className="text-xs text-[#737373]">
              {data.equipment.model.modelCode ?? "—"}
              {data.equipment.serialNumber
                ? ` · S/N ${data.equipment.serialNumber}`
                : ""}
              {data.equipment.installedAt
                ? ` · ${t("installedAt")}: ${formatDate(data.equipment.installedAt, locale)}`
                : ""}
            </p>
            {data.equipment.site && (
              <p className="text-xs text-[#737373]">
                {tv("site")}: {data.equipment.site.name}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-1 text-sm text-[#737373]">—</p>
        )}
      </section>

      <SignatureDocsSection visit={data} />

      <WorkScopeSection visit={data} />


      {data.serviceRequest && (
        <section className="rounded-xl border border-[var(--brand-blue-200)] bg-[var(--brand-blue-50)] p-4 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-blue-700)]">
            {data.serviceRequest.code} · {data.serviceRequest.type}
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[#262626]">
            {data.serviceRequest.description}
          </p>
        </section>
      )}

      {addressStr && (
        <section className="rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-medium text-[#737373]">Address</h2>
          <p className="mt-1 text-sm">{addressStr}</p>
        </section>
      )}

      <section className="rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-[#737373]">{t("officeNote.title")}</h2>
        <p className="mt-1 text-xs text-[#a3a3a3]">{t("officeNote.hint")}</p>
        {officeNotes.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {officeNotes.map((n, i) => (
              <li key={`${n.at}-${i}`} className="rounded-lg bg-[#f5f5f5] p-2 text-sm text-[#262626]">
                <span className="block whitespace-pre-wrap">{n.text}</span>
                <span className="mt-1 block text-[10px] text-[#737373]">
                  {n.authorName} · {formatDate(n.at, locale)} {n.at.slice(11, 16)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={t("officeNote.placeholder")}
          className="mt-3 w-full resize-none rounded-lg border border-[#e5e5e5] p-2 text-sm focus:border-[var(--brand-blue-500)] focus:outline-none"
        />
        <Button
          onClick={submitOfficeNote}
          disabled={!noteText.trim()}
          isLoading={noteSaving}
          variant="outline"
          fullWidth
          className="mt-2"
        >
          <span className="inline-flex items-center gap-2">
            <Send className="size-4" />
            {t("officeNote.submit")}
          </span>
        </Button>
      </section>

      {actionError && (
        <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{actionError}</p>
      )}

      <div className="flex flex-col gap-2">
        {isLead && data.state === "SCHEDULED" && (
          <Button onClick={start} fullWidth size="lg">
            <span className="inline-flex items-center gap-2">
              <Play className="size-5" />
              {t("actions.start")}
            </span>
          </Button>
        )}
        {isLead && data.state === "IN_PROGRESS" && (
          <Link href={`/f/visits/${id}/complete`} className="block">
            <Button fullWidth size="lg">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="size-5" />
                {t("actions.complete")}
              </span>
            </Button>
          </Link>
        )}
        {isLead && (data.state === "SCHEDULED" || data.state === "IN_PROGRESS") && (
          <Button
            variant="outline"
            fullWidth
            size="lg"
            onClick={() => router.push(`/f/visits/${id}/complete?action=fail`)}
          >
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="size-5" />
              {t("actions.fail")}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}

function pickConsumableName(
  c: ConsumableOnModel["consumable"],
  locale: string,
): string {
  if (locale === "ko") return c.nameKo;
  if (locale === "en") return c.nameEn;
  return c.nameVi;
}

/**
 * Visit-type-aware "scope of work" panel. Tells the technician what they
 * came here to do — for periodic inspections and filter replacements it
 * lists the model's compatible consumables (replace cycle, clean cycle,
 * or every-visit cleaning) so the tech knows which filters to bring +
 * what to check before tapping Start. For other visit types it falls
 * back to a generic type-specific intro line.
 */
function WorkScopeSection({ visit }: Readonly<{ visit: VisitDetail }>) {
  const t = useTranslations("mobile.workScope");
  const tv = useTranslations("visits.types");
  const locale = useLocale();

  const type = visit.type;
  const allConsumables = visit.equipment?.model.consumables ?? [];
  const active = allConsumables.filter((c) => c.consumable.isActive);

  // Buckets per visit type — periodic inspections clean every-visit
  // filters + check cycle-due filters; filter replacements list every
  // replaceable filter.
  const cleanItems = active.filter((c) => {
    if (type === "PERIODIC_INSPECTION")
      return c.consumable.cleanOnEveryVisit || c.consumable.cleanEveryMonths != null;
    if (type === "FILTER_REPLACEMENT")
      return c.consumable.cleanOnEveryVisit;
    return false;
  });
  const replaceItems = active.filter((c) => {
    if (type === "PERIODIC_INSPECTION")
      return c.consumable.replaceEveryMonths != null;
    if (type === "FILTER_REPLACEMENT")
      return c.consumable.replaceEveryMonths != null;
    return false;
  });

  const introKey = (() => {
    switch (type) {
      case "INSTALLATION":
        return "introInstallation";
      case "PERIODIC_INSPECTION":
        return "introPeriodicInspection";
      case "FILTER_REPLACEMENT":
        return "introFilterReplacement";
      case "REPAIR":
        return "introRepair";
      case "RELOCATION":
        return "introRelocation";
      case "PAYMENT_COLLECTION":
        return "introPaymentCollection";
      default:
        return "introOther";
    }
  })();

  return (
    <section className="rounded-xl border border-[var(--brand-blue-200)] bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-[var(--brand-blue-700)]">
        {t("title")} · {tv(type as never)}
      </h2>
      <p className="mt-2 text-sm text-[#262626]">{t(introKey as never)}</p>

      {replaceItems.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#737373]">
            {t("replaceTitle")}
          </h3>
          <ul className="mt-1 space-y-1">
            {replaceItems.map((c) => (
              <li
                key={`r-${c.consumable.id}`}
                className="flex items-start justify-between gap-2 text-sm"
              >
                <span className="text-[#262626]">
                  {pickConsumableName(c.consumable, locale)}
                  {c.quantity > 1 ? ` × ${c.quantity}` : ""}
                </span>
                <span className="font-mono text-xs text-[#737373]">
                  {c.consumable.sku}
                  {c.consumable.replaceEveryMonths
                    ? ` · ${t("everyMonths", { n: c.consumable.replaceEveryMonths })}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cleanItems.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#737373]">
            {t("cleanTitle")}
          </h3>
          <ul className="mt-1 space-y-1">
            {cleanItems.map((c) => {
              let cycle = "";
              if (c.consumable.cleanOnEveryVisit) cycle = ` · ${t("everyVisit")}`;
              else if (c.consumable.cleanEveryMonths != null)
                cycle = ` · ${t("everyMonths", { n: c.consumable.cleanEveryMonths })}`;
              return (
                <li
                  key={`c-${c.consumable.id}`}
                  className="flex items-start justify-between gap-2 text-sm"
                >
                  <span className="text-[#262626]">
                    {pickConsumableName(c.consumable, locale)}
                  </span>
                  <span className="font-mono text-xs text-[#737373]">
                    {c.consumable.sku}
                    {cycle}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {visit.scheduledWindow && (
        <p className="mt-3 text-xs text-[#737373]">
          {t("windowLabel")}: {visit.scheduledWindow}
        </p>
      )}
      {visit.expectedAmount && Number(visit.expectedAmount) > 0 && (
        <p className="mt-1 text-xs text-[#737373]">
          {t("expectedAmountLabel")}:{" "}
          <span className="font-mono">{visit.expectedAmount}</span>
        </p>
      )}
    </section>
  );
}

/**
 * Signature-required document list for the visit, with an inline PDF
 * preview per doc so the technician can verify exactly what the
 * customer is about to sign — prevents handing over the wrong slip or
 * skipping a signature.
 */
function SignatureDocsSection({ visit }: Readonly<{ visit: VisitDetail }>) {
  const t = useTranslations("mobile");
  if (!visit.signatureDocs || visit.signatureDocs.length === 0) return null;
  return (
    <section className="rounded-xl border border-[#fcd34d] bg-[#fffbeb] p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-[#92400e]">
        {t("signRequired")}
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {visit.signatureDocs.map((kind) => {
          const label = t(
            `signatureDocLabels.${kind}` as "signatureDocLabels.WORK_CONFIRMATION",
          );
          const previewUrl =
            kind === "CONTRACT"
              ? visit.contract
                ? `/api/contracts/${visit.contract.id}/pdf`
                : null
              : `/api/mobile/visits/${visit.id}/preview/${kind}?langPair=vi-ko`;
          return (
            <li
              key={kind}
              className="overflow-hidden rounded-lg border border-[#fcd34d] bg-white"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#fef3c7] bg-[#fffbeb] px-3 py-2">
                <span className="text-sm font-semibold text-[#92400e]">
                  {label}
                  {kind === "CONTRACT" && visit.contract && (
                    <span className="ml-2 font-mono text-xs text-[#737373]">
                      {visit.contract.contractNumber}
                    </span>
                  )}
                </span>
                {previewUrl && (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-[#92400e] px-2 py-0.5 text-xs font-medium text-[#92400e] hover:bg-[#fef3c7]"
                  >
                    {t("docPreviewOpen")}
                  </a>
                )}
              </div>
              {previewUrl && (
                <iframe
                  title={`preview-${kind}`}
                  src={previewUrl}
                  className="h-[60vh] w-full border-none"
                />
              )}
              <p className="px-3 py-2 text-xs text-[#92400e]">
                {t("docSignersHint")}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
