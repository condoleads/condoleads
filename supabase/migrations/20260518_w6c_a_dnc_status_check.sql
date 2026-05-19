-- W6c-DNC (2026-05-18)
-- Extends leads_status_check with do_not_contact for legal CASL/TCPA compliance.
-- Pre-existing 8 values: new, contacted, qualified, meeting_scheduled, closed, won, lost, archived.
-- Adding: do_not_contact (terminal-class -- default-hidden in list view, blocks outbound email server-side).
-- Snapshot of pre-state is captured by scripts/deploy-w6c-dnc-migration.js before applying.
-- Transaction management lives in the runner, NOT this file.

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
    'archived'::text,
    'do_not_contact'::text
  ]));

-- Verify (run manually if needed):
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid='public.leads'::regclass AND conname='leads_status_check';