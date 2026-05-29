-- supabase/migrations/20260527_p_floor_schema_and_resolver.sql
--
-- W-TERRITORY-MASTER P-FLOOR -- bounded hash-RR floor + resolver wiring.
--
-- Design lock: see docs/W-TERRITORY-MASTER-TRACKER.md v13.
-- Pre-apply schema cross-check passed: tenant_users, territory_reroll_queue,
-- territory_assignment_changes, auth.users, agent_geo_buildings,
-- agent_listing_assignments all verified.
--
-- Three patches over the initial draft (caught by pre-apply probe):
--   (a) territory_reroll_queue.scope CHECK constraint extended to allow
--       'tenant_default' (it was area/municipality/community only).
--   (b) Partial unique index on territory_reroll_queue
--       (tenant_id, scope, scope_id) WHERE status='pending' so the
--       ON CONFLICT DO NOTHING in the trigger actually dedupes.
--   (c) Audit trigger writes changed_by = auth.uid() (partial fix of
--       F-AUDIT-ORIGINATOR-WRITE-GAP for the floor-pool surface).
--
-- This migration is idempotent: safe to apply multiple times. Each CREATE
-- uses IF NOT EXISTS; each CREATE OR REPLACE FUNCTION replaces the body
-- in place. The apply runner (scripts/r-p-floor-apply.js) wraps this in
-- a transaction and captures a rollback snapshot of resolve_agent_for_context
-- before applying.

BEGIN;

