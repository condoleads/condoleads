-- supabase/migrations/20260523_w_cockpit_p_a_3_audit_grants.sql
--
-- W-COCKPIT P-A-3: fix missing role grants on three append-only/log tables.
--
-- Background:
--   The cockpit's Territory tab Audit log sub-lens triggered a 500 error
--   when read by a platform admin (browser smoke 2026-05-23). PostgreSQL
--   error 42501 -- "permission denied for table territory_assignment_changes".
--   Root cause: the CREATE TABLE migration shipped without GRANT statements
--   for service_role (the role Next.js routes use via SUPABASE_SERVICE_ROLE_KEY).
--
--   This is the same bug class as 20260510_t2f_followup_grants.sql, which
--   fixed lead_email_recipients_log. An audit pass across all log/changes
--   tables in the public schema identified three tables with the same gap:
--     1. territory_assignment_changes  (blocks cockpit Territory audit log)
--     2. lead_ownership_changes         (latent; not yet user-facing)
--     3. sync_logs                      (latent; no current app writer)
--
--   Fixing all three in one migration eliminates the bug class.
--
-- Per-table grant decisions (derived from this session's recon):
--
--   territory_assignment_changes (append-only via trg_tac_no_update +
--   trg_tac_no_delete; created 20260506_t2a_04):
--     GRANT SELECT (audit-log API route) + INSERT (future app-side writers;
--     existing writers are PL/pgSQL SECURITY DEFINER). No UPDATE/DELETE --
--     triggers enforce; non-grant is the second defence layer.
--
--   lead_ownership_changes (append-only via trg_loc_no_update +
--   trg_loc_no_delete; created 20260506_t2a_03):
--     Same family, same pattern. GRANT SELECT + INSERT. Currently no app
--     reader, but the architectural shape is identical to TAC -- granting
--     proactively prevents another silent failure when the leads workbench
--     eventually surfaces ownership history.
--
--   sync_logs (operational log; no append-only triggers; created
--   20251014070548_add_sync_tracking):
--     Schema shape supports running -> success/failed transitions via the
--     status column plus completed_at, listings_added/updated/removed,
--     error_message fillers. Grant set must include UPDATE for sync runners
--     to mark completion. GRANT SELECT + INSERT + UPDATE. No DELETE.
--
-- Roles intentionally NOT granted (mirrors 20260510_t2f_followup_grants reasoning):
--   - authenticated: all three tables are server-side only. Admin UIs go
--     through Next.js API routes (service_role). If a future client-side
--     view of any table is built, add SELECT for authenticated then; do not
--     pre-grant.
--   - anon: never -- all three contain operationally sensitive data (audit
--     trails, ownership history, sync diagnostics).
--
-- Multi-tenant safety:
--   Grants are role-level, not tenant-scoped. Per-tenant isolation is
--   enforced at the application layer via tenant_id NOT NULL columns +
--   per-query .eq('tenant_id', ...) filtering (already verified for TAC
--   in the audit-log route handler).
--
-- Idempotency:
--   GRANT statements in Postgres are idempotent. Re-running this migration
--   has no effect if grants already match. Safe to apply twice.

BEGIN;

-- 1. territory_assignment_changes
GRANT SELECT, INSERT ON TABLE public.territory_assignment_changes TO service_role;

-- 2. lead_ownership_changes
GRANT SELECT, INSERT ON TABLE public.lead_ownership_changes TO service_role;

-- 3. sync_logs
GRANT SELECT, INSERT, UPDATE ON TABLE public.sync_logs TO service_role;

-- Verification: assert grants landed before commit. If the assertion fires,
-- the whole transaction rolls back and the DB is left untouched.
DO $$
DECLARE
  v_tac_grants integer;
  v_loc_grants integer;
  v_syl_grants integer;
BEGIN
  SELECT COUNT(*) INTO v_tac_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'territory_assignment_changes'
    AND grantee = 'service_role'
    AND privilege_type IN ('SELECT', 'INSERT');
  IF v_tac_grants <> 2 THEN
    RAISE EXCEPTION 'territory_assignment_changes grants did not apply: expected 2 service_role grants (SELECT, INSERT), got %', v_tac_grants;
  END IF;

  SELECT COUNT(*) INTO v_loc_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'lead_ownership_changes'
    AND grantee = 'service_role'
    AND privilege_type IN ('SELECT', 'INSERT');
  IF v_loc_grants <> 2 THEN
    RAISE EXCEPTION 'lead_ownership_changes grants did not apply: expected 2 service_role grants (SELECT, INSERT), got %', v_loc_grants;
  END IF;

  SELECT COUNT(*) INTO v_syl_grants
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'sync_logs'
    AND grantee = 'service_role'
    AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE');
  IF v_syl_grants <> 3 THEN
    RAISE EXCEPTION 'sync_logs grants did not apply: expected 3 service_role grants (SELECT, INSERT, UPDATE), got %', v_syl_grants;
  END IF;

  RAISE NOTICE 'W-COCKPIT P-A-3 audit grants applied: TAC %, LOC %, sync_logs %',
    v_tac_grants, v_loc_grants, v_syl_grants;
END $$;

COMMIT;