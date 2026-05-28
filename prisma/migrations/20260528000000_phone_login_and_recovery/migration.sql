-- Phase 8 — phone-based login + self-service recovery
--
-- 1) User.phone becomes the login key:
--    • drop @unique on username (it's a display label now)
--    • make phone NOT NULL + UNIQUE
--    • drop the redundant `phone` index (the new UNIQUE creates one)
-- 2) Add password-recovery fields used by /api/auth/password-reset/{request,verify}:
--    • passwordResetCodeHash       — bcrypt(code) — short-lived
--    • passwordResetCodeExpiresAt  — 10-minute window
--    • passwordResetAttempts       — counts wrong verify attempts
--    • passwordResetLastRequestAt  — 1/minute throttle
--
-- Existing rows must already have non-null `phone` before this runs (callers
-- should backfill or db:reset). Dev DB was backfilled inline before this
-- migration was generated.

-- DropIndex
DROP INDEX "User_phone_idx";
DROP INDEX "User_username_key";

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "phone" SET NOT NULL;

ALTER TABLE "User"
  ADD COLUMN "passwordResetCodeHash"       TEXT,
  ADD COLUMN "passwordResetCodeExpiresAt"  TIMESTAMP(3),
  ADD COLUMN "passwordResetAttempts"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "passwordResetLastRequestAt"  TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