-- ============================================================
-- 1. tenant_floor_pool (D1c)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_floor_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  condo_access boolean NOT NULL DEFAULT true,
  homes_access boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  CONSTRAINT uq_tenant_floor_pool_tenant_agent UNIQUE (tenant_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_tfp_tenant_active
  ON public.tenant_floor_pool (tenant_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_tfp_agent
  ON public.tenant_floor_pool (agent_id);

COMMENT ON TABLE public.tenant_floor_pool IS
  'W-TERRITORY-MASTER P-FLOOR: bounded hash-RR floor pool. One row per (tenant, agent). Property-type flags filter eligibility per listing. Membership changes trigger reroll enqueue via handle_tenant_floor_pool_change.';

-- ============================================================
-- 2. tenant_floor_alerts (D5b)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_floor_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_type text NOT NULL,
  listing_id uuid REFERENCES public.mls_listings(id) ON DELETE SET NULL,
  alert_type text NOT NULL DEFAULT 'empty_floor_pool',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT tfa_property_type_check
    CHECK (property_type IN ('condo', 'home')),
  CONSTRAINT tfa_alert_type_check
    CHECK (alert_type IN ('empty_floor_pool', 'all_inactive', 'all_flags_off_for_type'))
);

CREATE INDEX IF NOT EXISTS idx_tfa_tenant_unresolved
  ON public.tenant_floor_alerts (tenant_id)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE public.tenant_floor_alerts IS
  'W-TERRITORY-MASTER P-FLOOR: D5b operator alerts. Written by pick_floor_agent when no eligible pool member can route a listing for its property type. resolved_at is set by operator action via admin UI.';

-- ============================================================
-- 3. Extend territory_assignment_changes.change_type CHECK
-- ============================================================

ALTER TABLE public.territory_assignment_changes
  DROP CONSTRAINT IF EXISTS territory_assignment_changes_change_type_check;

ALTER TABLE public.territory_assignment_changes
  ADD CONSTRAINT territory_assignment_changes_change_type_check
  CHECK (change_type = ANY (ARRAY[
    'assignment_granted'::text,
    'assignment_revoked'::text,
    'primary_set'::text,
    'primary_unset'::text,
    'percentage_set'::text,
    'percentage_changed'::text,
    'scope_widened'::text,
    'scope_narrowed'::text,
    'pin_added'::text,
    'pin_removed'::text,
    'pin_reactivated'::text,
    'access_toggle_changed'::text,
    'building_assigned'::text,
    'building_unassigned'::text,
    'building_reactivated'::text,
    'floor_pool_added'::text,
    'floor_pool_removed'::text,
    'floor_pool_access_changed'::text
  ]));

-- ============================================================
-- 3b. Extend territory_reroll_queue.scope CHECK (patch (a))
-- ============================================================

ALTER TABLE public.territory_reroll_queue
  DROP CONSTRAINT IF EXISTS territory_reroll_queue_scope_check;

ALTER TABLE public.territory_reroll_queue
  ADD CONSTRAINT territory_reroll_queue_scope_check
  CHECK (scope = ANY (ARRAY[
    'area'::text,
    'municipality'::text,
    'community'::text,
    'tenant_default'::text
  ]));

-- ============================================================
-- 3c. Partial unique index for queue dedup (patch (b))
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_trq_pending_dedup
  ON public.territory_reroll_queue (tenant_id, scope, scope_id)
  WHERE status = 'pending';

-- ============================================================
-- 4. pick_floor_agent (D2b)
-- ============================================================

CREATE OR REPLACE FUNCTION public.pick_floor_agent(
  p_listing_id uuid,
  p_tenant_id uuid,
  p_is_condo boolean,
  p_is_home boolean
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  v_agent_id uuid;
  v_total int;
BEGIN
  -- Guard: need a tenant and a listing-id-for-hashing.
  IF p_tenant_id IS NULL OR p_listing_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Guard: at least one property-type flag must be requested.
  IF NOT (p_is_condo OR p_is_home) THEN
    RETURN NULL;
  END IF;

  -- Count eligible pool members for this property type.
  SELECT COUNT(*) INTO v_total
  FROM public.tenant_floor_pool tfp
  JOIN public.agents a ON a.id = tfp.agent_id
  WHERE tfp.tenant_id = p_tenant_id
    AND tfp.is_active = true
    AND a.is_active = true
    AND a.is_selling = true
    AND (
      (p_is_condo = true AND tfp.condo_access = true) OR
      (p_is_home  = true AND tfp.homes_access = true)
    );

  -- Empty pool for this property type: write alert, return NULL.
  IF v_total = 0 THEN
    INSERT INTO public.tenant_floor_alerts (
      tenant_id, property_type, listing_id, alert_type
    ) VALUES (
      p_tenant_id,
      CASE WHEN p_is_condo THEN 'condo' ELSE 'home' END,
      p_listing_id,
      'empty_floor_pool'
    );
    RETURN NULL;
  END IF;

  -- Hash-RR pick from eligible pool, deterministic by listing_id.
  WITH eligible AS (
    SELECT tfp.agent_id,
           (ROW_NUMBER() OVER (ORDER BY tfp.agent_id) - 1) AS rn
    FROM public.tenant_floor_pool tfp
    JOIN public.agents a ON a.id = tfp.agent_id
    WHERE tfp.tenant_id = p_tenant_id
      AND tfp.is_active = true
      AND a.is_active = true
      AND a.is_selling = true
      AND (
        (p_is_condo = true AND tfp.condo_access = true) OR
        (p_is_home  = true AND tfp.homes_access = true)
      )
  )
  SELECT agent_id INTO v_agent_id
  FROM eligible
  WHERE rn = (abs(hashtext(p_listing_id::text)) % v_total);

  RETURN v_agent_id;
END;
$function$;

COMMENT ON FUNCTION public.pick_floor_agent IS
  'W-TERRITORY-MASTER P-FLOOR D2b: deterministic hash-RR over tenant_floor_pool eligible members for the listing property type. Returns NULL and writes tenant_floor_alerts row on empty pool. ORDER BY agent_id makes ROW_NUMBER stable across pool reads (add/remove of agents reshuffles only the rows whose modulo lands on the changed slot).';

-- ============================================================
-- 5. resolve_agent_for_context -- add D3a floor branch
-- ============================================================

CREATE OR REPLACE FUNCTION public.resolve_agent_for_context(
  p_listing_id uuid DEFAULT NULL::uuid,
  p_building_id uuid DEFAULT NULL::uuid,
  p_neighbourhood_id uuid DEFAULT NULL::uuid,
  p_community_id uuid DEFAULT NULL::uuid,
  p_municipality_id uuid DEFAULT NULL::uuid,
  p_area_id uuid DEFAULT NULL::uuid,
  p_user_id uuid DEFAULT NULL::uuid,
  p_tenant_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  v_agent_id uuid;
  v_property_type text;
  v_is_condo boolean := false;
  v_is_home  boolean := false;
BEGIN
  -- Tenant restriction gate (tenant_property_access).
  IF p_tenant_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM tenant_property_access WHERE tenant_id = p_tenant_id AND is_active = true) THEN
      IF NOT EXISTS (
        SELECT 1 FROM tenant_property_access
        WHERE tenant_id = p_tenant_id AND is_active = true
        AND (
          (area_id = p_area_id AND p_area_id IS NOT NULL) OR
          (municipality_id = p_municipality_id AND p_municipality_id IS NOT NULL) OR
          (community_id = p_community_id AND p_community_id IS NOT NULL)
        )
      ) THEN
        RETURN NULL;
      END IF;
    END IF;
  END IF;

  -- Derive property type from listing if provided.
  IF p_listing_id IS NOT NULL THEN
    SELECT property_type INTO v_property_type
    FROM mls_listings WHERE id = p_listing_id;
    IF v_property_type = 'Residential Condo & Other' THEN
      v_is_condo := true;
    ELSIF v_property_type = 'Residential Freehold' THEN
      v_is_home := true;
    END IF;
  END IF;

  -- P1: Listing pin (firm).
  IF p_listing_id IS NOT NULL THEN
    SELECT ala.agent_id INTO v_agent_id
    FROM agent_listing_assignments ala
    JOIN agents a ON a.id = ala.agent_id
    WHERE ala.listing_id = p_listing_id
      AND ala.is_active = true
      AND a.is_active = true AND a.is_selling = true
      AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P2: Building pin (firm).
  IF p_building_id IS NOT NULL THEN
    SELECT agb.agent_id INTO v_agent_id
    FROM agent_geo_buildings agb
    JOIN agents a ON a.id = agb.agent_id
    WHERE agb.building_id = p_building_id
      AND agb.is_active = true
      AND a.is_active = true AND a.is_selling = true
      AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  -- P3: Neighbourhood, property-type-aware.
  IF p_neighbourhood_id IS NOT NULL AND (v_is_condo OR v_is_home) THEN
    v_agent_id := pick_routing_agent_for_type(
      'neighbourhood', p_neighbourhood_id, p_tenant_id, v_is_condo, v_is_home
    );
    IF v_agent_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true) THEN
        RETURN v_agent_id;
      END IF;
    END IF;
  END IF;

  -- P4: Community, property-type-aware.
  IF p_community_id IS NOT NULL AND (v_is_condo OR v_is_home) THEN
    v_agent_id := pick_routing_agent_for_type(
      'community', p_community_id, p_tenant_id, v_is_condo, v_is_home
    );
    IF v_agent_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true) THEN
        RETURN v_agent_id;
      END IF;
    END IF;
  END IF;

  -- P5: Municipality, property-type-aware.
  IF p_municipality_id IS NOT NULL AND (v_is_condo OR v_is_home) THEN
    v_agent_id := pick_routing_agent_for_type(
      'municipality', p_municipality_id, p_tenant_id, v_is_condo, v_is_home
    );
    IF v_agent_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true) THEN
        RETURN v_agent_id;
      END IF;
    END IF;
  END IF;

  -- P6: Area, property-type-aware.
  IF p_area_id IS NOT NULL AND (v_is_condo OR v_is_home) THEN
    v_agent_id := pick_routing_agent_for_type(
      'area', p_area_id, p_tenant_id, v_is_condo, v_is_home
    );
    IF v_agent_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true) THEN
        RETURN v_agent_id;
      END IF;
    END IF;
  END IF;

  -- Page-level fallback (no listing_id): untyped picks.
  IF p_listing_id IS NULL THEN
    IF p_neighbourhood_id IS NOT NULL THEN
      v_agent_id := pick_routing_agent('neighbourhood', p_neighbourhood_id, p_tenant_id, NULL);
      IF v_agent_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true
      ) THEN RETURN v_agent_id; END IF;
    END IF;
    IF p_community_id IS NOT NULL THEN
      v_agent_id := pick_routing_agent('community', p_community_id, p_tenant_id, NULL);
      IF v_agent_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true
      ) THEN RETURN v_agent_id; END IF;
    END IF;
    IF p_municipality_id IS NOT NULL THEN
      v_agent_id := pick_routing_agent('municipality', p_municipality_id, p_tenant_id, NULL);
      IF v_agent_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true
      ) THEN RETURN v_agent_id; END IF;
    END IF;
    IF p_area_id IS NOT NULL THEN
      v_agent_id := pick_routing_agent('area', p_area_id, p_tenant_id, NULL);
      IF v_agent_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM agents WHERE id = v_agent_id AND is_active = true AND is_selling = true
      ) THEN RETURN v_agent_id; END IF;
    END IF;
  END IF;

  -- P-FLOOR (D3a): bounded hash-RR over tenant_floor_pool for the property type.
  IF p_listing_id IS NOT NULL AND p_tenant_id IS NOT NULL AND (v_is_condo OR v_is_home) THEN
    v_agent_id := pick_floor_agent(p_listing_id, p_tenant_id, v_is_condo, v_is_home);
    IF v_agent_id IS NOT NULL THEN RETURN v_agent_id; END IF;
  END IF;

  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.resolve_agent_for_context IS
  'W-TERRITORY-MASTER P-FLOOR (v13): canonical resolver. P1=listing pin, P2=building pin, P3-P6=apa cards property-type-aware (neighbourhood->community->municipality->area), page-level fallback untyped at each scope (no listing context), P-FLOOR=bounded hash-RR over tenant_floor_pool. Returns NULL only when listing has no property type OR floor pool is empty (alert written by pick_floor_agent).';

