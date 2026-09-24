-- Staff self-service password recovery (phone → 6-digit SMS code → temp
-- password) was removed 2026-09-24. Admins now reset staff passwords from
-- the user-management screen and read the temp password out over the phone,
-- so these columns have no writer left.
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordResetCodeHash";
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordResetCodeExpiresAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordResetAttempts";
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordResetLastRequestAt";
