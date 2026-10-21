"use client";

/**
 * 출금일 — the day of the month the contract's fee is collected, which is
 * also when each monthly bill falls due. Office staff may change it on a live
 * contract (it moves when the customer pays, not what they agreed to).
 *
 * Kept as a string while typing rather than <NumberInput>: an empty field is
 * meaningful here (back to the default 10th), and a string state has no
 * can't-clear-the-last-digit problem to work around.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApi, ApiClientError } from "@/lib/api/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function BillingDayEditor({
  contractId,
  billingDay,
  onSaved,
}: Readonly<{
  contractId: string;
  billingDay: number | null;
  onSaved: () => void | Promise<void>;
}>) {
  const t = useTranslations("contracts");
  const tc = useTranslations("common");
  const api = useApi();
  const [draft, setDraft] = useState(billingDay === null ? "" : String(billingDay));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const value = draft.trim() === "" ? null : Number(draft);
    if (value !== null && !(Number.isInteger(value) && value >= 1 && value <= 31)) {
      setError(t("billingDayInvalid"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/contracts/${contractId}`, { billingDay: value });
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4">
      <label htmlFor="contract-billing-day" className="text-xs font-medium uppercase tracking-wider text-[#737373]">
        {t("billingDay")}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id="contract-billing-day"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 2))}
          placeholder="10"
          className="w-20"
        />
        <Button size="sm" onClick={save} isLoading={saving}>
          {tc("save")}
        </Button>
      </div>
      <p className="text-xs text-[#737373]">{t("billingDayHint")}</p>
      {error && (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
