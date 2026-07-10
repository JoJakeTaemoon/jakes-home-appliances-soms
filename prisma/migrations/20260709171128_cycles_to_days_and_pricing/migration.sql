-- 주기 개월→일 (기존값 × 30), 신규 가격/계약 PDF 컬럼
ALTER TABLE "Consumable" RENAME COLUMN "replaceEveryMonths" TO "replaceEveryDays";
ALTER TABLE "Consumable" RENAME COLUMN "cleanEveryMonths" TO "cleanEveryDays";
UPDATE "Consumable" SET "replaceEveryDays" = "replaceEveryDays" * 30 WHERE "replaceEveryDays" IS NOT NULL;
UPDATE "Consumable" SET "cleanEveryDays" = "cleanEveryDays" * 30 WHERE "cleanEveryDays" IS NOT NULL;

ALTER TABLE "EquipmentModel" RENAME COLUMN "inspectionEveryMonths" TO "inspectionEveryDays";
UPDATE "EquipmentModel" SET "inspectionEveryDays" = "inspectionEveryDays" * 30 WHERE "inspectionEveryDays" IS NOT NULL;

ALTER TABLE "Equipment" RENAME COLUMN "customInspectionCycle" TO "customInspectionCycleDays";
ALTER TABLE "Equipment" RENAME COLUMN "customMaintenanceCycle" TO "customMaintenanceCycleDays";
UPDATE "Equipment" SET "customInspectionCycleDays" = "customInspectionCycleDays" * 30 WHERE "customInspectionCycleDays" IS NOT NULL;
UPDATE "Equipment" SET "customMaintenanceCycleDays" = "customMaintenanceCycleDays" * 30 WHERE "customMaintenanceCycleDays" IS NOT NULL;

ALTER TABLE "EquipmentConsumable" RENAME COLUMN "replaceEveryMonths" TO "replaceEveryDays";
UPDATE "EquipmentConsumable" SET "replaceEveryDays" = "replaceEveryDays" * 30 WHERE "replaceEveryDays" IS NOT NULL;

ALTER TABLE "Equipment" ADD COLUMN "installFee" DECIMAL(14,2);
ALTER TABLE "Equipment" ADD COLUMN "salePrice" DECIMAL(14,2);
ALTER TABLE "Contract" ADD COLUMN "pdfStorageKey" TEXT;
ALTER TABLE "Contract" ADD COLUMN "pdfUploadedAt" TIMESTAMP(3);
