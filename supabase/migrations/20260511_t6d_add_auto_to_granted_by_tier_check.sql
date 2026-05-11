-- 20260511_t6d_add_auto_to_granted_by_tier_check.sql
-- T6d-2: add 'auto' to user_credit_overrides.granted_by_tier CHECK constraint.
--
-- Surfaced by T6d synthetic auto-approve verify (scripts/verify-t6d-auto-approve-channel.js):
-- walliam/charlie/vip-request L292 writes `granted_by_tier: 'auto'` on the auto-approve
-- path, which violated the original CHECK constraint and caused all auto-approve credit
-- override writes to silently fail with PG error 23514 (check_violation).
--
-- Original constraint:
--   CHECK ((granted_by_tier = ANY (ARRAY['admin'::text, 'manager'::text, 'managed'::text])))
-- New constraint:
--   CHECK ((granted_by_tier = ANY (ARRAY['admin'::text, 'manager'::text, 'managed'::text, 'auto'::text])))
--
-- Semantic: 'auto' is a new grant tier representing tenant-policy-driven auto-approval,
-- distinct from human-clicker tiers ('admin', 'manager', 'managed'). Preserves audit trail.
--
-- Rollback: supabase/migrations/20260511_t6d_add_auto_to_granted_by_tier_check_rollback.sql

BEGIN;

ALTER TABLE public.user_credit_overrides
  DROP CONSTRAINT IF EXISTS user_credit_overrides_granted_by_tier_check;

ALTER TABLE public.user_credit_overrides
  ADD CONSTRAINT user_credit_overrides_granted_by_tier_check
  CHECK (granted_by_tier = ANY (ARRAY['admin'::text, 'manager'::text, 'managed'::text, 'auto'::text]));

COMMIT;