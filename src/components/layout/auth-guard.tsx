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

export function AuthGuard({ children }: Readonly<{ children: ReactNode }>) {
  const { isAuthenticated, isLoading } = useAuth();
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
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (!hydrated) return <>{children}</>;

  if (isLoading) {
    const wasAuthed =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(AUTH_FLAG) === "1";
    return wasAuthed ? <>{children}</> : null;
  }

  if (!isAuthenticated) return null;
  return <>{children}</>;
}
