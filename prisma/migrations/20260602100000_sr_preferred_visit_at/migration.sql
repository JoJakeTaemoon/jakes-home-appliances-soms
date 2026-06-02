-- Customer's preferred visit time captured at SR submission.
-- Office uses it to pre-fill approval modal's scheduledFor.

ALTER TABLE "ServiceRequest"
ADD COLUMN "preferredVisitAt" TIMESTAMP(3);
