-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "siteId" TEXT;

-- CreateIndex
CREATE INDEX "ServiceRequest_siteId_idx" ON "ServiceRequest"("siteId");

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
