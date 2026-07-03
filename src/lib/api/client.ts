"use client";

/**
 * Thin fetch wrapper that:
 *   - sends Bearer token from useAuth() when called via useApi()
 *   - unwraps the standard API envelope to `data` or throws ApiClientError
 *   - on 401, fires a global logout so the next render kicks the user
 *     back to the realm-appropriate login page
 *
 * Server Components should query Prisma directly; this is for client calls.
 */

import { useMemo } from "react";
import { useOptionalAuth } from "@/providers/auth-provider";
import { useOptionalFieldAuth } from "@/providers/field-auth-provider";
import { useOptionalCustomerAuth } from "@/providers/customer-auth-provider";
import { fireGlobalLogout, fireToast } from "@/lib/auth/global-handlers";

export class ApiClientError extends Error {
  code: string;
  status: number;
  issues?: { path: (string | number)[]; message: string }[];
  constructor(opts: { message: string; code: string; status: number; issues?: ApiClientError["issues"] }) {
    super(opts.message);
    this.name = "ApiClientError";
    this.code = opts.code;
    this.status = opts.status;
    this.issues = opts.issues;
  }
}

interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Override or omit Authorization header. */
  authToken?: string | null;
  /** Skip the global 401 logout side-effect — used by /api/auth/* endpoints
   *  to avoid recursive logout when login itself returns 401. */
  skipUnauthorizedSideEffects?: boolean;
}

/** Best-effort detection of whether we're already on a login page. */
function onLoginPath(): boolean {
  if (globalThis.window === undefined) return false;
  return /^\/[ofp]\/[^/]+\/login(?:\/|$)/.test(globalThis.window.location.pathname);
}

async function rawCall<T>(input: string, opts: ApiOptions): Promise<T> {
  const { body, authToken, headers, skipUnauthorizedSideEffects, ...rest } = opts;
  const finalHeaders = new Headers(headers);
  if (body !== undefined && !finalHeaders.has("content-type")) {
    finalHeaders.set("content-type", "application/json");
  }
  if (authToken) {
    finalHeaders.set("Authorization", `Bearer ${authToken}`);
  }
  let res: Response;
  try {
    res = await fetch(input, {
      ...rest,
      credentials: "include",
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    // Offline / DNS / aborted fetch — surface as a recoverable error
    // rather than letting the page silently hang.
    const message = (networkErr as Error)?.message ?? "Network error";
    fireToast(`네트워크 오류: ${message}`, { tone: "error" });
    throw new ApiClientError({
      message,
      code: "NETWORK_ERROR",
      status: 0,
    });
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* tolerate empty body */
  }
  const env = json as { success?: boolean; data?: T; error?: { code?: string; message?: string; issues?: ApiClientError["issues"] }; pagination?: unknown };
  if (!res.ok || env?.success === false) {
    const err = new ApiClientError({
      message: env?.error?.message ?? `Request failed (${res.status})`,
      code: env?.error?.code ?? "UNKNOWN",
      status: res.status,
      issues: env?.error?.issues,
    });
    // 401 — session is dead. Fire global logout (clears state + cache) and
    // surface a toast so the user knows what happened. Skip when explicitly
    // suppressed (login itself) or when we're already on a login page.
    if (res.status === 401 && !skipUnauthorizedSideEffects && !onLoginPath()) {
      fireToast("세션이 만료되었습니다. 다시 로그인해 주세요.", { tone: "warning" });
      void fireGlobalLogout();
    } else if (res.status >= 500) {
      fireToast(err.message, { tone: "error" });
    } else if (res.status === 403) {
      fireToast(err.message, { tone: "warning" });
    }
    throw err;
  }
  // Return raw response so paginated endpoints can access pagination metadata
  return (env ?? { success: true, data: undefined }) as unknown as T;
}

/**
 * Hook variant — automatically attaches the current accessToken.
 *
 *   const api = useApi();
 *   const data = await api.get<Customer[]>("/api/customers");
 */
export function useApi() {
  // Pick whichever realm's access token is currently mounted. Pages
  // under any realm (office, field, customer) call `useApi()` to send
  // authenticated requests; resolving the token here keeps callsites
  // identical across realms without forcing each page to import the
  // realm-specific provider.
  const office = useOptionalAuth();
  const field = useOptionalFieldAuth();
  const customer = useOptionalCustomerAuth();
  const accessToken =
    office?.accessToken ?? field?.accessToken ?? customer?.accessToken ?? null;
  // The returned object must be reference-stable across renders. Callers
  // routinely pass `api` (or a callback derived from it) into useEffect /
  // useCallback dependency arrays — without useMemo, the object literal
  // is fresh every render and triggers an infinite re-fetch loop on the
  // dashboard, the admin pages, and anywhere else that calls api.get
  // inside an effect.
  return useMemo(() => {
    return {
      get: <T,>(url: string, init?: RequestInit) =>
        rawCall<{ success: true; data: T; pagination?: unknown }>(url, {
          method: "GET",
          ...init,
          authToken: accessToken,
        }),
      post: <T,>(url: string, body?: unknown, init?: RequestInit) =>
        rawCall<{ success: true; data: T }>(url, {
          method: "POST",
          body,
          ...init,
          authToken: accessToken,
        }),
      patch: <T,>(url: string, body?: unknown, init?: RequestInit) =>
        rawCall<{ success: true; data: T }>(url, {
          method: "PATCH",
          body,
          ...init,
          authToken: accessToken,
        }),
      put: <T,>(url: string, body?: unknown, init?: RequestInit) =>
        rawCall<{ success: true; data: T }>(url, {
          method: "PUT",
          body,
          ...init,
          authToken: accessToken,
        }),
      del: <T,>(url: string, init?: RequestInit) =>
        rawCall<{ success: true; data: T }>(url, {
          method: "DELETE",
          ...init,
          authToken: accessToken,
        }),
    };
  }, [accessToken]);
}
