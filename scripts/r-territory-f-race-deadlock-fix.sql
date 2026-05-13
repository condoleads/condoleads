-- scripts/r-territory-f-race-deadlock-fix.sql
-- W-TERRITORY/F-RACE-DEADLOCK + F-RACE-LATENCY
--
-- Adds a per-tenant advisory lock acquired by a BEFORE trigger on
-- agent_property_access. The lock serializes concurrent apa mutations
-- within a single tenant, eliminating mls_listings deadlock and the
-- 22-326-second tail latencies observed in T6-followup-A.
--
-- The lock is xact-scoped (pg_advisory_xact_lock), so it is released
-- automatically at COMMIT or ROLLBACK. No leakage possible.
--
-- The trigger function uses COALESCE(NEW, OLD) so the same function
-- handles INSERT (NEW set, OLD null), UPDATE (both set), and DELETE
-- (NEW null, OLD set).
--
-- Recursion guard (pg_trigger_depth() > 1) ensures that apa rows
-- inserted by distribute_geo_to_children inside an existing trigger
-- chain do not attempt to re-acquire the same lock.

CREATE OR REPLACE FUNCTION public.apa_mutation_lock_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Don't lock if we're already inside a trigger chain
  -- (e.g., distribute_geo_to_children inserting child-scope rows)
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Per-tenant advisory lock. Same hash key for all apa mutations within
  -- this tenant; xact-scoped so it auto-releases at COMMIT or ROLLBACK.
  PERFORM pg_advisory_xact_lock(
    hashtext('apa_geo_mutation:' || COALESCE(NEW.tenant_id, OLD.tenant_id)::text)
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Three BEFORE triggers, one per DML operation. They fire BEFORE the
-- existing AFTER triggers (handle_apa_insert/update/delete), so the
-- lock is held by the time those run their distribute + reroll work.
DROP TRIGGER IF EXISTS apa_lock_before_insert ON public.agent_property_access;
CREATE TRIGGER apa_lock_before_insert
  BEFORE INSERT ON public.agent_property_access
  FOR EACH ROW EXECUTE FUNCTION public.apa_mutation_lock_trigger();

DROP TRIGGER IF EXISTS apa_lock_before_update ON public.agent_property_access;
CREATE TRIGGER apa_lock_before_update
  BEFORE UPDATE ON public.agent_property_access
  FOR EACH ROW EXECUTE FUNCTION public.apa_mutation_lock_trigger();

DROP TRIGGER IF EXISTS apa_lock_before_delete ON public.agent_property_access;
CREATE TRIGGER apa_lock_before_delete
  BEFORE DELETE ON public.agent_property_access
  FOR EACH ROW EXECUTE FUNCTION public.apa_mutation_lock_trigger();
