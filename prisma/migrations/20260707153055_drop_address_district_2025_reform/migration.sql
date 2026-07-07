-- 2025 administrative reform (effective 2025-07-01) abolished the Vietnamese
-- district level (Quận/Huyện). Addresses are now 2-tier: province → ward.
-- Drop the structured district columns on Customer and Site. The deprecated
-- legacy `district` text column is kept (it now denormalizes the ward for
-- back-compat display; old rows retain their historical district text).
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "addressDistrictCode";
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "addressDistrictName";
ALTER TABLE "Site" DROP COLUMN IF EXISTS "addressDistrictCode";
ALTER TABLE "Site" DROP COLUMN IF EXISTS "addressDistrictName";
