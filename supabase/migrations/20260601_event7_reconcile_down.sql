-- ============================================================================
-- P-LIFECYCLE Event 7 -- DOWN-MIGRATION.
-- Reverts the 5 up-migration deliverables in reverse order:
--   5. REVOKE SELECT on reconcile_corrections from service_role
--   4. DROP FUNCTION reconcile_tenant_cache
--   3. RESTORE tenant_floor_alerts CHECKs to pre-Event-7 values
--   2. DROP INDEX idx_mls_listings_updated_at
--   1. DROP TABLE reconcile_corrections
--
-- Date:           2026-06-01
-- Pair:           20260601_event7_reconcile.sql (up)
--
-- NOTE: any reconcile_corrections rows accumulated in production are LOST on
-- down. If audit history needs to be preserved, export to a CSV before
-- running the down-migration. The down-migration does NOT preserve audit
-- data -- this is a structural rollback, not a logical one.
-- ============================================================================

-- 5. REVOKE service_role grant.
REVOKE SELECT ON public.reconcile_corrections FROM service_role;

-- 4. DROP function.
DROP FUNCTION IF EXISTS public.reconcile_tenant_cache(uuid, int, numeric, int);

-- 3. RESTORE tenant_floor_alerts CHECKs to pre-Event-7 (3-value alert_type +
--    2-value property_type). DROP + ADD; existing rows revalidate.
ALTER TABLE public.tenant_floor_alerts
  DROP CONSTRAINT tfa_alert_type_check;
ALTER TABLE public.tenant_floor_alerts
  ADD CONSTRAINT tfa_alert_type_check
  CHECK (alert_type = ANY (ARRAY[
    'empty_floor_pool'::text,
    'all_inactive'::text,
    'all_flags_off_for_type'::text
  ]));

ALTER TABLE public.tenant_floor_alerts
  DROP CONSTRAINT tfa_property_type_check;
ALTER TABLE public.tenant_floor_alerts
  ADD CONSTRAINT tfa_property_type_check
  CHECK (property_type = ANY (ARRAY[
    'condo'::text,
    'home'::text
  ]));

-- 2. DROP index on mls_listings.updated_at.
DROP INDEX IF EXISTS public.idx_mls_listings_updated_at;

-- 1. DROP reconcile_corrections (cascade drops the indexes on it).
DROP TABLE IF EXISTS public.reconcile_corrections CASCADE;

-- ============================================================================
-- DOWN-VERIFICATION
-- ============================================================================
DO $$
DECLARE
  v_n int;
BEGIN
  -- DOWN-V1: table gone.
  SELECT COUNT(*)::int INTO v_n
    FROM information_schema.tables
   WHERE table_schema='public' AND table_name='reconcile_corrections';
  IF v_n <> 0 THEN RAISE EXCEPTION 'DOWN-V1 FAIL: reconcile_corrections still present'; END IF;

  -- DOWN-V2: function gone.
  SELECT COUNT(*)::int INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='reconcile_tenant_cache';
  IF v_n <> 0 THEN RAISE EXCEPTION 'DOWN-V2 FAIL: reconcile_tenant_cache still present'; END IF;

  -- DOWN-V3: index gone.
  SELECT COUNT(*)::int INTO v_n
    FROM pg_indexes
   WHERE schemaname='public' AND indexname='idx_mls_listings_updated_at';
  IF v_n <> 0 THEN RAISE EXCEPTION 'DOWN-V3 FAIL: idx_mls_listings_updated_at still present'; END IF;

  -- DOWN-V4: CHECKs restored (no longer mention reconcile_threshold_exceeded).
  PERFORM 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='tenant_floor_alerts'
     AND con.conname='tfa_alert_type_check'
     AND pg_get_constraintdef(con.oid) ILIKE '%reconcile_threshold_exceeded%';
  IF FOUND THEN RAISE EXCEPTION 'DOWN-V4 FAIL: tfa_alert_type_check still has reconcile_threshold_exceeded'; END IF;

  RAISE NOTICE 'DOWN-V1..V4 PASS: Event 7 deliverables reverted cleanly.';
END $$;
