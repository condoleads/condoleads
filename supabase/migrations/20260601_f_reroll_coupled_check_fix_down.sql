-- ============================================================================
-- F-REROLL-LISTINGS-AT-GEO-COUPLED-CHECK -- DOWN-MIGRATION (GAP-3 rollback).
-- Restores the EXACT live body captured during P1 FIX 2 recon (2026-06-01).
-- Reverts:
--   - prosecdef    : DEFINER -> INVOKER  (live state pre-fix)
--   - proconfig    : locked -> NULL      (live state pre-fix)
--   - body         : 5-step NULL-trio-then-delegate -> set-based hash-RR
--                    (the previously-uncommitted live body)
--
-- Date:           2026-06-01
-- Pair:           20260601_f_reroll_coupled_check_fix.sql (up)
-- Apply via:      node scripts/apply-f-reroll-coupled-check-fix-down.js
--                 (mirror of the up-runner; same pattern as Landing 2 down)
--
-- WHY the pre-fix body is hand-rolled here rather than read from snapshot:
--   The snapshot file at supabase/migrations/rollback-snapshots/_f-reroll-
--   coupled-check_<timestamp>.sql is forensic (apply-runner writes it as
--   evidence of pre-state). The down-migration must be REPEATABLE without
--   the snapshot (any environment, any timestamp), so the body is embedded
--   inline. Verbatim from pg_get_functiondef captured at recon time --
--   `cv-reroll-coupled-check-recon-output.txt` §1.
--
-- NOTE: this restores the LIVE PRE-FIX body, not the on-disk migration body
-- at supabase/migrations/20260507_t3b_b_01_distribution_functions.sql. The
-- on-disk body (per-row cursor + pick_routing_agent) was never on production;
-- restoring it would be a different migration. See git-drift note in the up.
-- ============================================================================

-- ============================================================================
-- 1. CREATE OR REPLACE FUNCTION public.reroll_listings_at_geo
--    (restore the pre-fix live body)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reroll_listings_at_geo(
  p_scope     text,
  p_scope_id  uuid,
  p_tenant_id uuid
) RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  v_count int := 0;
  v_total int := 0;
BEGIN
  IF p_scope_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN 0;
  END IF;
  IF p_scope NOT IN ('area', 'municipality', 'community') THEN
    -- mls_listings has no neighbourhood_id; can't reroll at that level
    RETURN 0;
  END IF;

  -- Compute routing set size once. v_total = 0 -> all picks become NULL
  -- (matches old behavior where pick_routing_agent returned NULL).
  SELECT COUNT(*) INTO v_total
  FROM agent_property_access
  WHERE scope = p_scope
    AND is_active = true
    AND tenant_id = p_tenant_id
    AND (
      (p_scope = 'area' AND area_id = p_scope_id) OR
      (p_scope = 'municipality' AND municipality_id = p_scope_id) OR
      (p_scope = 'community' AND community_id = p_scope_id)
    );

  WITH routing AS (
    SELECT
      agent_id,
      (ROW_NUMBER() OVER (ORDER BY id) - 1) AS rn
    FROM agent_property_access
    WHERE scope = p_scope
      AND is_active = true
      AND tenant_id = p_tenant_id
      AND (
        (p_scope = 'area' AND area_id = p_scope_id) OR
        (p_scope = 'municipality' AND municipality_id = p_scope_id) OR
        (p_scope = 'community' AND community_id = p_scope_id)
      )
  ),
  picks AS (
    SELECT
      ml.id AS listing_id,
      r.agent_id AS new_pick
    FROM mls_listings ml
    LEFT JOIN routing r
      ON v_total > 0
      AND r.rn = (abs(hashtext(ml.id::text)) % NULLIF(v_total, 0))
    WHERE (
      (p_scope = 'area' AND ml.area_id = p_scope_id) OR
      (p_scope = 'municipality' AND ml.municipality_id = p_scope_id) OR
      (p_scope = 'community' AND ml.community_id = p_scope_id)
    )
  ),
  updated AS (
    UPDATE mls_listings ml
    SET assigned_agent_id = picks.new_pick
    FROM picks
    WHERE ml.id = picks.listing_id
      AND ml.assigned_agent_id IS DISTINCT FROM picks.new_pick
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM updated;

  RETURN v_count;
END;
$function$;

-- ============================================================================
-- 2. RESTORE pre-fix posture (INVOKER, no locked search_path)
-- ============================================================================
ALTER FUNCTION public.reroll_listings_at_geo(text, uuid, uuid)
  SECURITY INVOKER
  RESET search_path;

COMMENT ON FUNCTION public.reroll_listings_at_geo(text, uuid, uuid) IS NULL;

-- ============================================================================
-- DOWN-VERIFICATION
-- ============================================================================
DO $$
DECLARE
  v_secdef    boolean;
  v_proconfig text[];
BEGIN
  SELECT prosecdef, proconfig INTO v_secdef, v_proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='reroll_listings_at_geo';
  IF v_secdef IS NULL THEN RAISE EXCEPTION 'DOWN-V1 FAIL: function disappeared'; END IF;
  IF v_secdef IS TRUE THEN RAISE EXCEPTION 'DOWN-V1 FAIL: prosecdef=TRUE (expected FALSE after revert)'; END IF;
  IF v_proconfig IS NOT NULL THEN RAISE EXCEPTION 'DOWN-V1 FAIL: proconfig=% (expected NULL after revert)', v_proconfig; END IF;
  RAISE NOTICE 'DOWN-V1 PASS: reroll_listings_at_geo restored to SECURITY INVOKER, no search_path lock.';
END $$;
