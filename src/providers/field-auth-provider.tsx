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
import { registerFieldLogout } from "@/lib/auth/global-handlers";

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
  // True while login() is in-flight — refresh() must NOT wipe state during
  // a concurrent login attempt (the user is racing to mint credentials).
  const loginInFlightRef = useRef(false);

  const isAuthenticated = !!user && !!accessToken;

  const login = useCallback(async (identifier: string, password: string) => {
    setIsLoading(true);
    loginInFlightRef.current = true;
    try {
      const trimmed = identifier.trim();
      const looksLikePhone = /^[+\d][\d\s().-]{4,}$/.test(trimmed);
      const payload: { username?: string; phone?: string; password: string } = {
        password,
      };
      if (looksLikePhone) payload.phone = trimmed;
      else payload.username = trimmed;
      let res: Response;
      try {
        res = await fetch("/api/auth/field/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
      } catch (networkErr) {
        throw new FieldLoginError(
          (networkErr as Error)?.message ?? "Network error",
          "NETWORK_ERROR",
        );
      }
      let json: { success?: boolean; data?: { user: FieldAuthUser; accessToken: string }; error?: { code?: string; message?: string; suggestedRealm?: "office" | "customer"; suggestedUrl?: string } } = {};
      try {
        json = await res.json();
      } catch {
        // empty body — fall through
      }
      if (!res.ok || !json.success) {
        const code = json?.error?.code ?? `HTTP_${res.status}`;
        const msg = json?.error?.message ?? `Login failed (${res.status})`;
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
      if (!json.data) {
        throw new FieldLoginError("Malformed login response", "MALFORMED_RESPONSE");
      }
      setUser(json.data.user);
      setAccessToken(json.data.accessToken);
      cacheAuth(json.data.user, json.data.accessToken);
    } finally {
      loginInFlightRef.current = false;
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
    if (refreshInFlightRef.current !== null) return refreshInFlightRef.current;
    const promise = (async () => {
      try {
        const res = await fetch("/api/auth/field/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (res.status === 401 || res.status === 403) {
          // Session is authoritatively dead. Wipe local state unless a
          // concurrent login is racing to set fresh credentials.
          if (!loginInFlightRef.current) {
            setUser(null);
            setAccessToken(null);
            cacheAuth(null, null);
          }
          return;
        }
        if (!res.ok) {
          // 5xx / transient — keep cached state, retry next interval.
          return;
        }
        const json = await res.json();
        if (!json.success) return;
        setUser(json.data.user);
        setAccessToken(json.data.accessToken);
        cacheAuth(json.data.user, json.data.accessToken);
      } catch {
        // Network drop — keep cached state, do NOT wipe.
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
    const path =
      globalThis.window === undefined
        ? ""
        : globalThis.window.location.pathname;
    const onLoginPage = /^\/f\/[^/]+\/login(?:\/|$)/.test(path);
    // Wipe stale cache when landing on the login page so a no-cookie
    // refresh isn't fired.
    if (onLoginPage) {
      cacheAuth(null, null);
      setIsLoading(false);
      return;
    }
    const cachedUser = getCachedUser();
    const cachedToken = getCachedToken();
    if (cachedUser && cachedToken) {
      setUser(cachedUser);
      setAccessToken(cachedToken);
      setIsLoading(false);
      void refresh();
      return;
    }
    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  // Expose logout to the API client so a 401 from any field-realm fetch
  // can tear down the session globally.
  useEffect(() => {
    return registerFieldLogout(logout);
  }, [logout]);

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
