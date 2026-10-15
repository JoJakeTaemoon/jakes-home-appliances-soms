"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useFieldAuth } from "@/providers/field-auth-provider";
import { useRouter } from "@/i18n/navigation";

const AUTH_FLAG = "soms_field_auth";

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Mirror of the office-side AuthGuard, but gated to TECHNICIAN role. If a
 * non-technician user opens /mobile/*, they're bounced back to the dashboard.
 * A technician still on a temp password (`mustChangePassword`) is sent to
 * /f/change-password, which passes `requireChange` to opt out.
 */
export function TechnicianAuthGuard({
  children,
  requireChange = false,
}: Readonly<{ children: ReactNode; requireChange?: boolean }>) {
  const { isAuthenticated, isLoading, user } = useFieldAuth();
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
    if (!isAuthenticated) {
      router.replace("/f/login");
      return;
    }
    if (user && user.role !== "TECHNICIAN") {
      router.replace("/o/dashboard");
      return;
    }
    if (mustChange) router.replace("/f/change-password");
  }, [isAuthenticated, isLoading, user, mustChange, router]);

  if (!hydrated) return <>{children}</>;
  if (isLoading) {
    const wasAuthed =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(AUTH_FLAG) === "1";
    return wasAuthed ? <>{children}</> : null;
  }
  if (!isAuthenticated) return null;
  if (user && user.role !== "TECHNICIAN") return null;
  if (mustChange) return null;
  return <>{children}</>;
}
