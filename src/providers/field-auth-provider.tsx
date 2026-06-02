"use client";

/**
 * Field auth provider — TECHNICIAN session in a separate React context so
 * it can coexist in the same browser as the office and customer sessions.
 *
 * Hits /api/auth/field/* endpoints. Stores its access token + user in
 * sessionStorage under the `soms_field_*` namespace so the office tab
 * cannot accidentally read or overwrite it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clearAll as clearOfflineQueue } from "@/lib/offline/queue";

const useIsomorphicLayoutEffect =
  globalThis.window === undefined ? useEffect : useLayoutEffect;

export interface FieldAuthUser {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: string; // "TECHNICIAN"
  mustChangePassword: boolean;
}

export interface FieldLoginRoleMismatch {
  suggestedRealm: "office" | "customer";
  suggestedUrl: string;
}

interface FieldAuthContextType {
  user: FieldAuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const FieldAuthContext = createContext<FieldAuthContextType | undefined>(
  undefined,
);

const FIELD_USER_KEY = "soms_field_user";
const FIELD_TOKEN_KEY = "soms_field_access";

function getCachedUser(): FieldAuthUser | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(FIELD_USER_KEY);
    return raw ? (JSON.parse(raw) as FieldAuthUser) : null;
  } catch {
    return null;
  }
}

function getCachedToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(FIELD_TOKEN_KEY);
}

function cacheAuth(user: FieldAuthUser | null, token: string | null) {
  if (typeof sessionStorage === "undefined") return;
  if (user && token) {
    sessionStorage.setItem(FIELD_USER_KEY, JSON.stringify(user));
    sessionStorage.setItem(FIELD_TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(FIELD_USER_KEY);
    sessionStorage.removeItem(FIELD_TOKEN_KEY);
  }
}

export class FieldLoginError extends Error {
  code: string;
  suggestedRealm?: "office" | "customer";
  suggestedUrl?: string;
  constructor(
    message: string,
    code: string,
    mismatch?: FieldLoginRoleMismatch,
  ) {
    super(message);
    this.code = code;
    if (mismatch) {
      this.suggestedRealm = mismatch.suggestedRealm;
      this.suggestedUrl = mismatch.suggestedUrl;
    }
  }
}

export function FieldAuthProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<FieldAuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  // Single-flight in-flight refresh promise. Locale change + StrictMode
  // double-mount can fire refresh() twice on the same render commit; the
  // second call would hit the server with a token that's already been
  // rotated and get 401, then wipe the user — which the field guard
  // immediately reads as "not signed in" and bounces to /f/login. Reuse
  // the in-flight promise so both callers observe the same outcome.
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  // Mirror of `user` for inside the refresh closure — lets refresh()
  // distinguish "session genuinely just died" from "we never had one to
  // begin with" without rebuilding the callback every render.
  const userRef = useRef<FieldAuthUser | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const isAuthenticated = !!user && !!accessToken;

  const login = useCallback(async (identifier: string, password: string) => {
    setIsLoading(true);
    try {
      const trimmed = identifier.trim();
      const looksLikePhone = /^[+\d][\d\s().-]{4,}$/.test(trimmed);
      const payload: { username?: string; phone?: string; password: string } = {
        password,
      };
      if (looksLikePhone) payload.phone = trimmed;
      else payload.username = trimmed;
      const res = await fetch("/api/auth/field/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const code = json?.error?.code ?? "UNKNOWN";
        const msg = json?.error?.message ?? "Login failed";
        const suggestedRealm = json?.error?.suggestedRealm;
        const suggestedUrl = json?.error?.suggestedUrl;
        throw new FieldLoginError(
          msg,
          code,
          suggestedRealm && suggestedUrl
            ? { suggestedRealm, suggestedUrl }
            : undefined,
        );
      }
      setUser(json.data.user);
      setAccessToken(json.data.accessToken);
      cacheAuth(json.data.user, json.data.accessToken);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/field/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore — clear local state regardless
    } finally {
      setUser(null);
      setAccessToken(null);
      cacheAuth(null, null);
      // Drop the TanStack Query cache so the next technician who picks
      // up the shared tablet cannot read the previous tech's visits /
      // customers until staleTime expires.
      queryClient.clear();
      // Wipe the Dexie offline queue + cached-visit snapshots — those
      // hold mutation payloads (VISIT_COMPLETE / VISIT_NOTES / PHOTO)
      // and visit detail copies that survive logout otherwise.
      clearOfflineQueue().catch(() => undefined);
    }
  }, [queryClient]);

  const refresh = useCallback(async () => {
    // De-dupe concurrent callers. Returning the same promise means a
    // locale change + a strict-mode replay both observe a single
    // round-trip, preventing the second one from carrying a rotated
    // refresh cookie and 401-ing.
    if (refreshInFlightRef.current !== null) return refreshInFlightRef.current;
    // Snapshot whether we had a logged-in user when this refresh
    // STARTED. Without it, the layout-effect's silent-restore refresh
    // can fire before the user has typed credentials, return 401 (no
    // cookie yet), arrive AFTER a fast login(), and clobber the
    // just-logged-in user/token — making the next API call go out with
    // a null Authorization header and 401 immediately.
    const startedWithUser = userRef.current !== null;
    const promise = (async () => {
      try {
        const res = await fetch("/api/auth/field/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (res.status === 401 || res.status === 403) {
          if (startedWithUser) {
            // We had a session; server explicitly killed it. Real logout.
            setUser(null);
            setAccessToken(null);
            cacheAuth(null, null);
          }
          // Otherwise this 401 was anticipated (no cookie on /f/login,
          // or a concurrent login has already set fresh state) — leave
          // local state alone.
          return;
        }
        if (!res.ok) {
          // 5xx / transient — keep cached state, retry next interval.
          return;
        }
        const json = await res.json();
        if (!json.success) {
          // Generic server error — same soft-fail policy.
          return;
        }
        setUser(json.data.user);
        setAccessToken(json.data.accessToken);
        cacheAuth(json.data.user, json.data.accessToken);
      } catch {
        // Network drop — keep cached state, do NOT wipe. The interval
        // and the next user action will retry.
      }
    })();
    refreshInFlightRef.current = promise;
    try {
      await promise;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, []);

  useIsomorphicLayoutEffect(() => {
    const cachedUser = getCachedUser();
    const cachedToken = getCachedToken();
    if (cachedUser && cachedToken) {
      setUser(cachedUser);
      setAccessToken(cachedToken);
      setIsLoading(false);
      void refresh();
      return;
    }
    // No cache. Silent-restore is only meaningful on a protected page
    // where a still-valid httpOnly refresh cookie can rehydrate the
    // session. On the login page the user demonstrably has no session
    // yet, so a refresh() call here is guaranteed to 401 — and the
    // browser logs every 4xx network response in the console regardless
    // of how we handle it in code. Skip the call entirely on /f/login.
    const path =
      globalThis.window === undefined
        ? ""
        : globalThis.window.location.pathname;
    if (/^\/f\/[^/]+\/login(?:\/|$)/.test(path)) {
      setIsLoading(false);
      return;
    }
    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (!accessToken) return;
    const interval = setInterval(() => void refresh(), 12 * 60 * 1000);
    return () => clearInterval(interval);
  }, [accessToken, refresh]);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      isLoading,
      isAuthenticated,
      login,
      logout,
      refresh,
    }),
    [user, accessToken, isLoading, isAuthenticated, login, logout, refresh],
  );

  return (
    <FieldAuthContext.Provider value={value}>
      {children}
    </FieldAuthContext.Provider>
  );
}

export function useFieldAuth() {
  const ctx = useContext(FieldAuthContext);
  if (ctx === undefined) {
    throw new Error("useFieldAuth must be used within a FieldAuthProvider");
  }
  return ctx;
}

/** Non-throwing variant — see `useOptionalAuth` in auth-provider for rationale. */
export function useOptionalFieldAuth() {
  return useContext(FieldAuthContext) ?? null;
}
