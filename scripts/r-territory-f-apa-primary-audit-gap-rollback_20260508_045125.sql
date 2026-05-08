CREATE OR REPLACE FUNCTION public.handle_apa_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_new_scope_id uuid;
  v_old_scope_id uuid;
  v_old_in_audit_scope boolean;
  v_new_in_audit_scope boolean;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Skip if no routing-affecting fields changed.
  -- is_primary flips and access-toggle changes (buildings/condo/homes) are
  -- display/policy-only -- no listing impact.
  IF NEW.agent_id IS NOT DISTINCT FROM OLD.agent_id
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
     AND NEW.scope IS NOT DISTINCT FROM OLD.scope
     AND NEW.area_id IS NOT DISTINCT FROM OLD.area_id
     AND NEW.municipality_id IS NOT DISTINCT FROM OLD.municipality_id
     AND NEW.community_id IS NOT DISTINCT FROM OLD.community_id
     AND NEW.neighbourhood_id IS NOT DISTINCT FROM OLD.neighbourhood_id THEN
    RETURN NEW;
  END IF;

  -- Compute scope_ids for both OLD and NEW state (used by audit + reroll)
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

  -- "in audit scope" means scope is one of the audit table's accepted values.
  -- The audit scope CHECK does not include 'all'.
  v_old_in_audit_scope := OLD.scope IN ('area', 'municipality', 'community', 'neighbourhood');
  v_new_in_audit_scope := NEW.scope IN ('area', 'municipality', 'community', 'neighbourhood');

  -- F-APA-UPDATE-AUDIT-GAP fix (v11): write audit rows for direct apa state changes.
  -- Cases:
  --   active -> inactive: 1 row, change_type='assignment_revoked'
  --   inactive -> active: 1 row, change_type='assignment_granted'
  --   active -> active with agent_id/scope/scope_id changed: 2 rows
  --     (assignment_revoked at OLD context + assignment_granted at NEW context)
  IF OLD.is_active IS TRUE AND NEW.is_active IS NOT TRUE THEN
    -- Active -> Inactive: revoke
    IF v_old_in_audit_scope AND v_old_scope_id IS NOT NULL THEN
      INSERT INTO territory_assignment_changes (
        tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state
      ) VALUES (
        OLD.tenant_id, OLD.agent_id, OLD.scope, v_old_scope_id, 'assignment_revoked',
        to_jsonb(OLD), to_jsonb(NEW)
      );
    END IF;
  ELSIF OLD.is_active IS NOT TRUE AND NEW.is_active IS TRUE THEN
    -- Inactive -> Active: grant
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
    -- Active -> Active but agent/scope/scope_id changed: revoke OLD, grant NEW
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
$function$
;
