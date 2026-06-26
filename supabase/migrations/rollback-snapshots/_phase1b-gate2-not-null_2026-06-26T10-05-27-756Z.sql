-- Snapshot BEFORE UNIT 16b GATE 2.
-- Restore via: psql -f <this file>

-- Pre-apply is_nullable: YES
ALTER TABLE public.tenants ALTER COLUMN default_agent_id DROP NOT NULL;
