-- The unit staff entered a unit's own filter cycle in; MONTH steps calendar months.
ALTER TABLE "EquipmentConsumable" ADD COLUMN "replaceCycleUnit" "ConsumableCycleUnit" NOT NULL DEFAULT 'DAY';
