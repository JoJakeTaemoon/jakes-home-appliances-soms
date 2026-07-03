"use client";

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
import { registerOfficeLogout } from "@/lib/auth/global-handlers";

// useLayoutEffect on client (runs before paint), useEffect on server (avoids SSR warning)
const useIsomorphicLayoutEffect =
  globalThis.window === undefined ? useEffect : useLayoutEffect;

export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: string;
  mustChangePassword: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * Sign in. `identifier` is matched against `username` first (office), then
   * `phone` (technician). The API accepts either field — passing a single
   * identifier here keeps the call ergonomic for office + mobile login forms.
   */
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_USER_KEY = "soms_user";
const AUTH_TOKEN_KEY = "soms_access";

function getCachedUser(): AuthUser | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function getCachedToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(AUTH_TOKEN_KEY);
}

function cacheAuth(user: AuthUser | null, token: string | null) {
  if (typeof sessionStorage === "undefined") return;
  if (user && token) {
    sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(AUTH_USER_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

class LoginError extends Error {
  code: string;
  suggestedUrl: string | null;
  constructor(message: string, code: string, suggestedUrl: string | null = null) {
    super(message);
    this.code = code;
    this.suggestedUrl = suggestedUrl;
  }
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  // See `field-auth-provider.tsx` for why refresh is single-flight: locale
  // change + StrictMode replay can fire refresh() twice on the same commit;
  // the second call would carry an already-rotated refresh cookie and 401,
  // wiping local state and bouncing the user to /o/login.
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  // True while login() is in-flight — refresh() must NOT wipe state during
  // a concurrent login (e.g. silent refresh fires right as the user submits
  // credentials).
  const loginInFlightRef = useRef(false);

  const isAuthenticated = !!user && !!accessToken;

  const login = useCallback(async (identifier: string, password: string) => {
    setIsLoading(true);
    loginInFlightRef.current = true;
    try {
      // Decide whether the identifier looks like a phone (digits + optional +)
      // or a username. Technicians log in with phone (K.2); office staff use
      // username. The server accepts either field.
      const trimmed = identifier.trim();
      const looksLikePhone = /^[+\d][\d\s().-]{4,}$/.test(trimmed);
      const payload: { username?: string; phone?: string; password: string } = {
        password,
      };
      if (looksLikePhone) payload.phone = trimmed;
      else payload.username = trimmed;
      let res: Response;
      try {
        res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
      } catch (networkErr) {
        // Distinguish network failures (offline, DNS, CORS) from auth
        // rejections so the form can surface a recoverable message rather
        // than silently spinning.
        throw new LoginError(
          (networkErr as Error)?.message ?? "Network error",
          "NETWORK_ERROR",
        );
      }
      let json: { success?: boolean; data?: { user: AuthUser; accessToken: string }; error?: { code?: string; message?: string; suggestedUrl?: string } } = {};
      try {
        json = await res.json();
      } catch {
        // Empty / non-JSON body → fall through to generic error below.
      }
      if (!res.ok || !json.success) {
        const code = json?.error?.code ?? `HTTP_${res.status}`;
        const msg = json?.error?.message ?? `Login failed (${res.status})`;
        const suggestedUrl: string | null =
          typeof json?.error?.suggestedUrl === "string"
            ? json.error.suggestedUrl
            : null;
        throw new LoginError(msg, code, suggestedUrl);
      }
      if (!json.data) {
        throw new LoginError("Malformed login response", "MALFORMED_RESPONSE");
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
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore — clear local state regardless
    } finally {
      setUser(null);
      setAccessToken(null);
      cacheAuth(null, null);
      // Drop ALL cached TanStack Query data so the next user on this
      // device cannot see the previous user's office data until the
      // staleTime window expires.
      queryClient.clear();
    }
  }, [queryClient]);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current !== null) return refreshInFlightRef.current;
    const promise = (async () => {
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (res.status === 401 || res.status === 403) {
          // 401/403 means the refresh cookie is missing or invalid — the
          // token is now authoritatively dead. Wipe local state UNLESS a
          // login is in-flight (the user is racing to mint new credentials
          // and we'd undo their work). isLoading is force-cleared too so
          // the initial-load code path (which chained `.finally` on this
          // promise) can't leave a mount-time refresh hanging in an
          // inconsistent state if the promise chain is interrupted
          // (dev-server restart mid-request being the trigger case).
          if (!loginInFlightRef.current) {
            setUser(null);
            setAccessToken(null);
            cacheAuth(null, null);
            setIsLoading(false);
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

  // Restore cached user before paint, then refresh in background.
  useIsomorphicLayoutEffect(() => {
    const path =
      globalThis.window === undefined
        ? ""
        : globalThis.window.location.pathname;
    // Match every realm's login page (office `/o/{locale}/login`, field
    // `/f/{locale}/login`, customer portal `/{locale}/login`) so the
    // clean-slate branch below isn't office-only. Otherwise a mount on
    // the field or portal login page runs refresh(), which 401s after
    // a dev-server restart and clutters the console with a stale 401.
    const onLoginPage =
      /^\/[of]\/[^/]+\/login(?:\/|$)/.test(path) ||
      /^\/[^/]+\/login(?:\/|$)/.test(path);

    // On any login page we want a clean slate. Stale sessionStorage
    // from a previous session (token rotated out, DB reseeded, etc.) would
    // otherwise cause the layout to read cachedUser/cachedToken and call
    // refresh() — which 401s and is logged to the console regardless of
    // how we handle it in JS. Wipe the cache and skip refresh.
    if (onLoginPage) {
      cacheAuth(null, null);
      setUser(null);
      setAccessToken(null);
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
  }, []);

  // Expose logout() to the API client so it can fire a global logout when
  // a 401 hits a hook-based fetch. Unregistered on unmount so a remounted
  // provider doesn't keep a dangling reference.
  useEffect(() => {
    return registerOfficeLogout(logout);
  }, [logout]);

  // Silent refresh every 12 minutes (access TTL is 15min).
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

/**
 * Non-throwing variant. Returns `null` when used outside the office
 * AuthProvider — useful for cross-realm helpers like `useApi()` that
 * need to pick whichever realm's access token is currently mounted.
 */
export function useOptionalAuth() {
  return useContext(AuthContext) ?? null;
}
