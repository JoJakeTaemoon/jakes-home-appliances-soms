-- 제품 분류 재구성 (2026-09-26).
--
--   제품군 (ProductCategory) ─┬─ 제품 유형 (ProductType, new)   M:N, ≥1 per type
--                             ├─ 모델                          M:N, ≥1 per model
--                             └─ 소모품 / 부속품               M:N, 0..N (search only)
--   모델 ── 제품 유형                                          0..1
--
-- The "at least one" rules and "a typed model's 제품군 must be the type's" live
-- in the API (src/lib/products/classification.ts) — a join table cannot carry
-- them. Order matters here: create the join tables, copy the old single FKs
-- into them, and only then drop the columns.

-- ── 1. new tables ────────────────────────────────────────────────────
CREATE TABLE "ProductType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameKo" TEXT NOT NULL,
    "nameVi" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductTypeCategory" (
    "productTypeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "ProductTypeCategory_pkey" PRIMARY KEY ("productTypeId","categoryId")
);

CREATE TABLE "EquipmentModelCategory" (
    "modelId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "EquipmentModelCategory_pkey" PRIMARY KEY ("modelId","categoryId")
);

CREATE TABLE "ConsumableCategory" (
    "consumableId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "ConsumableCategory_pkey" PRIMARY KEY ("consumableId","categoryId")
);

CREATE TABLE "AccessoryCategory" (
    "accessoryId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "AccessoryCategory_pkey" PRIMARY KEY ("accessoryId","categoryId")
);

CREATE UNIQUE INDEX "ProductType_code_key" ON "ProductType"("code");
CREATE INDEX "ProductType_isActive_sortOrder_idx" ON "ProductType"("isActive", "sortOrder");
CREATE INDEX "ProductTypeCategory_categoryId_idx" ON "ProductTypeCategory"("categoryId");
CREATE INDEX "EquipmentModelCategory_categoryId_idx" ON "EquipmentModelCategory"("categoryId");
CREATE INDEX "ConsumableCategory_categoryId_idx" ON "ConsumableCategory"("categoryId");
CREATE INDEX "AccessoryCategory_categoryId_idx" ON "AccessoryCategory"("categoryId");

ALTER TABLE "ProductTypeCategory" ADD CONSTRAINT "ProductTypeCategory_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "ProductType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductTypeCategory" ADD CONSTRAINT "ProductTypeCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipmentModelCategory" ADD CONSTRAINT "EquipmentModelCategory_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "EquipmentModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipmentModelCategory" ADD CONSTRAINT "EquipmentModelCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsumableCategory" ADD CONSTRAINT "ConsumableCategory_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "Consumable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsumableCategory" ADD CONSTRAINT "ConsumableCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessoryCategory" ADD CONSTRAINT "AccessoryCategory_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessoryCategory" ADD CONSTRAINT "AccessoryCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 2. carry the old single 제품군 over ──────────────────────────────
-- A model with no 제품군 today keeps zero links; the API asks for one on its
-- next save rather than this migration inventing a classification.
INSERT INTO "EquipmentModelCategory" ("modelId", "categoryId")
SELECT "id", "categoryId" FROM "EquipmentModel" WHERE "categoryId" IS NOT NULL;

INSERT INTO "ConsumableCategory" ("consumableId", "categoryId")
SELECT "id", "categoryId" FROM "Consumable" WHERE "categoryId" IS NOT NULL;

-- ── 3. drop the single FKs ───────────────────────────────────────────
ALTER TABLE "EquipmentModel" DROP CONSTRAINT "EquipmentModel_categoryId_fkey";
DROP INDEX "EquipmentModel_categoryId_isActive_idx";
ALTER TABLE "EquipmentModel" DROP COLUMN "categoryId";

ALTER TABLE "Consumable" DROP CONSTRAINT "Consumable_categoryId_fkey";
DROP INDEX "Consumable_categoryId_isActive_idx";
ALTER TABLE "Consumable" DROP COLUMN "categoryId";

-- ── 4. model → 제품 유형 (optional) ─────────────────────────────────
ALTER TABLE "EquipmentModel" ADD COLUMN "productTypeId" TEXT;
CREATE INDEX "EquipmentModel_productTypeId_isActive_idx" ON "EquipmentModel"("productTypeId", "isActive");
ALTER TABLE "EquipmentModel" ADD CONSTRAINT "EquipmentModel_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "ProductType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
