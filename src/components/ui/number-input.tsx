"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { groupThousands } from "@/lib/format";

/**
 * Standard numeric input used across the app for settings, schedule windows,
 * counts, and similar single-number fields.
 *
 * The native `<input type="number">` plus the typical
 * `onChange={(e) => setValue(Number(e.target.value) || 1)}` recipe has a
 * known UX problem: the user can't delete the last digit, because as soon
 * as the field is empty `parseInt`/`Number` returns NaN, the `|| fallback`
 * snaps it back to the fallback, the controlled input re-renders with the
 * fallback, and the cursor is stuck on a single character. Reported by
 * the user on the weather sync "수집 기간" control (2026-05-25).
 *
 * The fix is to decouple the visible string from the committed number:
 *
 *   - Display state is a string so the user can freely type / delete.
 *   - The parent's numeric `value` is only updated when the field holds
 *     a valid number — empty + partial input are kept local.
 *   - On blur (or when the field is otherwise committed) an empty value
 *     falls back to `fallback` (default 1) and the parent gets that.
 *
 * Project convention going forward: prefer this component for every
 * `type="number"` field. The default fallback is 0; if the input has a
 * `min` that excludes 0 (e.g. `min={1}`), `commit` clamps the fallback
 * up to that min, so callers usually don't have to think about it.
 */
interface Props {
  value: number;
  onChange: (value: number) => void;
  /**
   * Value committed when the user leaves the field empty. Defaults to 0
   * per the project-wide convention. If `min` excludes the fallback,
   * `commit` clamps it up to `min`.
   */
  fallback?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  id?: string;
  /**
   * Pass `true` to allow decimals; default is integer-only.
   */
  allowDecimal?: boolean;
  /**
   * Visual variant.
   *
   *   - `"default"` (or omitted) — plain integer / count input, left-
   *     aligned. Uses the same border, focus ring and hover accent as
   *     the standard `<Input>` component so callsites don't have to
   *     pass className every time.
   *   - `"money"` — right-aligned + subtle "editable amount" cue
   *     (thicker border, brand-blue hover) meant for VND unit
   *     prices, deposits, monthly fees. Defaults `step` to 1000 so
   *     the up/down keys move by the smallest bill denomination.
   */
  variant?: "default" | "money";
}

export function NumberInput({
  value,
  onChange,
  fallback = 0,
  min,
  max,
  step,
  disabled,
  className,
  ariaLabel,
  id,
  allowDecimal = false,
  variant = "default",
}: Readonly<Props>) {
  // Money fields step by 1000 VND (smallest bill denomination) unless
  // the caller explicitly overrode step.
  const effectiveStep = step ?? (variant === "money" ? 1000 : undefined);
  const isMoney = variant === "money";
  // Money shows dot-grouped digits (1.500.000); default shows the raw
  // number. `render` maps a committed number to its display string.
  const render = useCallback(
    (n: number): string =>
      isMoney ? groupThousands(String(Math.trunc(Math.abs(n)))) : String(n),
    [isMoney],
  );
  // Keep a string copy of what the user is typing so empty / partial input
  // can survive between renders.
  const [draft, setDraft] = useState<string>(render(value));
  const lastCommittedRef = useRef<number>(value);

  // If the parent changes `value` (e.g. data refetch), resync the draft —
  // but only when the parent's number is different from what WE last
  // emitted, otherwise our own commit would clobber the user's in-flight
  // typing.
  useEffect(() => {
    if (value !== lastCommittedRef.current) {
      setDraft(render(value));
      lastCommittedRef.current = value;
    }
  }, [value, render]);

  const clamp = (n: number): number => {
    let c = n;
    if (typeof min === "number" && c < min) c = min;
    if (typeof max === "number" && c > max) c = max;
    return c;
  };

  // Parse the field's raw string to a number. Money strips the dot group
  // separators first (1.500.000 → 1500000); other variants parse directly.
  const parse = (raw: string): number => {
    if (isMoney) return Number.parseInt(raw.replace(/\D/g, ""), 10);
    return allowDecimal ? Number(raw) : Number.parseInt(raw, 10);
  };

  const commit = (raw: string) => {
    const emit = (n: number) => {
      const next = clamp(n);
      setDraft(render(next));
      lastCommittedRef.current = next;
      onChange(next);
    };
    if (raw.trim() === "") {
      // Empty input → fall back, then clamp to the input's min/max
      // (e.g. fallback=0 but min=1 commits as 1).
      emit(fallback);
      return;
    }
    const parsed = parse(raw);
    emit(Number.isFinite(parsed) ? parsed : fallback);
  };

  const inputEl = (
    <input
      id={id}
      // Money is a text field so the dot group separators (1.500.000) can
      // be shown while typing — `type="number"` rejects them. inputMode
      // keeps the numeric keypad on mobile.
      type={isMoney ? "text" : "number"}
      inputMode={isMoney ? "numeric" : undefined}
      min={isMoney ? undefined : min}
      max={isMoney ? undefined : max}
      step={isMoney ? undefined : effectiveStep}
      disabled={disabled}
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw.trim() === "") {
          // Allow the field to be empty during editing.
          setDraft(raw);
          return;
        }
        const parsed = parse(raw);
        if (!Number.isFinite(parsed)) return;
        // For money, re-group as the user types so the separators track
        // the digits; other variants echo the raw keystrokes.
        setDraft(isMoney ? render(parsed) : raw);
        // Live-update the parent only for valid numbers; clamping waits
        // for blur so the user can briefly overshoot while typing.
        lastCommittedRef.current = parsed;
        onChange(parsed);
      }}
      onBlur={(e) => commit(e.target.value)}
      className={cn(
        // Baseline — matches `<Input>` (see components/ui/input.tsx) so
        // the field reads as editable even without a caller-provided
        // className. Hover/focus accents flag "you can type here".
        "h-10 w-full rounded-lg border-2 bg-white px-3 text-sm text-[#111111] outline-none",
        "hover:border-[var(--brand-blue-300)]",
        "focus:border-[var(--brand-blue-500)] focus:ring-2 focus:ring-[var(--brand-blue-200)]",
        "disabled:cursor-not-allowed disabled:bg-[#fafafa] disabled:text-[#737373]",
        variant === "money"
          ? "border-[#e5e5e5] pr-8 text-right tabular-nums"
          : "border-[#e5e5e5]",
        className,
      )}
    />
  );
  if (variant !== "money") return inputEl;
  // Money variant — right-aligned amount with a ₫ suffix so the user
  // never has to guess the currency. Wrap in a relative container so
  // the suffix floats over the input's padding.
  return (
    <div className="relative w-full">
      {inputEl}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[#737373]"
      >
        ₫
      </span>
    </div>
  );
}
