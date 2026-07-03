-- AlterEnum
ALTER TYPE "VisitType" ADD VALUE 'CONSUMABLE_DELIVERY';

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "additionalTypes" "VisitType"[] DEFAULT ARRAY[]::"VisitType"[];
