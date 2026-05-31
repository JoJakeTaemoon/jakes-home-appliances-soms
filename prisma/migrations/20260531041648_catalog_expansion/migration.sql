-- CreateEnum
CREATE TYPE "ChargePolicyContractType" AS ENUM ('RENTAL', 'SALE', 'MAINTENANCE');

-- AlterTable
ALTER TABLE "Accessory" ADD COLUMN     "isMinorPart" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AccessoryOnModel" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Consumable" ADD COLUMN     "cleanOnEveryVisit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ConsumableOnModel" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "EquipmentModel" ADD COLUMN     "brandId" TEXT,
ADD COLUMN     "displayNameEn" TEXT,
ADD COLUMN     "displayNameKo" TEXT,
ADD COLUMN     "displayNameVi" TEXT,
ADD COLUMN     "inspectionEveryMonths" INTEGER,
ADD COLUMN     "warrantyMonths" INTEGER DEFAULT 12;

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargePolicy" (
    "id" TEXT NOT NULL,
    "accessoryId" TEXT,
    "consumableId" TEXT,
    "contractType" "ChargePolicyContractType" NOT NULL,
    "withinWarranty" BOOLEAN NOT NULL DEFAULT false,
    "isChargeable" BOOLEAN NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE INDEX "Brand_isActive_sortOrder_idx" ON "Brand"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ChargePolicy_accessoryId_idx" ON "ChargePolicy"("accessoryId");

-- CreateIndex
CREATE INDEX "ChargePolicy_consumableId_idx" ON "ChargePolicy"("consumableId");

-- CreateIndex
CREATE UNIQUE INDEX "ChargePolicy_accessoryId_contractType_withinWarranty_key" ON "ChargePolicy"("accessoryId", "contractType", "withinWarranty");

-- CreateIndex
CREATE UNIQUE INDEX "ChargePolicy_consumableId_contractType_withinWarranty_key" ON "ChargePolicy"("consumableId", "contractType", "withinWarranty");

-- CreateIndex
CREATE INDEX "EquipmentModel_brandId_isActive_idx" ON "EquipmentModel"("brandId", "isActive");

-- AddForeignKey
ALTER TABLE "EquipmentModel" ADD CONSTRAINT "EquipmentModel_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargePolicy" ADD CONSTRAINT "ChargePolicy_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargePolicy" ADD CONSTRAINT "ChargePolicy_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "Consumable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
