-- ChargePolicy is polymorphic: each row references EITHER an Accessory OR a
-- Consumable, never both, never neither. The Zod superRefine in
-- src/lib/validators/product.ts already enforces this on API input, but the
-- composite UNIQUE on (accessoryId, contractType, withinWarranty) does NOT
-- (Postgres treats NULL as distinct). Without this CHECK, a direct DB insert
-- or future code path could create a row violating the invariant, which the
-- decideCharge helper would then resolve ambiguously.

ALTER TABLE "ChargePolicy"
  ADD CONSTRAINT "ChargePolicy_part_xor"
  CHECK (
    ("accessoryId" IS NULL) <> ("consumableId" IS NULL)
  );
