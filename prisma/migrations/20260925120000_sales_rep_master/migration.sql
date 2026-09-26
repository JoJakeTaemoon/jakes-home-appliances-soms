-- 판매원 master: 담당 판매원 moves off `User` onto its own table.
--
-- Most reps never log in, and hanging the roster off office accounts put every
-- staff member in the picker whether they sell or not. Existing assignments are
-- cleared deliberately (decision 2026-09-25): the roster is entered fresh, so
-- there is nothing to carry over.

CREATE TABLE "SalesRep" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "title" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesRep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesRep_isActive_idx" ON "SalesRep"("isActive");

-- Drop the old User FK and clear every assignment before pointing the column
-- at the new table, otherwise the FK cannot be created.
ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_salesRepId_fkey";
UPDATE "Customer" SET "salesRepId" = NULL WHERE "salesRepId" IS NOT NULL;

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_salesRepId_fkey"
    FOREIGN KEY ("salesRepId") REFERENCES "SalesRep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The sales-rep candidacy flag on User has no readers left.
DROP INDEX IF EXISTS "User_isSalesRep_idx";
ALTER TABLE "User" DROP COLUMN IF EXISTS "isSalesRep";
