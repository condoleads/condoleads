-- Rollback snapshot for P-LIFECYCLE Landing 3 Event 4 ASYNC HANDOFF
-- Captured: 2026-05-30T14:56:41.737Z
-- Function: public.handle_agent_deactivate()
-- pre-state prosecdef: false
--
-- This is the SYNCHRONOUS body about to be replaced by the async-handoff
-- migration. The down-runner reads this file to restore the sync body if
-- the async handoff needs to be reverted. Note: restoring the sync body
-- re-introduces the production-path 8s statement_timeout problem for
-- high-footprint agents -- the down is a recovery path, not a normal one.

CREATE OR REPLACE FUNCTION public.handle_agent_deactivate()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Platform-tier agents have tenant_id IS NULL. Skip reflow.
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Synchronous reflow inside the agents-table UPDATE transaction.
  -- The PERFORM swallows the result tuple; reflow_deactivated_agent
  -- writes its effects directly to mls_listings.
  PERFORM public.reflow_deactivated_agent(NEW.id, NEW.tenant_id);

  RETURN NEW;
END;
$function$

