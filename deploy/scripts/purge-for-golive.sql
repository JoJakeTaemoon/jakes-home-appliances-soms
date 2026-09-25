-- Seoul Aqua SOMS — go-live purge.
--
-- Empties every operational table so the system starts real use from zero,
-- keeping only what is configuration rather than data:
--
--   KEPT     User (role = ADMIN only) · NotificationTemplate · SystemSetting
--   EMPTIED  everything else, including the product catalog, the audit log
--            and the notification history
--
-- Runs as ONE transaction: either the whole purge lands or nothing does.
-- `User` is not truncated because ADMIN rows stay; every FK to User lives on
-- the child side (User owns no foreign key column), so truncating the
-- children first leaves the surviving admins intact. Session rows of the
-- deleted staff go with them (Session.userId is onDelete: Cascade).
--
-- Invoked by .github/workflows/purge-for-golive.yml. NEVER wire this to a
-- push or a schedule.

BEGIN;

TRUNCATE TABLE
  -- documents + money
  "Document",
  "TaxInvoice",
  "Payment",
  -- field work
  "VisitConsumableLog",
  "Visit",
  "ServiceRequest",
  -- outbound history
  "NotificationLog",
  -- orders
  "OrderItem",
  "Order",
  -- contracts
  "ContractEquipment",
  "Contract",
  -- installed equipment
  "EquipmentConsumable",
  "Equipment",
  -- inventory ledger
  "StockMove",
  -- product catalog
  "ConsumableOnModel",
  "AccessoryOnModel",
  "ChargePolicy",
  "EquipmentModel",
  "Consumable",
  "Accessory",
  "Brand",
  "ProductCategory",
  -- customers + portal accounts
  "CustomerSession",
  "CustomerContact",
  "Site",
  "Customer",
  -- system history
  "AuditLog",
  "LoginAttempt";

-- Staff: keep the admins, drop everyone else. Their sessions cascade.
DELETE FROM "User" WHERE role <> 'ADMIN';

-- Every refresh session, including the surviving admins'. A system entering
-- real use should not carry hundreds of refresh tokens minted during testing;
-- the admin simply logs in again.
DELETE FROM "Session";

COMMIT;
