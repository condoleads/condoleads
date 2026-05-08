CREATE OR REPLACE FUNCTION public.handle_apa_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_scope_id uuid;
  v_old_scope_id uuid;
  v_old_in_audit_scope boolean;
  v_new_in_audit_scope boolean;
  v_is_primary_changed boolean;
  v_access_toggle_changed boolean;
  v_routing_changed boolean;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Compute scope_ids and audit-scope booleans (used by every audit branch)
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

  -- Classify the change
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

  -- F-APA-PRIMARY-AUDIT-GAP fix (v13): audit display/policy-only changes that
  -- previously caused early-return without any audit row. Only audit when the
  -- row is active and at an auditable scope.
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

  -- If only display/policy-only fields changed (no routing impact), skip the
  -- routing-audit + reroll logic. Preserves T6 Test 3 semantics: is_primary
  -- toggle and access-toggle changes do not fire reroll.
  IF NOT v_routing_changed THEN
    RETURN NEW;
  END IF;

  -- F-APA-UPDATE-AUDIT-GAP fix (v11): write audit rows for direct apa state changes.
  -- Cases:
  --   active -> inactive: 1 row, change_type='assignment_revoked'
  --   inactive -> active: 1 row, change_type='assignment_granted'
  --   active -> active with agent_id/scope/scope_id changed: 2 rows
  --     (assignment_revoked at OLD context + assignment_granted at NEW context)
  IF OLD.is_active IS TRUE AND NEW.is_active IS NOT TRUE THEN
    IF v_old_in_audit_scope AND v_old_scope_id IS NOT NULL THEN
      INSERT INTO territory_assignment_changes (
        tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
      ) VALUES (
        OLD.tenant_id, OLD.agent_id, OLD.scope, v_old_scope_id, 'assignment_revoked',
        to_jsonb(OLD), to_jsonb(NEW)
      );
    END IF;
  ELSIF OLD.is_active IS NOT TRUE AND NEW.is_active IS TRUE THEN
    IF v_new_in_audit_scope AND v_new_scope_id IS NOT NULL THEN
      INSERT INTO territory_assignment_changes (
        tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
      ) VALUES (
        NEW.tenant_id, NEW.agent_id, NEW.scope, v_new_scope_id, 'assignment_granted',
        to_jsonb(OLD), to_jsonb(NEW)
      );
    END IF;
  ELSIF NEW.is_active IS TRUE AND (
        NEW.agent_id IS DISTINCT FROM OLD.agent_id
        OR NEW.scope IS DISTINCT FROM OLD.scope
        OR v_new_scope_id IS DISTINCT FROM v_old_scope_id) THEN
    IF v_old_in_audit_scope AND v_old_scope_id IS NOT NULL THEN
      INSERT INTO territory_assignment_changes (
        tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
      ) VALUES (
        OLD.tenant_id, OLD.agent_id, OLD.scope, v_old_scope_id, 'assignment_revoked',
        to_jsonb(OLD), to_jsonb(NEW)
      );
    END IF;
    IF v_new_in_audit_scope AND v_new_scope_id IS NOT NULL THEN
      INSERT INTO territory_assignment_changes (
        tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
      ) VALUES (
        NEW.tenant_id, NEW.agent_id, NEW.scope, v_new_scope_id, 'assignment_granted',
        to_jsonb(OLD), to_jsonb(NEW)
      );
    END IF;
  END IF;

  -- Reroll at NEW scope (only if active, since inactive rows don't route)
  IF NEW.is_active IS TRUE AND NEW.scope IN ('area', 'municipality', 'community') THEN
    IF v_new_scope_id IS NOT NULL THEN
      PERFORM reroll_listings_at_geo(NEW.scope, v_new_scope_id, NEW.tenant_id);
    END IF;
  END IF;

  -- If scope changed OR scope_id changed OR row went active->inactive,
  -- also reroll at OLD scope (listings might have cached the old context)
  IF (OLD.scope IS DISTINCT FROM NEW.scope
      OR OLD.area_id IS DISTINCT FROM NEW.area_id
      OR OLD.municipality_id IS DISTINCT FROM NEW.municipality_id
      OR OLD.community_id IS DISTINCT FROM NEW.community_id
      OR (OLD.is_active IS TRUE AND NEW.is_active IS NOT TRUE))
     AND OLD.scope IN ('area', 'municipality', 'community') THEN
    IF v_old_scope_id IS NOT NULL THEN
      PERFORM reroll_listings_at_geo(OLD.scope, v_old_scope_id, OLD.tenant_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
