"use client";

import type { ReactNode } from "react";
import { Button } from "./button";
import { cn } from "@/lib/cn";
import { useHotkeys, type HotkeyMap } from "@/lib/hooks/use-hotkeys";

type ActionVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";

export interface ActionBarItem {
  /** Stable identity for React keys. */
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: ActionVariant;
  disabled?: boolean;
  /** Keyboard shortcut, e.g. "F2", "F5", "Esc". Bound while the bar is mounted. */
  hotkey?: string;
}

/** "Esc" → the KeyboardEvent.key value "Escape"; function keys pass through. */
function normalizeHotkey(h: string): string {
  return h.toLowerCase() === "esc" ? "Escape" : h;
}

/**
 * Bottom function-button bar (desktop-ERP style). Renders the actions as
 * buttons with their shortcut hint and binds the shortcuts globally.
 */
export function ActionBar({
  items,
  className,
}: {
  items: ActionBarItem[];
  className?: string;
}) {
  const hotkeyMap: HotkeyMap = {};
  for (const it of items) {
    if (it.hotkey && !it.disabled) {
      hotkeyMap[normalizeHotkey(it.hotkey)] = () => it.onClick();
    }
  }
  useHotkeys(hotkeyMap);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-t border-[#e5e5e5] bg-white px-4 py-3",
        className,
      )}
    >
      {items.map((it) => (
        <Button
          key={it.key}
          variant={it.variant ?? "secondary"}
          onClick={it.onClick}
          disabled={it.disabled}
          className="shrink-0 gap-1.5"
        >
          {it.icon}
          <span>{it.label}</span>
          {it.hotkey && (
            <kbd className="ml-0.5 rounded border border-current/30 bg-current/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none">
              {it.hotkey}
            </kbd>
          )}
        </Button>
      ))}
    </div>
  );
}
