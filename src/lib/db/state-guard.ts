/**
 * Shared concurrency guard for state-machine transitions.
 *
 * State-machine writes are particularly prone to lost-update races: two
 * concurrent transitions both `findUnique → check → update` and both succeed
 * because each holds its own snapshot of the prior state. The fix is to pin
 * the expected prior state into the `update.where` clause. If anyone won
 * the race ahead of us, Prisma raises `P2025` (record-not-found) and we
 * translate that to a user-friendly "state changed concurrently" error.
 *
 * The 4 domain workflows all need the same pattern (Contract, Visit, Payment,
 * ServiceRequest) so it lives here rather than being copied into each.
 *
 * Usage:
 *
 *   await updateWithStateGuard(prisma.payment, {
 *     id: paymentId,
 *     expectedPriorState: current.state,
 *     data: { state: "RECONCILED", reconciledAt: new Date() },
 *     entityName: "Payment",
 *   });
 *
 * The delegate is `prisma.<model>` — any Prisma model whose update signature
 * accepts a `where` with the entity's `id` + `state` columns. The compile-time
 * type stays loose so domain workflows can pin their own state-enum types.
 */

/**
 * Structural shape for Prisma delegates. Prisma's generated `update` overload
 * is too strict to match against a loose param, so we accept any function on
 * `update` and cast inside the helper. The runtime contract is identical to
 * `prisma.<model>.update({ where, data })`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyUpdateFn = (args: { where: any; data: any }) => Promise<any>;
interface UpdatableDelegate {
  update: AnyUpdateFn;
}

export interface StateGuardArgs<TData = Record<string, unknown>> {
  /** Primary-key id of the row to update. */
  id: string;
  /** Pre-transition state value; included in WHERE alongside `id`. */
  expectedPriorState: string;
  /** Same `data` payload you'd pass to a normal `update(...)`. */
  data: TData;
  /** Human-readable entity name used in the concurrency error message. */
  entityName: string;
}

/**
 * `delegate.update({ where: { id, state }, data })` with friendly P2025 → race error.
 *
 * Returns the raw Prisma row (typed as `unknown` here so the helper stays
 * delegate-agnostic). Callers cast on the way out — domain workflows know
 * the concrete row shape they expect.
 */
export async function updateWithStateGuard<TData = Record<string, unknown>>(
  delegate: UpdatableDelegate,
  args: StateGuardArgs<TData>,
): Promise<unknown> {
  try {
    return await delegate.update({
      where: { id: args.id, state: args.expectedPriorState },
      data: args.data,
    });
  } catch (err) {
    if (isPrismaRecordNotFound(err)) {
      throw new StateChangedConcurrentlyError(args.entityName);
    }
    throw err;
  }
}

/** True iff the error looks like Prisma's "record not found" / "no rows matched WHERE". */
export function isPrismaRecordNotFound(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "P2025"
  );
}

export class StateChangedConcurrentlyError extends Error {
  readonly code = "STATE_CHANGED_CONCURRENTLY";
  constructor(entityName: string) {
    super(`${entityName} state changed concurrently — refresh and try again`);
    this.name = "StateChangedConcurrentlyError";
  }
}
