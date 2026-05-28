"use client";

import type { ReactNode } from "react";
import { CustomerAuthGuard } from "@/components/portal/customer-auth-guard";
import { PortalShell } from "@/components/portal/portal-shell";

/**
 * Standard wrapper for protected portal pages — guard + shell in one.
 * Pass `requireChange` when the page is /portal/change-password itself so
 * the guard doesn't bounce-loop the user.
 */
export function PortalPage({
  children,
  requireChange = false,
}: Readonly<{ children: ReactNode; requireChange?: boolean }>) {
  return (
    <CustomerAuthGuard requireChange={requireChange}>
      <PortalShell>{children}</PortalShell>
    </CustomerAuthGuard>
  );
}
