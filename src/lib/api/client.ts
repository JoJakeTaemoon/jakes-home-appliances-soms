"use client";

/**
 * Thin fetch wrapper that:
 *   - sends Bearer token from useAuth() when called via useApi()
 *   - unwraps the standard API envelope to `data` or throws ApiClientError
 *
 * Server Components should query Prisma directly; this is for client calls.
 */

import { useCallback } from "react";
import { useAuth } from "@/providers/auth-provider";

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
}

async function rawCall<T>(input: string, opts: ApiOptions): Promise<T> {
  const { body, authToken, headers, ...rest } = opts;
  const finalHeaders = new Headers(headers);
  if (body !== undefined && !finalHeaders.has("content-type")) {
    finalHeaders.set("content-type", "application/json");
  }
  if (authToken) {
    finalHeaders.set("Authorization", `Bearer ${authToken}`);
  }
  const res = await fetch(input, {
    ...rest,
    credentials: "include",
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* tolerate empty body */
  }
  const env = json as { success?: boolean; data?: T; error?: { code?: string; message?: string; issues?: ApiClientError["issues"] }; pagination?: unknown };
  if (!res.ok || env?.success === false) {
    throw new ApiClientError({
      message: env?.error?.message ?? `Request failed (${res.status})`,
      code: env?.error?.code ?? "UNKNOWN",
      status: res.status,
      issues: env?.error?.issues,
    });
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
  const { accessToken } = useAuth();
  return {
    get: useCallback(
      <T,>(url: string, init?: RequestInit) =>
        rawCall<{ success: true; data: T; pagination?: unknown }>(url, {
          method: "GET",
          ...init,
          authToken: accessToken,
        }),
      [accessToken],
    ),
    post: useCallback(
      <T,>(url: string, body?: unknown, init?: RequestInit) =>
        rawCall<{ success: true; data: T }>(url, {
          method: "POST",
          body,
          ...init,
          authToken: accessToken,
        }),
      [accessToken],
    ),
    patch: useCallback(
      <T,>(url: string, body?: unknown, init?: RequestInit) =>
        rawCall<{ success: true; data: T }>(url, {
          method: "PATCH",
          body,
          ...init,
          authToken: accessToken,
        }),
      [accessToken],
    ),
    put: useCallback(
      <T,>(url: string, body?: unknown, init?: RequestInit) =>
        rawCall<{ success: true; data: T }>(url, {
          method: "PUT",
          body,
          ...init,
          authToken: accessToken,
        }),
      [accessToken],
    ),
    del: useCallback(
      <T,>(url: string, init?: RequestInit) =>
        rawCall<{ success: true; data: T }>(url, {
          method: "DELETE",
          ...init,
          authToken: accessToken,
        }),
      [accessToken],
    ),
  };
}
