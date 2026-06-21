"use client";

/**
 * Breadcrumb label override store.
 *
 * Detail pages (e.g. `/o/customers/[id]`) fetch the entity row anyway,
 * so they can hand the resolved name (`"Nguyễn Thị Lan"`) to the
 * breadcrumb instead of letting it fall back to the static i18n label
 * (`nav.detail` → "상세"). Pages register the label by rendering
 * `<BreadcrumbLabel value={...} />` at the top of their tree.
 *
 * One store, keyed by the locale-less canonical `pathname` of the
 * dynamic segment (e.g. `/o/customers/cm123abc`). The breadcrumb
 * component reads it during render — empty map = static labels only,
 * so nothing breaks when a detail page hasn't been wired up yet.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "@/i18n/navigation";

interface CrumbStore {
  /** Pathname → resolved label. Pathname is the locale-less `usePathname()`. */
  overrides: ReadonlyMap<string, string>;
  /** Register an override; pass `null` to clear it. */
  set: (pathname: string, label: string | null) => void;
}

const Ctx = createContext<CrumbStore | null>(null);

export function BreadcrumbProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [map, setMap] = useState<Map<string, string>>(() => new Map());

  // `set` MUST be stable across renders. If it changed when `map`
  // changed, every detail page's `useEffect` would re-fire on the
  // resulting context update, call set() again, and infinite-loop —
  // dedup notwithstanding, because the effect's cleanup runs first
  // (deleting the override) and the next effect re-adds it.
  const set = useCallback((pathname: string, label: string | null) => {
    setMap((prev) => {
      if (label === null) {
        if (!prev.has(pathname)) return prev;
        const next = new Map(prev);
        next.delete(pathname);
        return next;
      }
      if (prev.get(pathname) === label) return prev;
      const next = new Map(prev);
      next.set(pathname, label);
      return next;
    });
  }, []);

  const value = useMemo<CrumbStore>(
    () => ({ overrides: map, set }),
    [map, set],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBreadcrumbOverrides(): ReadonlyMap<string, string> {
  const ctx = useContext(Ctx);
  return ctx?.overrides ?? EMPTY_MAP;
}

const EMPTY_MAP: ReadonlyMap<string, string> = new Map();

/**
 * Detail-page helper: register `value` as the breadcrumb label for the
 * page's own pathname. `null` skips registration (e.g. while data is
 * still loading). Cleared on unmount.
 *
 * Depends on `set` (stable) — NOT the full ctx object — so this effect
 * only re-runs when the page's own `pathname` or `label` actually
 * changes, not when somebody else's override mutates the store.
 */
function useRegisterLabel(label: string | null) {
  const set = useContext(Ctx)?.set;
  const pathname = usePathname();
  useEffect(() => {
    if (!set) return;
    set(pathname, label);
    return () => set(pathname, null);
  }, [set, pathname, label]);
}

/**
 * Drop-in element that detail pages render anywhere in their tree.
 * Renders nothing — it's just a side-effect host for `useRegisterLabel`.
 *
 *   <BreadcrumbLabel value={customer?.name ?? null} />
 */
export function BreadcrumbLabel({ value }: Readonly<{ value: string | null }>) {
  useRegisterLabel(value);
  return null;
}
