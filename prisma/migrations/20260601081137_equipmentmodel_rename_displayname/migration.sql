-- EquipmentModel — collapse `displayName{En,Ko,Vi}` to `name{En,Ko,Vi}` and
-- drop the redundant single-language `name` column. UI/API now picks the
-- locale-appropriate `name{locale}` directly via a shared helper.

ALTER TABLE "EquipmentModel" RENAME COLUMN "displayNameEn" TO "nameEn";
ALTER TABLE "EquipmentModel" RENAME COLUMN "displayNameKo" TO "nameKo";
ALTER TABLE "EquipmentModel" RENAME COLUMN "displayNameVi" TO "nameVi";

-- Preserve any rows whose KO name is still NULL by backfilling from the
-- legacy `name` column before we drop it.
UPDATE "EquipmentModel" SET "nameKo" = "name" WHERE "nameKo" IS NULL;
UPDATE "EquipmentModel" SET "nameEn" = "name" WHERE "nameEn" IS NULL;
UPDATE "EquipmentModel" SET "nameVi" = "name" WHERE "nameVi" IS NULL;

ALTER TABLE "EquipmentModel" DROP COLUMN "name";
