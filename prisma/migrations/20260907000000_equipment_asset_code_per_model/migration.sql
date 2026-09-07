-- 장비코드(Equipment.assetCode) 발행 규칙 변경 (2026-09-07)
--
--   before: {modelCode}{YY}{MM}{DD}{NNNN} — 테이블 전체에서 유니크
--   after:  MAY-{NNNNNN}                  — 모델 안에서만 유니크
--
-- 모델이 다르면 같은 번호가 공존한다. 유니크 대상은 (modelId, assetCode) 쌍.

-- DropIndex
DROP INDEX "Equipment_assetCode_key";

-- 기존 코드를 새 규칙으로 재발행. 모델별로 파티션하고(modelId = NULL 인
-- 비카탈로그 기기는 SQL 의 PARTITION BY 규칙에 따라 한 묶음이 된다),
-- 설치일 → 생성일 → id 순으로 1 부터 번호를 매긴다.
WITH numbered AS (
  SELECT
    id,
    'MAY-' || LPAD(
      (ROW_NUMBER() OVER (
        PARTITION BY "modelId"
        ORDER BY "installedAt" NULLS LAST, "createdAt", id
      ))::text,
      6,
      '0'
    ) AS code
  FROM "Equipment"
)
UPDATE "Equipment" e
SET "assetCode" = n.code
FROM numbered n
WHERE e.id = n.id;

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_modelId_assetCode_key" ON "Equipment"("modelId", "assetCode");
