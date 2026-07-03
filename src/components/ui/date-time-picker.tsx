"use client";

/**
 * Custom date+time picker — pairs an ISO date input with our custom
 * TimePicker so every visit-time field looks the same, follows the app
 * locale (not the browser OS locale), stays 24-hour with 10-minute
 * increments, and defaults to 09:00 on new entries.
 *
 * Value is a plain `YYYY-MM-DDTHH:mm` string interpreted as VST wall
 * clock — the same shape a native `<input type="datetime-local">` would
 * produce. Empty string represents "no value". Round-trip helpers live
 * in `@/lib/format`:
 *   - `toVstDateTimeInput(iso)` prepares a UTC instant for display here
 *   - `fromVstDateTimeInput(value)` converts the value back to UTC ISO
 *
 * We keep the browser's native `<input type="date">` for the calendar
 * because that control (a) doesn't have the AM/PM problem, (b) is
 * always ISO on the wire regardless of OS locale, and (c) building a
 * full calendar UI would be scope creep.
 */

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { TimePicker, normalizeToTenMinuteStep } from "./time-picker";
import { DatePicker } from "./date-picker";
import { formatDate } from "@/lib/format";

interface Props {
  value: string; // "YYYY-MM-DDTHH:mm" or ""
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Time to seed when a date is picked with no prior time. Default 09:00. */
  defaultTime?: string;
  /** Show the app-locale-formatted date next to the picker. Default true. */
  showLocaleHint?: boolean;
}

const DEFAULT_TIME = "09:00";

function splitValue(v: string): { date: string; time: string } {
  if (!v) return { date: "", time: "" };
  const [d, t = ""] = v.split("T");
  return { date: d ?? "", time: normalizeToTenMinuteStep(t) };
}

export function DateTimePicker({
  value,
  onChange,
  disabled,
  defaultTime = DEFAULT_TIME,
  showLocaleHint = true,
}: Readonly<Props>) {
  const locale = useLocale();
  // Track the two halves as local state — this keeps the picker
  // responsive while the user is mid-selection (a "date picked, time
  // still empty" state is valid to render but shouldn't propagate as
  // an empty value to the parent, which would clear their state).
  const initial = splitValue(value);
  const [date, setDate] = useState<string>(initial.date);
  const [time, setTime] = useState<string>(initial.time);

  // Reflect external value changes (parent resets the field, or the
  // form was seeded with a different visit).
  useEffect(() => {
    const next = splitValue(value);
    setDate(next.date);
    setTime(next.time);
  }, [value]);

  const push = (nextDate: string, nextTime: string) => {
    if (!nextDate) {
      onChange("");
      return;
    }
    onChange(`${nextDate}T${nextTime || defaultTime}`);
  };

  const onDate = (nextDate: string) => {
    setDate(nextDate);
    // Auto-fill the time to `defaultTime` (09:00) the moment the user
    // picks a date and no time is set — matches the office's "default
    // 9시" rule so they don't have to double-click.
    const nextTime = time || defaultTime;
    if (!time && nextDate) setTime(nextTime);
    push(nextDate, nextTime);
  };

  const onTime = (nextTime: string) => {
    setTime(nextTime);
    push(date, nextTime);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {/*
          Custom DatePicker (no native <input type="date">) so the
          calendar popover follows the app locale on every browser —
          including Firefox, which ignores the `lang` attribute.
        */}
        <div className="w-48">
          <DatePicker
            value={date}
            onChange={onDate}
            disabled={disabled}
            clearable={false}
          />
        </div>
        <TimePicker
          value={time}
          onChange={onTime}
          disabled={disabled}
        />
      </div>
      {showLocaleHint && date && (
        <span className="text-xs text-[#737373]">
          {formatDate(date, locale)}
          {time ? ` · ${time}` : ""}
        </span>
      )}
    </div>
  );
}
