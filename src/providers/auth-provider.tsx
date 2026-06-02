"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user && !!accessToken;

  const login = useCallback(async (identifier: string, password: string) => {
    setIsLoading(true);
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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const code = json?.error?.code ?? "UNKNOWN";
        const msg = json?.error?.message ?? "Login failed";
        throw new LoginError(msg, code);
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
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        setUser(null);
        setAccessToken(null);
        cacheAuth(null, null);
        return;
      }
      const json = await res.json();
      if (!json.success) {
        setUser(null);
        setAccessToken(null);
        cacheAuth(null, null);
        return;
      }
      setUser(json.data.user);
      setAccessToken(json.data.accessToken);
      cacheAuth(json.data.user, json.data.accessToken);
    } catch {
      setUser(null);
      setAccessToken(null);
      cacheAuth(null, null);
    }
  }, []);

  // Restore cached user before paint, then refresh in background.
  useIsomorphicLayoutEffect(() => {
    const cachedUser = getCachedUser();
    const cachedToken = getCachedToken();
    if (cachedUser && cachedToken) {
      setUser(cachedUser);
      setAccessToken(cachedToken);
      setIsLoading(false);
      void refresh();
    } else {
      refresh().finally(() => setIsLoading(false));
    }

  }, []);

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
