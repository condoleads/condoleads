-- W-LEADS-EMAIL T2d — leads data-quality CHECK constraints
-- Bounds the values lib/actions/leads.ts writes (assignment_source) and the
-- charlie/appointment workflow uses (appointment_status).
--
-- NULL handling: Postgres CHECK passes when expression evaluates to NULL,
-- so the IN-list naturally accepts NULL without explicit IS NULL OR.
-- appointment_status defaults to 'pending'; assignment_source has no default
-- but is set by code on every INSERT.
--
-- 0 rows in leads at apply time → no NOT VALID + VALIDATE dance needed.

BEGIN;

ALTER TABLE leads ADD CONSTRAINT leads_appointment_status_check
  CHECK (appointment_status IN ('pending', 'confirmed', 'cancelled', 'completed', 'rescheduled'));

ALTER TABLE leads ADD CONSTRAINT leads_assignment_source_check
  CHECK (assignment_source IN ('geo', 'admin', 'manual', 'override'));

COMMIT;