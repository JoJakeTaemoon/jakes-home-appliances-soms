"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApi, ApiClientError } from "@/lib/api/client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { cn } from "@/lib/cn";

type Action = "RECEIVE" | "ISSUE" | "ADJUST";

interface Props {
  open: boolean;
  onClose: () => void;
  itemKind: "MODEL" | "CONSUMABLE";
  itemId: string;
  itemLabel: string;
  currentStock: number;
  /** Called after a successful move so the caller can refresh its list. */
  onDone?: () => void;
}

/**
 * 입고 / 출고 / 조정 modal — the manual side of the inventory ledger. Posts to
 * `/api/inventory/moves`; RECEIVE/ISSUE take an amount, ADJUST takes a target.
 */
export function StockAdjustModal({
  open,
  onClose,
  itemKind,
  itemId,
  itemLabel,
  currentStock,
  onDone,
}: Readonly<Props>) {
  const t = useTranslations("admin.products");
  const api = useApi();
  const [action, setAction] = useState<Action>("RECEIVE");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ACTIONS: { value: Action; label: string }[] = [
    { value: "RECEIVE", label: t("stockReceive") },
    { value: "ISSUE", label: t("stockIssue") },
    { value: "ADJUST", label: t("stockAdjust") },
  ];
  const qtyLabel =
    action === "ADJUST" ? t("stockQtyTarget") : action === "ISSUE" ? t("stockQtyIssue") : t("stockQtyReceive");
  const qtyNum = Number(qty);
  // RECEIVE/ISSUE need a positive integer; ADJUST target may be any integer
  // (0/negative allowed — the ledger permits deficits).
  const qtyValid =
    qty.trim() !== "" &&
    Number.isInteger(qtyNum) &&
    (action === "ADJUST" || qtyNum > 0);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.post("/api/inventory/moves", {
        itemKind,
        itemId,
        action,
        quantity: Number(qty),
        note: note.trim() || undefined,
      });
      setQty("");
      setNote("");
      onDone?.();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiClientError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("stockAdjustTitle")}>
      <div className="flex flex-col gap-4">
        <div className="text-sm text-[#586a7c]">
          <span className="font-medium text-[#111]">{itemLabel}</span>
          <span className="ml-2">
            {t("stockCurrent")}: <b className="tabular-nums">{currentStock.toLocaleString()}</b>
          </span>
        </div>

        <div className="flex gap-2">
          {ACTIONS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => setAction(a.value)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm font-medium",
                action === a.value
                  ? "border-[var(--brand-blue,#1f6feb)] bg-[var(--brand-blue-50,#e8f1fd)] text-[var(--brand-blue,#1657c8)]"
                  : "border-[#e5e5e5] bg-white text-[#586a7c]",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>

        <FormField label={qtyLabel} required>
          <Input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="numeric"
            placeholder="0"
            autoFocus
          />
        </FormField>
        <FormField label={t("stockNote")}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </FormField>

        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} isLoading={busy} disabled={!qtyValid}>
            {t("save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
