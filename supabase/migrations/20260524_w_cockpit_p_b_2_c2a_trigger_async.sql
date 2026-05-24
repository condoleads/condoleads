-- supabase/migrations/20260524_w_cockpit_p_b_2_c2a_trigger_async.sql
-- W-COCKPIT P-B-2 Commit 2a: triggers honor app.skip_apa_reroll session GUC.
--
-- When the GUC is 'on' (set per-transaction by the cards API), the trigger
-- inserts a row into territory_reroll_queue instead of calling
-- reroll_listings_at_geo synchronously. The audit row writes are kept inline
-- (small, fast). When GUC is unset/off, behavior is identical to v13 baseline.
--
-- Pre-flight verified clean (no existing GUC reads in these functions).

CREATE OR REPLACE FUNCTION public.handle_apa_insert()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
DECLARE
  v_scope_id uuid;
  v_skip_reroll boolean := false;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.is_active IS NOT TRUE THEN RETURN NEW; END IF;

  v_scope_id := CASE NEW.scope
    WHEN 'area' THEN NEW.area_id
    WHEN 'municipality' THEN NEW.municipality_id
    WHEN 'community' THEN NEW.community_id
    WHEN 'neighbourhood' THEN NEW.neighbourhood_id
  END;
  IF v_scope_id IS NULL THEN RETURN NEW; END IF;

  -- C2a: read app.skip_apa_reroll GUC. Missing/empty -> false.
  v_skip_reroll := COALESCE(NULLIF(current_setting('app.skip_apa_reroll', true), ''), 'off') = 'on';

  -- Audit (always synchronous; tiny INSERTs).
  INSERT INTO territory_assignment_changes (
    tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
  ) VALUES (
    NEW.tenant_id, NEW.agent_id, NEW.scope, v_scope_id, 'assignment_granted',
    NULL, to_jsonb(NEW)
  );

  -- Distribute primaries to child geos (always synchronous; small writes,
  -- bounded by child count). Not the bottleneck.
  IF NEW.scope = 'area' THEN
    PERFORM distribute_geo_to_children('area', v_scope_id, 'municipality', NEW.tenant_id);
    PERFORM distribute_geo_to_children('area', v_scope_id, 'neighbourhood', NEW.tenant_id);
  ELSIF NEW.scope = 'municipality' THEN
    PERFORM distribute_geo_to_children('municipality', v_scope_id, 'community', NEW.tenant_id);
  END IF;

  -- Reroll listings: SYNC (legacy) or ASYNC (C2a path) based on GUC.
  IF NEW.scope IN ('area', 'municipality', 'community') THEN
    IF v_skip_reroll THEN
      -- Enqueue. ON CONFLICT DO NOTHING coalesces repeated requests for same slot.
      INSERT INTO territory_reroll_queue (tenant_id, scope, scope_id)
      VALUES (NEW.tenant_id, NEW.scope, v_scope_id)
      ON CONFLICT (tenant_id, scope, scope_id) WHERE status = 'pending' DO NOTHING;
    ELSE
      PERFORM reroll_listings_at_geo(NEW.scope, v_scope_id, NEW.tenant_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.handle_apa_update()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
DECLARE
  v_new_scope_id uuid;
  v_old_scope_id uuid;
  v_old_in_audit_scope boolean;
  v_new_in_audit_scope boolean;
  v_is_primary_changed boolean;
  v_access_toggle_changed boolean;
  v_routing_changed boolean;
  v_skip_reroll boolean := false;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  v_old_scope_id := CASE OLD.scope
    WHEN 'area' THEN OLD.area_id
    WHEN 'municipality' THEN OLD.municipality_id
    WHEN 'community' THEN OLD.community_id
    WHEN 'neighbourhood' THEN OLD.neighbourhood_id
  END;
  v_new_scope_id := CASE NEW.scope
    WHEN 'area' THEN NEW.area_id
    WHEN 'municipality' THEN NEW.municipality_id
    WHEN 'community' THEN NEW.community_id
    WHEN 'neighbourhood' THEN NEW.neighbourhood_id
  END;
  v_old_in_audit_scope := OLD.scope IN ('area', 'municipality', 'community', 'neighbourhood');
  v_new_in_audit_scope := NEW.scope IN ('area', 'municipality', 'community', 'neighbourhood');

  v_is_primary_changed := NEW.is_primary IS DISTINCT FROM OLD.is_primary;
  v_access_toggle_changed := (
    NEW.condo_access IS DISTINCT FROM OLD.condo_access
    OR NEW.homes_access IS DISTINCT FROM OLD.homes_access
    OR NEW.buildings_access IS DISTINCT FROM OLD.buildings_access
    OR NEW.buildings_mode IS DISTINCT FROM OLD.buildings_mode
  );
  v_routing_changed := (
    NEW.agent_id IS DISTINCT FROM OLD.agent_id
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.scope IS DISTINCT FROM OLD.scope
    OR NEW.area_id IS DISTINCT FROM OLD.area_id
    OR NEW.municipality_id IS DISTINCT FROM OLD.municipality_id
    OR NEW.community_id IS DISTINCT FROM OLD.community_id
    OR NEW.neighbourhood_id IS DISTINCT FROM OLD.neighbourhood_id
  );

  v_skip_reroll := COALESCE(NULLIF(current_setting('app.skip_apa_reroll', true), ''), 'off') = 'on';

  -- Display/policy-only audit rows (unchanged from v13).
  IF NEW.is_active IS TRUE AND v_new_in_audit_scope AND v_new_scope_id IS NOT NULL THEN
    IF v_is_primary_changed THEN
      INSERT INTO territory_assignment_changes (
        tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
      ) VALUES (
        NEW.tenant_id, NEW.agent_id, NEW.scope, v_new_scope_id,
        CASE WHEN NEW.is_primary THEN 'primary_set' ELSE 'primary_unset' END,
        to_jsonb(OLD), to_jsonb(NEW)
      );
    END IF;
    IF v_access_toggle_changed THEN
      INSERT INTO territory_assignment_changes (
        tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
      ) VALUES (
        NEW.tenant_id, NEW.agent_id, NEW.scope, v_new_scope_id, 'access_toggle_changed',
        to_jsonb(OLD), to_jsonb(NEW)
      );
    END IF;
  END IF;

  IF NOT v_routing_changed THEN RETURN NEW; END IF;

  -- Routing audit rows (unchanged from v13).
  IF OLD.is_active IS TRUE AND NEW.is_active IS NOT TRUE THEN
    IF v_old_in_audit_scope AND v_old_scope_id IS NOT NULL THEN
      INSERT INTO territory_assignment_changes (tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state)
      VALUES (OLD.tenant_id, OLD.agent_id, OLD.scope, v_old_scope_id, 'assignment_revoked', to_jsonb(OLD), to_jsonb(NEW));
    END IF;
  ELSIF OLD.is_active IS NOT TRUE AND NEW.is_active IS TRUE THEN
    IF v_new_in_audit_scope AND v_new_scope_id IS NOT NULL THEN
      INSERT INTO territory_assignment_changes (tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state)
      VALUES (NEW.tenant_id, NEW.agent_id, NEW.scope, v_new_scope_id, 'assignment_granted', to_jsonb(OLD), to_jsonb(NEW));
    END IF;
  ELSIF NEW.is_active IS TRUE AND (
        NEW.agent_id IS DISTINCT FROM OLD.agent_id
        OR NEW.scope IS DISTINCT FROM OLD.scope
        OR v_new_scope_id IS DISTINCT FROM v_old_scope_id) THEN
    IF v_old_in_audit_scope AND v_old_scope_id IS NOT NULL THEN
      INSERT INTO territory_assignment_changes (tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state)
      VALUES (OLD.tenant_id, OLD.agent_id, OLD.scope, v_old_scope_id, 'assignment_revoked', to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    IF v_new_in_audit_scope AND v_new_scope_id IS NOT NULL THEN
      INSERT INTO territory_assignment_changes (tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state)
      VALUES (NEW.tenant_id, NEW.agent_id, NEW.scope, v_new_scope_id, 'assignment_granted', to_jsonb(OLD), to_jsonb(NEW));
    END IF;
  END IF;

  -- Reroll: SYNC or ASYNC at NEW scope.
  IF NEW.is_active IS TRUE AND NEW.scope IN ('area', 'municipality', 'community') AND v_new_scope_id IS NOT NULL THEN
    IF v_skip_reroll THEN
      INSERT INTO territory_reroll_queue (tenant_id, scope, scope_id)
      VALUES (NEW.tenant_id, NEW.scope, v_new_scope_id)
      ON CONFLICT (tenant_id, scope, scope_id) WHERE status = 'pending' DO NOTHING;
    ELSE
      PERFORM reroll_listings_at_geo(NEW.scope, v_new_scope_id, NEW.tenant_id);
    END IF;
  END IF;

  -- Reroll at OLD scope if it differs.
  IF (OLD.scope IS DISTINCT FROM NEW.scope
      OR OLD.area_id IS DISTINCT FROM NEW.area_id
      OR OLD.municipality_id IS DISTINCT FROM NEW.municipality_id
      OR OLD.community_id IS DISTINCT FROM NEW.community_id
      OR (OLD.is_active IS TRUE AND NEW.is_active IS NOT TRUE))
     AND OLD.scope IN ('area', 'municipality', 'community')
     AND v_old_scope_id IS NOT NULL THEN
    IF v_skip_reroll THEN
      INSERT INTO territory_reroll_queue (tenant_id, scope, scope_id)
      VALUES (OLD.tenant_id, OLD.scope, v_old_scope_id)
      ON CONFLICT (tenant_id, scope, scope_id) WHERE status = 'pending' DO NOTHING;
    ELSE
      PERFORM reroll_listings_at_geo(OLD.scope, v_old_scope_id, OLD.tenant_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.handle_apa_delete()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
DECLARE
  v_scope_id uuid;
  v_skip_reroll boolean := false;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  IF OLD.is_active IS NOT TRUE THEN RETURN OLD; END IF;

  v_scope_id := CASE OLD.scope
    WHEN 'area' THEN OLD.area_id
    WHEN 'municipality' THEN OLD.municipality_id
    WHEN 'community' THEN OLD.community_id
    WHEN 'neighbourhood' THEN OLD.neighbourhood_id
  END;
  IF v_scope_id IS NULL THEN RETURN OLD; END IF;

  v_skip_reroll := COALESCE(NULLIF(current_setting('app.skip_apa_reroll', true), ''), 'off') = 'on';

  INSERT INTO territory_assignment_changes (tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state)
  VALUES (OLD.tenant_id, OLD.agent_id, OLD.scope, v_scope_id, 'assignment_revoked', to_jsonb(OLD), NULL);

  IF OLD.scope IN ('area', 'municipality', 'community') THEN
    IF v_skip_reroll THEN
      INSERT INTO territory_reroll_queue (tenant_id, scope, scope_id)
      VALUES (OLD.tenant_id, OLD.scope, v_scope_id)
      ON CONFLICT (tenant_id, scope, scope_id) WHERE status = 'pending' DO NOTHING;
    ELSE
      PERFORM reroll_listings_at_geo(OLD.scope, v_scope_id, OLD.tenant_id);
    END IF;
  END IF;

  RETURN OLD;
END;
$function$;