-- 서비스 구성 표 인라인 편집: 다음 예정일 관리자 오버라이드(점검/필터).
-- 값이 있으면 다음예정일 계산보다 우선 적용되어 D-day를 직접 구동한다.
ALTER TABLE "Equipment" ADD COLUMN "nextInspectionAtOverride" TIMESTAMP(3);
ALTER TABLE "EquipmentConsumable" ADD COLUMN "nextReplaceAtOverride" TIMESTAMP(3);
