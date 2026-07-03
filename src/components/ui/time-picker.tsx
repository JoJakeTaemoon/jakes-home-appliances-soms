"use client";

/**
 * Custom time picker — pair of Comboboxes for hour (00-23) and minute
 * (00, 10, 20, 30, 40, 50). Replaces `<input type="time">` because the
 * native control:
 *   - Honours the browser's OS locale, not the app locale, so a
 *     Korean-app user with a VN-locale OS sees the picker in VN.
 *   - Shows AM/PM in some locales/browsers with no HTML flag to force
 *     24-hour.
 *   - Ignores `step` unless the user opens the built-in picker UI (typed
 *     values can be any minute).
 *
 * The Combobox pair sidesteps all three: the values are literally the
 * only options, the UI is our own Combobox (already locale-aware for
 * search/empty/etc), and everything renders as `HH:mm`.
 *
 * Value is a plain `HH:mm` string. Empty string represents "no value".
 */

import { useMemo } from "react";
import { Combobox } from "@/components/ui/combobox";

/** The 10-minute step is fixed by the office's booking rule. */
const MINUTE_OPTIONS = ["00", "10", "20", "30", "40", "50"] as const;

interface Props {
  value: string; // "HH:mm" or ""
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Optional aria label so screen readers announce a purpose. */
  ariaLabel?: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function TimePicker({ value, onChange, disabled, ariaLabel }: Readonly<Props>) {
  const [hh, mm] = useMemo(() => {
    if (!value) return ["", ""] as const;
    const [h, m] = value.split(":");
    return [h ?? "", m ?? ""] as const;
  }, [value]);

  const hourOptions = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        value: pad2(i),
        label: pad2(i),
      })),
    [],
  );
  const minuteOptions = useMemo(
    () => MINUTE_OPTIONS.map((m) => ({ value: m, label: m })),
    [],
  );

  const write = (nextHh: string, nextMm: string) => {
    if (!nextHh && !nextMm) {
      onChange("");
    } else {
      onChange(`${nextHh || "00"}:${nextMm || "00"}`);
    }
  };

  return (
    <div className="flex items-center gap-1.5" aria-label={ariaLabel}>
      <div className="w-20">
        <Combobox
          value={hh || null}
          onChange={(v) => write(v ?? "", mm)}
          options={hourOptions}
          searchable={false}
          allowClear={false}
          disabled={disabled}
          placeholder="00"
          minDropdownWidth={140}
        />
      </div>
      <span aria-hidden="true" className="text-[#525252]">:</span>
      <div className="w-20">
        <Combobox
          value={mm || null}
          onChange={(v) => write(hh, v ?? "")}
          options={minuteOptions}
          searchable={false}
          allowClear={false}
          disabled={disabled}
          placeholder="00"
          minDropdownWidth={140}
        />
      </div>
    </div>
  );
}

/**
 * Round any incoming `HH:mm` string down to the nearest 10-minute step
 * so a value pasted / restored from storage stays picker-friendly.
 * Non-parseable input yields an empty string.
 */
export function normalizeToTenMinuteStep(value: string): string {
  if (!value) return "";
  const [h, m] = value.split(":");
  const hh = Number(h);
  const mmRaw = Number(m);
  if (!Number.isFinite(hh) || !Number.isFinite(mmRaw)) return "";
  const clampedHh = Math.min(23, Math.max(0, Math.floor(hh)));
  const clampedMm = Math.min(50, Math.max(0, Math.floor(mmRaw / 10) * 10));
  return `${pad2(clampedHh)}:${pad2(clampedMm)}`;
}
