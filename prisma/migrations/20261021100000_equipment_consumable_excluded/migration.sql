-- A catalog filter staff removed from one unit; the model keeps it for the others.
ALTER TABLE "EquipmentConsumable" ADD COLUMN "excluded" BOOLEAN NOT NULL DEFAULT false;
