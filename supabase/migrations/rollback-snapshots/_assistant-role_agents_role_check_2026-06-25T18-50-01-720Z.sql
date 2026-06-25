-- Snapshot of agents_role_check BEFORE W-TENANT-ASSISTANT UNIT 11.
-- Restore via: psql -f <this file>

ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_role_check;
ALTER TABLE public.agents ADD CONSTRAINT agents_role_check CHECK ((role = ANY (ARRAY['agent'::text, 'manager'::text, 'area_manager'::text, 'tenant_admin'::text, 'admin'::text])));
