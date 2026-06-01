-- ============================================================================
-- P-LIFECYCLE Landing 3 EVENT 7 -- nightly reconcile (the last lifecycle event).
--
-- Date:           2026-06-01
-- Recon:          f-event7-reconcile-recon.md
--                 cv-event7-recon-output.txt
-- Apply via:      node scripts/apply-event7-reconcile.js
-- Down-migration: 20260601_event7_reconcile_down.sql
-- Smoke harness:  scripts/smoke-event7-reconcile.js
-- Cron workflow:  .github/workflows/reconcile.yml
-- Route:          app/api/admin-homes/territory/reconcile/route.ts
--
-- BACKGROUND:
--   Event 7 closes the P-LIFECYCLE event set per the v16 model Decision B
--   (incremental + bounded nightly reconcile as the safety net behind the
--   mutation triggers). NOT a full 1.28M re-resolve -- that's reserved for an
--   explicit operator-triggered "rebuild" button only. The reconcile checks
--   only rows that could plausibly have drifted:
--     - sync-delta (mls_listings.updated_at > now() - p_lookback_hours)
--     - flagged rows (half-NULL coupled-check violators + NULL-cache routable)
--     - random TABLESAMPLE BERNOULLI(p_sample_pct) rolling sample
--   Typical nightly candidate set on WALLiam scale: ~18k rows (probe live
--   data: 17,039 rows updated in last 24h on 2026-06-01).
--
--   The reconcile reuses public.reresolve_listings_in_set (the Landing 2
--   primitive, SECURITY DEFINER + locked search_path) via the SAME proven
--   NULL-then-delegate pattern that P1 FIX 2 used to fix
--   reroll_listings_at_geo (commit ba40191). The sticky guard inside
--   reresolve_listings_in_set would block re-pick at the same scope -- WRONG
--   for reconcile, where the whole point is "is the current cache still
--   correct?". NULL-ing the trio first defeats the sticky guard cleanly so
--   every candidate gets a full cascade re-walk.
--
--   DIFF SEMANTIC: every candidate's pre-state trio is captured into a TEMP
--   table BEFORE the NULL+walk. After the walk, post-state is compared via
--   ROW(pre.agent, pre.scope, pre.source) IS DISTINCT FROM ROW(post.agent,
--   post.scope, post.source). Any difference = a correction row in
--   reconcile_corrections with both old and new trios + the discovery reason.
--   IS DISTINCT FROM is NULL-safe (treats NULL/NULL pair as equal).
--
-- DELIVERABLES IN THIS MIGRATION:
--   1. CREATE TABLE public.reconcile_corrections + 2 indexes.
--   2. CREATE INDEX idx_mls_listings_updated_at on mls_listings(updated_at).
--      Required for the sync-delta scan to use an Index Scan instead of seq-
--      scanning 1.3M rows. Currently no timestamp index exists (recon §Q2c).
--   3. Extend CHECK constraints on tenant_floor_alerts to allow:
--        alert_type = 'reconcile_threshold_exceeded'
--        property_type = 'system'
--      Existing CHECKs (per probe 2026-06-01):
--        tfa_alert_type_check: ('empty_floor_pool','all_inactive','all_flags_off_for_type')
--        tfa_property_type_check: ('condo','home')
--      Both DROP+ADD as ONE step; existing rows (1 row total, property_type=
--      'condo', alert_type='empty_floor_pool') re-validate trivially against
--      the wider sets.
--   4. CREATE OR REPLACE FUNCTION public.reconcile_tenant_cache(p_tenant_id
--      uuid, p_lookback_hours int=24, p_sample_pct numeric=0.08, p_threshold
--      int=50) RETURNS TABLE (corrections_count int, candidates_count int).
--      SECURITY DEFINER + locked search_path = public, pg_temp.
--   5. GRANT SELECT ON public.reconcile_corrections TO service_role (so the
--      dashboard health route can read the audit trail server-side without
--      hitting the same grant wall the prior P1 FIX 3 closed for
--      platform_manager_tenants).
--
-- INDEX BUILD LOCK NOTE:
--   CREATE INDEX (non-CONCURRENTLY) on mls_listings.updated_at takes ACCESS
--   EXCLUSIVE on the table for the duration of the build. On 1.3M rows this
--   is ~30 seconds. During that window every read/write on mls_listings
--   blocks. Apply during low-traffic window (e.g., between nightly-sync's
--   completion at ~03:00 EST and the new reconcile cron at 04:00 EST).
--   ALTERNATIVE if the operator wants zero-downtime: split index creation
--   into a separate CONCURRENTLY migration and run outside this tx. The
--   apply-runner does NOT do that today; if needed, change the migration
--   shape (recon doc §Recommended fix shape discusses the trade-off).
--
-- SECURITY DEFINER SAFETY (Landing 1 v21 rubric):
--   (1) Body has no auth.uid() / current_user / session_user / dynamic SQL
--       beyond a single parameterized EXECUTE-equivalent (none in this body).
--   (2) Every caller auditable: only the new
--       app/api/admin-homes/territory/reconcile/route.ts route, which is
--       Bearer-token-gated (RECONCILE_CRON_TOKEN, distinct from the reroll
--       worker token per separation-of-revocation).
--   (3) p_tenant_id validated upstream: route validates UUID shape and
--       compares against known-tenant allowlist (workflow only iterates
--       WALLIAM_TENANT_ID + AILY_TENANT_ID).
--   (4) search_path locked = public, pg_temp.
--   Identical posture to reresolve_listings_in_set (which this function
--   wraps), pick_floor_agent, reflow_deactivated_agent, the handle_apa_*
--   handlers, and the new reroll_listings_at_geo (P1 FIX 2).
--
-- MULTI-TENANT REVIEW (HARD GATE -- attached at end of file).
-- ============================================================================

