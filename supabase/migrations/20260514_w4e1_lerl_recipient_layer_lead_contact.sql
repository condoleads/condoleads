-- supabase/migrations/20260514_w4e1_lerl_recipient_layer_lead_contact.sql
-- W-LEADS-WORKBENCH W4e.1 (2026-05-14)
--
-- Add 'lead_contact' label to lerl_recipient_layer_check.
--
-- BACKGROUND
--   The W4e Send composer (POST /api/admin-homes/leads/[id]/send-email) sends
--   customer-facing emails TO the lead's contact_email, with the agent
--   hierarchy in BCC. The contact_email recipient does not map to any of the
--   8 existing recipient_layer labels (all internal hierarchy slots). Adding
--   'lead_contact' gives logEmailRecipients() a precise label for the external
--   recipient and preserves audit granularity (no overlay-bucket collapse).
--
-- IMPACT
--   - lead_email_recipients_log.recipient_layer now permits 'lead_contact'.
--   - Existing 8 labels unchanged. No data backfill needed.
--   - No FK / index / RLS changes.
--   - Append-only triggers (trg_lerl_no_delete, trg_lerl_status_only_update)
--     unaffected; they do not reference the constraint.
--
-- ROLLBACK (snapshot of pre-migration constraint definition, captured from
-- pg_constraint via pg_get_constraintdef on 2026-05-14)
--   BEGIN;
--   ALTER TABLE public.lead_email_recipients_log
--     DROP CONSTRAINT lerl_recipient_layer_check;
--   ALTER TABLE public.lead_email_recipients_log
--     ADD CONSTRAINT lerl_recipient_layer_check
--     CHECK (recipient_layer = ANY (ARRAY[
--       'agent'::text,
--       'manager'::text,
--       'area_manager'::text,
--       'tenant_admin'::text,
--       'platform_manager'::text,
--       'platform_admin'::text,
--       'tenant_overlay_cc'::text,
--       'tenant_overlay_bcc'::text
--     ]));
--   COMMIT;
--   NOTE: rollback will fail if any rows with recipient_layer='lead_contact'
--   exist by then. DELETE or relabel those first.

BEGIN;

ALTER TABLE public.lead_email_recipients_log
  DROP CONSTRAINT lerl_recipient_layer_check;

ALTER TABLE public.lead_email_recipients_log
  ADD CONSTRAINT lerl_recipient_layer_check
  CHECK (recipient_layer = ANY (ARRAY[
    'agent'::text,
    'manager'::text,
    'area_manager'::text,
    'tenant_admin'::text,
    'platform_manager'::text,
    'platform_admin'::text,
    'tenant_overlay_cc'::text,
    'tenant_overlay_bcc'::text,
    'lead_contact'::text
  ]));

COMMIT;