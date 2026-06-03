-- Visit-document expansion (Phase 6 — 2026-06-03).
-- Adds 5 new DocumentKind values for the 6-format visit-document set
-- (DELIVERY_RECEIPT / SALE_RECEIPT_B2C / DELIVERY_SLIP_B2B /
-- PERIODIC_CHECK_B2C / PERIODIC_CHECK_B2B). The pre-existing
-- DELIVERY_SLIP + PERIODIC_INSPECTION kinds are retained as legacy
-- aliases so existing Document rows continue to resolve.

ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'DELIVERY_RECEIPT';
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'SALE_RECEIPT_B2C';
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'DELIVERY_SLIP_B2B';
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'PERIODIC_CHECK_B2C';
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'PERIODIC_CHECK_B2B';
