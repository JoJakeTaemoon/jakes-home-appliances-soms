"use client";

import { useEffect, useMemo, useState } from "react";
import { pickModelName } from "@/lib/products/name";
import { useTranslations , useLocale} from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import { compressImage } from "@/lib/upload/compress";

interface EquipmentOption {
  id: string;
  serialNumber: string | null;
  model: { modelCode: string | null; nameKo: string | null; nameVi: string | null; nameEn: string | null };
  site: { id: string; name: string } | null;
  status: string;
}

interface AttachmentEntry {
  storageKey: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

type SrType = "INSPECTION" | "REPAIR" | "PART_REPLACEMENT" | "RELOCATION" | "OTHER";

const TYPES: { value: SrType; emoji: string }[] = [
  { value: "INSPECTION", emoji: "🔍" },
  { value: "REPAIR", emoji: "🛠️" },
  { value: "PART_REPLACEMENT", emoji: "🧰" },
  { value: "RELOCATION", emoji: "📦" },
  { value: "OTHER", emoji: "❓" },
];

function randomTmpId(): string {
  return `tmp-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function NewRequestClient() {
  const locale = useLocale();
  const t = useTranslations("portal.requests");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { accessToken } = useCustomerAuth();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [equipment, setEquipment] = useState<EquipmentOption[] | null>(null);
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  // Optional site picker (added 2026-06). Visible only for multi-site
  // customers when no equipment has been selected. Never required — the
  // customer may not remember which site, and the office reconciles.
  const [siteId, setSiteId] = useState<string | null>(null);
  const [type, setType] = useState<SrType | null>(null);
  const [description, setDescription] = useState("");
  const [preferredVisitAt, setPreferredVisitAt] = useState("");
  const [attachments, setAttachments] = useState<AttachmentEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [tmpId] = useState(() => randomTmpId());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    code: string;
    isPaid: boolean;
    serviceRequestId: string;
  } | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    fetch("/api/portal/equipment", {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setEquipment(json.data.equipment as EquipmentOption[]);
        else setEquipment([]);
      })
      .catch(() => setEquipment([]));
  }, [accessToken]);

  const selectedEquipment = useMemo(
    () => equipment?.find((e) => e.id === equipmentId) ?? null,
    [equipment, equipmentId],
  );

  // Group equipment by site (B2B); B2C usually no site.
  const groupedEquipment = useMemo(() => {
    if (!equipment) return [];
    const m = new Map<string, EquipmentOption[]>();
    for (const e of equipment) {
      const k = e.site?.name ?? "";
      const list = m.get(k);
      if (list) list.push(e);
      else m.set(k, [e]);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [equipment]);

  // Distinct sites surfaced via equipment payload. The portal endpoint
  // returns `equipment[].site` so we don't need an extra round-trip.
  const siteOptions = useMemo(() => {
    if (!equipment) return [];
    const map = new Map<string, string>();
    for (const e of equipment) {
      if (e.site) map.set(e.site.id, e.site.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [equipment]);
  const multiSite = siteOptions.length >= 2;
  const selectedSiteId = equipmentId
    ? equipment?.find((e) => e.id === equipmentId)?.site?.id ?? null
    : siteId;

  async function handleFile(file: File) {
    if (!accessToken) return;
    setSubmitError(null);
    setUploading(true);
    try {
      const compressed = await compressImage(file).catch(() => file);
      const form = new FormData();
      form.append("tmpId", tmpId);
      form.append("file", compressed);
      const res = await fetch("/api/portal/uploads", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) {
        setSubmitError(json?.error?.message ?? t("submitError"));
        return;
      }
      setAttachments((prev) => [...prev, json.data as AttachmentEntry]);
    } catch {
      setSubmitError(t("submitError"));
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (!type || description.trim().length < 10) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/portal/service-requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({
          equipmentId,
          siteId: selectedSiteId ?? undefined,
          type,
          description: description.trim(),
          preferredVisitAt: preferredVisitAt
            ? new Date(preferredVisitAt).toISOString()
            : undefined,
          attachments: attachments.map((a) => ({
            storageKey: a.storageKey,
            filename: a.filename,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
          })),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setSubmitError(json?.error?.message ?? t("submitError"));
        return;
      }
      setResult({
        code: json.data.code,
        isPaid: json.data.isPaid,
        serviceRequestId: json.data.serviceRequestId,
      });
    } catch {
      setSubmitError(t("submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  // Confirmation screen
  if (result) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-[#002A4D]">
          {t("confirmTitle")}
        </h1>
        <div className="rounded-2xl border border-[#e5e5e5] bg-white p-5 text-center">
          <div className="mb-3 text-4xl">✅</div>
          <p className="text-sm text-[#262626]">
            {t("confirmBody", { code: result.code })}
          </p>
          <p className="mt-3 text-xs text-[#525252]">
            {result.isPaid ? t("confirmPaid") : t("confirmAuto")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/requests")}
          className="w-full rounded-md border border-[var(--brand-blue-500)] bg-[var(--brand-blue-500)] px-3 h-10 text-sm font-semibold text-white outline-none transition-transform hover:scale-[1.02]"
        >
          {t("viewList")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      <header>
        <h1 className="text-xl font-semibold text-[#002A4D]">{t("createTitle")}</h1>
        <p className="text-xs text-[#737373]">{t("createSubtitle")}</p>
      </header>

      <ol className="flex items-center gap-1 text-xs">
        {[1, 2, 3, 4, 5].map((n) => (
          <li
            key={n}
            className={[
              "flex-1 rounded-full px-2 py-1 text-center font-medium",
              n === step
                ? "bg-[var(--brand-blue-500)] text-white"
                : n < step
                ? "bg-[var(--brand-blue-50)] text-[var(--brand-blue-700)]"
                : "bg-[#f5f5f5] text-[#a3a3a3]",
            ].join(" ")}
          >
            {n}
          </li>
        ))}
      </ol>

      {submitError && (
        <p role="alert" className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
          {submitError}
        </p>
      )}

      {step === 1 && (
        <section className="space-y-3">
          {multiSite && (
            <div className="space-y-2 rounded-2xl border border-[var(--brand-blue-100)] bg-[var(--brand-blue-50)]/40 p-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-blue-700)]">
                {t("siteOptional")}
              </label>
              <select
                value={siteId ?? ""}
                onChange={(e) => {
                  setSiteId(e.target.value || null);
                  setEquipmentId(null);
                }}
                disabled={!!equipmentId}
                className="w-full rounded-md border border-[#e5e5e5] bg-white p-3 text-sm text-[#262626] outline-none focus:border-[var(--brand-blue-500)] disabled:bg-[#f5f5f5] disabled:text-[#a3a3a3]"
              >
                <option value="">{t("siteAny")}</option>
                {siteOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {equipmentId && (
                <p className="text-xs text-[#737373]">{t("siteFromEquipment")}</p>
              )}
            </div>
          )}
          <h2 className="text-sm font-semibold text-[#262626]">
            {t("stepEquipment")}
          </h2>
          {equipment === null ? (
            <p className="py-6 text-center text-sm text-[#737373]">{tCommon("loading")}</p>
          ) : equipment.length === 0 ? (
            <p className="rounded-md border border-dashed border-[#e5e5e5] bg-[#fafafa] p-4 text-sm text-[#737373]">
              {t("noEquipment")}
            </p>
          ) : (
            <div className="space-y-3">
              {groupedEquipment.map(([siteName, list]) => (
                <div key={siteName || "__main"} className="space-y-2">
                  {siteName && (
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#737373]">
                      {siteName}
                    </h3>
                  )}
                  <ul className="space-y-2">
                    {list.map((e) => {
                      const active = equipmentId === e.id;
                      return (
                        <li key={e.id}>
                          <button
                            type="button"
                            onClick={() => setEquipmentId(e.id)}
                            className={[
                              "w-full rounded-2xl border bg-white p-3 text-left outline-none transition-colors",
                              active
                                ? "border-[var(--brand-blue-500)] ring-1 ring-[var(--brand-blue-500)]"
                                : "border-[#e5e5e5] hover:border-[#a3a3a3]",
                            ].join(" ")}
                          >
                            <div className="text-sm font-semibold text-[#002A4D]">
                              {pickModelName(e.model, locale)}
                            </div>
                            <div className="text-xs text-[#737373]">
                              {pickModelName(e.model, locale)}
                              {e.serialNumber ? ` · ${e.serialNumber}` : ""}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[#262626]">{t("stepType")}</h2>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((tp) => {
              const active = type === tp.value;
              return (
                <button
                  key={tp.value}
                  type="button"
                  onClick={() => setType(tp.value)}
                  className={[
                    "rounded-2xl border bg-white p-4 text-left outline-none transition-colors",
                    active
                      ? "border-[var(--brand-blue-500)] ring-1 ring-[var(--brand-blue-500)]"
                      : "border-[#e5e5e5] hover:border-[#a3a3a3]",
                  ].join(" ")}
                >
                  <div className="text-2xl">{tp.emoji}</div>
                  <div className="mt-1 text-sm font-semibold text-[#262626]">
                    {t(`types.${tp.value}` as never)}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-[#262626]">
              {t("stepDescription")}
            </h2>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              rows={6}
              className="w-full rounded-md border border-[#e5e5e5] bg-white p-3 text-sm text-[#262626] outline-none focus:border-[var(--brand-blue-500)]"
            />
            <p className="text-xs text-[#a3a3a3]">
              {description.trim().length}/4000
            </p>
          </div>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-[#262626]">
              {t("preferredVisitAt")}
            </h2>
            <input
              type="datetime-local"
              lang={locale}
              value={preferredVisitAt}
              onChange={(e) => setPreferredVisitAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full rounded-md border border-[#e5e5e5] bg-white p-3 text-sm text-[#262626] outline-none focus:border-[var(--brand-blue-500)]"
            />
            <p className="text-xs text-[#a3a3a3]">
              {t("preferredVisitAtHint")}
            </p>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[#262626]">{t("stepPhotos")}</h2>
          {attachments.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {attachments.map((a, i) => (
                <li
                  key={a.storageKey}
                  className="relative overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={a.filename}
                    className="aspect-square w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white"
                  >
                    {t("removePhoto")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="flex h-12 cursor-pointer items-center justify-center rounded-md border border-dashed border-[#e5e5e5] bg-white text-sm font-medium text-[#525252] outline-none hover:border-[var(--brand-blue-500)]">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={uploading || attachments.length >= 8}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  void handleFile(f);
                  e.target.value = "";
                }
              }}
            />
            {uploading
              ? t("uploading")
              : attachments.length === 0
              ? t("addPhoto")
              : t("addAnotherPhoto")}
          </label>
        </section>
      )}

      {step === 5 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[#262626]">{t("stepReview")}</h2>
          <div className="space-y-2 rounded-2xl border border-[#e5e5e5] bg-white p-4 text-sm">
            <Row label={t("detailEquipment")} value={
              selectedEquipment
                ? `${pickModelName(selectedEquipment.model, locale)} · ${pickModelName(selectedEquipment.model, locale)}`
                : "—"
            } />
            <Row label={t("detailType")} value={type ? t(`types.${type}` as never) : "—"} />
            <Row
              label={t("preferredVisitAt")}
              value={
                preferredVisitAt
                  ? new Date(preferredVisitAt).toLocaleString(locale)
                  : "—"
              }
            />
            <div>
              <span className="text-xs text-[#737373]">{t("detailDescription")}</span>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[#262626]">
                {description.trim() || "—"}
              </p>
            </div>
            {attachments.length > 0 && (
              <div>
                <span className="text-xs text-[#737373]">{t("stepPhotos")}</span>
                <p className="mt-1 text-sm text-[#262626]">{attachments.length} photo(s)</p>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="flex gap-2 pt-2">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4 | 5)}
            className="flex-1 rounded-md border border-[#e5e5e5] bg-white px-3 h-10 text-sm font-medium text-[#525252] outline-none transition-colors hover:border-[#a3a3a3]"
          >
            {t("back")}
          </button>
        )}
        {step < 5 ? (
          <button
            type="button"
            disabled={
              (step === 1 && !equipmentId && (equipment?.length ?? 0) > 0) ||
              (step === 2 && !type) ||
              (step === 3 && description.trim().length < 10)
            }
            onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4 | 5)}
            className="flex-1 rounded-md border border-[var(--brand-blue-500)] bg-[var(--brand-blue-500)] px-3 h-10 text-sm font-semibold text-white outline-none transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("next")}
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting || !type || description.trim().length < 10}
            onClick={submit}
            className="flex-1 rounded-md border border-[var(--brand-blue-500)] bg-[var(--brand-blue-500)] px-3 h-10 text-sm font-semibold text-white outline-none transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? t("submitting") : t("submit")}
          </button>
        )}
      </div>
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
