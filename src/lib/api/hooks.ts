"use client";

/**
 * TanStack Query bindings for the realm-aware `useApi()` client.
 *
 * `useApiQuery(url)` replaces the prevailing
 *
 *   const [data, setData] = useState<T | null>(null);
 *   useEffect(() => { api.get<T>(url).then((r) => setData(r.data)); }, [api]);
 *
 * pattern that the `react-hooks/set-state-in-effect` rule (React 19 /
 * React Compiler) flags as a cascading-render anti-pattern. Co-locating
 * the access-token-bound `useApi()` call inside the queryFn keeps the
 * Authorization header attached without leaking it into the queryKey.
 *
 * `useApiMutation()` provides the matching write-side helper that
 * returns invalidation tags so server-derived caches stay fresh.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useApi, type ApiClientError } from "./client";

export interface ApiPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages?: number;
}

interface PageEnvelope<T> {
  success: true;
  data: T;
  pagination?: ApiPagination;
}

type ApiUrl = string | null | undefined;

/**
 * GET a JSON envelope and return its `.data` field. Pass `null`/`undefined`
 * as the url to keep the query disabled (e.g. waiting for an id param).
 */
export function useApiQuery<T>(
  url: ApiUrl,
  options?: Omit<
    UseQueryOptions<T, ApiClientError, T, readonly [string]>,
    "queryKey" | "queryFn" | "enabled"
  > & { enabled?: boolean },
) {
  const api = useApi();
  const enabled = options?.enabled !== false && !!url;
  return useQuery<T, ApiClientError, T, readonly [string]>({
    ...options,
    enabled,
    queryKey: [url ?? ""] as const,
    queryFn: async () => {
      const env = await api.get<T>(url as string);
      return (env as unknown as PageEnvelope<T>).data;
    },
  });
}

/**
 * GET a JSON envelope and return BOTH `.data` and `.pagination`. Used by
 * list pages that need page metadata alongside the rows.
 */
export function useApiPageQuery<T>(
  url: ApiUrl,
  options?: Omit<
    UseQueryOptions<
      PageEnvelope<T>,
      ApiClientError,
      PageEnvelope<T>,
      readonly [string]
    >,
    "queryKey" | "queryFn" | "enabled"
  > & { enabled?: boolean },
) {
  const api = useApi();
  const enabled = options?.enabled !== false && !!url;
  return useQuery<
    PageEnvelope<T>,
    ApiClientError,
    PageEnvelope<T>,
    readonly [string]
  >({
    ...options,
    enabled,
    queryKey: [url ?? ""] as const,
    queryFn: async () => {
      const env = await api.get<T>(url as string);
      return env as unknown as PageEnvelope<T>;
    },
  });
}

type ApiMethod = "post" | "patch" | "put" | "del";

/**
 * Mutation wrapper. Pass the HTTP verb + a function that yields the URL
 * for the call. On success any cached query whose URL starts with one of
 * the strings in `invalidate` is evicted. Prefix matching is intentional
 * because list queries include their query string in the queryKey
 * (e.g. `/api/customers?page=1&q=foo`), so an exact-key match like
 * `invalidate: ['/api/customers']` would silently no-op for every list
 * page.
 */
export function useApiMutation<TVars = unknown, TResp = unknown>(
  method: ApiMethod,
  urlFor: (vars: TVars) => string,
  options?: {
    invalidate?: readonly string[];
    mutationOptions?: Omit<
      UseMutationOptions<TResp, ApiClientError, TVars>,
      "mutationFn"
    >;
  },
) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<TResp, ApiClientError, TVars>({
    ...options?.mutationOptions,
    mutationFn: async (vars) => {
      const url = urlFor(vars);
      const env =
        method === "del"
          ? await api.del<TResp>(url)
          : await api[method]<TResp>(url, vars);
      return (env as unknown as { data: TResp }).data;
    },
    onSuccess: (data, vars, onMutateResult, ctx) => {
      options?.mutationOptions?.onSuccess?.(data, vars, onMutateResult, ctx);
      const prefixes = options?.invalidate ?? [];
      if (prefixes.length === 0) return;
      qc.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey[0];
          if (typeof k !== "string") return false;
          return prefixes.some((p) => k === p || k.startsWith(`${p}?`));
        },
      });
    },
  });
}
