/**
 * GET /api/health — unauthenticated liveness + readiness probe.
 *
 * - Liveness: the route exists and the Next.js process can serve it.
 * - Readiness: Prisma can round-trip a `SELECT 1` against the DB.
 *
 * Used by:
 * - Docker `HEALTHCHECK` (gates `caddy` startup in docker-compose.yml).
 * - The staging-deploy workflow as the post-deploy smoke check.
 * - External monitoring (uptime pings) once the staging URL is public.
 *
 * Intentionally leaks nothing sensitive: no DB connection string, no env
 * values, no stack traces. Only `status`, `db`, `version`, `uptime`.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import pkg from "../../../../package.json" with { type: "json" };

// Force this route to run at request time, never cached. Health checks that
// see a cached 200 while the DB is down would be worse than no probe at all.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface HealthBody {
  status: "ok" | "degraded";
  db: "ok" | "error";
  version: string;
  uptime: number;
}

export async function GET(): Promise<NextResponse<HealthBody>> {
  let dbStatus: "ok" | "error" = "error";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "ok";
  } catch {
    // Swallow the DB error — we report "degraded" + db:"error" but never
    // surface the underlying message (could expose connection strings).
  }

  const body: HealthBody = {
    status: dbStatus === "ok" ? "ok" : "degraded",
    db: dbStatus,
    version: pkg.version,
    uptime: Math.round(process.uptime()),
  };

  // 200 even when degraded — the route is alive. Load balancers should
  // separately check the `db` field if they want to drain on DB outage.
  return NextResponse.json(body, {
    status: dbStatus === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
