-- ============================================================================
-- W-TERRITORY-MASTER P-LIFECYCLE Landing 2 - DOWN migration (DROP-ONLY).
--
-- Date:        2026-05-30
-- Pairs with:  20260530_phase_lifecycle_landing_2_reresolve_in_set.sql
-- Apply via:   node scripts/apply-phase-lifecycle-landing-2-down.js
--              (NOT psql -f directly: see notes below)
--
-- WHAT THIS DOES:
--   1. DROP reresolve_listings_in_set.
--   2. DROP reresolve_listing (the patched, post-Landing-2 body).
--
-- WHAT THIS DOES NOT DO:
--   Does NOT restore the original reresolve_listing body. That restoration is
--   performed by the down-RUNNER (scripts/apply-phase-lifecycle-landing-2-down.js),
--   which reads the snapshot file
--   supabase/migrations/rollback-snapshots/_phase-lifecycle-landing-2_reresolve_listing_<ts>.sql
--   captured pre-BEGIN by the up-runner, BOM-strips it, and executes it after
--   this .sql runs. The snapshot is the SINGLE source of truth for the
--   restored body. No body is hardcoded anywhere in the down path.
--
-- WHY DROP-ONLY:
--   A previous version of this file pasted the original body inline. If the
--   pre-Landing-2 body ever drifts from this paste (e.g. a hotfix before
--   Landing 2 shipped), the inline restore would resurrect the wrong body
--   without warning. Reading from the snapshot file makes drift impossible.
--
-- WHEN TO RUN THIS:
--   If after Landing 2 ships, a regression surfaces that warrants reverting
--   the set-based primitive AND the reresolve_listing patch together. The
--   runner orchestrates: DROP -> read snapshot -> CREATE OR REPLACE from
--   snapshot bytes -> post-verify.
--
-- WHAT YOU LOSE ON REVERT:
--   F-RERESOLVE-COUPLED-CHECK returns: reresolve_listing again crashes on
--   NULL-cache rows. The sync hook (if wired) would error out.
--   F-RESOLVE-AT-INSERT-PRIORITY returns: NULL-cache drift resumes.
-- ============================================================================

DROP FUNCTION IF EXISTS public.reresolve_listings_in_set(uuid[], uuid);
DROP FUNCTION IF EXISTS public.reresolve_listing(uuid, uuid);

-- ============================================================================
-- VERIFICATION (post-DROPs, pre-snapshot-restore)
-- ============================================================================

DO $$
DECLARE
  v_in_set_exists boolean;
  v_old_exists    boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='reresolve_listings_in_set'
  ) INTO v_in_set_exists;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='reresolve_listing'
  ) INTO v_old_exists;

  IF v_in_set_exists THEN
    RAISE EXCEPTION 'DOWN V1 FAIL: reresolve_listings_in_set still exists after DROP';
  END IF;
  IF v_old_exists THEN
    RAISE EXCEPTION 'DOWN V2 FAIL: reresolve_listing still exists after DROP (snapshot restore expected to re-create it)';
  END IF;

  RAISE NOTICE 'DOWN V1+V2 PASS: both Landing 2 functions dropped. Runner will now restore reresolve_listing from snapshot.';
END $$;
