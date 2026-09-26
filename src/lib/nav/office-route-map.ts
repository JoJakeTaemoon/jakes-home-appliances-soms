/**
 * Office-realm route map: pathname → breadcrumb trail.
 *
 * The tree below mirrors `src/app/o/[locale]/(dashboard)/**`. Each node
 * carries an i18n key (resolved under the `nav.*` namespace) and child
 * routes. A `":id"` child matches any dynamic segment that doesn't have
 * an explicit name (e.g. customer id, contract id) — by user decision
 * (2026-06-21) we render a static label like "고객 상세" rather than
 * fetching the entity name.
 *
 * `computeOfficeCrumbs(pathname)` walks the tree and returns the trail
 * for both the breadcrumb component and the back-button parent link.
 * Returns `null` when the path doesn't belong to the office realm so
 * the caller can render nothing.
 */

export type RouteNode = {
  /** i18n key under the `nav.*` namespace */
  labelKey: string;
  children?: Record<string, RouteNode>;
  /**
   * A label in the trail with no page of its own (e.g. `/o/admin` groups the
   * admin screens but has no `page.tsx`). Rendered as plain text, and the
   * back button skips it — as a link it 404s, both on click and on Next's
   * automatic prefetch of visible links.
   */
  grouping?: true;
};

const TREE: RouteNode = {
  labelKey: "home",
  children: {
    dashboard: { labelKey: "dashboard" },
    customers: {
      labelKey: "customers",
      children: {
        new: { labelKey: "new" },
        merge: { labelKey: "merge" },
        ":id": {
          labelKey: "detail",
          children: {
            edit: { labelKey: "edit" },
          },
        },
      },
    },
    contracts: {
      labelKey: "contracts",
      children: {
        new: { labelKey: "new" },
        ":id": {
          labelKey: "detail",
          children: {
            amend: { labelKey: "amend" },
            renew: { labelKey: "renew" },
          },
        },
      },
    },
    visits: {
      labelKey: "visits",
      children: {
        new: { labelKey: "new" },
        print: { labelKey: "visitsPrint" },
        map: { labelKey: "map" },
        ":id": { labelKey: "detail" },
      },
    },
    "schedule-board": { labelKey: "scheduleBoard" },
    payments: {
      labelKey: "payments",
      children: {
        ":id": { labelKey: "detail" },
      },
    },
    equipment: {
      labelKey: "equipment",
      children: {
        new: { labelKey: "new" },
        ":id": { labelKey: "detail" },
      },
    },
    "service-requests": {
      labelKey: "serviceRequests",
      children: {
        new: { labelKey: "new" },
        ":id": { labelKey: "detail" },
      },
    },
    "tax-invoices": { labelKey: "taxInvoices" },
    reports: {
      labelKey: "reports",
      children: {
        aging: { labelKey: "reportsAging" },
        audit: { labelKey: "reportsAudit" },
        churn: { labelKey: "reportsChurn" },
        "daily-visits": { labelKey: "reportsDailyVisits" },
        revenue: { labelKey: "reportsRevenue" },
        "technician-productivity": { labelKey: "reportsTechnicianProductivity" },
      },
    },
    admin: {
      labelKey: "admin",
      grouping: true,
      children: {
        users: { labelKey: "users" },
        products: { labelKey: "products" },
        "company-contact": { labelKey: "companyContact" },
        "notification-templates": { labelKey: "notificationTemplates" },
        "notification-logs": { labelKey: "notificationLogs" },
        migration: { labelKey: "dataMigration" },
        "scheduler-weights": { labelKey: "schedulerWeights" },
      },
    },
  },
};

export type Crumb = {
  /** Locale-less href consumed by `Link` from `@/i18n/navigation` */
  href: string;
  /** i18n key under `nav.*` */
  labelKey: string;
  /** True when this crumb sat on a dynamic `[id]` segment — detail pages
   *  use this to optionally override the static label with the resolved
   *  entity name via the breadcrumb context. */
  isDynamic?: boolean;
  /** False for a grouping segment with no page — never render it as a link. */
  linkable: boolean;
};

/**
 * The crumb the back button should fall back to: the nearest ancestor of
 * the current page that is an actual page. Null at depth ≤ 1.
 */
export function parentCrumb(crumbs: readonly Crumb[]): Crumb | null {
  for (let i = crumbs.length - 2; i >= 1; i--) {
    if (crumbs[i].linkable) return crumbs[i];
  }
  // Only ancestors left are grouping labels (or just home) — home is the
  // page to fall back to, but a depth-1 page has no back button at all.
  return crumbs.length >= 3 ? crumbs[0] : null;
}

/**
 * Strip the leading `/o` prefix, then walk the tree one segment at a
 * time. `usePathname()` from `@/i18n/navigation` already canonicalises
 * the locale away, so a route like `/o/ko/customers/cm123abc/edit`
 * arrives here as `/o/customers/cm123abc/edit`.
 *
 * Returns `null` when the path isn't in the office realm.
 */
export function computeOfficeCrumbs(pathname: string): Crumb[] | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "o") return null;
  const tail = parts.slice(1);

  const crumbs: Crumb[] = [{ href: "/o", labelKey: TREE.labelKey, linkable: true }];
  let node: RouteNode = TREE;
  let href = "/o";
  for (const seg of tail) {
    const exact = node.children?.[seg];
    const wildcard = node.children?.[":id"];
    const child = exact ?? wildcard;
    if (!child) break;
    href = `${href}/${seg}`;
    crumbs.push({
      href,
      labelKey: child.labelKey,
      isDynamic: exact ? undefined : true,
      linkable: !child.grouping,
    });
    node = child;
  }
  return crumbs;
}
