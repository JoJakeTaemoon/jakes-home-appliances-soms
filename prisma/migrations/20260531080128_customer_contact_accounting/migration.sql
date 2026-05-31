-- AlterTable
ALTER TABLE "CustomerContact" ADD COLUMN     "isAccountingContact" BOOLEAN NOT NULL DEFAULT false;

-- At most one accounting OPS contact per customer (scope=CUSTOMER, role=OPS_CONTACT).
-- Tax-invoice routing depends on this row uniqueness.
CREATE UNIQUE INDEX "CustomerContact_customerId_accounting_unique"
  ON "CustomerContact" ("customerId")
  WHERE "isAccountingContact" = true;

-- Accounting flag is only meaningful on a customer-scoped OPS contact.
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_accounting_ops_only"
  CHECK (
    "isAccountingContact" = false
    OR ("role" = 'OPS_CONTACT' AND "scope" = 'CUSTOMER')
  );
