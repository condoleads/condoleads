-- W-FUNNEL F-EMAIL-CALLER-RETURNS-SUCCESS-ON-FAIL Phase 2 (2026-06-03).
-- Adds lead_email_delivery_status column to leads so the agent dashboard
-- can surface "not yet alerted" leads when the chain (agent-notification)
-- email did not actually send.
--
-- Lock behavior: leads has 184 rows / 192 KB. ALTER TABLE ADD COLUMN with
-- a literal DEFAULT is metadata-only in PG 11+ (no table rewrite).
-- ACCESS EXCLUSIVE lock for milliseconds. ADD CONSTRAINT validates the
-- 184 rows against the CHECK predicate -- trivial at this row count.
--
-- Backfill: NONE. Per W-FUNNEL-VERIFICATION decisions: the 184 existing
-- rows are all test leads; they land on DEFAULT 'pending' and the
-- dashboard badge fires only on 'failed', so 'pending' yields no badge
-- (zero dashboard noise). New leads start 'pending'; the route's
-- post-chainOutcome UPDATE (Commit B) moves them to 'sent' or 'failed'.

ALTER TABLE public.leads
  ADD COLUMN lead_email_delivery_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.leads
  ADD CONSTRAINT leads_lead_email_delivery_status_check
  CHECK (lead_email_delivery_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text]));
