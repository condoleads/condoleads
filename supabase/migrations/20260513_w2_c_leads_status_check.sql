-- W2-C: leads.status CHECK +3 values
-- Workstream: W-LEADS-WORKBENCH W2
-- Applied: 2026-05-13 via Supabase Studio direct DDL.
-- Before: 5 values (new, contacted, qualified, closed, lost)
-- After:  8 values (5 existing + meeting_scheduled, won, archived)
-- Workbench semantics:
--   meeting_scheduled - appointment_status=confirmed bridge state (W4f tab)
--   won               - closed + sale completed (vs closed umbrella)
--   archived          - admin soft-delete bucket (default filter hides per W6c)
-- Idempotent: DROP IF EXISTS + ADD pattern. Atomic in single transaction.

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status = ANY (ARRAY[
    'new'::text,
    'contacted'::text,
    'qualified'::text,
    'meeting_scheduled'::text,
    'closed'::text,
    'won'::text,
    'lost'::text,
    'archived'::text
  ]));

-- Verification:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid='public.leads'::regclass AND conname='leads_status_check';