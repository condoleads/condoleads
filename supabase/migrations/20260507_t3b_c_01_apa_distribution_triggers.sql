-- supabase/migrations/20260507_t3b_c_01_apa_distribution_triggers.sql
-- W-TERRITORY/T3b-C — apa triggers wiring distribution + re-roll autonomously.
--
-- Triggers (all AFTER, FOR EACH ROW):
--   trg_apa_after_insert → handle_apa_insert()
--     Calls distribute_geo_to_children for valid child scopes
--     (area→municipality, area→neighbourhood, municipality→community)
--     + reroll_listings_at_geo for the changed scope (skip neighbourhood;
--      mls_listings has no neighbourhood_id).
--
--   trg_apa_after_update → handle_apa_update()
--     Fires reroll_listings_at_geo only on ROUTING-AFFECTING changes:
--     agent_id change, is_active flip, scope change. is_primary flips and
--     access-toggle (buildings/condo/homes) changes are display/policy-only,
--     no listing impact, early-return.
--     If scope changed: reroll at BOTH old and new scope.
--
--   trg_apa_after_delete → handle_apa_delete()
--     Fires reroll_listings_at_geo for OLD scope.
--
-- Recursion guard: pg_trigger_depth() > 1 → RETURN.
--   distribute_geo_to_children INSERTs into apa, which would re-fire
--   trg_apa_after_insert at depth=2. The guard prevents infinite loop.
--
-- Performance note: at scale, distribute_geo_to_children + reroll_listings_at_geo
--   inside a trigger can be slow (hundreds of audit inserts, thousands of
--   listing updates). Synchronous execution holds locks during the user's
--   apa INSERT. V1 is single-tenant + small data → fine. Future scale path:
--   move to LISTEN/NOTIFY + async worker.
--
-- Security: SECURITY INVOKER (default). Trigger runs as the calling user.
--   apa changes are made by admin users (service_role) which has full grants.
--   If permission errors surface for non-admin contexts, switch to SECURITY
--   DEFINER and audit grants.
--
-- Idempotency: CREATE OR REPLACE for functions; DROP TRIGGER IF EXISTS +
--   CREATE TRIGGER for triggers. Safe to re-run.
--
-- Rollback:
--   DROP TRIGGER trg_apa_after_insert ON agent_property_access;
--   DROP TRIGGER trg_apa_after_update ON agent_property_access;
--   DROP TRIGGER trg_apa_after_delete ON agent_property_access;
--   DROP FUNCTION handle_apa_insert(); handle_apa_update(); handle_apa_delete();
--
-- VERIFICATION (separate blocks after apply):
--   Block A: 3 trigger functions exist with correct signature
--   Block B: 3 triggers attached to agent_property_access
--   Block C (optional): transaction-rollback safe smoke (INSERT + observe + ROLLBACK)

BEGIN;

-- ─── handle_apa_insert ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_apa_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_scope_id uuid;
BEGIN
  -- Recursion guard: skip if we're already inside a trigger chain
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Skip inactive rows; they don't participate in routing
  IF NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Determine the scope_id for this row based on scope discriminator
  v_scope_id := CASE NEW.scope
    WHEN 'area' THEN NEW.area_id
    WHEN 'municipality' THEN NEW.municipality_id
    WHEN 'community' THEN NEW.community_id
    WHEN 'neighbourhood' THEN NEW.neighbourhood_id
  END;

  IF v_scope_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Event 1: distribute primaries to child geos for valid parent→child pairs
  IF NEW.scope = 'area' THEN
    PERFORM distribute_geo_to_children('area', v_scope_id, 'municipality', NEW.tenant_id);
    PERFORM distribute_geo_to_children('area', v_scope_id, 'neighbourhood', NEW.tenant_id);
  ELSIF NEW.scope = 'municipality' THEN
    PERFORM distribute_geo_to_children('municipality', v_scope_id, 'community', NEW.tenant_id);
  END IF;
  -- community + neighbourhood have no children in this schema

  -- Event 2: reroll cached listings at this scope
  -- (mls_listings has no neighbourhood_id; skip neighbourhood)
  IF NEW.scope IN ('area', 'municipality', 'community') THEN
    PERFORM reroll_listings_at_geo(NEW.scope, v_scope_id, NEW.tenant_id);
  END IF;

  RETURN NEW;
