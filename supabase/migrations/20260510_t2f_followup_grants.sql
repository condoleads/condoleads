-- supabase/migrations/20260510_t2f_followup_grants.sql
--
-- T2f-followup: fix missing role grants on lead_email_recipients_log.
--
-- Background:
--   T2f (commit 8e84040, 2026-05-10) created the lead_email_recipients_log
--   audit table with append-only triggers (trg_lerl_no_delete blocking DELETE,
--   trg_lerl_status_only_update restricting UPDATE columns) but did NOT issue
--   GRANT statements for the API roles. Result: only the `postgres` role had
--   privileges. service_role (the role the Next.js routes use via
--   SUPABASE_SERVICE_ROLE_KEY) was denied INSERT, so every audit-log write
--   from logEmailRecipients silently failed with "permission denied".
--
--   The helper swallows insert errors per design (audit failures must never
--   block lead-write or email-send operations — see lib/admin-homes/log-email-recipients.ts),
--   so the bug went undetected until the T3b smoke harness exposed it via
--   a SELECT permission denied error from service_role.
--
-- Fix scope:
--   Grant the privileges service_role needs to write + read the audit log.
--   - INSERT: every audit row write
--   - SELECT: admin dashboards reading audit history server-side via API
--   - UPDATE: required for trg_lerl_status_only_update to fire when Resend
--     webhook integration lands (deferred T3-followup) — limited to
--     status / sent_at / delivered_at / bounced_at / resend_message_id.
--   - NO DELETE grant: trigger blocks it anyway; explicit non-grant adds
--     a second layer of defence and keeps least-privilege intact.
--
-- Roles intentionally NOT granted:
--   - authenticated: audit log is server-side only. Admin UIs go through
--     Next.js API routes (which use service_role). If a future client-side
--     audit view is built, add SELECT for authenticated then; do not pre-grant.
--   - anon: audit logs contain PII (recipient emails) and never go to anon.
--
-- Multi-tenant safety:
--   Grants are role-level, not tenant-scoped. Per-tenant isolation is enforced
--   at the application layer via the tenant_id NOT NULL column + per-query
--   .eq('tenant_id', ...) filtering. No RLS is enabled on this table (matches
--   the leads table pattern verified 2026-05-10).
--
-- Idempotency:
--   GRANT statements in Postgres are idempotent — re-running this migration
--   has no effect if grants already match. Safe to apply twice.

BEGIN;

GRANT SELECT, INSERT, UPDATE ON TABLE public.lead_email_recipients_log TO service_role;

-- Verification: assert grants landed before commit. If the assertion fires,
-- the transaction rolls back and the table is left in its pre-migration state.
DO $$
DECLARE
  v_grant_count integer;
BEGIN
  SELECT COUNT(*) INTO v_grant_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'lead_email_recipients_log'
    AND grantee = 'service_role'
    AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE');

  IF v_grant_count <> 3 THEN
    RAISE EXCEPTION 'T2f-followup grants did not apply: expected 3 service_role grants (SELECT, INSERT, UPDATE), got %', v_grant_count;
  END IF;

  RAISE NOTICE 'T2f-followup grants applied: service_role has SELECT + INSERT + UPDATE on lead_email_recipients_log';
END $$;

COMMIT;