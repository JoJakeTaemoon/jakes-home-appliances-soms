-- Add optional per-line linked-equipment on OrderItem so a single order
-- can carry parts for multiple distinct devices at the same customer.
ALTER TABLE "OrderItem" ADD COLUMN "equipmentId" TEXT;
ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "OrderItem_equipmentId_idx" ON "OrderItem"("equipmentId");
