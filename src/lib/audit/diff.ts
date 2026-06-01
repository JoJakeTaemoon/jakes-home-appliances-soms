/**
 * Shallow before/after diff for audit payloads.
 *
 * Audit `before`/`after` payloads are intentionally flat (writer-side
 * `pickAudit()` flattens them). Deep diff is not needed for v1 — nested
 * shapes render as compact JSON in the cell. See plan §"비범위" for v2.
 */

export type DiffKind = "created" | "deleted" | "updated";

export interface DiffEntry {
  field: string;
  beforeValue: unknown;
  afterValue: unknown;
  kind: DiffKind;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Diff two payloads. Returns entries sorted by field name (stable render).
 *
 *   computeDiff({ a: 1, b: 2 }, { a: 1, b: 3 })
 *     // → [{ field: "b", beforeValue: 2, afterValue: 3, kind: "updated" }]
 *
 *   computeDiff(null, { name: "x" })
 *     // → [{ field: "name", ..., kind: "created" }]
 *
 *   computeDiff({ name: "x" }, null)
 *     // → [{ field: "name", ..., kind: "deleted" }]
 */
export function computeDiff(before: unknown, after: unknown): DiffEntry[] {
  const beforeObj = isPlainObject(before) ? before : null;
  const afterObj = isPlainObject(after) ? after : null;

  if (!beforeObj && !afterObj) return [];

  // CREATE
  if (!beforeObj && afterObj) {
    return Object.keys(afterObj)
      .sort()
      .map((field) => ({
        field,
        beforeValue: undefined,
        afterValue: afterObj[field],
        kind: "created" as const,
      }));
  }

  // DELETE
  if (beforeObj && !afterObj) {
    return Object.keys(beforeObj)
      .sort()
      .map((field) => ({
        field,
        beforeValue: beforeObj[field],
        afterValue: undefined,
        kind: "deleted" as const,
      }));
  }

  // UPDATE — only changed fields
  const keys = new Set<string>([
    ...Object.keys(beforeObj!),
    ...Object.keys(afterObj!),
  ]);
  const out: DiffEntry[] = [];
  for (const field of [...keys].sort()) {
    const bv = beforeObj![field];
    const av = afterObj![field];
    if (jsonEqual(bv, av)) continue;
    out.push({
      field,
      beforeValue: bv,
      afterValue: av,
      kind: "updated",
    });
  }
  return out;
}
