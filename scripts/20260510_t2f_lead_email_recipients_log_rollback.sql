-- W-LEADS-EMAIL T2f — manual rollback for lead_email_recipients_log audit table.
-- Idempotent. Drops table (which cascades to indexes + triggers) + 2 trigger functions.

BEGIN;

DROP TABLE IF EXISTS lead_email_recipients_log;
DROP FUNCTION IF EXISTS lead_email_recipients_log_status_only();
DROP FUNCTION IF EXISTS lead_email_recipients_log_no_mutate();

COMMIT;