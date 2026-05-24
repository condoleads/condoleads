-- supabase/migrations/20260524_w_cockpit_p_b_2_c2a_reroll_queue.sql
-- W-COCKPIT P-B-2 Commit 2a: async reroll queue.
--
-- Decouples apa mutation from listing reroll. The triggers no longer do
-- the 19-second reroll inline -- they enqueue, and a worker drains.
--
-- Rule Zero: pre-flight verified no existing queue table or GUC pattern.

CREATE TABLE IF NOT EXISTS public.territory_reroll_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  scope         text NOT NULL CHECK (scope IN ('area','municipality','community')),
  scope_id      uuid NOT NULL,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  processed_at  timestamptz,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','done','error')),
  rows_updated  integer,
  error_message text,
  requested_by  uuid
);

-- One pending row per (tenant, scope, scope_id) — coalesce repeated requests.
-- If a previous request for the same slot is still pending, the new INSERT
-- is suppressed at the application layer (ON CONFLICT DO NOTHING).
CREATE UNIQUE INDEX IF NOT EXISTS uq_reroll_queue_pending_slot
  ON public.territory_reroll_queue (tenant_id, scope, scope_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_reroll_queue_pending_requested_at
  ON public.territory_reroll_queue (requested_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_reroll_queue_tenant_status
  ON public.territory_reroll_queue (tenant_id, status, requested_at DESC);

COMMENT ON TABLE public.territory_reroll_queue IS
  'W-COCKPIT P-B-2 Commit 2a: async reroll job queue. Triggers enqueue when app.skip_apa_reroll is on; a worker drains.';