"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useApi } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { useFieldAuth } from "@/providers/field-auth-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { NumberInput } from "@/components/ui/number-input";
import { Combobox } from "@/components/ui/combobox";
import { MobileWrapper } from "@/components/mobile/mobile-wrapper";
import { compressImage } from "@/lib/upload/compress";
import { enqueue, useOnlineStatus } from "@/lib/offline/queue";

interface UploadResp {
  storageKey: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
}

interface PhotoState extends UploadResp {
  takenAt: string;
}

/**
 * A photo the technician has picked but not yet uploaded. We hold the
 * raw File + a blob URL for the in-card preview, so they can review +
 * remove individual shots before sending them to the server.
 */
interface PendingPhoto {
  localId: string;
  file: File;
  previewUrl: string;
}

interface SuggestionResp {
  consumableId: string;
  sku: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
  action: "REPLACE" | "CLEAN";
  lastDoneAt: string | null;
  nextDueAt: string;
  daysUntilDue: number;
  cycleMonths: number;
}

interface PartCatalogItem {
  id: string;
  sku: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
  kind: "CONSUMABLE" | "ACCESSORY";
  retailPrice: string;
}

function pickPartName(p: PartCatalogItem, locale: string): string {
  if (locale === "ko") return p.nameKo;
  if (locale === "en") return p.nameEn;
  return p.nameVi;
}

function suggestionKey(s: { consumableId: string; action: string }): string {
  return `${s.consumableId}:${s.action}`;
}

interface StepNumProps {
  n: number;
  label: string;
  active: boolean;
}

function StepNum({ n, label, active }: Readonly<StepNumProps>) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={
          active
            ? "flex size-7 items-center justify-center rounded-full bg-[var(--brand-blue-500)] text-xs font-semibold text-white"
            : "flex size-7 items-center justify-center rounded-full bg-[#e5e5e5] text-xs font-semibold text-[#737373]"
        }
      >
        {n}
      </span>
      <span className="mt-1 text-[10px] text-[#737373]">{label}</span>
    </div>
  );
}

export default function MobileCompletePage() {
  return (
    <MobileWrapper>
      <CompleteWizard />
    </MobileWrapper>
  );
}

