-- CreateEnum
CREATE TYPE "ConsumableAction" AS ENUM ('REPLACE', 'CLEAN');

-- AlterTable
ALTER TABLE "EquipmentModel" ADD COLUMN     "categoryId" TEXT;

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameKo" TEXT NOT NULL,
    "nameVi" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consumable" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nameKo" TEXT NOT NULL,
    "nameVi" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "replaceEveryMonths" INTEGER,
    "cleanEveryMonths" INTEGER,
    "retailPrice" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consumable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accessory" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nameKo" TEXT NOT NULL,
    "nameVi" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "retailPrice" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accessory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumableOnModel" (
    "consumableId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,

    CONSTRAINT "ConsumableOnModel_pkey" PRIMARY KEY ("consumableId","modelId")
);

-- CreateTable
CREATE TABLE "AccessoryOnModel" (
    "accessoryId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,

    CONSTRAINT "AccessoryOnModel_pkey" PRIMARY KEY ("accessoryId","modelId")
);

-- CreateTable
CREATE TABLE "VisitConsumableLog" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "consumableId" TEXT NOT NULL,
    "action" "ConsumableAction" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitConsumableLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_code_key" ON "ProductCategory"("code");

-- CreateIndex
CREATE INDEX "ProductCategory_isActive_sortOrder_idx" ON "ProductCategory"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Consumable_sku_key" ON "Consumable"("sku");

-- CreateIndex
CREATE INDEX "Consumable_isActive_idx" ON "Consumable"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Accessory_sku_key" ON "Accessory"("sku");

-- CreateIndex
CREATE INDEX "Accessory_isActive_idx" ON "Accessory"("isActive");

-- CreateIndex
CREATE INDEX "ConsumableOnModel_modelId_idx" ON "ConsumableOnModel"("modelId");

-- CreateIndex
CREATE INDEX "AccessoryOnModel_modelId_idx" ON "AccessoryOnModel"("modelId");

-- CreateIndex
CREATE INDEX "VisitConsumableLog_visitId_idx" ON "VisitConsumableLog"("visitId");

-- CreateIndex
CREATE INDEX "VisitConsumableLog_consumableId_action_createdAt_idx" ON "VisitConsumableLog"("consumableId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "EquipmentModel_categoryId_isActive_idx" ON "EquipmentModel"("categoryId", "isActive");

-- AddForeignKey
ALTER TABLE "EquipmentModel" ADD CONSTRAINT "EquipmentModel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumableOnModel" ADD CONSTRAINT "ConsumableOnModel_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "Consumable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumableOnModel" ADD CONSTRAINT "ConsumableOnModel_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "EquipmentModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessoryOnModel" ADD CONSTRAINT "AccessoryOnModel_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessoryOnModel" ADD CONSTRAINT "AccessoryOnModel_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "EquipmentModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitConsumableLog" ADD CONSTRAINT "VisitConsumableLog_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitConsumableLog" ADD CONSTRAINT "VisitConsumableLog_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "Consumable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
