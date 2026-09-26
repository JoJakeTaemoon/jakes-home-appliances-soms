-- Seoul Aqua SOMS — catalog purge (2026-09-26).
--
-- Deletes every model, consumable and accessory — the test catalog entered
-- after go-live — so the real catalog is entered on the new classification
-- (제품군 · 제품 유형 · 모델, see migration 20260926000000).
--
--   KEPT     User · Brand · ProductCategory (제품군) · ProductType (제품 유형)
--            · everything customer-side
--   DELETED  EquipmentModel · Consumable · Accessory, and with them (FK
--            cascade) their 제품군 links, model↔part links, charge policies
--            and inventory ledger rows
--
-- FAILS CLOSED. If any customer-side row still points at a model or part —
-- installed equipment, a visit's consumable log, an order line, a unit's
-- filter config — it raises before deleting anything. Those FKs are either
-- Restrict (the delete would fail half-way) or SetNull (it would silently
-- blank real records), and neither is acceptable for a "test data" wipe.
--
-- One transaction: all of it lands or none of it does.
-- Invoked by .github/workflows/purge-catalog.yml. NEVER wire this to a push
-- or a schedule.

BEGIN;

DO $$
DECLARE
  n_equipment   int;
  n_visit_logs  int;
  n_order_items int;
  n_unit_links  int;
BEGIN
  SELECT count(*) INTO n_equipment   FROM "Equipment"           WHERE "modelId" IS NOT NULL;
  SELECT count(*) INTO n_visit_logs  FROM "VisitConsumableLog";
  SELECT count(*) INTO n_order_items FROM "OrderItem"
    WHERE "consumableId" IS NOT NULL OR "equipmentModelId" IS NOT NULL;
  SELECT count(*) INTO n_unit_links  FROM "EquipmentConsumable" WHERE "consumableId" IS NOT NULL;

  IF n_equipment + n_visit_logs + n_order_items + n_unit_links > 0 THEN
    RAISE EXCEPTION
      'Catalog is in use — equipment=%, visit consumable logs=%, order lines=%, unit filter links=%. Nothing was deleted.',
      n_equipment, n_visit_logs, n_order_items, n_unit_links;
  END IF;
END $$;

-- Children first where the FK is not a cascade; the rest cascade.
DELETE FROM "StockMove" WHERE "equipmentModelId" IS NOT NULL OR "consumableId" IS NOT NULL;
DELETE FROM "ChargePolicy" WHERE "consumableId" IS NOT NULL OR "accessoryId" IS NOT NULL;

DELETE FROM "Consumable";
DELETE FROM "Accessory";
DELETE FROM "EquipmentModel";

COMMIT;
