-- W2-A: lead_admin_actions audit table
-- Workstream: W-LEADS-WORKBENCH W2
-- Applied: 2026-05-13 via Supabase Studio direct DDL.
-- Pattern: mirrors lead_email_recipients_log audit shape.
-- Multi-tenant safety: tenant_id NOT NULL + FK CASCADE.
-- Idempotent: IF NOT EXISTS re-runnable.

CREATE TABLE IF NOT EXISTS public.lead_admin_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id         uuid NOT NULL REFERENCES public.leads(id)   ON DELETE CASCADE,
  actor_user_id   uuid REFERENCES auth.users(id)              ON DELETE SET NULL,
  actor_agent_id  uuid REFERENCES public.agents(id)           ON DELETE SET NULL,
  actor_role      text NOT NULL,
  action_type     text NOT NULL,
  target_field    text,
  before_value    jsonb,
  after_value     jsonb,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_admin_actions_tenant_lead
  ON public.lead_admin_actions(tenant_id, lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_admin_actions_actor
  ON public.lead_admin_actions(actor_user_id, created_at DESC);

-- Verification:
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='lead_admin_actions' ORDER BY ordinal_position;