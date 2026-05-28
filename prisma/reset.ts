// Reset all data — DEV/STAGING ONLY.
// Per CLAUDE.md: NEVER run `npm run db:reset` on production; use `db:reset:dev`.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { rm } from "node:fs/promises";
import { join } from "node:path";

const pool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const uploadsDir = join(process.cwd(), "uploads");
  try {
    await rm(uploadsDir, { recursive: true, force: true });
    console.log("Deleted uploads/\n");
  } catch {
    // ok if missing
  }

  console.log("Resetting database — deleting all data...\n");

  // Order matters: delete children before parents.
  const counts = {
    document:           await prisma.document.deleteMany(),
    taxInvoice:         await prisma.taxInvoice.deleteMany(),
    payment:            await prisma.payment.deleteMany(),
    visit:              await prisma.visit.deleteMany(),
    serviceRequest:     await prisma.serviceRequest.deleteMany(),
    notificationLog:    await prisma.notificationLog.deleteMany(),
    contractEquipment:  await prisma.contractEquipment.deleteMany(),
    contract:           await prisma.contract.deleteMany(),
    equipment:          await prisma.equipment.deleteMany(),
    equipmentModel:     await prisma.equipmentModel.deleteMany(),
    customerSession:    await prisma.customerSession.deleteMany(),
    customerContact:    await prisma.customerContact.deleteMany(),
    site:               await prisma.site.deleteMany(),
    customer:           await prisma.customer.deleteMany(),
    auditLog:           await prisma.auditLog.deleteMany(),
    loginAttempt:       await prisma.loginAttempt.deleteMany(),
    session:            await prisma.session.deleteMany(),
    user:               await prisma.user.deleteMany(),
  };

  for (const [table, result] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(20)} ${result.count.toString().padStart(6)} rows`);
  }
  console.log("\nDone.");
}

main()
  .then(() => prisma.$disconnect().then(() => pool.end()))
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
