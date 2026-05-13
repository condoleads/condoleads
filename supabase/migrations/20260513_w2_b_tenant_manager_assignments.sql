-- W2-B: tenant_manager_assignments junction (multi-tenant role membership)
-- Workstream: W-LEADS-WORKBENCH W2
-- Applied: 2026-05-13 via Supabase Studio direct DDL.
-- Pattern: mirrors platform_manager_tenants junction.
-- Soft-revoke via revoked_at preserves audit; UNIQUE(user_id, tenant_id) prevents duplicates.
-- Multi-tenant safety: tenant_id NOT NULL + FK CASCADE.
-- Idempotent: IF NOT EXISTS re-runnable.

CREATE TABLE IF NOT EXISTS public.tenant_manager_assignments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  granted_by_user_id uuid REFERENCES auth.users(id)            ON DELETE SET NULL,
  granted_at         timestamptz NOT NULL DEFAULT now(),
  revoked_at         timestamptz,
  notes              text,
  UNIQUE (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tma_tenant_active
  ON public.tenant_manager_assignments(tenant_id) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tma_user_active
  ON public.tenant_manager_assignments(user_id) WHERE revoked_at IS NULL;

-- Verification:
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='tenant_manager_assignments' ORDER BY ordinal_position;