-- W-LEADS-EMAIL T2c — leads.lead_origin_route column for questionnaire LIKE filter fix
-- Adds tenant-agnostic origin route column. Schema half of F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER.
-- Application half ships at T6b: replaces LIKE 'walliam_estimator%' with WHERE lead_origin_route = 'estimator_questionnaire'.
--
-- Column is NOT NULL DEFAULT 'unknown'. Postgres backfills existing rows to 'unknown',
-- then the UPDATE step refines via tenant-agnostic CASE on existing source text.
-- All in one transaction; partial-failure rolls back to pre-state.
--
-- No CHECK constraint at this stage — T2d covers data-quality CHECKs separately.
-- The app writes lead_origin_route as a controlled vocabulary in T5/T6.

BEGIN;

ALTER TABLE leads ADD COLUMN lead_origin_route text NOT NULL DEFAULT 'unknown';

-- Tenant-agnostic source → lead_origin_route mapping.
-- Order matters: more-specific patterns matched before less-specific.
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

CREATE INDEX idx_leads_tenant_origin_route ON leads (tenant_id, lead_origin_route);

COMMIT;