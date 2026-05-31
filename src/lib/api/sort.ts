import { z } from "zod";

/**
 * Shared `sortBy` + `sortDir` query params for paginated list endpoints.
 *
 * Each route declares its `SortMap` (a closed set per resource) and a
 * `defaultOrderBy` shape; `resolveOrderBy` converts the validated query
 * into a Prisma `orderBy` object — falling back to the default when the
 * client either omits `sortBy` or sends an unknown key.
 *
 * The return type is `unknown` on purpose; callers spread it into
 * `findMany({ orderBy })` where Prisma's row type accepts it. We keep the
 * helper unaware of the concrete model so it can be shared across resources
 * without a per-model generic.
 */
export const sortQueryFields = {
  sortBy: z.string().trim().min(1).max(60).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
};

export type SortParam = {
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

/**
 * Map of `sortBy` key → Prisma orderBy fragment. The fragment accepts the
 * resolved direction so nested relation sorts can route it appropriately,
 * e.g. `customer: (dir) => ({ customer: { name: dir } })`.
 */
export type SortMap<TOrderBy = unknown> = Record<
  string,
  (dir: "asc" | "desc") => TOrderBy
>;

export function resolveOrderBy<TOrderBy>(
  query: SortParam,
  map: SortMap<TOrderBy>,
  defaultOrderBy: TOrderBy,
): TOrderBy {
  const key = query.sortBy;
  const dir = query.sortDir ?? "asc";
  if (!key) return defaultOrderBy;
  const builder = map[key];
  if (!builder) return defaultOrderBy;
  return builder(dir);
}
