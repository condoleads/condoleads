-- 20260511_t6d_add_auto_to_granted_by_tier_check_rollback.sql
-- Rollback: restore the original CHECK constraint (without 'auto').
-- WARNING: any rows with granted_by_tier='auto' will block this rollback.

BEGIN;

ALTER TABLE public.user_credit_overrides
  DROP CONSTRAINT IF EXISTS user_credit_overrides_granted_by_tier_check;

ALTER TABLE public.user_credit_overrides
  ADD CONSTRAINT user_credit_overrides_granted_by_tier_check
  CHECK (granted_by_tier = ANY (ARRAY['admin'::text, 'manager'::text, 'managed'::text]));

COMMIT;