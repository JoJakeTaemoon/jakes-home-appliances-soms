-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "equipmentId" TEXT;

-- CreateTable
CREATE TABLE "EquipmentConsumable" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "consumableId" TEXT,
    "customName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "replaceEveryMonths" INTEGER,
    "unitPrice" DECIMAL(14,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentConsumable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentConsumable_equipmentId_idx" ON "EquipmentConsumable"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentConsumable_consumableId_idx" ON "EquipmentConsumable"("consumableId");

-- CreateIndex
CREATE INDEX "Payment_equipmentId_idx" ON "Payment"("equipmentId");

-- AddForeignKey
ALTER TABLE "EquipmentConsumable" ADD CONSTRAINT "EquipmentConsumable_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentConsumable" ADD CONSTRAINT "EquipmentConsumable_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "Consumable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
