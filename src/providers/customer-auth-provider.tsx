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
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        setContact(null);
        setAccessToken(null);
        setCached(null, null);
        return;
      }
      const json = await res.json();
      if (!json.success) {
        setContact(null);
        setAccessToken(null);
        setCached(null, null);
        return;
      }
      setContact(json.data.contact);
      setAccessToken(json.data.accessToken);
      setCached(json.data.contact, json.data.accessToken);
    } catch {
      setContact(null);
      setAccessToken(null);
      setCached(null, null);
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
    } else {
      refresh().finally(() => setIsLoading(false));
    }

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
