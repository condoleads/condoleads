-- supabase/migrations/20260603_w_funnel_batch2_leads_tenant_agent_fk.sql
-- W-FUNNEL Batch 2a: enforce leads.tenant_id == referenced agent.tenant_id
-- across all 6 agent-referencing columns. Closes
-- F-CV-LEADS-INSERT-NO-TENANT-AGENT-FK.
--
-- Precheck (scripts/recon-w-funnel-batch2-fk-precheck.js): all 6 columns
-- show 0 cross-tenant violations on current data, so the constraints can be
-- added without first chasing a routing finding.
--
-- Mechanics:
--   1. Add UNIQUE (id, tenant_id) on agents -- required by PostgreSQL for any
--      composite FK to (id, tenant_id). agents.id is already PRIMARY KEY (so
--      ALONE-unique), but PG won't accept a multi-column FK against a single-
--      column UNIQUE -- the target must cover every column the FK references.
--   2. Add 6 composite FK constraints on leads, one per agent-referencing
--      column, each (col, tenant_id) -> agents(id, tenant_id) MATCH SIMPLE.
--      MATCH SIMPLE means: if leads.<col> IS NULL, no check fires (matches
--      today's nullable-column semantics; not every lead has every chain
--      column populated).
--      ON DELETE NO ACTION: deleting an agent that's still referenced by a
--      lead is blocked (correct -- the existing leads_<col>_fkey constraints
--      already enforce this for the simple agent id reference; we don't
--      change that contract).
--
-- The 6 existing single-column FKs (leads_<col>_fkey -> agents(id)) are NOT
-- dropped -- they continue to validate the simple agent id reference, and
-- the new constraints add the tenant-consistency check on top. Redundant
-- but safer than dropping protections in this migration. Dedup is a future
-- cleanup once the new constraints are proven stable.

BEGIN;

-- 1) Prerequisite: composite UNIQUE on agents (id, tenant_id).
ALTER TABLE public.agents
  ADD CONSTRAINT agents_id_tenant_id_unique UNIQUE (id, tenant_id);

-- 2) Six composite FKs on leads.

ALTER TABLE public.leads
  ADD CONSTRAINT leads_agent_tenant_consistency
  FOREIGN KEY (agent_id, tenant_id)
  REFERENCES public.agents (id, tenant_id)
  MATCH SIMPLE ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_manager_tenant_consistency
  FOREIGN KEY (manager_id, tenant_id)
  REFERENCES public.agents (id, tenant_id)
  MATCH SIMPLE ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_area_manager_tenant_consistency
  FOREIGN KEY (area_manager_id, tenant_id)
  REFERENCES public.agents (id, tenant_id)
  MATCH SIMPLE ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_tenant_admin_tenant_consistency
  FOREIGN KEY (tenant_admin_id, tenant_id)
  REFERENCES public.agents (id, tenant_id)
  MATCH SIMPLE ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_claimed_by_tenant_consistency
  FOREIGN KEY (claimed_by_agent_id, tenant_id)
  REFERENCES public.agents (id, tenant_id)
  MATCH SIMPLE ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_override_agent_tenant_consistency
  FOREIGN KEY (override_agent_id, tenant_id)
  REFERENCES public.agents (id, tenant_id)
  MATCH SIMPLE ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT;