function CompleteWizard() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const t = useTranslations("mobile.complete");
  const tm = useTranslations("mobile");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const api = useApi();
  const { accessToken } = useFieldAuth();

  const [step, setStep] = useState(1);
  const [findings, setFindings] = useState("");
  const [parts, setParts] = useState<string[]>([]);
  const [photos, setPhotos] = useState<PhotoState[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [signature, setSignature] = useState<PhotoState | null>(null);
  // Amounts are seeded from the visit's expectedAmount via useApiQuery.
  // Overrides are user-typed values; null = "use the server's expected".
  const [collectedAmountOverride, setCollectedAmountOverride] = useState<
    number | null
  >(null);
  const [chargedAmountOverride, setChargedAmountOverride] = useState<
    number | null
  >(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [chargeOverrideReason, setChargeOverrideReason] = useState<string>("");
  // unselectedSuggestionKeys tracks what the technician UN-checked.
  // Default-selected state is computed from the query's recommendations.
  const [unselectedSuggestionKeys, setUnselectedSuggestionKeys] = useState<
    Set<string>
  >(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedForSync, setQueuedForSync] = useState(false);
  const online = useOnlineStatus();
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  // Track whether step 2's auto-open already fired once. Re-firing on
  // every step change would feel hostile (e.g. user clicks Back from
  // step 3 to step 2 and the picker pops again).
  const photoAutoOpenedRef = useRef(false);

  // Auto-open the gallery/camera picker the first time the technician
  // lands on step 2 — saves a tap on the data-entry-heavy field flow.
  // Browsers only honour the programmatic .click() because we're still
  // inside the React commit triggered by the user's tap on "Next".
  useEffect(() => {
    if (step !== 2) return;
    if (photoAutoOpenedRef.current) return;
    if (photos.length > 0) return;
    photoAutoOpenedRef.current = true;
    photoInputRef.current?.click();
  }, [step, photos.length]);

  // Wizard form values (expectedAmount, suggestion list) are frozen for
  // the duration of the completion flow: if the technician taps away to
  // check the manual and returns, a window-focus refetch must NOT flip
  // their in-progress numbers or re-include consumable rows they
  // explicitly unchecked. staleTime: Infinity + no refetch-on-focus
  // keeps the initial server snapshot until the page unmounts.
  const visitQuery = useApiQuery<{ expectedAmount: string | null }>(
    id ? `/api/mobile/visits/${id}` : null,
    { staleTime: Infinity, refetchOnWindowFocus: false },
  );
  const suggestionsQuery = useApiQuery<{ recommendations: SuggestionResp[] }>(
    id ? `/api/mobile/visits/${id}/suggest-consumables` : null,
    { staleTime: Infinity, refetchOnWindowFocus: false },
  );
  // Catalog of every active consumable + accessory — powers the parts
  // dropdown so the technician can pick by SKU/name instead of typing
  // free-text. The Combobox falls back to a "Add <typed>" row for the
  // off-catalog case (custom-made replacement, customer-supplied part).
  const partsCatalogQuery = useApiQuery<PartCatalogItem[]>(
    `/api/mobile/parts`,
    { staleTime: Infinity, refetchOnWindowFocus: false },
  );
  const partsCatalog = useMemo(
    () => partsCatalogQuery.data ?? [],
    [partsCatalogQuery.data],
  );
  const expectedAmount = visitQuery.data?.expectedAmount
    ? Number(visitQuery.data.expectedAmount)
    : 0;
  const chargedAmount = chargedAmountOverride ?? expectedAmount;
  const collectedAmount = collectedAmountOverride ?? expectedAmount;
  const suggestions = useMemo(
    () => suggestionsQuery.data?.recommendations ?? [],
    [suggestionsQuery.data],
  );
  const selectedSuggestionKeys = useMemo(() => {
    const set = new Set<string>();
    for (const s of suggestions) {
      const k = suggestionKey(s);
      if (!unselectedSuggestionKeys.has(k)) set.add(k);
    }
    return set;
  }, [suggestions, unselectedSuggestionKeys]);

  const toggleSuggestion = (key: string) => {
    setUnselectedSuggestionKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const upload = async (file: File): Promise<UploadResp | null> => {
    const compressed = await compressImage(file).catch(() => file);
    const form = new FormData();
    form.append("file", compressed);
    form.append("visitId", id);
    const res = await fetch("/api/mobile/uploads", {
      method: "POST",
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: form,
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message ?? "Upload failed");
    }
    return json.data as UploadResp;
  };

  // Step 2 is now staged: picking a photo only buffers it locally so the
  // technician can review/remove before committing. Upload happens when
  // they tap the explicit "업로드" button below.
  const handlePhotoInput = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setError(null);
    const additions: PendingPhoto[] = files.map((file) => ({
      localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setPendingPhotos((prev) => [...prev, ...additions]);
    e.target.value = "";
  };

  const removePendingPhoto = (localId: string) => {
    setPendingPhotos((prev) => {
      const removed = prev.find((p) => p.localId === localId);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((p) => p.localId !== localId);
    });
  };

  const uploadPendingPhotos = async () => {
    if (pendingPhotos.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const pending of pendingPhotos) {
        const resp = await upload(pending.file);
        if (resp) {
          setPhotos((prev) => [
            ...prev,
            { ...resp, takenAt: new Date().toISOString() },
          ]);
          URL.revokeObjectURL(pending.previewUrl);
          setPendingPhotos((prev) =>
            prev.filter((p) => p.localId !== pending.localId),
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  // Free any unreleased blob URLs when the wizard unmounts (e.g.
  // technician hits back/cancel on the device).
  useEffect(() => {
    return () => {
      for (const p of pendingPhotos) URL.revokeObjectURL(p.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only on unmount
  }, []);

  const handleSignatureInput = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const resp = await upload(file);
      if (resp) setSignature({ ...resp, takenAt: new Date().toISOString() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };


  const submit = async () => {
    setError(null);
    if (!signature) {
      setError("Customer signature required");
      return;
    }
    if (!findings.trim()) {
      setError("Findings required");
      return;
    }
    // chargeOverride guard MUST fire before the body is assembled — otherwise
    // the offline-sync queue would carry the under-validated payload.
    if (
      chargedAmount !== expectedAmount &&
      chargeOverrideReason.trim().length < 5
    ) {
      setError(t("chargeOverrideReasonRequired"));
      return;
    }
    setSubmitting(true);
    const consumableLogs = suggestions
      .filter((s) => selectedSuggestionKeys.has(suggestionKey(s)))
      .map((s) => ({ consumableId: s.consumableId, action: s.action }));
    const body = {
      findings,
      partsReplaced: parts,
      consumableLogs,
      photos: photos.map((p) => ({
        storageKey: p.storageKey,
        takenAt: p.takenAt,
      })),
      customerSignaturePhotoStorageKey: signature.storageKey,
      chargedAmount:
        chargedAmount !== expectedAmount ? chargedAmount : undefined,
      chargeOverrideReason:
        chargedAmount !== expectedAmount
          ? chargeOverrideReason.trim()
          : undefined,
      collectedAmount: collectedAmount > 0 ? collectedAmount : null,
      paymentMethod: collectedAmount > 0 ? paymentMethod : undefined,
    };
    if (!online) {
      // Offline path — queue locally and bounce back to the visit detail.
      try {
        await enqueue({
          kind: "VISIT_COMPLETE",
          payload: { visitId: id, ...body },
          visitId: id,
        });
        setQueuedForSync(true);
        // Give the toast a moment, then nav back.
        window.setTimeout(() => router.replace(`/f/visits/${id}`), 800);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    try {
      await api.post(`/api/mobile/visits/${id}/complete`, body);
      router.replace(`/f/visits/${id}`);
    } catch (err) {
      // If network died mid-flight, fall back to queue + notify
      if (!navigator.onLine) {
        try {
          await enqueue({
            kind: "VISIT_COMPLETE",
            payload: { visitId: id, ...body },
            visitId: id,
          });
          setQueuedForSync(true);
          window.setTimeout(
            () => router.replace(`/f/visits/${id}`),
            800,
          );
          return;
        } catch (qerr) {
          setError(
            qerr instanceof Error ? qerr.message : String(qerr),
          );
          return;
        }
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[#002A4D]">{t("title")}</h1>
      <div className="flex items-start justify-between gap-2">
        <StepNum active={step >= 1} n={1} label={t("step1")} />
        <StepNum active={step >= 2} n={2} label={t("step2")} />
        <StepNum active={step >= 3} n={3} label={t("step3")} />
        <StepNum active={step >= 4} n={4} label={t("step4")} />
        <StepNum active={step >= 5} n={5} label={t("step5")} />
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <FormField label={t("findings")} required>
            <Textarea
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              placeholder={t("findingsPlaceholder")}
              rows={5}
            />
          </FormField>
          {suggestions.length > 0 && (
            <FormField label={t("suggestedConsumables")}>
              <div className="flex flex-col gap-2">
                <p className="text-xs text-[#737373]">{t("suggestedHint")}</p>
                <ul className="flex flex-col gap-1">
                  {suggestions.map((s) => {
                    const key = suggestionKey(s);
                    const checked = selectedSuggestionKeys.has(key);
                    const label =
                      s.action === "REPLACE"
                        ? t("actionReplace")
                        : t("actionClean");
                    const overdue = s.daysUntilDue < 0;
                    return (
                      <li
                        key={key}
                        className="flex items-start gap-2 rounded-md border border-[#e5e5e5] p-2"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSuggestion(key)}
                          className="mt-1"
                        />
                        <div className="flex flex-col text-xs">
                          <span className="font-semibold">
                            {s.nameVi}{" "}
                            <span className="text-[var(--brand-blue-600)]">
                              [{label}]
                            </span>
                          </span>
                          <span className="text-[#737373]">
                            {s.sku} · {t("cycleEvery")} {s.cycleMonths}
                            {t("monthsShort")} ·{" "}
                            {overdue
                              ? t("overdueBy", { days: -s.daysUntilDue })
                              : t("dueIn", { days: s.daysUntilDue })}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </FormField>
          )}
          <FormField label={t("partsReplaced")} hint={t("partsHint")}>
            <Combobox
              value={null}
              onChange={(v) => {
                if (!v) return;
                const item = partsCatalog.find((p) => p.id === v);
                const label = item ? `${pickPartName(item, locale)} (${item.sku})` : v;
                if (!parts.includes(label)) setParts([...parts, label]);
              }}
              onCreate={(typed) => {
                if (!parts.includes(typed)) setParts([...parts, typed]);
              }}
              allowCreate
              createLabel={(q) => t("partsAddCustom", { name: q })}
              options={partsCatalog.map((p) => ({
                value: p.id,
                label: `${pickPartName(p, locale)} (${p.sku})`,
                description:
                  p.kind === "CONSUMABLE"
                    ? t("partKindConsumable")
                    : t("partKindAccessory"),
              }))}
              placeholder={
                partsCatalogQuery.isLoading
                  ? tc("loading")
                  : t("partsPickPlaceholder")
              }
              searchPlaceholder={t("partsSearchPlaceholder")}
              emptyText={t("partsEmpty")}
              allowClear={false}
              searchable
            />
          </FormField>
          {parts.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {parts.map((p) => (
                <li
                  key={p}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-blue-50)] px-2 py-1 text-xs text-[var(--brand-blue-700)]"
                >
                  {p}
                  <button
                    type="button"
                    onClick={() => setParts(parts.filter((x) => x !== p))}
                    className="hover:text-red-600"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-[#737373]">{t("photosHint")}</p>
          {/*
            Hidden multi-file input. The auto-open effect above clicks it
            once on first arrival; the visible button below re-triggers it
            whenever the picker was dismissed or the technician wants to
            add more shots later.
          */}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoInput}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
          <Button
            type="button"
            variant="secondary"
            fullWidth
            disabled={uploading}
            onClick={() => photoInputRef.current?.click()}
          >
            {photos.length === 0 && pendingPhotos.length === 0
              ? tm("actions.addPhoto")
              : t("addMorePhotos")}
          </Button>
          {uploading && (
            <p className="text-xs text-[#737373]">{t("uploading")}</p>
          )}

          {/*
            Pending (not-yet-uploaded) shots — vertical stack of larger
            thumbnails so the technician can review the framing before
            committing bandwidth on a slow site link. Tapping the row or
            the × removes it without ever hitting the server.
          */}
          {pendingPhotos.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-[#525252]">
                {t("photosPendingTitle", { count: pendingPhotos.length })}
              </p>
              <ul className="flex flex-col gap-2">
                {pendingPhotos.map((p) => (
                  <li
                    key={p.localId}
                    className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, no optimisation needed */}
                    <img
                      src={p.previewUrl}
                      alt=""
                      className="size-20 shrink-0 rounded-md object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#262626]">
                        {p.file.name || t("photosUntitled")}
                      </p>
                      <p className="text-xs text-amber-700">
                        {t("photosPendingBadge")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingPhoto(p.localId)}
                      disabled={uploading}
                      aria-label={t("removePhoto")}
                      className="rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white hover:bg-black disabled:opacity-50"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                onClick={uploadPendingPhotos}
                disabled={uploading}
                isLoading={uploading}
                fullWidth
              >
                {t("photosConfirmUpload", { count: pendingPhotos.length })}
              </Button>
            </div>
          )}

          {/* Already-uploaded shots — same vertical layout for visual
              consistency with the pending list. */}
          {photos.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-[#525252]">
                {t("photosUploadedTitle", { count: photos.length })}
              </p>
              <ul className="flex flex-col gap-2">
                {photos.map((p, i) => (
                  <li
                    key={p.storageKey}
                    className="flex items-center gap-3 rounded-md border border-[#e5e5e5] bg-white p-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, no optimisation needed */}
                    <img
                      src={p.url}
                      alt=""
                      className="size-20 shrink-0 rounded-md object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-emerald-700">
                        {t("photosUploadedBadge")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPhotos(photos.filter((_, idx) => idx !== i))
                      }
                      aria-label={t("removePhoto")}
                      className="rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white hover:bg-black"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-[#737373]">{t("signatureHint")}</p>
          <label className="block">
            <span className="sr-only">{t("signature")}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleSignatureInput}
              className="block w-full text-sm"
            />
          </label>
          {uploading && <p className="text-xs text-[#737373]">{t("uploading")}</p>}
          {signature && (
            <div className="relative aspect-[2/1] overflow-hidden rounded-md border border-[#e5e5e5] bg-[#fafafa]">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, no optimisation needed */}
              <img src={signature.url} alt="" className="size-full object-contain" />
              <button
                type="button"
                onClick={() => setSignature(null)}
                className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white"
              >
                {t("removePhoto")}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-[#737373]">{t("collectedHint")}</p>
          {/* chargedAmount = 청구 금액. 사전 예상값 prefill, 기사가 현장에서 수정 가능. */}
          <FormField label={t("chargedAmount")}>
            <NumberInput
              value={chargedAmount}
              onChange={setChargedAmountOverride}
              min={0}
              allowDecimal={false}
            />
          </FormField>
          {expectedAmount > 0 && chargedAmount !== expectedAmount && (
            <>
              <p className="text-xs text-amber-700">
                {t("chargeOverrideHint", {
                  original: expectedAmount.toLocaleString(),
                })}
              </p>
              <FormField
                label={t("chargeOverrideReason")}
                required
                htmlFor="charge-override-reason"
              >
                <Textarea
                  id="charge-override-reason"
                  value={chargeOverrideReason}
                  onChange={(e) => setChargeOverrideReason(e.target.value)}
                  rows={2}
                  placeholder={t("chargeOverrideReasonPlaceholder")}
                />
              </FormField>
            </>
          )}
          <FormField label={t("collected")}>
            <NumberInput
              value={collectedAmount}
              onChange={setCollectedAmountOverride}
              min={0}
              allowDecimal={false}
            />
          </FormField>
          {collectedAmount > 0 && (
            <FormField label={t("paymentMethod")}>
              <Combobox
                value={paymentMethod}
                onChange={(v) => setPaymentMethod(v ?? "CASH")}
                options={[
                  { value: "CASH", label: "CASH" },
                  { value: "BANK_TRANSFER", label: "BANK_TRANSFER" },
                  { value: "CARD", label: "CARD" },
                  { value: "OTHER", label: "OTHER" },
                ]}
                allowClear={false}
                searchable={false}
              />
            </FormField>
          )}
          {chargedAmount > 0 && (
            <p className="text-xs text-[#737373]">
              Charged: {chargedAmount.toLocaleString()} VND
              {chargedAmount !== collectedAmount &&
                ` · Diff: ${(chargedAmount - collectedAmount).toLocaleString()} VND`}
            </p>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[#002A4D]">{t("review")}</h2>
          <ReviewRow label={t("findings")} value={findings || "—"} multi />
          <ReviewRow
            label={t("partsReplaced")}
            value={parts.length ? parts.join(", ") : "—"}
          />
          <ReviewRow
            label={t("step2")}
            value={photos.length > 0 ? `${photos.length} photo(s)` : "—"}
          />
          <ReviewRow
            label={t("signature")}
            value={signature ? "OK" : "Missing"}
          />
          <ReviewRow
            label={t("collected")}
            value={
              collectedAmount > 0
                ? `${collectedAmount.toLocaleString()} VND (${paymentMethod})`
                : "—"
            }
          />
        </div>
      )}

      {error && (
        <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}
      {queuedForSync && (
        <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-700">
          {t("queuedForSync")}
        </p>
      )}

      <div className="flex gap-2">
        {step > 1 && (
          <Button variant="ghost" onClick={() => setStep(step - 1)} fullWidth>
            {t("back")}
          </Button>
        )}
        {step < 5 ? (
          <Button
            onClick={() => {
              // Block step 2 → 3 while photos are picked-but-not-uploaded.
              // Otherwise the chosen shots would be discarded silently.
              if (step === 2 && pendingPhotos.length > 0) {
                setError(t("photosPendingBlock"));
                return;
              }
              setError(null);
              setStep(step + 1);
            }}
            fullWidth
          >
            {t("next")}
          </Button>
        ) : (
          <Button onClick={submit} disabled={submitting} fullWidth>
            {submitting ? t("submitting") : t("submit")}
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  multi,
}: Readonly<{ label: string; value: string; multi?: boolean }>) {
  return (
    <div className="rounded-md border border-[#e5e5e5] bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-[#737373]">{label}</p>
      <p
        className={
          multi
            ? "mt-1 whitespace-pre-line text-sm text-[#111]"
            : "mt-1 text-sm text-[#111]"
        }
      >
        {value}
      </p>
    </div>
  );
}
