"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useAuth } from "@/providers/auth-provider";

const AUTH_FLAG = "pmis_auth";

// useSyncExternalStore with server snapshot avoids hydration mismatch
// and the "setState in effect" lint error
function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,   // client
    () => false,  // server
  );
}

export function AuthGuard({ children }: Readonly<{ children: ReactNode }>) {
  const { isAuthenticated, isLoading } = useAuth();
  const hydrated = useHydrated();

  // Sync auth state to sessionStorage
  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.setItem(AUTH_FLAG, "1");
    } else if (!isLoading) {
      sessionStorage.removeItem(AUTH_FLAG);
    }
  }, [isAuthenticated, isLoading]);

  // Redirect to login when not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      globalThis.location.href = "/login";
    }
  }, [isAuthenticated, isLoading]);

  // Server render: always show children (matches SSR output)
  if (!hydrated) return <>{children}</>;

  // Client: loading — check sessionStorage to avoid blank flash on back/forward
  if (isLoading) {
    const wasAuthed = sessionStorage.getItem(AUTH_FLAG) === "1";
    return wasAuthed ? <>{children}</> : null;
  }

  if (!isAuthenticated) return null;

  return <>{children}</>;
}
