-- Phase 7 — admin-tunable settings
--
-- 1) NotificationTemplate: DB-backed overrides for SMS + email template bodies.
--    Provider lookups check this table first (60s in-memory cache) and fall back
--    to the file-based defaults in src/lib/{sms,email}/templates.ts.
-- 2) SystemSetting: generic key/value store for scheduler weights (UC-AD-05)
--    and other admin-tunable knobs. Values are JSON-typed.

CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "locale" "Locale" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationTemplate_code_locale_key" ON "NotificationTemplate"("code", "locale");
CREATE INDEX "NotificationTemplate_code_idx" ON "NotificationTemplate"("code");

CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);
