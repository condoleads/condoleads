-- W-TENANT-AUTH Phase 4a.1 (Apr 30, 2026)
--
-- Adds low_credit_email_sent jsonb column to tenant_users.
-- Per-tenant dedup tracking for low-credit warning emails.

BEGIN;

ALTER TABLE tenant_users
  ADD COLUMN IF NOT EXISTS low_credit_email_sent jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;