import type { ReactNode } from "react";

/**
 * Mobile (technician PWA) layout wrapper.
 *
 * Login page (`/mobile/login`) intentionally short-circuits — it's its own
 * full-screen page with no shell or auth guard. Every other `/mobile/*` page
 * is wrapped in `<TechnicianAuthGuard>` + `<MobileShell>` via the
 * `mobile-wrapper.tsx` server-friendly client component.
 *
 * Keeping this layout server-rendered keeps the bundle small for the entry
 * route.
 */

export default function MobileLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
