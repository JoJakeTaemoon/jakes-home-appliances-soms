"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useApiMutation } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";

const REASONS = ["NO_SHOW", "UNREACHABLE", "RESCHEDULE_REQUESTED", "SITE_ISSUE", "OTHER"] as const;
type Reason = (typeof REASONS)[number];

/**
 * 「방문 실패 처리」 — lead technician marks the visit FAILED_NO_SHOW
 * (POST /api/mobile/visits/:id/fail). The API takes one free-text `reason`,
 * so the picked reason label and the optional note are joined into it; the
 * office reads it in the technician's language, like every other field note.
 */
export function VisitFailModal({
  visitId,
  open,
  onClose,
  onFailed,
}: Readonly<{ visitId: string; open: boolean; onClose: () => void; onFailed: () => void }>) {
  const t = useTranslations("mobile.fail");
  const tc = useTranslations("common");
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fail = useApiMutation<{ reason: string }>("post", () => `/api/mobile/visits/${visitId}/fail`, {
    invalidate: [`/api/mobile/visits/${visitId}`, "/api/mobile/visits/today", "/api/mobile/visits/upcoming"],
  });

  const submit = () => {
    if (!reason) return;
    const trimmed = note.trim();
    if (reason === "OTHER" && !trimmed) {
      setError(t("noteRequired"));
      return;
    }
    setError(null);
    const label = t(`reasons.${reason}`);
    fail.mutate(
      { reason: (trimmed ? `${label} — ${trimmed}` : label).slice(0, 500) },
      {
        onSuccess: onFailed,
        onError: (err) => setError(err instanceof Error ? err.message : String(err)),
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("title")}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={fail.isPending}>
            {tc("cancel")}
          </Button>
          <Button variant="danger" onClick={submit} disabled={!reason} isLoading={fail.isPending}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-[#737373]">{t("hint")}</p>
        <div role="radiogroup" aria-label={t("reason")} className="flex flex-col gap-2">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => {
                setReason(r);
                setError(null);
              }}
              className={cn(
                "min-h-11 rounded-lg border px-3 py-2 text-left text-sm",
                reason === r
                  ? "border-[var(--brand-blue-500)] bg-[var(--brand-blue-50)] font-medium text-[var(--brand-blue-700)]"
                  : "border-[#e5e5e5] bg-white text-[#262626]",
              )}
            >
              {t(`reasons.${r}`)}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm text-[#525252]" htmlFor="visit-fail-note">
          {t("note")}
          <Textarea
            id="visit-fail-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={400}
            placeholder={t("notePlaceholder")}
          />
        </label>
        {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
