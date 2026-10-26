/**
 * 시리얼 번호 — `{prefix}{NNNN}`, where the prefix is the model code + install
 * date (YYMMDD) or one staff typed. The number continues past the highest one
 * already used with that prefix, so a second registration of the same model
 * on the same day gets 0002 instead of a second 0001. Serials stay non-unique
 * in the schema (hand-typed and legacy ones can repeat); this only keeps the
 * generated ones from colliding.
 */
import type { Prisma } from "@/generated/prisma/client";

export async function nextSerials(tx: Prisma.TransactionClient, prefix: string, count: number): Promise<string[]> {
  // Two registrations at once would read the same highest number.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`serial:${prefix}`}))`;
  const taken = await tx.equipment.findMany({
    where: { serialNumber: { startsWith: prefix } },
    select: { serialNumber: true },
  });
  const highest = taken.reduce((max, r) => {
    const tail = r.serialNumber!.slice(prefix.length);
    return /^\d{4,}$/.test(tail) ? Math.max(max, Number(tail)) : max;
  }, 0);
  return Array.from({ length: count }, (_, i) => `${prefix}${String(highest + i + 1).padStart(4, "0")}`);
}
