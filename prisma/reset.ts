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
    visitConsumableLog: await prisma.visitConsumableLog.deleteMany(),
    visit:              await prisma.visit.deleteMany(),
    serviceRequest:     await prisma.serviceRequest.deleteMany(),
    notificationLog:    await prisma.notificationLog.deleteMany(),
    // Order → Customer is onDelete: Restrict, so orders must go before their
    // parents (customer/contract/equipment). OrderItem → Order is Cascade.
    orderItem:          await prisma.orderItem.deleteMany(),
    order:              await prisma.order.deleteMany(),
    contractEquipment:  await prisma.contractEquipment.deleteMany(),
    contract:           await prisma.contract.deleteMany(),
    equipmentConsumable: await prisma.equipmentConsumable.deleteMany(),
    equipment:          await prisma.equipment.deleteMany(),
    // Catalog + inventory — clear fully so a reset rebuilds it from scratch
    // (no stale orphan parts, and StockMove empty so the seed writes fresh
    // stock counters that reconcile with the ledger).
    stockMove:          await prisma.stockMove.deleteMany(),
    consumableOnModel:  await prisma.consumableOnModel.deleteMany(),
    accessoryOnModel:   await prisma.accessoryOnModel.deleteMany(),
    chargePolicy:       await prisma.chargePolicy.deleteMany(),
    equipmentModel:     await prisma.equipmentModel.deleteMany(),
    consumable:         await prisma.consumable.deleteMany(),
    accessory:          await prisma.accessory.deleteMany(),
    brand:              await prisma.brand.deleteMany(),
    productCategory:    await prisma.productCategory.deleteMany(),
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
