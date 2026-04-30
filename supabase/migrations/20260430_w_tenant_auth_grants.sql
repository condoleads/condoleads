-- W-TENANT-AUTH GRANT fix (Apr 30, 2026)
--
-- Phase 2 created tenant_users and added tenant_id to user_activities via raw SQL,
-- which bypassed Supabase's automatic table-creation grant logic. As a result, the
-- service_role, anon, and authenticated roles had no privileges on tenant_users,
-- and user_activities was missing anon/authenticated grants.
--
-- This migration applies the same grant pattern that other public tables (leads,
-- user_profiles, etc) carry by default. Idempotent — safe to re-run.

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON TABLE public.tenant_users
  TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON TABLE public.user_activities
  TO anon, authenticated, service_role;

COMMIT;