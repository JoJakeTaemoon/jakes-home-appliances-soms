import type { ReactNode } from "react";
import { AuthGuard } from "@/components/layout/auth-guard";
import { DashboardShell } from "@/components/layout/dashboard-shell";

/**
 * Dashboard layout wraps every authenticated page. AuthGuard redirects to
 * /login if the session is missing; DashboardShell renders the sidebar +
 * topbar chrome.
 */
export default function DashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <AuthGuard>
      <DashboardShell>{children}</DashboardShell>
    </AuthGuard>
  );
}
