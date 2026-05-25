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
  email: string;
  name: string;
  role: string;
  language: string;
  permissionOverrides?: Record<string, boolean>;
}

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_USER_KEY = "pmis_user";
const AUTH_TOKEN_KEY = "pmis_token";

function getCachedUser(): AuthUser | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user && !!accessToken;

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // TODO: Replace with actual API call in Phase 1
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json();

      if (!res.ok) {
        const code = json?.error?.code || "UNKNOWN";
        const err = new Error("Login failed");
        (err as Error & { code: string }).code = code;
        throw err;
      }
      setAccessToken(json.data.accessToken);
      setUser(json.data.user);
      cacheAuth(json.data.user, json.data.accessToken);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout errors
    } finally {
      setUser(null);
      setAccessToken(null);
      cacheAuth(null, null);
    }
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST" });

      if (!res.ok) {
        setUser(null);
        setAccessToken(null);
        cacheAuth(null, null);
        return;
      }

      const json = await res.json();
      setAccessToken(json.data.accessToken);
      setUser(json.data.user);
      cacheAuth(json.data.user, json.data.accessToken);
    } catch {
      setUser(null);
      setAccessToken(null);
      cacheAuth(null, null);
    }
  }, []);

  // On mount: restore from cache before paint, then refresh in background
  useIsomorphicLayoutEffect(() => {
    const cached = getCachedUser();
    const cachedToken = getCachedToken();
    if (cached && cachedToken) {
      setUser(cached);
      setAccessToken(cachedToken);
      setIsLoading(false);
      // Refresh in background to get a fresh token
      refreshToken();
    } else {
      refreshToken().finally(() => setIsLoading(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh before token expiry (refresh every 110 minutes for a 120-minute token)
  useEffect(() => {
    if (!accessToken) return;

    const interval = setInterval(
      () => {
        refreshToken();
      },
      110 * 60 * 1000
    );

    return () => clearInterval(interval);
  }, [accessToken, refreshToken]);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      isLoading,
      isAuthenticated,
      login,
      logout,
      refreshToken,
    }),
    [user, accessToken, isLoading, isAuthenticated, login, logout, refreshToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
