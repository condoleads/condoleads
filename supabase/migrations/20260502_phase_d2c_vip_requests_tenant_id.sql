-- supabase/migrations/20260502_phase_d2c_vip_requests_tenant_id.sql
-- W-CREDIT-VERIFY Phase D2c
-- Adds tenant_id to vip_requests so the GET handler can scope by tenant
-- (closes F39 — vip-request status leak: any caller could previously poll
-- any tenant's request status by guessing UUIDs).
--
-- Already applied to production on 2026-05-02 via Supabase SQL editor.
-- This file exists so the repo's migration history matches production state.

ALTER TABLE vip_requests
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE vip_requests vr
SET tenant_id = a.tenant_id
FROM agents a
WHERE vr.agent_id = a.id
  AND vr.tenant_id IS NULL;

-- Note: 4 System 1 test rows (agent OVAIS QASSIM, no tenant_id) remain NULL.
-- Per System 1 isolation rule, the agent row was not given a tenant_id.
-- These rows are inert under the new GET filter and were not migrated.
--
-- Foreign key constraint and NOT NULL deliberately deferred — the existing
-- NULL test rows would block both, and the GET filter (.eq('tenant_id', tenantId))
-- already enforces tenant scope at the application layer. Schema tightening
-- is a separate decision tracked outside D2c.