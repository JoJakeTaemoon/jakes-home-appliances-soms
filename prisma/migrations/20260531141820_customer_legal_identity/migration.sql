-- CreateEnum
CREATE TYPE "CustomerResidency" AS ENUM ('DOMESTIC', 'FOREIGN');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "nationalId" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "passportNumber" TEXT,
ADD COLUMN     "representativeName" TEXT,
ADD COLUMN     "residency" "CustomerResidency" DEFAULT 'DOMESTIC';
