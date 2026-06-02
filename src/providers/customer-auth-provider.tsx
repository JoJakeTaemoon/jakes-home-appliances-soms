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

const useIsomorphicLayoutEffect =
  globalThis.window === undefined ? useEffect : useLayoutEffect;

export interface PortalContact {
  id: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  customerType?: "B2C" | "B2B";
  name: string;
  phone1: string;
  email: string | null;
  language: "ko" | "vi" | "en";
  role: "CONTRACT_PARTY" | "OPS_CONTACT";
  scope: "CUSTOMER" | "SITE";
  siteId: string | null;
  mustChangePassword: boolean;
}

export interface PortalLoginCandidate {
  id: string;
  name: string;
  customerName: string;
  customerCode: string;
}

interface CustomerAuthContextType {
  contact: PortalContact | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (
    phone: string,
    password: string,
    contactId?: string,
  ) => Promise<{ candidates?: PortalLoginCandidate[]; mustChangePassword?: boolean }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<CustomerAuthContextType | undefined>(undefined);

const STORAGE_CONTACT = "soms_portal_contact";
const STORAGE_TOKEN = "soms_portal_access";

function getCached<T>(key: string): T | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function setCached(contact: PortalContact | null, token: string | null) {
  if (typeof sessionStorage === "undefined") return;
  if (contact && token) {
    sessionStorage.setItem(STORAGE_CONTACT, JSON.stringify(contact));
    sessionStorage.setItem(STORAGE_TOKEN, token);
  } else {
    sessionStorage.removeItem(STORAGE_CONTACT);
    sessionStorage.removeItem(STORAGE_TOKEN);
  }
}

class PortalLoginError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export function CustomerAuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [contact, setContact] = useState<PortalContact | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  // See `field-auth-provider.tsx` for the rationale — single-flight refresh
  // protects against locale-change + StrictMode double-fire racing the
  // refresh-token rotation and wiping local state.
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  // Snapshot for refresh() so a 401 on the login-page silent-restore
  // attempt doesn't clobber a fast login() that landed in between.
  const contactRef = useRef<PortalContact | null>(null);
  useEffect(() => {
    contactRef.current = contact;
  }, [contact]);

  const isAuthenticated = !!contact && !!accessToken;

  const login = useCallback(
    async (
      phone: string,
      password: string,
      contactId?: string,
    ): Promise<{
      candidates?: PortalLoginCandidate[];
      mustChangePassword?: boolean;
    }> => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/portal/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ phone, password, contactId }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          const code = json?.error?.code ?? "UNKNOWN";
          const msg = json?.error?.message ?? "Login failed";
          throw new PortalLoginError(msg, code);
        }
        // Disambiguation path — response has `candidates` only, no contact yet.
        if (json.data.candidates) {
          return { candidates: json.data.candidates as PortalLoginCandidate[] };
        }
        const c = json.data.contact as PortalContact;
        setContact(c);
        setAccessToken(json.data.accessToken);
        setCached(c, json.data.accessToken);
        return { mustChangePassword: !!json.data.mustChangePassword };
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/portal/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore — clear local state regardless
    } finally {
      setContact(null);
      setAccessToken(null);
      setCached(null, null);
      // Drop ALL cached TanStack Query data so the next contact who
      // logs in on this device cannot see the previous contact's
      // invoices / equipment / SR thread until staleTime expires.
      queryClient.clear();
    }
  }, [queryClient]);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current !== null) return refreshInFlightRef.current;
    const startedWithUser = contactRef.current !== null;
    const promise = (async () => {
      try {
        const res = await fetch("/api/portal/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (res.status === 401 || res.status === 403) {
          if (startedWithUser) {
            setContact(null);
            setAccessToken(null);
            setCached(null, null);
          }
          return;
        }
        if (!res.ok) {
          // 5xx / transient — keep cached state, retry next interval.
          return;
        }
        const json = await res.json();
        if (!json.success) return;
        setContact(json.data.contact);
        setAccessToken(json.data.accessToken);
        setCached(json.data.contact, json.data.accessToken);
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
    const cachedContact = getCached<PortalContact>(STORAGE_CONTACT);
    const cachedToken =
      typeof sessionStorage === "undefined"
        ? null
        : sessionStorage.getItem(STORAGE_TOKEN);
    if (cachedContact && cachedToken) {
      setContact(cachedContact);
      setAccessToken(cachedToken);
      setIsLoading(false);
      void refresh();
      return;
    }
    // No cache. On /login (or forgot/change-password) the user has no
    // session yet, so a refresh() here is a guaranteed 401 — and
    // browsers log 4xx responses to the console regardless of how the
    // JS code handles them. Skip the call on customer public pages.
    const path =
      globalThis.window === undefined
        ? ""
        : globalThis.window.location.pathname;
    if (
      /^\/[^/]+\/(login|forgot-password|change-password)(?:\/|$)/.test(path)
    ) {
      setIsLoading(false);
      return;
    }
    refresh().finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    const interval = setInterval(() => void refresh(), 12 * 60 * 1000);
    return () => clearInterval(interval);
  }, [accessToken, refresh]);

  const value = useMemo(
    () => ({
      contact,
      accessToken,
      isLoading,
      isAuthenticated,
      login,
      logout,
      refresh,
    }),
    [contact, accessToken, isLoading, isAuthenticated, login, logout, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCustomerAuth() {
  const ctx = useContext(Ctx);
  if (ctx === undefined) {
    throw new Error("useCustomerAuth must be used within a CustomerAuthProvider");
  }
  return ctx;
}

/** Non-throwing variant — see `useOptionalAuth` in auth-provider for rationale. */
export function useOptionalCustomerAuth() {
  return useContext(Ctx) ?? null;
}
