-- Drop the legacy `EquipmentCategory` enum. ProductCategory (제품군) is now the
-- model's only classifier.
--
-- Backfill order matters: every legacy enum value must land on a ProductCategory
-- row before the column goes away, otherwise the classification is lost.
--   1. WATER_PURIFIER / BIDET / AIR_PURIFIER / FILTER already exist as
--      ProductCategory codes (seeded), so they match by code.
--   2. OTHER has no seeded counterpart — create it only if some model actually
--      needs it, so we don't add a stray 제품군 to clean installs.

INSERT INTO "ProductCategory" ("id", "code", "nameKo", "nameVi", "nameEn", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'pc_legacy_other_0001', 'OTHER', '기타', 'Khác', 'Other', 900, true, now(), now()
WHERE EXISTS (
  SELECT 1 FROM "EquipmentModel"
  WHERE "categoryId" IS NULL AND "category" = 'OTHER'
)
ON CONFLICT ("code") DO NOTHING;

UPDATE "EquipmentModel" m
SET "categoryId" = c."id"
FROM "ProductCategory" c
WHERE m."categoryId" IS NULL
  AND m."category" IS NOT NULL
  AND c."code" = m."category"::text;

DROP INDEX IF EXISTS "EquipmentModel_category_isActive_idx";

ALTER TABLE "EquipmentModel" DROP COLUMN "category";

DROP TYPE "EquipmentCategory";
