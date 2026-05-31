-- DropIndex
DROP INDEX "EquipmentModel_modelCode_key";

-- AlterTable
ALTER TABLE "EquipmentModel" ALTER COLUMN "modelCode" DROP NOT NULL,
ALTER COLUMN "category" DROP NOT NULL;