END;
$function$;

-- ─── handle_apa_update ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_apa_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_new_scope_id uuid;
  v_old_scope_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Skip if no routing-affecting fields changed.
  -- is_primary flips and access-toggle changes (buildings/condo/homes) are
  -- display/policy-only — no listing impact.
  IF NEW.agent_id IS NOT DISTINCT FROM OLD.agent_id
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
     AND NEW.scope IS NOT DISTINCT FROM OLD.scope
     AND NEW.area_id IS NOT DISTINCT FROM OLD.area_id
     AND NEW.municipality_id IS NOT DISTINCT FROM OLD.municipality_id
     AND NEW.community_id IS NOT DISTINCT FROM OLD.community_id
     AND NEW.neighbourhood_id IS NOT DISTINCT FROM OLD.neighbourhood_id THEN
    RETURN NEW;
  END IF;

  -- Reroll at NEW scope (only if active, since inactive rows don't route)
  IF NEW.is_active IS TRUE AND NEW.scope IN ('area', 'municipality', 'community') THEN
    v_new_scope_id := CASE NEW.scope
      WHEN 'area' THEN NEW.area_id
      WHEN 'municipality' THEN NEW.municipality_id
      WHEN 'community' THEN NEW.community_id
    END;
    IF v_new_scope_id IS NOT NULL THEN
      PERFORM reroll_listings_at_geo(NEW.scope, v_new_scope_id, NEW.tenant_id);
    END IF;
  END IF;

  -- If scope changed OR scope_id changed OR row went active→inactive,
  -- also reroll at OLD scope (listings might have cached the old context)
  IF (OLD.scope IS DISTINCT FROM NEW.scope
      OR OLD.area_id IS DISTINCT FROM NEW.area_id
      OR OLD.municipality_id IS DISTINCT FROM NEW.municipality_id
      OR OLD.community_id IS DISTINCT FROM NEW.community_id
      OR (OLD.is_active IS TRUE AND NEW.is_active IS NOT TRUE))
     AND OLD.scope IN ('area', 'municipality', 'community') THEN
    v_old_scope_id := CASE OLD.scope
      WHEN 'area' THEN OLD.area_id
      WHEN 'municipality' THEN OLD.municipality_id
      WHEN 'community' THEN OLD.community_id
    END;
    IF v_old_scope_id IS NOT NULL THEN
      PERFORM reroll_listings_at_geo(OLD.scope, v_old_scope_id, OLD.tenant_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ─── handle_apa_delete ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_apa_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_scope_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  -- Skip if was already inactive (no routing impact)
  IF OLD.is_active IS NOT TRUE THEN
    RETURN OLD;
  END IF;

  v_scope_id := CASE OLD.scope
    WHEN 'area' THEN OLD.area_id
    WHEN 'municipality' THEN OLD.municipality_id
    WHEN 'community' THEN OLD.community_id
    WHEN 'neighbourhood' THEN OLD.neighbourhood_id
  END;

  IF v_scope_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- Event 2: reroll cached listings at this scope
  IF OLD.scope IN ('area', 'municipality', 'community') THEN
    PERFORM reroll_listings_at_geo(OLD.scope, v_scope_id, OLD.tenant_id);
  END IF;

  RETURN OLD;
END;
$function$;

-- ─── Trigger declarations (drop existing, create fresh — idempotent) ────────
DROP TRIGGER IF EXISTS trg_apa_after_insert ON agent_property_access;
DROP TRIGGER IF EXISTS trg_apa_after_update ON agent_property_access;
DROP TRIGGER IF EXISTS trg_apa_after_delete ON agent_property_access;

CREATE TRIGGER trg_apa_after_insert
AFTER INSERT ON agent_property_access
FOR EACH ROW
EXECUTE FUNCTION handle_apa_insert();

CREATE TRIGGER trg_apa_after_update
AFTER UPDATE ON agent_property_access
FOR EACH ROW
EXECUTE FUNCTION handle_apa_update();

CREATE TRIGGER trg_apa_after_delete
AFTER DELETE ON agent_property_access
FOR EACH ROW
EXECUTE FUNCTION handle_apa_delete();

COMMIT;
