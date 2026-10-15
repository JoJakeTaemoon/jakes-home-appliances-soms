"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useRouter } from "@/i18n/navigation";

const AUTH_FLAG = "soms_auth";

// useSyncExternalStore with server snapshot avoids hydration mismatch and
// the "setState in effect" lint error.
function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Office gate. Redirects to /o/login without a session, and to
 * /o/change-password while the user still holds an admin-issued temp
 * password (`mustChangePassword`). The change-password page passes
 * `requireChange` so it isn't bounced to itself.
 */
export function AuthGuard({
  children,
  requireChange = false,
}: Readonly<{ children: ReactNode; requireChange?: boolean }>) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const mustChange = !!user?.mustChangePassword && !requireChange;
  const router = useRouter();
  const hydrated = useHydrated();

  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.setItem(AUTH_FLAG, "1");
    } else if (!isLoading) {
      sessionStorage.removeItem(AUTH_FLAG);
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) router.replace("/o/login");
    else if (mustChange) router.replace("/o/change-password");
  }, [isAuthenticated, isLoading, mustChange, router]);

  if (!hydrated) return <>{children}</>;

  if (isLoading) {
    const wasAuthed =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(AUTH_FLAG) === "1";
    return wasAuthed ? <>{children}</> : null;
  }

  if (!isAuthenticated || mustChange) return null;
  return <>{children}</>;
}
