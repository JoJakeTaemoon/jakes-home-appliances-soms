-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "serviceRequestId" TEXT,
ADD COLUMN     "visitId" TEXT;

-- CreateIndex
CREATE INDEX "Order_visitId_idx" ON "Order"("visitId");

-- CreateIndex
CREATE INDEX "Order_serviceRequestId_idx" ON "Order"("serviceRequestId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
