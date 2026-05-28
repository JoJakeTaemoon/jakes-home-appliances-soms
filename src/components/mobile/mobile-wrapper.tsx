"use client";

import type { ReactNode } from "react";
import { TechnicianAuthGuard } from "@/components/mobile/technician-guard";
import { MobileShell } from "@/components/mobile/mobile-shell";

/**
 * Common wrapper for every authenticated /mobile/* page. Pages that need a
 * different shell (login) skip this.
 */
export function MobileWrapper({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <TechnicianAuthGuard>
      <MobileShell>{children}</MobileShell>
    </TechnicianAuthGuard>
  );
}
