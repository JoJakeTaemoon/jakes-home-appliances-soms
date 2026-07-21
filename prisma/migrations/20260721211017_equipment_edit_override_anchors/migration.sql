-- 장비 편집(요청 #1): 최근 점검일 / 최근 필터교체일 관리자 오버라이드 앵커.
-- 값이 있으면 다음 예정일 계산의 앵커로 우선 사용된다(읽기 시 계산).
ALTER TABLE "Equipment" ADD COLUMN "lastInspectionAtOverride" TIMESTAMP(3);
ALTER TABLE "EquipmentConsumable" ADD COLUMN "lastReplacedAtOverride" TIMESTAMP(3);
