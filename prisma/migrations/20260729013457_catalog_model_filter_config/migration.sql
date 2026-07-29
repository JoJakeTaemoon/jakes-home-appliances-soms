-- 카탈로그 재설계(요청 A): 필터 단위(일/개월), 모델별 필터 순서·주기 오버라이드.
CREATE TYPE "ConsumableCycleUnit" AS ENUM ('DAY', 'MONTH');
ALTER TABLE "Consumable" ADD COLUMN "replaceCycleUnit" "ConsumableCycleUnit" NOT NULL DEFAULT 'DAY';
ALTER TABLE "ConsumableOnModel" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ConsumableOnModel" ADD COLUMN "replaceEveryDaysOverride" INTEGER;
