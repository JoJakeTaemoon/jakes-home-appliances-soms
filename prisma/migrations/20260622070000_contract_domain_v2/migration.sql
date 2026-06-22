-- ─── Enums ────────────────────────────────────────────────────────────────
CREATE TYPE "EndOfTermAction" AS ENUM ('TRANSFER_OWNERSHIP', 'RETRIEVE_DEVICE');

CREATE TYPE "PaymentKind" AS ENUM (
  'DEPOSIT',
  'RENTAL_FEE',
  'SALE_PAYMENT',
  'MAINTENANCE_FEE',
  'SERVICE_FEE',
  'DEPOSIT_REFUND'
);

ALTER TYPE "VisitType" ADD VALUE 'RETRIEVAL';

-- ─── Contract ─────────────────────────────────────────────────────────────
ALTER TABLE "Contract" ADD COLUMN "deposit" DECIMAL(14, 2);
ALTER TABLE "Contract" ADD COLUMN "endOfTermAction" "EndOfTermAction" DEFAULT 'TRANSFER_OWNERSHIP';
ALTER TABLE "Contract" ADD COLUMN "terminationRefundAmount" DECIMAL(14, 2);
ALTER TABLE "Contract" ADD COLUMN "convertedFromType" "ContractType";
ALTER TABLE "Contract" ADD COLUMN "convertedAt" TIMESTAMP(3);

-- Backfill: existing RENTAL rows default to TRANSFER_OWNERSHIP (current
-- behavior). Non-RENTAL types stay NULL.
UPDATE "Contract" SET "endOfTermAction" = 'TRANSFER_OWNERSHIP' WHERE "type" = 'RENTAL';

CREATE INDEX "Contract_endDate_idx" ON "Contract"("endDate");

-- ─── Equipment ────────────────────────────────────────────────────────────
-- Make modelId nullable so MAINTENANCE contracts can register off-catalog
-- customer-owned devices. Drop + re-create the FK as nullable; existing rows
-- keep their modelId.
ALTER TABLE "Equipment" DROP CONSTRAINT IF EXISTS "Equipment_modelId_fkey";
ALTER TABLE "Equipment" ALTER COLUMN "modelId" DROP NOT NULL;
ALTER TABLE "Equipment"
  ADD CONSTRAINT "Equipment_modelId_fkey"
  FOREIGN KEY ("modelId") REFERENCES "EquipmentModel"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Equipment" ADD COLUMN "customDescription" VARCHAR(500);
ALTER TABLE "Equipment" ADD COLUMN "customMaintenanceCycle" INTEGER;

-- ─── Visit ────────────────────────────────────────────────────────────────
ALTER TABLE "Visit" ADD COLUMN "contractId" TEXT;
ALTER TABLE "Visit"
  ADD CONSTRAINT "Visit_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Visit_contractId_idx" ON "Visit"("contractId");

-- ─── Payment ──────────────────────────────────────────────────────────────
ALTER TABLE "Payment" ADD COLUMN "kind" "PaymentKind" NOT NULL DEFAULT 'RENTAL_FEE';

CREATE INDEX "Payment_contractId_kind_idx" ON "Payment"("contractId", "kind");
