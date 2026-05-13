-- Rollback for F-RACE-DEADLOCK fix
-- Captured: 2026-05-07T09:56:59.620Z
-- To rollback: paste this into Supabase SQL editor or pipe through pg.

DROP TRIGGER IF EXISTS apa_lock_before_insert ON public.agent_property_access;
DROP TRIGGER IF EXISTS apa_lock_before_update ON public.agent_property_access;
DROP TRIGGER IF EXISTS apa_lock_before_delete ON public.agent_property_access;
DROP FUNCTION IF EXISTS public.apa_mutation_lock_trigger();
