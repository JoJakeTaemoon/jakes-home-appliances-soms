import type { ReactNode } from "react";
import { CustomerAuthProvider } from "@/providers/customer-auth-provider";

/**
 * Portal root layout. Wraps every `/[locale]/portal/*` route with the
 * customer auth provider. Authenticated chrome (top bar + bottom tab nav)
 * lives in a deeper layout segment so it isn't applied to /login,
 * /forgot-password, /change-password.
 *
 * Staff `AuthProvider` from the parent locale layout remains in the tree but
 * is essentially idle here — portal pages only consume `useCustomerAuth()`.
 */
export default function PortalLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <CustomerAuthProvider>{children}</CustomerAuthProvider>;
}