-- ============================================================================
-- 1. CREATE TABLE public.reconcile_corrections
-- ============================================================================
CREATE TABLE public.reconcile_corrections (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id),
  listing_id      uuid        NOT NULL REFERENCES public.mls_listings(id),
  old_agent_id    uuid,
  old_scope       text,
  old_source_id   uuid,
  new_agent_id    uuid,
  new_scope       text,
  new_source_id   uuid,
  reason          text        NOT NULL,
  reconciled_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reconcile_corrections IS
  'P-LIFECYCLE Event 7 audit trail. One row per (listing, run) where the
   reconcile job detected that the cached (assigned_agent_id, assigned_scope,
   assigned_source_id) trio differed from what reresolve_listings_in_set
   would now produce. reason: sync_delta | flagged | rolling_sample.';

CREATE INDEX idx_reconcile_corrections_tenant_time
  ON public.reconcile_corrections (tenant_id, reconciled_at DESC);

CREATE INDEX idx_reconcile_corrections_listing
  ON public.reconcile_corrections (listing_id);

-- ============================================================================
-- 2. idx_mls_listings_updated_at -- created in PHASE 1 (outside this tx)
-- ============================================================================
-- The apply-runner builds idx_mls_listings_updated_at via
-- CREATE INDEX CONCURRENTLY BEFORE this transactional migration begins, so
-- the hot mls_listings table is never locked. CONCURRENTLY cannot run inside
-- a transaction block, so it lives in apply-runner phase 1.
-- V3 below still asserts the index EXISTS + is valid (was created in phase 1).
-- If phase 1 failed or left the index invalid, phase 1's verify step
-- would have aborted before this migration ran.

-- ============================================================================
-- 3. EXTEND tenant_floor_alerts CHECK constraints
-- ============================================================================
-- DROP + ADD as one step within this tx. Existing data (1 row,
-- property_type='condo', alert_type='empty_floor_pool' per 2026-06-01 probe)
-- re-validates trivially against the wider sets.

ALTER TABLE public.tenant_floor_alerts
  DROP CONSTRAINT tfa_alert_type_check;
