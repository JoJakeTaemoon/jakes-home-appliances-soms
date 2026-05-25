import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { retryOnMaxConn } from "@/lib/db/retry";

// Defense in depth against Supabase Supavisor `EMAXCONNSESSION` errors.
//
// Supavisor's `pool_size` (session-mode) defaults to 15 even on the paid
// plan — the dashboard setting must be raised separately. Until the dashboard
// is bumped, we have to behave well inside a 15-slot ceiling shared across
// every warm Vercel function instance.
//
//   Layer 1 — `max: 3` per Prisma pool. 5 warm instances × 3 = 15 (fits).
//   Layer 2 — `idleTimeoutMillis: 1000`. Released clients return to Supavisor
//             in 1s instead of the default 10s, freeing slots fast.
//   Layer 3 — `$extends({ query: { $allOperations } })` catches
//             EMAXCONNSESSION on any model query and retries with 100/200/300ms
//             backoff. Covers transient burst overflows.
//
// Trade-off: heavy parallel routes (cost-summary) may serialise into smaller
// batches (3 at a time) and see +100~300ms latency. Acceptable for stability.

const POOL_MAX = 3;
const POOL_IDLE_TIMEOUT_MS = 1000;

function createPrismaClient() {
  const connStr = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  const masked = connStr.replace(/:\/\/([^:]+):([^@]+)@/, "://***:***@");
  console.log(`[Prisma] Connected to: ${masked}`);

  const pool = new pg.Pool({
    connectionString: connStr,
    max: POOL_MAX,
    idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
  });
  const adapter = new PrismaPg(pool);
  const base = new PrismaClient({ adapter });

  return base.$extends({
    query: {
      $allOperations({ args, query }) {
        return retryOnMaxConn(() => query(args));
      },
    },
  });
}

// We cast the $extends result back to `PrismaClient` so callers keep the
// familiar model accessor types (`prisma.user.findMany`, etc.). The retry
// extension is transparent — it doesn't add new methods, only intercepts
// existing ones — so callers don't need the extended type to benefit.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? (createPrismaClient() as unknown as PrismaClient);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
