-- 재고 서브시스템 신설: 제품·소모품 재고/가격 필드 + StockMove 입출고 원장.
-- 현재고(stockOnHand)는 캐시 카운터, StockMove가 이력의 원천. 음수 허용.

-- Enums -----------------------------------------------------------------
CREATE TYPE "StockItemKind" AS ENUM ('MODEL', 'CONSUMABLE');
CREATE TYPE "StockDirection" AS ENUM ('IN', 'OUT');
CREATE TYPE "StockMoveReason" AS ENUM ('PURCHASE', 'SALE', 'INSTALL', 'FILTER_REPLACE', 'ADJUST', 'RETURN');

-- EquipmentModel: 판매가·입고가·지정가 + 재고/안전재고 -------------------
ALTER TABLE "EquipmentModel" ADD COLUMN "salePrice" DECIMAL(14,2);
ALTER TABLE "EquipmentModel" ADD COLUMN "purchasePrice" DECIMAL(14,2);
ALTER TABLE "EquipmentModel" ADD COLUMN "fixedPrice" DECIMAL(14,2);
ALTER TABLE "EquipmentModel" ADD COLUMN "stockOnHand" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EquipmentModel" ADD COLUMN "safetyStock" INTEGER NOT NULL DEFAULT 0;

-- Consumable: 제품그룹·브랜드·규격·주요용도 + 입고가·지정가 + 재고 ---------
ALTER TABLE "Consumable" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "Consumable" ADD COLUMN "brandId" TEXT;
ALTER TABLE "Consumable" ADD COLUMN "spec" TEXT;
ALTER TABLE "Consumable" ADD COLUMN "mainUse" TEXT;
ALTER TABLE "Consumable" ADD COLUMN "purchasePrice" DECIMAL(14,2);
ALTER TABLE "Consumable" ADD COLUMN "fixedPrice" DECIMAL(14,2);
ALTER TABLE "Consumable" ADD COLUMN "stockOnHand" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Consumable" ADD COLUMN "safetyStock" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Consumable_categoryId_isActive_idx" ON "Consumable"("categoryId", "isActive");
CREATE INDEX "Consumable_brandId_isActive_idx" ON "Consumable"("brandId", "isActive");

ALTER TABLE "Consumable" ADD CONSTRAINT "Consumable_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Consumable" ADD CONSTRAINT "Consumable_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- StockMove 원장 --------------------------------------------------------
CREATE TABLE "StockMove" (
  "id" TEXT NOT NULL,
  "itemKind" "StockItemKind" NOT NULL,
  "equipmentModelId" TEXT,
  "consumableId" TEXT,
  "direction" "StockDirection" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "reason" "StockMoveReason" NOT NULL,
  "unitPrice" DECIMAL(14,2),
  "sourceType" TEXT,
  "sourceId" TEXT,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMove_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockMove_equipmentModelId_createdAt_idx" ON "StockMove"("equipmentModelId", "createdAt");
CREATE INDEX "StockMove_consumableId_createdAt_idx" ON "StockMove"("consumableId", "createdAt");

ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_equipmentModelId_fkey"
  FOREIGN KEY ("equipmentModelId") REFERENCES "EquipmentModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_consumableId_fkey"
  FOREIGN KEY ("consumableId") REFERENCES "Consumable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
