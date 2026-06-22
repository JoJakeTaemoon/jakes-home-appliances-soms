-- ─── Customer ──────────────────────────────────────────────────────────────
-- Drop B2B legal representative column. Going forward, the CONTRACT_PARTY
-- contact (CustomerContact role=CONTRACT_PARTY) is the canonical signatory.
ALTER TABLE "Customer" DROP COLUMN "representativeName";

-- Identity document issue info (covers CCCD or passport, whichever applies).
ALTER TABLE "Customer" ADD COLUMN "documentIssueDate" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "documentIssuePlace" TEXT;

-- Structured Vietnamese address columns (Shopee-style cascading region picker).
ALTER TABLE "Customer" ADD COLUMN "addressProvinceCode" TEXT;
ALTER TABLE "Customer" ADD COLUMN "addressProvinceName" TEXT;
ALTER TABLE "Customer" ADD COLUMN "addressDistrictCode" TEXT;
ALTER TABLE "Customer" ADD COLUMN "addressDistrictName" TEXT;
ALTER TABLE "Customer" ADD COLUMN "addressWardCode" TEXT;
ALTER TABLE "Customer" ADD COLUMN "addressWardName" TEXT;
ALTER TABLE "Customer" ADD COLUMN "addressStreet" TEXT;

-- Carry legacy free-text address into the new street column so existing rows
-- continue to show their street detail in the new UI.
UPDATE "Customer" SET "addressStreet" = "address" WHERE "address" IS NOT NULL;

-- ─── Site ──────────────────────────────────────────────────────────────────
ALTER TABLE "Site" ADD COLUMN "addressProvinceCode" TEXT;
ALTER TABLE "Site" ADD COLUMN "addressProvinceName" TEXT;
ALTER TABLE "Site" ADD COLUMN "addressDistrictCode" TEXT;
ALTER TABLE "Site" ADD COLUMN "addressDistrictName" TEXT;
ALTER TABLE "Site" ADD COLUMN "addressWardCode" TEXT;
ALTER TABLE "Site" ADD COLUMN "addressWardName" TEXT;
ALTER TABLE "Site" ADD COLUMN "addressStreet" TEXT;

UPDATE "Site" SET "addressStreet" = "address" WHERE "address" IS NOT NULL;

-- Relax legacy `address` NOT NULL so new sites can be created with only the
-- structured columns populated.
ALTER TABLE "Site" ALTER COLUMN "address" DROP NOT NULL;
