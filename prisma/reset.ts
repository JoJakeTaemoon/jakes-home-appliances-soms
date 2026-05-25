import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { rm } from "node:fs/promises";
import { join } from "node:path";

const pool = new Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const uploadsDir = join(process.cwd(), "uploads", "documents");
  try {
    await rm(uploadsDir, { recursive: true, force: true });
    console.log("Deleted uploads/documents/\n");
  } catch {
    // Directory may not exist
  }

  console.log("Resetting database — deleting all data...\n");

  const counts = {
    notificationLog: await prisma.notificationLog.deleteMany(),
    dailyReportPhoto: await prisma.dailyReportPhoto.deleteMany(),
    dailyReportDrawing: await prisma.dailyReportDrawing.deleteMany(),
    dailyReportEquipment: await prisma.dailyReportEquipment.deleteMany(),
    // PR-E (IA v3.1): legacy DailyReportMaterial replaced by 3 typed usage tables.
    dailyReportUsageAttachment: await prisma.dailyReportUsageAttachment.deleteMany(),
    dailyReportConcreteUsage: await prisma.dailyReportConcreteUsage.deleteMany(),
    dailyReportRebarUsage: await prisma.dailyReportRebarUsage.deleteMany(),
    dailyReportStoneUsage: await prisma.dailyReportStoneUsage.deleteMany(),
    dailyReportVendorManpower: await prisma.dailyReportVendorManpower.deleteMany(),
    dailyReportManpower: await prisma.dailyReportManpower.deleteMany(),
    dailyReportTask: await prisma.dailyReportTask.deleteMany(),
    dailyReport: await prisma.dailyReport.deleteMany(),
    documentVersion: await prisma.documentVersion.deleteMany(),
    documentTagMap: await prisma.documentTagMap.deleteMany(),
    document: await prisma.document.deleteMany(),
    documentTag: await prisma.documentTag.deleteMany(),
    reportSchedule: await prisma.reportSchedule.deleteMany(),
    majorReporter: await prisma.majorReporter.deleteMany(),
    projectVendor: await prisma.projectVendor.deleteMany(),
    projectMember: await prisma.projectMember.deleteMany(),
    project: await prisma.project.deleteMany(),
    vendor: await prisma.vendor.deleteMany(),
    equipment: await prisma.equipment.deleteMany(),
    concreteSpec: await prisma.concreteSpec.deleteMany(),
    rebarDiameter: await prisma.rebarDiameter.deleteMany(),
    rebarType: await prisma.rebarType.deleteMany(),
    stoneGrade: await prisma.stoneGrade.deleteMany(),
    stoneSpec: await prisma.stoneSpec.deleteMany(),
    refreshToken: await prisma.refreshToken.deleteMany(),
    actionLog: await prisma.actionLog.deleteMany(),
    user: await prisma.user.deleteMany(),
    rolePermission: await prisma.rolePermission.deleteMany(),
    permission: await prisma.permission.deleteMany(),
    role: await prisma.role.deleteMany(),
  };

  for (const [table, result] of Object.entries(counts)) {
    if (result.count > 0) {
      console.log(`  Deleted ${result.count} rows from ${table}`);
    }
  }

  console.log("\nAll data deleted.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
