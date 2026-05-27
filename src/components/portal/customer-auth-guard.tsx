"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useCustomerAuth } from "@/providers/customer-auth-provider";
import { useRouter } from "@/i18n/navigation";

const PORTAL_AUTH_FLAG = "soms_portal_auth";

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Client-side gate for portal pages. Redirects to /portal/login when no
 * session. Force-redirects to /portal/change-password when the contact has
 * `mustChangePassword=true` and is on any page other than change-password
 * itself.
 */
export function CustomerAuthGuard({
  children,
  requireChange = false,
}: Readonly<{ children: ReactNode; requireChange?: boolean }>) {
  const { contact, isAuthenticated, isLoading } = useCustomerAuth();
  const router = useRouter();
  const hydrated = useHydrated();

  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.setItem(PORTAL_AUTH_FLAG, "1");
    } else if (!isLoading) {
      sessionStorage.removeItem(PORTAL_AUTH_FLAG);
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/portal/login");
      return;
    }
    if (
      !isLoading &&
      isAuthenticated &&
      contact?.mustChangePassword &&
      !requireChange
    ) {
      router.replace("/portal/change-password");
    }
  }, [
    isAuthenticated,
    isLoading,
    contact?.mustChangePassword,
    requireChange,
    router,
  ]);

  if (!hydrated) return <>{children}</>;

  if (isLoading) {
    const wasAuthed =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(PORTAL_AUTH_FLAG) === "1";
    return wasAuthed ? <>{children}</> : null;
  }

  if (!isAuthenticated) return null;
  if (contact?.mustChangePassword && !requireChange) return null;
  return <>{children}</>;
}
