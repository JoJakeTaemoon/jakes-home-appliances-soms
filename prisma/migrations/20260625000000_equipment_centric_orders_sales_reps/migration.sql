-- ─── Enums ────────────────────────────────────────────────────────────────
CREATE TYPE "EquipmentServiceType" AS ENUM ('RENTAL', 'MAINTENANCE', 'SALE');
CREATE TYPE "ManagementType" AS ENUM ('FULL_SERVICE', 'SELF_MANAGED', 'OTHER');
CREATE TYPE "LifecycleStage" AS ENUM ('INSTALLED', 'IN_RENTAL', 'IN_MAINTENANCE', 'RETRIEVED', 'REPLACED');
CREATE TYPE "OrderState" AS ENUM ('PENDING', 'DELIVERED', 'CANCELLED');
CREATE TYPE "ProductKind" AS ENUM ('EQUIPMENT', 'CONSUMABLE', 'OTHER');

-- ─── User ────────────────────────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN "isSalesRep" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "title" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;

CREATE INDEX "User_isSalesRep_idx" ON "User"("isSalesRep");

-- ─── Customer ────────────────────────────────────────────────────────────
ALTER TABLE "Customer" ADD COLUMN "salesRepId" TEXT;
ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_salesRepId_fkey"
  FOREIGN KEY ("salesRepId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Customer_salesRepId_idx" ON "Customer"("salesRepId");

-- ─── Equipment ──────────────────────────────────────────────────────────
ALTER TABLE "Equipment" ADD COLUMN "deposit" DECIMAL(14, 2);
ALTER TABLE "Equipment" ADD COLUMN "monthlyFee" DECIMAL(14, 2);
ALTER TABLE "Equipment" ADD COLUMN "serviceType" "EquipmentServiceType";
ALTER TABLE "Equipment" ADD COLUMN "managementType" "ManagementType";
ALTER TABLE "Equipment" ADD COLUMN "lifecycleStage" "LifecycleStage" NOT NULL DEFAULT 'INSTALLED';
ALTER TABLE "Equipment" ADD COLUMN "customInspectionCycle" INTEGER;
ALTER TABLE "Equipment" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "Equipment" ADD COLUMN "registeredById" TEXT;
ALTER TABLE "Equipment" ADD COLUMN "assetCode" TEXT;

ALTER TABLE "Equipment"
  ADD CONSTRAINT "Equipment_registeredById_fkey"
  FOREIGN KEY ("registeredById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Equipment_assetCode_key" ON "Equipment"("assetCode");
CREATE INDEX "Equipment_assetCode_idx" ON "Equipment"("assetCode");
CREATE INDEX "Equipment_serviceType_lifecycleStage_idx" ON "Equipment"("serviceType", "lifecycleStage");
CREATE INDEX "Equipment_managementType_idx" ON "Equipment"("managementType");

-- Backfill equipment from linked contracts:
-- - serviceType from Contract.type (first ACTIVE/COMPLETED contract)
-- - managementType default to FULL_SERVICE (typical Seoul Aqua case)
-- - deposit/monthlyFee from contract divided by line quantity (best-effort)
-- - lifecycleStage from current status + linked contract state

UPDATE "Equipment" e
SET "managementType" = 'FULL_SERVICE'
WHERE "managementType" IS NULL;

UPDATE "Equipment" e
SET "serviceType" = c."type"::text::"EquipmentServiceType"
FROM "ContractEquipment" ce
JOIN "Contract" c ON c."id" = ce."contractId"
WHERE ce."equipmentId" = e."id"
  AND e."serviceType" IS NULL
  AND c."state" IN ('ACTIVE', 'PENDING_SIGNATURE', 'AMENDED');

-- Backfill deposit/monthlyFee: take first contract's value divided by line quantity
UPDATE "Equipment" e
SET
  "deposit" = COALESCE(e."deposit", c."deposit" / NULLIF(ce."quantity", 0)),
  "monthlyFee" = COALESCE(e."monthlyFee", c."monthlyMaintenanceFee" / NULLIF(ce."quantity", 0))
FROM "ContractEquipment" ce
JOIN "Contract" c ON c."id" = ce."contractId"
WHERE ce."equipmentId" = e."id"
  AND c."state" IN ('ACTIVE', 'PENDING_SIGNATURE', 'AMENDED');

-- Backfill lifecycleStage:
-- - REPLACED → REPLACED
-- - DEACTIVATED/TERMINATED with retrievedAt → RETRIEVED
-- - linked to ACTIVE RENTAL contract → IN_RENTAL
-- - linked to ACTIVE MAINTENANCE/SALE contract → IN_MAINTENANCE
-- - else → INSTALLED (default)

UPDATE "Equipment" SET "lifecycleStage" = 'REPLACED' WHERE "status" = 'REPLACED';
UPDATE "Equipment" SET "lifecycleStage" = 'RETRIEVED' WHERE "retrievedAt" IS NOT NULL;

UPDATE "Equipment" e
SET "lifecycleStage" = 'IN_RENTAL'
FROM "ContractEquipment" ce
JOIN "Contract" c ON c."id" = ce."contractId"
WHERE ce."equipmentId" = e."id"
  AND c."type" = 'RENTAL'
  AND c."state" = 'ACTIVE'
  AND e."lifecycleStage" = 'INSTALLED';

UPDATE "Equipment" e
SET "lifecycleStage" = 'IN_MAINTENANCE'
FROM "ContractEquipment" ce
JOIN "Contract" c ON c."id" = ce."contractId"
WHERE ce."equipmentId" = e."id"
  AND c."type" IN ('MAINTENANCE', 'SALE')
  AND c."state" = 'ACTIVE'
  AND e."lifecycleStage" = 'INSTALLED';

-- ─── Order + OrderItem ──────────────────────────────────────────────────
CREATE TABLE "Order" (
  "id"          TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "customerId"  TEXT NOT NULL,
  "equipmentId" TEXT,
  "siteId"      TEXT,
  "contractId"  TEXT,
  "orderedAt"   TIMESTAMP(3) NOT NULL,
  "deliveredAt" TIMESTAMP(3),
  "state"       "OrderState" NOT NULL DEFAULT 'PENDING',
  "notes"       TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX "Order_customerId_orderedAt_idx" ON "Order"("customerId", "orderedAt");
CREATE INDEX "Order_equipmentId_idx" ON "Order"("equipmentId");
CREATE INDEX "Order_state_idx" ON "Order"("state");

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_contractId_fkey"
  FOREIGN KEY ("contractId") REFERENCES "Contract"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OrderItem" (
  "id"               TEXT NOT NULL,
  "orderId"          TEXT NOT NULL,
  "productKind"      "ProductKind" NOT NULL,
  "consumableId"     TEXT,
  "equipmentModelId" TEXT,
  "customName"       TEXT,
  "quantity"         INTEGER NOT NULL,
  "unitPrice"        DECIMAL(14, 2) NOT NULL,
  "totalPrice"       DECIMAL(14, 2) NOT NULL,
  "purpose"          TEXT,
  "notes"            TEXT,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_consumableId_idx" ON "OrderItem"("consumableId");
CREATE INDEX "OrderItem_equipmentModelId_idx" ON "OrderItem"("equipmentModelId");

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_consumableId_fkey"
  FOREIGN KEY ("consumableId") REFERENCES "Consumable"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_equipmentModelId_fkey"
  FOREIGN KEY ("equipmentModelId") REFERENCES "EquipmentModel"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
