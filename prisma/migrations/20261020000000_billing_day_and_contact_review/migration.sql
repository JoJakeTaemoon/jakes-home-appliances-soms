-- Contract.billingDay: day of month the monthly fee falls due (1-31); NULL keeps the old 10th.
ALTER TABLE "Contract" ADD COLUMN "billingDay" INTEGER;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_billingDay_range" CHECK ("billingDay" IS NULL OR "billingDay" BETWEEN 1 AND 31);

-- CustomerContact.needsReview: contact filled in by the system (data migration) that staff should confirm.
ALTER TABLE "CustomerContact" ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;
