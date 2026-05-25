-- supabase/migrations/20260525_w_territory_ops_T1_3_agents_summary_rpc.sql
-- W-TERRITORY-OPS T1-3 -- per-agent territory rollup RPC.
--
-- Returns one row per agent in the tenant with their effective routing
-- inventory:
--   assigned_card_count   -- active apa rows held
--   building_pin_count    -- agent_geo_buildings rows
--   listing_pin_count     -- agent_listing_assignments rows
--   user_assignment_count -- tenant_users.assigned_agent_id pointing at them
--   is_tenant_default     -- agent is the tenant's default routing target
--
-- Multi-tenant safe by construction: every row source filters on tenant_id.
-- agent_geo_buildings has no tenant_id column; it's scoped via the agents
-- join (a.tenant_id = p_tenant_id).
-- agent_listing_assignments also has no tenant_id; scoped via agents join.
--
-- Used by:
--   GET /api/admin-homes/territory/agents-summary (T1-3 route)
--   AgentsView.tsx -- View 1 of the operations dashboard
--
-- No DROP; CREATE OR REPLACE keeps the function definition idempotent.

CREATE OR REPLACE FUNCTION public.territory_agents_summary(p_tenant_id uuid)
RETURNS TABLE (
  agent_id                uuid,
  full_name               text,
  role                    text,
  is_selling              boolean,
  is_active               boolean,
  is_tenant_default       boolean,
  assigned_card_count     integer,
  building_pin_count      integer,
  listing_pin_count       integer,
  user_assignment_count   integer
)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_default_agent uuid;
BEGIN
  -- Tenant default agent (single lookup; reused in is_tenant_default flag).
  SELECT default_agent_id INTO v_default_agent
    FROM tenants
   WHERE id = p_tenant_id;

  RETURN QUERY
  WITH agent_base AS (
    SELECT
      a.id                                            AS agent_id,
      a.full_name::text                               AS full_name,
      COALESCE(a.role, 'agent')::text                 AS role,
      a.is_selling                                    AS is_selling,
      COALESCE(a.is_active, false)                    AS is_active,
      (a.id = v_default_agent)                        AS is_tenant_default
    FROM agents a
    WHERE a.tenant_id = p_tenant_id
  ),
  card_counts AS (
    SELECT
      apa.agent_id,
      COUNT(*)::integer AS n
    FROM agent_property_access apa
    WHERE apa.tenant_id = p_tenant_id
      AND apa.is_active = true
    GROUP BY apa.agent_id
  ),
  building_counts AS (
    SELECT
      agb.agent_id,
      COUNT(*)::integer AS n
    FROM agent_geo_buildings agb
    JOIN agents a2 ON a2.id = agb.agent_id
    WHERE a2.tenant_id = p_tenant_id
    GROUP BY agb.agent_id
  ),
  listing_counts AS (
    SELECT
      ala.agent_id,
      COUNT(*)::integer AS n
    FROM agent_listing_assignments ala
    JOIN agents a3 ON a3.id = ala.agent_id
    WHERE a3.tenant_id = p_tenant_id
    GROUP BY ala.agent_id
  ),
  user_assign_counts AS (
    SELECT
      tu.assigned_agent_id AS agent_id,
      COUNT(*)::integer    AS n
    FROM tenant_users tu
    WHERE tu.tenant_id = p_tenant_id
      AND tu.assigned_agent_id IS NOT NULL
    GROUP BY tu.assigned_agent_id
  )
  SELECT
    ab.agent_id,
    ab.full_name,
    ab.role,
    ab.is_selling,
    ab.is_active,
    ab.is_tenant_default,
    COALESCE(cc.n, 0)  AS assigned_card_count,
    COALESCE(bc.n, 0)  AS building_pin_count,
    COALESCE(lc.n, 0)  AS listing_pin_count,
    COALESCE(uc.n, 0)  AS user_assignment_count
  FROM agent_base ab
  LEFT JOIN card_counts    cc ON cc.agent_id = ab.agent_id
  LEFT JOIN building_counts bc ON bc.agent_id = ab.agent_id
  LEFT JOIN listing_counts lc ON lc.agent_id = ab.agent_id
  LEFT JOIN user_assign_counts uc ON uc.agent_id = ab.agent_id
  ORDER BY
    -- selling+active first, then by name -- operator-friendly default sort
    (ab.is_selling AND ab.is_active) DESC,
    ab.full_name ASC;
END;
$function$;

COMMENT ON FUNCTION public.territory_agents_summary(uuid) IS
'W-TERRITORY-OPS T1-3: per-agent territory rollup. Returns one row per agent in the tenant with active card counts, building pins, listing pins, user-level assignments, and is_tenant_default flag. Multi-tenant safe by construction (every source filtered on tenant_id).';