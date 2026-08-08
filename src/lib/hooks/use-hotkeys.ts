"use client";

import { useEffect, useRef } from "react";

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

/**
 * Bind global keyboard shortcuts (desktop-ERP style F-keys + Esc). Keys use the
 * `KeyboardEvent.key` value — "F2", "F5", "Escape", etc.
 *
 * By default, shortcuts are ignored while the user is typing in an input /
 * textarea / select / contenteditable, EXCEPT the keys in `allowInInputs`
 * (Escape and the function keys, so F5=저장 still works from inside a field).
 */
export function useHotkeys(
  map: HotkeyMap,
  opts?: { enabled?: boolean; allowInInputs?: string[] },
) {
  const mapRef = useRef(map);
  // Keep the latest handler map without re-binding the listener every render.
  useEffect(() => {
    mapRef.current = map;
  });
  const enabled = opts?.enabled ?? true;
  const allowInInputs = opts?.allowInInputs;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const fn = mapRef.current[e.key];
      if (!fn) return;
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      // Function keys and Escape stay live even inside a field; plain-letter
      // shortcuts (rare here) are suppressed while typing.
      const allow = allowInInputs ?? ["Escape", ...FUNCTION_KEYS];
      if (inField && !allow.includes(e.key)) return;
      e.preventDefault();
      fn(e);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // allowInInputs is read via closure; callers pass a stable array or accept
    // a rebind. enabled toggles the listener.
  }, [enabled, allowInInputs]);
}

const FUNCTION_KEYS = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"];
