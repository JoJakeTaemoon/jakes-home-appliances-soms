"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useApi } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function suggestionKey(s: { consumableId: string; action: string }): string {
  return `${s.consumableId}:${s.action}`;
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
  const router = useRouter();
  const api = useApi();
  const { accessToken } = useAuth();

  const [step, setStep] = useState(1);
  const [findings, setFindings] = useState("");
  const [partInput, setPartInput] = useState("");
  const [parts, setParts] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionResp[]>([]);
  const [selectedSuggestionKeys, setSelectedSuggestionKeys] = useState<Set<string>>(
    new Set(),
  );
  const [photos, setPhotos] = useState<PhotoState[]>([]);
  const [signature, setSignature] = useState<PhotoState | null>(null);
  const [collectedAmount, setCollectedAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [expectedAmount, setExpectedAmount] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedForSync, setQueuedForSync] = useState(false);
  const online = useOnlineStatus();

  // Load expectedAmount so the cash step prefills
  const reload = useCallback(async () => {
    try {
      const res = await api.get<{ expectedAmount: string | null }>(
        `/api/mobile/visits/${id}`,
      );
      const exp = res.data.expectedAmount
        ? Number(res.data.expectedAmount)
        : 0;
      setExpectedAmount(exp);
      setCollectedAmount(exp);
    } catch {
      // ignore
    }
  }, [api, id]);
  useEffect(() => {
    if (!id) return;
    reload().catch(() => undefined);
  }, [id, reload]);

  // Fetch consumable recommendations once on mount. Default-select every
  // suggestion — the technician unchecks what they didn't actually do.
  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const res = await api.get<{ recommendations: SuggestionResp[] }>(
          `/api/mobile/visits/${id}/suggest-consumables`,
        );
        const recs = res.data.recommendations ?? [];
        setSuggestions(recs);
        setSelectedSuggestionKeys(new Set(recs.map((r) => suggestionKey(r))));
      } catch {
        // Recommendations are best-effort prefill — silent fail is OK.
      }
    })();
  }, [id, api]);

  const toggleSuggestion = (key: string) => {
    setSelectedSuggestionKeys((prev) => {
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

  const handlePhotoInput = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const resp = await upload(file);
      if (resp) {
        setPhotos((prev) => [
          ...prev,
          { ...resp, takenAt: new Date().toISOString() },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

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

  const addPart = () => {
    const v = partInput.trim();
    if (!v) return;
    if (parts.includes(v)) return;
    setParts([...parts, v]);
    setPartInput("");
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
        window.setTimeout(() => router.replace(`/mobile/visits/${id}`), 800);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    try {
      await api.post(`/api/mobile/visits/${id}/complete`, body);
      router.replace(`/mobile/visits/${id}`);
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
            () => router.replace(`/mobile/visits/${id}`),
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

  const StepNum = ({ n, label }: Readonly<{ n: number; label: string }>) => (
    <div className="flex flex-col items-center">
      <span
        className={
          step >= n
            ? "flex size-7 items-center justify-center rounded-full bg-[var(--brand-blue-500)] text-xs font-semibold text-white"
            : "flex size-7 items-center justify-center rounded-full bg-[#e5e5e5] text-xs font-semibold text-[#737373]"
        }
      >
        {n}
      </span>
      <span className="mt-1 text-[10px] text-[#737373]">{label}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-[#002A4D]">{t("title")}</h1>
      <div className="flex items-start justify-between gap-2">
        <StepNum n={1} label={t("step1")} />
        <StepNum n={2} label={t("step2")} />
        <StepNum n={3} label={t("step3")} />
        <StepNum n={4} label={t("step4")} />
        <StepNum n={5} label={t("step5")} />
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
          <FormField label={t("partsReplaced")}>
            <div className="flex gap-2">
              <Input
                value={partInput}
                onChange={(e) => setPartInput(e.target.value)}
                placeholder={t("partsAddPlaceholder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPart();
                  }
                }}
              />
              <Button onClick={addPart} variant="secondary">
                +
              </Button>
            </div>
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
          <label className="block">
            <span className="sr-only">{tm("actions.addPhoto")}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoInput}
              className="block w-full text-sm"
            />
          </label>
          {uploading && <p className="text-xs text-[#737373]">{t("uploading")}</p>}
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <li
                key={p.storageKey}
                className="relative aspect-square overflow-hidden rounded-md border border-[#e5e5e5] bg-[#fafafa]"
              >
                <img src={p.url} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white"
                >
                  {t("removePhoto")}
                </button>
              </li>
            ))}
          </ul>
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
          <FormField label={t("collected")}>
            <NumberInput
              value={collectedAmount}
              onChange={setCollectedAmount}
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
          {expectedAmount > 0 && (
            <p className="text-xs text-[#737373]">
              Expected: {expectedAmount.toLocaleString()} VND
              {expectedAmount !== collectedAmount &&
                ` · Diff: ${(expectedAmount - collectedAmount).toLocaleString()} VND`}
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
          <Button onClick={() => setStep(step + 1)} fullWidth>
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