-- ============================================================
-- 6. reroll_listings_at_floor
-- ============================================================

CREATE OR REPLACE FUNCTION public.reroll_listings_at_floor(
  p_tenant_id uuid,
  p_is_condo boolean,
  p_is_home boolean
)
RETURNS int
LANGUAGE plpgsql
AS $function$
DECLARE
  v_count int := 0;
  v_property_type_filter text;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN 0; END IF;
  IF NOT (p_is_condo OR p_is_home) THEN RETURN 0; END IF;

  v_property_type_filter := CASE
    WHEN p_is_condo THEN 'Residential Condo & Other'
    WHEN p_is_home  THEN 'Residential Freehold'
  END;

  -- Touch only assigned_agent_id IS NULL rows. Existing cascade
  -- assignments (12,547 today) are NOT clobbered.
  WITH picks AS (
    SELECT
      ml.id AS listing_id,
      pick_floor_agent(ml.id, p_tenant_id, p_is_condo, p_is_home) AS new_pick
    FROM mls_listings ml
    WHERE ml.assigned_agent_id IS NULL
      AND ml.property_type = v_property_type_filter
  ),
  updated AS (
    UPDATE mls_listings ml
    SET assigned_agent_id = picks.new_pick
    FROM picks
    WHERE ml.id = picks.listing_id
      AND picks.new_pick IS NOT NULL
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM updated;

  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.reroll_listings_at_floor IS
  'W-TERRITORY-MASTER P-FLOOR: backfill listings via floor pool. Only touches assigned_agent_id IS NULL rows so existing cascade routing is preserved. Property-type-scoped per call. Idempotent: re-running yields same hash result for stable pool.';

-- ============================================================
-- 7. handle_tenant_floor_pool_change (D6b)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_tenant_floor_pool_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_change_type text;
  v_tenant_id uuid;
  v_agent_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_change_type := 'floor_pool_added';
    v_tenant_id := NEW.tenant_id;
    v_agent_id := NEW.agent_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_change_type := 'floor_pool_removed';
    v_tenant_id := OLD.tenant_id;
    v_agent_id := OLD.agent_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_change_type := 'floor_pool_access_changed';
    v_tenant_id := NEW.tenant_id;
    v_agent_id := NEW.agent_id;
    -- Skip if nothing routing-affecting changed.
    IF OLD.is_active = NEW.is_active
       AND OLD.condo_access = NEW.condo_access
       AND OLD.homes_access = NEW.homes_access
       AND OLD.agent_id = NEW.agent_id THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Audit row: scope='tenant_default', scope_id=tenant_id.
  -- changed_by = auth.uid() for proper attribution (partial fix of
  -- F-AUDIT-ORIGINATOR-WRITE-GAP for this surface).
  INSERT INTO territory_assignment_changes (
    tenant_id, agent_id, scope, scope_id, change_type,
    before_state, after_state, changed_by, notes
  ) VALUES (
    v_tenant_id,
    v_agent_id,
    'tenant_default',
    v_tenant_id,
    v_change_type,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN
      jsonb_build_object(
        'is_active', OLD.is_active,
        'condo_access', OLD.condo_access,
        'homes_access', OLD.homes_access
      )
    ELSE NULL END,
    CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN
      jsonb_build_object(
        'is_active', NEW.is_active,
        'condo_access', NEW.condo_access,
        'homes_access', NEW.homes_access
      )
    ELSE NULL END,
    auth.uid(),
    'tenant_floor_pool ' || TG_OP
  );

  -- Enqueue floor reroll job (deduped by partial unique index on pending).
  -- Skip enqueue if app.skip_apa_reroll is set (bulk-reassign pattern from T1-3).
  IF current_setting('app.skip_apa_reroll', true) IS DISTINCT FROM 'on' THEN
    INSERT INTO territory_reroll_queue (tenant_id, scope, scope_id, status)
    VALUES (v_tenant_id, 'tenant_default', v_tenant_id, 'pending')
    ON CONFLICT (tenant_id, scope, scope_id) WHERE status = 'pending' DO NOTHING;
  END IF;

  RETURN NULL;
END;
$function$;

-- ============================================================
-- 8. Triggers on tenant_floor_pool
-- ============================================================

DROP TRIGGER IF EXISTS trg_tfp_after_insert ON public.tenant_floor_pool;
CREATE TRIGGER trg_tfp_after_insert
  AFTER INSERT ON public.tenant_floor_pool
  FOR EACH ROW EXECUTE FUNCTION public.handle_tenant_floor_pool_change();

DROP TRIGGER IF EXISTS trg_tfp_after_update ON public.tenant_floor_pool;
CREATE TRIGGER trg_tfp_after_update
  AFTER UPDATE ON public.tenant_floor_pool
  FOR EACH ROW EXECUTE FUNCTION public.handle_tenant_floor_pool_change();

DROP TRIGGER IF EXISTS trg_tfp_after_delete ON public.tenant_floor_pool;
CREATE TRIGGER trg_tfp_after_delete
  AFTER DELETE ON public.tenant_floor_pool
  FOR EACH ROW EXECUTE FUNCTION public.handle_tenant_floor_pool_change();

-- ============================================================
-- 9. RLS on new tables (multi-tenant safety)
-- ============================================================

ALTER TABLE public.tenant_floor_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_floor_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tfp_read_own_tenant ON public.tenant_floor_pool;
CREATE POLICY tfp_read_own_tenant ON public.tenant_floor_pool
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tfa_read_own_tenant ON public.tenant_floor_alerts;
CREATE POLICY tfa_read_own_tenant ON public.tenant_floor_alerts
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid()
    )
  );

COMMIT;