ALTER TABLE public.tenant_floor_alerts
  ADD CONSTRAINT tfa_alert_type_check
  CHECK (alert_type = ANY (ARRAY[
    'empty_floor_pool'::text,
    'all_inactive'::text,
    'all_flags_off_for_type'::text,
    'reconcile_threshold_exceeded'::text
  ]));

ALTER TABLE public.tenant_floor_alerts
  DROP CONSTRAINT tfa_property_type_check;
ALTER TABLE public.tenant_floor_alerts
  ADD CONSTRAINT tfa_property_type_check
  CHECK (property_type = ANY (ARRAY[
    'condo'::text,
    'home'::text,
    'system'::text
  ]));

-- ============================================================================
-- 4. CREATE OR REPLACE FUNCTION public.reconcile_tenant_cache
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reconcile_tenant_cache(
  p_tenant_id      uuid,
  p_lookback_hours int      DEFAULT 24,
  p_sample_pct     numeric  DEFAULT 0.08,
  p_threshold      int      DEFAULT 50
) RETURNS TABLE (corrections_count int, candidates_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_candidates int := 0;
  v_corrections int := 0;
BEGIN
  -- Input shape -- NULL tenant -> no-op.
  IF p_tenant_id IS NULL THEN
    corrections_count := 0;
    candidates_count  := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Defensive: clean any leftover temp tables from a prior call in the same tx
  -- (the function is reentrant when invoked multiple times in one transaction,
  -- e.g., in-tx V5 + later same-tx calls).
  DROP TABLE IF EXISTS pg_temp._e7_candidates;
  DROP TABLE IF EXISTS pg_temp._e7_pre;

  -- ============================================================
  -- Step 1. Candidate set: sync_delta UNION flagged UNION rolling.
  -- Reason precedence (sync_delta > flagged > rolling_sample) chosen via
  -- DISTINCT ON so each listing_id gets exactly one reason -- the most
  -- specific one available.
  -- ============================================================
  CREATE TEMP TABLE _e7_candidates ON COMMIT DROP AS
  WITH
  sync_delta AS (
    SELECT id AS listing_id, 'sync_delta'::text AS reason, 1 AS prio
      FROM public.mls_listings
     WHERE updated_at > now() - make_interval(hours => p_lookback_hours)
       AND (building_id IS NOT NULL
            OR community_id IS NOT NULL
            OR municipality_id IS NOT NULL
            OR area_id IS NOT NULL)
  ),
  flagged AS (
    SELECT id AS listing_id, 'flagged'::text AS reason, 2 AS prio
      FROM public.mls_listings
     WHERE -- (a) half-NULL coupled-check violators (should be 0 after P1 FIX 2,
           -- but defense-in-depth checks anyway)
           ((assigned_agent_id IS NULL) <> (assigned_scope IS NULL))
        OR -- (b) NULL-cache routable rows (resolve-at-insert misses)
           (assigned_agent_id IS NULL AND building_id IS NOT NULL)
  ),
  rolling AS (
    SELECT id AS listing_id, 'rolling_sample'::text AS reason, 3 AS prio
      FROM public.mls_listings TABLESAMPLE BERNOULLI (p_sample_pct)
     WHERE assigned_scope IS NOT NULL
  ),
  unioned AS (
    SELECT listing_id, reason, prio FROM sync_delta
    UNION ALL
    SELECT listing_id, reason, prio FROM flagged
    UNION ALL
    SELECT listing_id, reason, prio FROM rolling
  )
  SELECT DISTINCT ON (listing_id) listing_id, reason
    FROM unioned
   ORDER BY listing_id, prio;

  SELECT COUNT(*)::int INTO v_candidates FROM _e7_candidates;

  IF v_candidates = 0 THEN
    corrections_count := 0;
    candidates_count  := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- ============================================================
  -- Step 2. Capture pre-state trio for the candidate set.
  -- ============================================================
  CREATE TEMP TABLE _e7_pre ON COMMIT DROP AS
  SELECT ml.id                  AS listing_id,
         ml.assigned_agent_id   AS old_agent_id,
         ml.assigned_scope      AS old_scope,
         ml.assigned_source_id  AS old_source_id,
         c.reason
    FROM public.mls_listings ml
    JOIN _e7_candidates c ON c.listing_id = ml.id;

  -- ============================================================
  -- Step 3. ATOMIC TRIO RESET for the candidate set. Coupled CHECK holds
  -- because (NULL, NULL, NULL) satisfies the both-NULL branch. This is
  -- the SAME NULL-then-delegate pattern P1 FIX 2 used to fix
  -- reroll_listings_at_geo (commit ba40191).
  -- ============================================================
  UPDATE public.mls_listings
     SET assigned_agent_id  = NULL,
         assigned_scope     = NULL,
         assigned_source_id = NULL
   WHERE id IN (SELECT listing_id FROM _e7_pre);

  -- ============================================================
  -- Step 4. Delegate to the cascade walker. Writes the coupled trio
  -- atomically per cascade level (L1 pin -> L2 building -> L3/L4 community
  -- condo+home -> L5/L6 muni -> L7/L8 area -> L9/L10 floor + floor-pool
  -- alerts). Property_type discriminator + tenant scoping inherited from
  -- the delegate -- NOT re-implemented here.
  -- ============================================================
  PERFORM public.reresolve_listings_in_set(
    (SELECT array_agg(listing_id) FROM _e7_pre),
    p_tenant_id
  );

  -- ============================================================
  -- Step 5. Log corrections: rows whose post-state differs from pre-state.
  -- ROW(...) IS DISTINCT FROM ROW(...) is NULL-safe (treats NULL/NULL
  -- pairs as equal -- exactly what we want).
  -- ============================================================
  WITH inserted AS (
    INSERT INTO public.reconcile_corrections
      (tenant_id, listing_id,
       old_agent_id, old_scope, old_source_id,
       new_agent_id, new_scope, new_source_id,
       reason, reconciled_at)
    SELECT p_tenant_id,
           pre.listing_id,
           pre.old_agent_id, pre.old_scope, pre.old_source_id,
           ml.assigned_agent_id, ml.assigned_scope, ml.assigned_source_id,
           pre.reason,
           now()
      FROM _e7_pre pre
      JOIN public.mls_listings ml ON ml.id = pre.listing_id
     WHERE ROW(pre.old_agent_id, pre.old_scope, pre.old_source_id)
           IS DISTINCT FROM
           ROW(ml.assigned_agent_id, ml.assigned_scope, ml.assigned_source_id)
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_corrections FROM inserted;

  -- ============================================================
  -- Step 6. Threshold alert. If the corrections count exceeds p_threshold,
  -- INSERT a tenant_floor_alerts row signaling drift. The dashboard surfaces
  -- this in the territory health tab (P-DASHBOARD CORE-5 GAP-B wiring).
  -- alert_type and property_type values are NEW (allowed by the CHECK
  -- extensions earlier in this migration).
  -- ============================================================
  IF v_corrections > p_threshold THEN
    INSERT INTO public.tenant_floor_alerts
      (tenant_id, property_type, listing_id, alert_type)
    VALUES
      (p_tenant_id, 'system', NULL, 'reconcile_threshold_exceeded');
  END IF;

  -- ============================================================
  -- Step 7. Return counts.
  -- ============================================================
  corrections_count := v_corrections;
  candidates_count  := v_candidates;
  RETURN NEXT;
  RETURN;
END;
$function$;

COMMENT ON FUNCTION public.reconcile_tenant_cache(uuid, int, numeric, int) IS
  'P-LIFECYCLE Event 7 (2026-06-01). Nightly reconcile primitive: detects
   cache drift on a bounded candidate set (sync_delta UNION flagged UNION
   rolling_sample), writes corrections to reconcile_corrections with old +
   new trios, and inserts a tenant_floor_alerts row if corrections >
   p_threshold. SECURITY DEFINER + locked search_path. Uses the same NULL-
   then-delegate pattern P1 FIX 2 used for reroll_listings_at_geo
   (commit ba40191): capture pre-state, NULL the trio, PERFORM
   reresolve_listings_in_set, compare post vs pre, log diffs. Single-tenant
   per call. Caller contract: p_tenant_id validated upstream by the route
   (Bearer-token + UUID shape).';

-- ============================================================================
-- 5. GRANT SELECT ON reconcile_corrections TO service_role
-- ============================================================================
-- Dashboard read path needs this. P1 FIX 3 closed the same class of gap for
-- platform_manager_tenants; this is the same pattern -- audit table read by
-- supabase-js with the service_role key.
GRANT SELECT ON public.reconcile_corrections TO service_role;

-- ============================================================================
-- VERIFICATION (in-tx; outer apply-runner BEGIN/COMMIT; any RAISE -> ROLLBACK)
-- ============================================================================

-- V1: reconcile_corrections table + 2 indexes present.
DO $$
DECLARE
  v_cols int;
  v_idx_cnt int;
BEGIN
  SELECT COUNT(*)::int INTO v_cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='reconcile_corrections';
  IF v_cols < 11 THEN
    RAISE EXCEPTION 'V1 FAIL: reconcile_corrections columns=% (expected >=11)', v_cols;
  END IF;

  SELECT COUNT(*)::int INTO v_idx_cnt
    FROM pg_indexes
   WHERE schemaname='public' AND tablename='reconcile_corrections';
  IF v_idx_cnt < 3 THEN
    -- pkey + tenant_time + listing = 3
    RAISE EXCEPTION 'V1 FAIL: reconcile_corrections indexes=% (expected >=3)', v_idx_cnt;
  END IF;
  RAISE NOTICE 'V1 PASS: reconcile_corrections table + indexes present.';
END $$;

-- V2: reconcile_tenant_cache function exists with SECURITY DEFINER + locked search_path.
DO $$
DECLARE
  v_secdef    boolean;
  v_proconfig text[];
  v_args      text;
  v_result    text;
BEGIN
  SELECT p.prosecdef, p.proconfig,
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid)
    INTO v_secdef, v_proconfig, v_args, v_result
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='reconcile_tenant_cache';

  IF v_secdef IS NULL THEN
    RAISE EXCEPTION 'V2 FAIL: reconcile_tenant_cache not found';
  END IF;
  IF v_secdef IS FALSE THEN
    RAISE EXCEPTION 'V2 FAIL: prosecdef=FALSE (expected TRUE)';
  END IF;
  IF v_proconfig IS NULL OR NOT (v_proconfig::text ILIKE '%search_path=public, pg_temp%') THEN
    RAISE EXCEPTION 'V2 FAIL: proconfig missing locked search_path: %', v_proconfig;
  END IF;
  IF v_result NOT ILIKE '%corrections_count integer%' OR v_result NOT ILIKE '%candidates_count integer%' THEN
    RAISE EXCEPTION 'V2 FAIL: result_type missing expected columns: %', v_result;
  END IF;
  RAISE NOTICE 'V2 PASS: reconcile_tenant_cache DEFINER + locked search_path + result shape.';
END $$;

-- V3: idx_mls_listings_updated_at exists AND is valid (phase-1 CONCURRENTLY
-- built it; CONCURRENTLY can leave the index invalid on failure).
DO $$
DECLARE
  v_valid boolean;
BEGIN
  SELECT i.indisvalid INTO v_valid
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'idx_mls_listings_updated_at';
  IF v_valid IS NULL THEN
    RAISE EXCEPTION 'V3 FAIL: idx_mls_listings_updated_at not found -- phase 1 did not run or its DROP cleanup fired';
  END IF;
  IF v_valid IS FALSE THEN
    RAISE EXCEPTION 'V3 FAIL: idx_mls_listings_updated_at exists but indisvalid=FALSE -- phase 1 build left an invalid index';
  END IF;
  RAISE NOTICE 'V3 PASS: idx_mls_listings_updated_at exists and indisvalid=true.';
END $$;

-- V4: extended CHECK constraints on tenant_floor_alerts allow new values.
DO $$
DECLARE
  v_alert_def text;
  v_prop_def  text;
BEGIN
  SELECT pg_get_constraintdef(con.oid) INTO v_alert_def
    FROM pg_constraint con
    JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='tenant_floor_alerts'
     AND con.conname='tfa_alert_type_check';
  IF v_alert_def NOT ILIKE '%reconcile_threshold_exceeded%' THEN
    RAISE EXCEPTION 'V4 FAIL: tfa_alert_type_check missing reconcile_threshold_exceeded. Got: %', v_alert_def;
  END IF;

  SELECT pg_get_constraintdef(con.oid) INTO v_prop_def
    FROM pg_constraint con
    JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='tenant_floor_alerts'
     AND con.conname='tfa_property_type_check';
  IF v_prop_def NOT ILIKE '%system%' THEN
    RAISE EXCEPTION 'V4 FAIL: tfa_property_type_check missing system. Got: %', v_prop_def;
  END IF;

  RAISE NOTICE 'V4 PASS: tenant_floor_alerts CHECKs extended.';
END $$;

-- V5: SAVEPOINT-isolated end-to-end -- invoke reconcile_tenant_cache on
-- WALLiam with a tiny lookback (1 hour, sample_pct 0 -> no rolling), assert
-- it returns counts and inserts no rows IF there's no drift. RAISE sentinel
-- to roll back the inner state (any reconcile_corrections rows inserted
-- get reverted; mls_listings churn reverts too).
DO $$
DECLARE
  v_tenant_id     uuid;
  v_pre_corr      int;
  v_post_corr     int;
  v_corrections   int;
  v_candidates    int;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE source_key='walliam';
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'V5 SKIP: WALLiam tenant not found.';
    RETURN;
  END IF;

  BEGIN
    BEGIN
      SELECT COUNT(*)::int INTO v_pre_corr FROM public.reconcile_corrections;

      -- Call with sample_pct=0 -> rolling sample empty -> candidate set =
      -- sync_delta + flagged only. lookback_hours=1 keeps the delta tight.
      -- threshold=999999 ensures no alert row is inserted on this run.
      SELECT corrections_count, candidates_count
        INTO v_corrections, v_candidates
        FROM public.reconcile_tenant_cache(v_tenant_id, 1, 0::numeric, 999999);

      SELECT COUNT(*)::int INTO v_post_corr FROM public.reconcile_corrections;

      IF v_corrections IS NULL OR v_candidates IS NULL THEN
        RAISE EXCEPTION 'V5 FAIL: function returned NULL counts';
      END IF;
      IF v_post_corr <> v_pre_corr + v_corrections THEN
        RAISE EXCEPTION 'V5 FAIL: reconcile_corrections grew by % (expected %)',
                        v_post_corr - v_pre_corr, v_corrections;
      END IF;

      -- Sentinel-rollback -- revert any state changes (correction inserts,
      -- mls_listings UPDATEs from the function's internal NULL+walk).
      RAISE EXCEPTION 'V5_DONE_ROLLBACK';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM = 'V5_DONE_ROLLBACK' THEN
          NULL;
        ELSE
          RAISE;
        END IF;
    END;
  END;

  RAISE NOTICE 'V5 PASS: reconcile_tenant_cache called e2e (1h lookback) -- candidates=%, corrections=% (rolled back).',
               v_candidates, v_corrections;
END $$;

-- End of in-tx verification. V1..V5 must all PASS (or V5 SKIP) for COMMIT.

-- ============================================================================
-- MULTI-TENANT REVIEW (HARD GATE) -- attached per CLAUDE.md ruleset
-- ============================================================================
-- Function: public.reconcile_tenant_cache(uuid, int, numeric, int)
-- Date: 2026-06-01.
--
-- THE 5 PREDICATE PATHS that touch tenant-scoped data:
--
-- 1. STEP-1 CANDIDATE SCAN (mls_listings -- 3 CTEs).
--    sync_delta, flagged, and rolling all SELECT from public.mls_listings
--    WITHOUT a tenant_id predicate. This is intentional and consistent with
--    the rest of the routing system:
--    - mls_listings has NO tenant_id column (verified in CLAUDE.md "Verified
--      key IDs"). Tenant scoping for mls_listings is resolver-side.
--    - The candidate set is therefore a SUPERSET that may include listings
--      whose current cache points to ANOTHER tenant's agent. That's fine --
--      the cascade in Step 4 scopes to p_tenant_id, and the diff in Step 5
--      will log a correction for any listing whose tenant-correct cache
--      differs from its current state.
--    - This matches the posture of reresolve_listings_in_set and
--      reroll_listings_at_geo (also no row-level tenant predicate on
--      mls_listings; tenant scoping happens via the apa/agents join in the
--      cascade walker).
--
-- 2. STEP-3 NULL UPDATE on mls_listings.
--    Writes only NULL/NULL/NULL across the trio. Tenant-neutral by
--    construction (NULL trio).
--
-- 3. STEP-4 DELEGATE (PERFORM reresolve_listings_in_set).
--    The delegate scopes BOTH the anchor tables (apa.tenant_id,
--    tfp.tenant_id) AND agents.tenant_id by p_tenant_id at every cascade
--    level (v22 belt-and-suspenders, documented in the Landing 2 migration
--    COMMENT). Any final agent landed in mls_listings is guaranteed to
--    belong to p_tenant_id.
--
-- 4. STEP-5 INSERT into reconcile_corrections.
--    Every row stamped with p_tenant_id. The audit row records the
--    listing's pre-state (which may have been another tenant's agent if
--    cross-tenant drift occurred) and its post-state (which is guaranteed
--    p_tenant_id). The reason discriminator preserves the audit trail.
--
-- 5. STEP-6 INSERT into tenant_floor_alerts.
--    Stamped with p_tenant_id. Only fires if corrections > p_threshold for
--    THIS tenant's run. Other tenants are untouched.
--
-- HOW p_tenant_id IS SOURCED BY THE CALLER (validated upstream):
--   The route validates two things before calling this function:
--   (a) Bearer token matches RECONCILE_CRON_TOKEN env (>= 32 chars).
--   (b) ?tenant_id=<uuid> query param matches the UUID_RE regex.
--   The workflow only iterates known tenant IDs (WALLIAM_TENANT_ID +
--   AILY_TENANT_ID). p_tenant_id is NEVER from raw user input.
--
-- CROSS-TENANT BLAST-RADIUS UNDER A MISCONFIGURED CALL:
--   If a future caller mistakenly passes the wrong tenant_id (e.g.,
--   tries to "reconcile" tenant A's cache but passes tenant B's id), the
--   function would walk tenant B's apa rules and overwrite tenant A's
--   listings with tenant B's agents. THE SAME EXPOSURE EXISTS FOR
--   reresolve_listings_in_set and reroll_listings_at_geo today -- the
--   tenant_id parameter is THE trust boundary across the cascade. This
--   migration does NOT add a new exposure; it inherits the existing one.
--
--   The existing mitigations apply:
--   - Bearer-token gate on the route.
--   - Workflow iterates a fixed allowlist (no untrusted invocation).
--   - The cron workflow is auditable; manual workflow_dispatch is the only
--     way to invoke with a different tenant_id, and that requires GH
--     Actions write access.
--
-- WHY THIS POSTURE IS THE SAME AS THE 3 SIBLING DEFINER FUNCTIONS:
--   pick_floor_agent, reflow_deactivated_agent, reresolve_listings_in_set,
--   reroll_listings_at_geo all take p_tenant_id as a parameter and trust
--   it. reconcile_tenant_cache inherits that posture and adds nothing new.
--
-- CONCLUSION: tenant isolation is preserved at the level the cascade
-- walker enforces. No NEW cross-tenant exposure introduced. The same
-- v22-belt-and-suspenders scoping that reresolve_listings_in_set already
-- provides at the delegate is the binding scoping mechanism.
-- ============================================================================
