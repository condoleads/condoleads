-- W-LEADS-EMAIL T6b - backfill of lead_origin_route for rows still at 'unknown'.
--
-- The T2c migration (20260510_t2c_lead_origin_route.sql) added the column with
-- DEFAULT 'unknown' and ran a tenant-agnostic CASE UPDATE to map existing
-- rows. However at T2c migration time the leads table was effectively empty,
-- so the UPDATE matched 0 rows. All rows inserted since (17 as of 2026-05-11)
-- defaulted to 'unknown' because no caller wired the column.
--
-- T6b ships the application half: caller wiring forward + this backfill UPDATE.
-- This SQL is byte-for-byte the same CASE as T2c, re-applied. Idempotent: WHERE
-- clause filters to rows still at 'unknown', so re-runs are safe.
--
-- All in one transaction; partial-failure rolls back to pre-state.

BEGIN;

UPDATE leads SET lead_origin_route = CASE
  WHEN source LIKE '%\_charlie\_vip\_request' ESCAPE '\' THEN 'charlie_vip_request'
  WHEN source LIKE '%\_estimator\_vip\_request' ESCAPE '\' THEN 'estimator_vip_request'
  WHEN source LIKE '%\_estimator\_questionnaire' ESCAPE '\' THEN 'estimator_questionnaire'
  WHEN source LIKE '%\_estimator%' ESCAPE '\' THEN 'estimator'
  WHEN source LIKE '%\_charlie' ESCAPE '\' THEN 'charlie'
  WHEN source LIKE '%\_contact' ESCAPE '\' THEN 'contact_form'
  WHEN source IN ('contact_form', 'message_agent', 'building_page') THEN 'contact_form'
  WHEN source = 'estimator' THEN 'estimator'
  WHEN source = 'registration' THEN 'registration'
  WHEN source = 'property_inquiry' THEN 'property_inquiry'
  WHEN source = 'building_visit_request' THEN 'building_visit'
  WHEN source = 'sale_evaluation_request' THEN 'sale_evaluation'
  ELSE 'unknown'
END
WHERE lead_origin_route = 'unknown';

COMMIT;
