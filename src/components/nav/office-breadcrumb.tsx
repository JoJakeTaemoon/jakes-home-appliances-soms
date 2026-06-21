"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useBreadcrumbOverrides } from "@/lib/nav/breadcrumb-context";
import {
  computeOfficeCrumbs,
  type Crumb,
} from "@/lib/nav/office-route-map";

/**
 * Header strip shown above every office page's main content. Renders a
 * full breadcrumb trail (clickable links to each ancestor) and — from
 * depth 2 onward — a back button pointing at the parent route.
 *
 * Returns `null` for the bare `/o/[locale]` landing or for any route
 * the map doesn't cover (defensive fallback so unrouted experiments
 * don't crash the layout).
 */
export function OfficeBreadcrumb() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const overrides = useBreadcrumbOverrides();
  const crumbs = computeOfficeCrumbs(pathname);

  if (!crumbs || crumbs.length <= 1) return null;

  const lastIdx = crumbs.length - 1;
  // depth 0 = home only (already returned), depth 1 = home + 1 segment
  // (e.g. /customers), depth 2+ = at least one ancestor below "home".
  const parent: Crumb | null =
    crumbs.length >= 3 ? crumbs[lastIdx - 1] : null;

  // Detail pages can replace a `[id]` crumb's static label ("상세") with
  // the resolved entity name via `<BreadcrumbLabel />`. Keys are the
  // crumb's own href so the same pattern reuses across customer / contract
  // / visit / etc.
  const labelFor = (c: Crumb): string => {
    if (c.isDynamic) {
      const override = overrides.get(c.href);
      if (override) return override;
    }
    return t(c.labelKey);
  };

  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 flex flex-wrap items-center gap-2"
    >
      {parent && (
        <Link
          href={parent.href as "/o"}
          className="inline-flex items-center gap-1 rounded-md border border-[#e5e5e5] bg-white px-2.5 py-1 text-xs font-medium text-[#525252] transition-colors hover:bg-[#f5f5f5] hover:text-[#171717]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t("back")}
        </Link>
      )}
      <ol className="flex flex-wrap items-center gap-1 text-xs text-[#737373]">
        {crumbs.map((c, i) => {
          const isLast = i === lastIdx;
          return (
            <li key={c.href} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight
                  className="h-3 w-3 text-[#a3a3a3]"
                  aria-hidden="true"
                />
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  className="font-medium text-[#262626]"
                >
                  {labelFor(c)}
                </span>
              ) : (
                <Link
                  href={c.href as "/o"}
                  className="rounded-sm hover:text-[#262626] hover:underline"
                >
                  {labelFor(c)}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
