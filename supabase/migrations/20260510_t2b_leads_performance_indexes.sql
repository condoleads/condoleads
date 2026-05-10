-- W-LEADS-EMAIL T2b — leads performance indexes
-- Anchors performance for the dup-detection key + analytics-side filters.
--
-- F-LEADS-NO-INDEX-ON-DUP-DETECTION-KEY: getOrCreateLead in lib/actions/leads.ts
--   looks up WHERE contact_email = ? AND tenant_id = ? on every form submit.
--   Composite index leading on tenant_id matches the existing idx_leads_tenant_agent
--   convention. Both columns equality-matched → planner uses full composite.
--
-- F-LEADS-NO-INDEX-ON-LISTING-ID: idx_leads_building_id exists; listing_id sibling
--   index added with the same WHERE col IS NOT NULL partial pattern.
--
-- F-LEADS-NO-INDEX-ON-SOURCE: source-axis analytics queries currently scan.
--
-- Plain CREATE INDEX (not CONCURRENTLY) — leads is essentially empty,
-- AccessExclusiveLock window is sub-second. CONCURRENTLY can't run inside a
-- transaction anyway.

BEGIN;

CREATE INDEX idx_leads_tenant_email ON leads (tenant_id, contact_email);
CREATE INDEX idx_leads_listing_id ON leads (listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX idx_leads_source ON leads (source);

COMMIT;