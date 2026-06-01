// F-REROLL-LISTINGS-AT-GEO-COUPLED-CHECK -- live-DB recon (read-only).
// P1 FIX 2 of 3 -- audits the function body, security posture, callers, and
// at-risk-row count BEFORE any patch is drafted.
//
// Output goes to stdout + tee'd by the runner to a file the user can review.
require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')

;(async () => {
  const url = process.env.DATABASE_URL
  if (!url) { console.error('no DATABASE_URL'); process.exit(1) }
  const c = new Client({ connectionString: url })
  c.on('error', (e) => console.error('CLIENT ERROR:', e.message))
  await c.connect()
  await c.query('BEGIN READ ONLY')

  console.log('=== 1. reroll_listings_at_geo: current DB body (pg_get_functiondef) ===')
  {
    const r = await c.query(`
      SELECT pg_get_functiondef(p.oid) AS def,
             p.prosecdef,
             p.proconfig,
             pg_get_userbyid(p.proowner) AS owner,
             p.pronargs,
             pg_get_function_arguments(p.oid) AS args,
             pg_get_function_result(p.oid) AS result_type
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'reroll_listings_at_geo'`)
    if (r.rowCount === 0) {
      console.log('  (NOT FOUND)')
    } else {
      const row = r.rows[0]
      console.log('  owner:        ', row.owner)
      console.log('  prosecdef:    ', row.prosecdef, '(true=DEFINER, false=INVOKER)')
      console.log('  proconfig:    ', row.proconfig)
      console.log('  pronargs:     ', row.pronargs)
      console.log('  args:         ', row.args)
      console.log('  result_type:  ', row.result_type)
      console.log('  ---- BODY ----')
      console.log(row.def)
      console.log('  ---- END BODY ----')
    }
  }

  console.log('\n=== 2. reresolve_listings_in_set: signature + posture (the proven pattern) ===')
  {
    const r = await c.query(`
      SELECT p.prosecdef,
             p.proconfig,
             pg_get_userbyid(p.proowner) AS owner,
             pg_get_function_arguments(p.oid) AS args,
             pg_get_function_result(p.oid) AS result_type
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'reresolve_listings_in_set'`)
    if (r.rowCount === 0) console.log('  (NOT FOUND)')
    else console.log('  ', r.rows[0])
  }

  console.log('\n=== 3. reresolve_listing: how it delegates (the proven fix pattern) ===')
  {
    const r = await c.query(`
      SELECT pg_get_functiondef(p.oid) AS def,
             p.prosecdef,
             p.proconfig,
             pg_get_userbyid(p.proowner) AS owner,
             pg_get_function_arguments(p.oid) AS args,
             pg_get_function_result(p.oid) AS result_type
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'reresolve_listing'`)
    if (r.rowCount === 0) {
      console.log('  (NOT FOUND)')
    } else {
      const row = r.rows[0]
      console.log('  owner:        ', row.owner)
      console.log('  prosecdef:    ', row.prosecdef)
      console.log('  proconfig:    ', row.proconfig)
      console.log('  args:         ', row.args)
      console.log('  result_type:  ', row.result_type)
      console.log('  ---- BODY ----')
      console.log(row.def)
      console.log('  ---- END BODY ----')
    }
  }

  console.log('\n=== 4. pick_routing_agent: the inner the OLD reroll body calls ===')
  {
    const r = await c.query(`
      SELECT p.prosecdef,
             p.proconfig,
             pg_get_userbyid(p.proowner) AS owner,
             pg_get_function_arguments(p.oid) AS args,
             pg_get_function_result(p.oid) AS result_type
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'pick_routing_agent'`)
    if (r.rowCount === 0) console.log('  (NOT FOUND)')
    else for (const row of r.rows) console.log('  ', row)
  }

  console.log('\n=== 5. handle_apa_insert/update/delete: posture + inline-vs-async branches ===')
  {
    const r = await c.query(`
      SELECT p.proname,
             p.prosecdef,
             p.proconfig,
             pg_get_userbyid(p.proowner) AS owner
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('handle_apa_insert','handle_apa_update','handle_apa_delete')
       ORDER BY p.proname`)
    for (const row of r.rows) console.log('  ', row)
  }

  console.log('\n=== 6. mls_listings: relevant grants per role (informs DEFINER decision) ===')
  {
    const r = await c.query(`
      SELECT grantee, privilege_type
        FROM information_schema.role_table_grants
       WHERE table_schema = 'public'
         AND table_name   = 'mls_listings'
         AND grantee IN ('postgres','service_role','authenticator','anon','authenticated')
       ORDER BY grantee, privilege_type`)
    for (const row of r.rows) console.log('  ', row.grantee, '->', row.privilege_type)
    if (r.rowCount === 0) console.log('  (no rows -- table not present or no grants)')
  }

  console.log('\n=== 7. mls_listings_assigned_coupled_check: live constraint definition ===')
  {
    const r = await c.query(`
      SELECT conname,
             pg_get_constraintdef(c.oid) AS def,
             c.convalidated
        FROM pg_constraint c
       WHERE c.conrelid = 'public.mls_listings'::regclass
         AND c.conname  = 'mls_listings_assigned_coupled_check'`)
    if (r.rowCount === 0) console.log('  (NOT FOUND)')
    else for (const row of r.rows) console.log('  ', row)
  }

  console.log('\n=== 8. scope_specificity: the sticky-guard helper used by reresolve_listings_in_set ===')
  {
    const r = await c.query(`
      SELECT pg_get_functiondef(p.oid) AS def
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname='scope_specificity'`)
    if (r.rowCount === 0) console.log('  (NOT FOUND)')
    else console.log(r.rows[0].def)
  }

  console.log('\n=== 9. At-risk-row count: how many rows would the OLD body half-NULL on next reroll? ===')
  console.log('  Definition: rows whose current (assigned_agent_id NON-NULL, assigned_scope NON-NULL)')
  console.log('  would map to v_pick=NULL under pick_routing_agent at the same scope -- i.e., the')
  console.log('  apa for their geo+property_type has disappeared. Old body would set agent=NULL while')
  console.log('  leaving scope non-NULL -> COUPLED CHECK violation.')
  console.log('  Probe: per-tenant, count listings at community scope where no community apa exists')
  console.log('  for their (community_id, property_type) pair. Same for municipality and area.')
  {
    const r = await c.query(`
      WITH per_tenant AS (
        SELECT 'community'::text AS scope,
               ml.id AS listing_id,
               ml.assigned_agent_id,
               ml.assigned_scope,
               ml.community_id AS geo_id,
               ml.property_type,
               (SELECT a.tenant_id FROM public.agents a WHERE a.id = ml.assigned_agent_id) AS tenant_id
          FROM public.mls_listings ml
         WHERE ml.assigned_scope = 'community'
           AND ml.assigned_agent_id IS NOT NULL
           AND ml.community_id IS NOT NULL
        UNION ALL
        SELECT 'municipality', ml.id, ml.assigned_agent_id, ml.assigned_scope,
               ml.municipality_id, ml.property_type,
               (SELECT a.tenant_id FROM public.agents a WHERE a.id = ml.assigned_agent_id)
          FROM public.mls_listings ml
         WHERE ml.assigned_scope = 'municipality'
           AND ml.assigned_agent_id IS NOT NULL
           AND ml.municipality_id IS NOT NULL
        UNION ALL
        SELECT 'area', ml.id, ml.assigned_agent_id, ml.assigned_scope,
               ml.area_id, ml.property_type,
               (SELECT a.tenant_id FROM public.agents a WHERE a.id = ml.assigned_agent_id)
          FROM public.mls_listings ml
         WHERE ml.assigned_scope = 'area'
           AND ml.assigned_agent_id IS NOT NULL
           AND ml.area_id IS NOT NULL
      ),
      at_risk AS (
        SELECT pt.*
          FROM per_tenant pt
         WHERE pt.tenant_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
               FROM public.agent_property_access apa
               JOIN public.agents a ON a.id = apa.agent_id
              WHERE apa.tenant_id = pt.tenant_id
                AND apa.is_active = TRUE
                AND a.is_active = TRUE
                AND a.is_selling = TRUE
                AND a.tenant_id = pt.tenant_id
                AND apa.scope = pt.scope
                AND ((pt.scope = 'community'    AND apa.community_id    = pt.geo_id)
                  OR (pt.scope = 'municipality' AND apa.municipality_id = pt.geo_id)
                  OR (pt.scope = 'area'         AND apa.area_id         = pt.geo_id))
                AND ((pt.property_type = 'Residential Condo & Other' AND apa.condo_access)
                  OR (pt.property_type = 'Residential Freehold'      AND apa.homes_access))
           )
      )
      SELECT scope, property_type, COUNT(*)::int AS at_risk_count
        FROM at_risk
       GROUP BY scope, property_type
       ORDER BY scope, property_type`)
    if (r.rowCount === 0) console.log('  (zero at-risk rows -- finding is currently LATENT)')
    else for (const row of r.rows) console.log('  ', row)
  }

  console.log('\n=== 10. Half-NULL rows currently present in mls_listings (should be 0 per CHECK) ===')
  {
    const r = await c.query(`
      SELECT
        COUNT(*) FILTER (WHERE assigned_agent_id IS NOT NULL AND assigned_scope IS NULL) AS agent_only,
        COUNT(*) FILTER (WHERE assigned_agent_id IS NULL AND assigned_scope IS NOT NULL) AS scope_only,
        COUNT(*) FILTER (WHERE assigned_agent_id IS NOT NULL AND assigned_scope IS NOT NULL) AS both_set,
        COUNT(*) FILTER (WHERE assigned_agent_id IS NULL AND assigned_scope IS NULL) AS both_null
        FROM public.mls_listings`)
    console.log('  ', r.rows[0])
  }

  console.log('\n=== 11. WALLiam fixture: identify a viable smoke target geo (community level) ===')
  console.log('  Goal: find a (tenant, community) pair where:')
  console.log('    (a) the community has cached listings already at scope=community (so OLD reroll would touch them)')
  console.log('    (b) we can simulate a half-NULL transition by INSERT+DELETE+ROLLBACK on apa')
  {
    const r = await c.query(`
      SELECT t.source_key AS tenant_key,
             c.id AS community_id,
             c.name AS community_name,
             COUNT(ml.id) FILTER (WHERE ml.assigned_scope = 'community') AS community_scoped_cnt,
             COUNT(ml.id) AS total_listings
        FROM public.tenants t
        JOIN public.agent_property_access apa
          ON apa.tenant_id = t.id AND apa.scope = 'community' AND apa.is_active = TRUE
        JOIN public.communities c ON c.id = apa.community_id
        JOIN public.mls_listings ml ON ml.community_id = c.id
       WHERE t.source_key = 'walliam'
       GROUP BY t.source_key, c.id, c.name
       HAVING COUNT(ml.id) FILTER (WHERE ml.assigned_scope = 'community') > 0
       ORDER BY community_scoped_cnt DESC
       LIMIT 5`)
    for (const row of r.rows) console.log('  ', row)
  }

  await c.query('ROLLBACK')
  await c.end()
})().catch(e => { console.error('PROBE ERROR:', e); process.exit(1) })
