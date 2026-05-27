/**
 * Build-time DB connectivity check.
 *
 * Runs after `prisma generate` and before `next build`. Fails the build with
 * exit code 1 if the database is unreachable, so we don't ship a deployment
 * that will throw 500s as soon as a request lands.
 *
 * Mirrors src/lib/prisma.ts so the adapter + Pool semantics match the runtime
 * client (Supabase requires PrismaPg(pool), not a connection-string adapter).
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { config as loadDotenv } from "dotenv";

async function main() {
  // Skip in environments without a real DB (portfolio-sync CI, isolated build checks).
  if (process.env.SKIP_DB_CHECK === "1") {
    console.log("[DB Check] SKIP_DB_CHECK=1 — bypassing connectivity check");
    return;
  }

  // On Vercel env vars are platform-injected; locally they live in .env.
  // Load .env silently — no-op on Vercel where the file doesn't exist.
  if (!process.env.DIRECT_URL && !process.env.DATABASE_URL) {
    loadDotenv({ path: ".env", quiet: true });
  }

  const connStr = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  if (!connStr) {
    console.error("✗ DB connection check: neither DIRECT_URL nor DATABASE_URL is set");
    process.exit(1);
  }
  const masked = connStr.replace(/:\/\/([^:]+):([^@]+)@/, "://***:***@");
  console.log(`[DB Check] Target: ${masked}`);

  const pool = new pg.Pool({
    connectionString: connStr,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(`✓ DB connection OK (${Date.now() - start}ms)`);
  } catch (err) {
    console.error(
      `✗ DB connection failed after ${Date.now() - start}ms:`,
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
