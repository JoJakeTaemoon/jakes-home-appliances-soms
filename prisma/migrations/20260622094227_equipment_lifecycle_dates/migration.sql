-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "retrievedAt" TIMESTAMP(3),
ADD COLUMN     "terminatedAt" TIMESTAMP(3);
