-- W-LEADS-EMAIL T2f — lead_email_recipients_log new audit table
-- Anchors System 2 chain-notification audit (F-LEAD-EMAIL-LOG-IS-SYSTEM-1-ONLY +
-- F-LEAD-EMAIL-LOG-NO-RECIPIENT-COLUMN). Unblocks T3b/T3c.
--
-- Append-only semantics:
--   - DELETE blocked entirely (trg_lerl_no_delete).
--   - UPDATE allows only: status, sent_at, delivered_at, bounced_at, and
--     resend_message_id (NULL → value, once). All other columns immutable.
--     This carve-out enables Resend webhook to transition status
--     queued → sent → delivered/bounced/complained/failed without otherwise
--     compromising audit integrity.
--
-- Recipient layer enum (8 values): 6 chain layers + 2 tenant overlays.
--   - agent / manager / area_manager / tenant_admin: chain (W-HIERARCHY)
--   - platform_manager / platform_admin: platform tier (W-ROLES-DELEGATION)
--   - tenant_overlay_cc / tenant_overlay_bcc: per-tenant manager_cc/admin_bcc
--     columns (added in tenants table; consulted by recipient helper at T3a).
--
-- ON DELETE CASCADE on tenant_id + lead_id mirrors lead_ownership_changes
-- pattern: declarative consistency with parent lifecycle, but the no-mutate
-- trigger backstops actual deletion. Effectively, tenants can't be hard-
-- deleted while audit rows exist; soft-delete via lifecycle_status='terminated'
-- is the supported path.

BEGIN;

-- ─── Trigger functions (must exist before triggers reference them) ───────
CREATE OR REPLACE FUNCTION lead_email_recipients_log_no_mutate()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'lead_email_recipients_log is append-only; DELETE not permitted (id=%)', OLD.id
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION lead_email_recipients_log_status_only()
RETURNS TRIGGER AS $$
BEGIN
  -- Identifying / content fields immutable.
  IF NEW.id              IS DISTINCT FROM OLD.id              OR
     NEW.tenant_id       IS DISTINCT FROM OLD.tenant_id       OR
     NEW.lead_id         IS DISTINCT FROM OLD.lead_id         OR
     NEW.agent_id        IS DISTINCT FROM OLD.agent_id        OR
     NEW.recipient_email IS DISTINCT FROM OLD.recipient_email OR
     NEW.recipient_layer IS DISTINCT FROM OLD.recipient_layer OR
     NEW.direction       IS DISTINCT FROM OLD.direction       OR
     NEW.subject         IS DISTINCT FROM OLD.subject         OR
     NEW.template_key    IS DISTINCT FROM OLD.template_key    OR
     NEW.created_at      IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'lead_email_recipients_log: only status / sent_at / delivered_at / bounced_at / resend_message_id (NULL->value) are mutable'
      USING ERRCODE = 'check_violation';
  END IF;

  -- resend_message_id: allow NULL → value transition once; reject any change once set.
  IF OLD.resend_message_id IS NOT NULL
     AND NEW.resend_message_id IS DISTINCT FROM OLD.resend_message_id THEN
    RAISE EXCEPTION 'lead_email_recipients_log: resend_message_id immutable once set'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Table ───────────────────────────────────────────────────────────────
CREATE TABLE lead_email_recipients_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  agent_id uuid NULL REFERENCES agents(id),
  recipient_email text NOT NULL,
  recipient_layer text NOT NULL,
  direction text NOT NULL,
  subject text NOT NULL,
  template_key text NOT NULL,
  resend_message_id text NULL,
  status text NOT NULL DEFAULT 'queued',
  sent_at timestamptz NULL,
  delivered_at timestamptz NULL,
  bounced_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lerl_recipient_layer_check CHECK (recipient_layer IN
    ('agent', 'manager', 'area_manager', 'tenant_admin',
     'platform_manager', 'platform_admin',
     'tenant_overlay_cc', 'tenant_overlay_bcc')),

  CONSTRAINT lerl_direction_check CHECK (direction IN ('to', 'cc', 'bcc')),

  CONSTRAINT lerl_status_check CHECK (status IN
    ('queued', 'sent', 'delivered', 'bounced', 'failed', 'complained'))
);

-- ─── Indexes ─────────────────────────────────────────────────────────────
CREATE INDEX idx_lerl_tenant_sent ON lead_email_recipients_log (tenant_id, sent_at DESC);
CREATE INDEX idx_lerl_lead ON lead_email_recipients_log (lead_id);
CREATE INDEX idx_lerl_recipient ON lead_email_recipients_log (recipient_email);
CREATE INDEX idx_lerl_resend_msg ON lead_email_recipients_log (resend_message_id)
  WHERE resend_message_id IS NOT NULL;

-- ─── Triggers ────────────────────────────────────────────────────────────
CREATE TRIGGER trg_lerl_no_delete
  BEFORE DELETE ON lead_email_recipients_log
  FOR EACH ROW EXECUTE FUNCTION lead_email_recipients_log_no_mutate();

CREATE TRIGGER trg_lerl_status_only_update
  BEFORE UPDATE ON lead_email_recipients_log
  FOR EACH ROW EXECUTE FUNCTION lead_email_recipients_log_status_only();

COMMIT;