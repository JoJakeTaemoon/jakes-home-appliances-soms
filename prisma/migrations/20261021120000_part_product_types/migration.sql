-- 제품 유형 on consumables and accessories — zero or more, search only.
-- CreateTable
CREATE TABLE "ConsumableProductType" (
    "consumableId" TEXT NOT NULL,
    "productTypeId" TEXT NOT NULL,

    CONSTRAINT "ConsumableProductType_pkey" PRIMARY KEY ("consumableId","productTypeId")
);

-- CreateTable
CREATE TABLE "AccessoryProductType" (
    "accessoryId" TEXT NOT NULL,
    "productTypeId" TEXT NOT NULL,

    CONSTRAINT "AccessoryProductType_pkey" PRIMARY KEY ("accessoryId","productTypeId")
);

-- CreateIndex
CREATE INDEX "ConsumableProductType_productTypeId_idx" ON "ConsumableProductType"("productTypeId");

-- CreateIndex
CREATE INDEX "AccessoryProductType_productTypeId_idx" ON "AccessoryProductType"("productTypeId");

-- AddForeignKey
ALTER TABLE "ConsumableProductType" ADD CONSTRAINT "ConsumableProductType_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "Consumable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumableProductType" ADD CONSTRAINT "ConsumableProductType_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "ProductType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessoryProductType" ADD CONSTRAINT "AccessoryProductType_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessoryProductType" ADD CONSTRAINT "AccessoryProductType_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "ProductType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

