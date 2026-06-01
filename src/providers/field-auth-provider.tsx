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
  useState,
  type ReactNode,
} from "react";

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
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/field/refresh", {
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
