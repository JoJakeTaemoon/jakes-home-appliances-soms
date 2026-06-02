/**
 * Mutation + query higher-order helpers for API routes.
 *
 * Every route in this app follows the same five-step shape:
 *
 *   1. authenticate (staff or customer realm)
 *   2. authorize (role / permission gate)
 *   3. parse params (Zod)
 *   4. parse body (Zod)
 *   5. run the handler, then optionally write an AuditLog row, then
 *      envelope the JSON response.
 *
 * `defineMutation` encodes that shape so each route file can become a
 * declarative config + a handler closure. `defineQuery` is the GET-side
 * cousin (no body, no built-in audit).
 *
 * Wire protocol is unchanged — both helpers return responses produced by
 * `successResponse` / `toErrorResponse`, so error envelopes, status codes,
 * and JSON shape stay byte-identical to the hand-rolled try/catch routes
 * they replace.
 */

import type { NextRequest } from "next/server";
import type { ZodIssue, ZodTypeAny, z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import type { AuthenticatedStaff } from "@/lib/auth/guards";
import { requireFieldAuth } from "@/lib/auth/field-guards";
import type { AuthenticatedField } from "@/lib/auth/field-guards";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import type { AuthenticatedCustomer } from "@/lib/auth/customer-guards";
import {
  paginatedResponse,
  successResponse,
  toErrorResponse,
} from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

// ─── Public types ────────────────────────────────────────────────────────

export type Audience = "staff" | "field" | "customer";

/** Subset of NextRequest's `RouteContext`. Params are always async in app router. */
export interface RouteContext {
  params: Promise<unknown>;
}

/** All five inputs visible to a handler. */
export interface MutationContext<TAuth, TBody, TParams> {
  auth: TAuth;
  body: TBody;
  params: TParams;
  request: NextRequest;
}

export interface QueryContext<TAuth, TParams, TQuery> {
  auth: TAuth;
  params: TParams;
  query: TQuery;
  request: NextRequest;
}

export type AudiencedAuth<A extends Audience> = A extends "customer"
  ? AuthenticatedCustomer
  : A extends "field"
    ? AuthenticatedField
    : AuthenticatedStaff;

/** Audit-row config. Replaces inline `logAudit({...})` calls in route handlers. */
export interface MutationAuditConfig<TCtx, TResult> {
  action: string;
  entityType: string;
  /** Pluck the entityId out of the handler result (defaults to `result.id`). */
  entityId?: (result: TResult, ctx: TCtx) => string | null | undefined;
  /**
   * Snapshot before the change. Skip if not meaningful. May return a Promise
   * for cases where the pre-image must be fetched from the DB (the wrapper
   * awaits the return value before writing the audit row).
   */
  before?: (ctx: TCtx) => unknown;
  /** Snapshot of relevant fields after the change. May be async. */
  after?: (result: TResult, ctx: TCtx) => unknown;
}

export interface MutationConfig<
  A extends Audience,
  BodySchema extends ZodTypeAny | undefined,
  ParamsSchema extends ZodTypeAny | undefined,
  TResult,
> {
  /** Which auth realm to gate on. */
  audience: A;

  /**
   * Optional role / permission predicate run AFTER auth resolves.
   * Throw a `ForbiddenError` (or any `ApiError`) to deny.
   */
  authorize?: (auth: AudiencedAuth<A>) => void | Promise<void>;

  /** Optional Zod schema for the JSON body. If omitted, handler sees `undefined`. */
  body?: BodySchema;

  /**
   * Optional Zod schema for `params` (the `{ id }` etc. in `[id]/route.ts`).
   * If omitted, handler receives the raw awaited params (typed as `unknown`).
   */
  params?: ParamsSchema;

  /** The actual mutation. Return a JSON-serialisable value. */
  handler: (
    ctx: MutationContext<
      AudiencedAuth<A>,
      InferZod<BodySchema>,
      InferZodOrUnknown<ParamsSchema>
    >,
  ) => Promise<TResult>;

  /**
   * Optional audit hook. Runs AFTER the handler succeeds. The hook is
   * fire-and-forget at the `logAudit` layer (never throws into the
   * response), so audit failures cannot abort the user-visible 2xx.
   */
  audit?: MutationAuditConfig<
    MutationContext<
      AudiencedAuth<A>,
      InferZod<BodySchema>,
      InferZodOrUnknown<ParamsSchema>
    >,
    TResult
  >;

  /** HTTP status on success. Default 200 (set to 201 for creates). */
  successStatus?: number;
}

export interface QueryConfig<
  A extends Audience,
  ParamsSchema extends ZodTypeAny | undefined,
  QuerySchema extends ZodTypeAny | undefined,
  TResult,
> {
  audience: A;
  authorize?: (auth: AudiencedAuth<A>) => void | Promise<void>;
  params?: ParamsSchema;
  /** Optional URLSearchParams Zod parser. */
  query?: QuerySchema;
  handler: (
    ctx: QueryContext<
      AudiencedAuth<A>,
      InferZodOrUnknown<ParamsSchema>,
      InferZod<QuerySchema>
    >,
  ) => Promise<TResult>;
  /**
   * If true and the handler returns `{ rows, pagination }`, the result is
   * emitted via `paginatedResponse` instead of `successResponse`.
   */
  paginated?: boolean;
}

type InferZod<S> = S extends ZodTypeAny ? z.infer<S> : undefined;
type InferZodOrUnknown<S> = S extends ZodTypeAny ? z.infer<S> : unknown;

export type RouteHandler = (
  request: NextRequest,
  context?: RouteContext,
) => Promise<Response>;

// ─── Implementation ──────────────────────────────────────────────────────

/**
 * Dispatch to the correct realm guard. Each realm reads its own cookie
 * (and verifies a realm-bound JWT `aud` claim), so a token minted for one
 * realm cannot satisfy another.
 */
function authenticateForAudience(
  audience: Audience,
  request: NextRequest,
): Promise<AuthenticatedStaff | AuthenticatedField | AuthenticatedCustomer> {
  if (audience === "customer") return requireCustomerAuth(request);
  if (audience === "field") return requireFieldAuth(request);
  return requireAuth(request);
}

export function defineMutation<
  A extends Audience,
  BodySchema extends ZodTypeAny | undefined = undefined,
  ParamsSchema extends ZodTypeAny | undefined = undefined,
  TResult = unknown,
>(
  config: MutationConfig<A, BodySchema, ParamsSchema, TResult>,
): RouteHandler {
  type TBody = InferZod<BodySchema>;
  type TParams = InferZodOrUnknown<ParamsSchema>;
  return async (request, routeCtx) => {
    try {
      // 1. Authenticate. Each realm reads its own cookie + verifies a
      //    realm-bound JWT audience claim; mismatched tokens fail closed.
      const auth = (await authenticateForAudience(
        config.audience,
        request,
      )) as AudiencedAuth<A>;

      // 2. Authorize.
      if (config.authorize) await config.authorize(auth);

      // 3. Parse params.
      const rawParams = routeCtx ? await routeCtx.params : {};
      const params = (
        config.params
          ? parseOrThrow(config.params, rawParams, "params")
          : rawParams
      ) as TParams;

      // 4. Parse body.
      let body: TBody;
      if (config.body) {
        const raw = await safelyReadJson(request);
        body = parseOrThrow(config.body, raw ?? {}, "body") as TBody;
      } else {
        body = undefined as TBody;
      }

      // 5. Run handler.
      const ctx: MutationContext<AudiencedAuth<A>, TBody, TParams> = {
        auth,
        body,
        params,
        request,
      };
      const result = await config.handler(ctx);

      // 6. Audit (optional). Errors here are swallowed by `logAudit`.
      if (config.audit) {
        const fallbackId =
          result && typeof result === "object" && result !== null && "id" in result
            ? (result as { id?: unknown }).id
            : undefined;
        const entityId =
          config.audit.entityId?.(result, ctx) ??
          (typeof fallbackId === "string" ? fallbackId : null) ??
          null;
        const before = config.audit.before
          ? await Promise.resolve(config.audit.before(ctx))
          : undefined;
        const after = config.audit.after
          ? await Promise.resolve(config.audit.after(result, ctx))
          : undefined;
        await logAudit({
          actorType: config.audience === "customer" ? "CUSTOMER" : "USER",
          actorId:
            config.audience === "customer"
              ? (auth as AuthenticatedCustomer).contactId
              : (auth as AuthenticatedStaff).userId,
          action: config.audit.action,
          entityType: config.audit.entityType,
          entityId,
          before,
          after,
          request,
        });
      }

      return successResponse(result, config.successStatus ?? 200);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export function defineQuery<
  A extends Audience,
  ParamsSchema extends ZodTypeAny | undefined = undefined,
  QuerySchema extends ZodTypeAny | undefined = undefined,
  TResult = unknown,
>(
  config: QueryConfig<A, ParamsSchema, QuerySchema, TResult>,
): RouteHandler {
  type TParams = InferZodOrUnknown<ParamsSchema>;
  type TQuery = InferZod<QuerySchema>;
  return async (request, routeCtx) => {
    try {
      const auth = (await authenticateForAudience(
        config.audience,
        request,
      )) as AudiencedAuth<A>;

      if (config.authorize) await config.authorize(auth);

      const rawParams = routeCtx ? await routeCtx.params : {};
      const params = (
        config.params
          ? parseOrThrow(config.params, rawParams, "params")
          : rawParams
      ) as TParams;

      let query: TQuery;
      if (config.query) {
        const url = new URL(request.url);
        const raw = Object.fromEntries(url.searchParams);
        query = parseOrThrow(config.query, raw, "query") as TQuery;
      } else {
        query = undefined as TQuery;
      }

      const result = await config.handler({ auth, params, query, request });

      if (config.paginated && isPaginatedShape(result)) {
        return paginatedResponse(result.rows, result.pagination);
      }

      return successResponse(result);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────

function parseOrThrow<S extends ZodTypeAny>(
  schema: S,
  raw: unknown,
  where: "body" | "params" | "query",
): z.infer<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      `Invalid ${where}`,
      parsed.error.issues.map((i: ZodIssue) => ({
        path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
        message: i.message,
      })),
    );
  }
  return parsed.data;
}

async function safelyReadJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isPaginatedShape(
  v: unknown,
): v is { rows: unknown[]; pagination: { page: number; limit: number; total: number } } {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.rows) &&
    !!o.pagination &&
    typeof o.pagination === "object"
  );
}
