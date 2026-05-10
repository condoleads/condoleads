-- W-LEADS-EMAIL T2d — manual rollback for CHECK constraints.
-- Idempotent.

BEGIN;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_assignment_source_check;
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_appointment_status_check;

COMMIT;