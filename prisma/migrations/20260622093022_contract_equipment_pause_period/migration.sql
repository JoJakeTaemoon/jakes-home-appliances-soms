-- AlterTable
ALTER TABLE "ContractEquipment" ADD COLUMN     "cumulativePausedDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentPauseStartedAt" TIMESTAMP(3),
ADD COLUMN     "settledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ContractEquipment_currentPauseStartedAt_idx" ON "ContractEquipment"("currentPauseStartedAt");
