/**
 * Customer portal access policy (PRD §6.2 portal permissions matrix).
 *
 * Roles (encoded on `CustomerContact.role`):
 *   - CONTRACT_PARTY : organisation-level signatory; can manage all OPS
 *     contacts and view all data across the customer.
 *   - OPS_CONTACT    : operations contact, scoped CUSTOMER (organisation-wide)
 *     or SITE (single site). Primary OPS of a site can manage same-site
 *     contacts.
 *
 * All decisions are pure functions of viewer + target — no DB access — so
 * call sites can compose with their own queries.
 */

import type { ContactRole, ContactScope } from "@/generated/prisma/client";

export interface ContactPermViewer {
  contactId: string;
  customerId: string;
  role: ContactRole;
  scope: ContactScope;
  siteId: string | null;
  /** Set true on the viewer's row when they are the primary OPS for their scope. */
  isPrimary?: boolean;
}

export interface ContactPermTarget {
  id: string;
  customerId: string;
  role: ContactRole;
  scope: ContactScope;
  siteId: string | null;
}

/** May the viewer create / edit / disable the target contact? */
export function canManageContact(
  viewer: ContactPermViewer,
  target: ContactPermTarget,
): boolean {
  if (viewer.customerId !== target.customerId) return false;
  // CONTRACT_PARTY can manage every OPS contact under the same customer.
  if (viewer.role === "CONTRACT_PARTY") {
    // CONTRACT_PARTY cannot disable themselves via the portal — must use
    // office side (changing CONTRACT_PARTY is a sensitive action). They CAN
    // edit their own fields (handled by canEditOwnProfile).
    if (target.role === "CONTRACT_PARTY") return target.id === viewer.contactId;
    return true;
  }
  // OPS_CONTACT primary on a site can manage same-site OPS rows only.
  if (
    viewer.role === "OPS_CONTACT" &&
    viewer.scope === "SITE" &&
    viewer.isPrimary &&
    viewer.siteId &&
    target.scope === "SITE" &&
    target.siteId === viewer.siteId &&
    target.role === "OPS_CONTACT"
  ) {
    return true;
  }
  // Otherwise no — non-primary OPS can only edit themselves (separate helper).
  return false;
}

/** May the viewer download tax invoices (B2B-only feature)? */
export function canDownloadInvoice(viewer: ContactPermViewer & { customerType?: "B2C" | "B2B" }): boolean {
  if (viewer.customerType && viewer.customerType !== "B2B") return false;
  return viewer.role === "CONTRACT_PARTY" || viewer.role === "OPS_CONTACT";
}

/** Any portal-enabled contact may submit service requests. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function canSubmitServiceRequest(_viewer: ContactPermViewer): boolean {
  return true;
}

/** Anyone may edit their own contact info (name/email/language). */
export function canEditOwnProfile(
  viewer: ContactPermViewer,
  target: ContactPermTarget,
): boolean {
  return viewer.contactId === target.id;
}

/** May the viewer view equipment at this site (or any site for CUSTOMER scope)? */
export function canViewEquipmentAtSite(
  viewer: ContactPermViewer,
  siteId: string | null,
): boolean {
  if (viewer.role === "CONTRACT_PARTY") return true;
  if (viewer.scope === "CUSTOMER") return true;
  // SITE-scoped OPS see only equipment in their site (and customer-level
  // equipment with no site, e.g. B2C with no Sites).
  return viewer.siteId === siteId || siteId === null;
}
