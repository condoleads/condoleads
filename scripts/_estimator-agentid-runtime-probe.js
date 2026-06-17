// scripts/_estimator-agentid-runtime-probe.js
//
// W-ESTIMATOR-EMAIL-LEAD-BROKEN RECON 2 RUNTIME PROBE — read-only.
// Replicates the EXACT agent-resolution paths that EstimatorSeller
// (condo) + HomeEstimatorBuyerModal (home) compose at runtime, against
// the live DB, with the real WALLiam tenant_id. Prints the values that
// would flow into the `if (!agentId) { setSubmitted(true); return }`
// gate.
//
// SCRIPT 1 always runs.
// SCRIPT 2 runs only if Script 1 shows a valid agentId on BOTH surfaces
// (the gate not the cause). All writes wrapped in BEGIN/ROLLBACK.

require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const { createClient } = require('@supabase/supabase-js')

const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const WALLIAM_HOST = 'walliam.ca'

;(async () => {
  const pgPool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
  })
  const pgClient = await pgPool.connect()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    console.log('═══════════════════════════════════════════════════════════════════')
    console.log('SCRIPT 1 — Replicate the EXACT agent-resolution paths')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    // ─────────────────────────────────────────────────────────────────
    // SURFACE A — Condo seller (BuildingPage → EstimatorSeller)
    // ─────────────────────────────────────────────────────────────────
    console.log('── SURFACE A — Condo seller (BuildingPage on a WALLiam building) ──\n')

    // Pick a real building under WALLiam's reach (a Whitby community, since
    // WALLiam is the hero tenant). Building does NOT need to be tenant-
    // owned — WALLiam is global hero.
    await pgClient.query('BEGIN READ ONLY')
    const buildingRow = await pgClient.query(`
      SELECT b.id, b.building_name, b.canonical_address, b.community_id,
             c.name AS community_name, c.municipality_id,
             m.name AS municipality_name
        FROM buildings b
        LEFT JOIN communities c ON c.id = b.community_id
        LEFT JOIN municipalities m ON m.id = c.municipality_id
       WHERE b.community_id IS NOT NULL
       LIMIT 1
    `)
    if (buildingRow.rowCount === 0) {
      console.log('  FATAL: no buildings with community_id in DB; cannot probe condo surface.')
    } else {
      const b = buildingRow.rows[0]
      console.log(`  Test building: ${b.building_name} (${b.canonical_address})`)
      console.log(`    id=${b.id}`)
      console.log(`    community=${b.community_name} (${b.community_id})`)
      console.log(`    municipality=${b.municipality_name} (${b.municipality_id})\n`)

      // STEP 1 — BuildingPage.tsx:281-282 — getCurrentTenantId + isHeroTenant
      // (header-based; in this script we assume WALLiam host → tenantId, isHero=true).
      console.log('  STEP 1 — getCurrentTenantId() + isHeroTenant() (header-based)')
      console.log(`    tenantId  = ${WALLIAM_TENANT_ID}    (simulating x-tenant-id middleware set for ${WALLIAM_HOST})`)
      console.log(`    isHero    = true                                    (WALLiam IS the hero tenant)\n`)

      // STEP 2 — BuildingPage.tsx:284-292 — resolveAgentForContext
      // (live call via the RPC the helper wraps).
      console.log('  STEP 2 — resolveAgentForContext({building_id, community_id, municipality_id, area_id, tenant_id}) — live RPC call')
      const { data: rpcResolved, error: rpcErr } = await supabase.rpc('resolve_agent_for_context', {
        p_listing_id: null,
        p_building_id: b.id,
        p_neighbourhood_id: null,
        p_community_id: b.community_id,
        p_municipality_id: b.municipality_id,
        p_area_id: null,
        p_user_id: null,
        p_tenant_id: WALLIAM_TENANT_ID,
      })
      console.log(`    rpc.data  = ${rpcResolved === null ? 'NULL' : rpcResolved}`)
      console.log(`    rpc.error = ${rpcErr ? JSON.stringify(rpcErr) : '(none)'}`)

      // STEP 2b — fall back to tenants.default_agent_id when RPC returns null
      // (tenant-resolver.ts:170-175).
      let resolvedAgentId = rpcResolved
      if (!resolvedAgentId) {
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('default_agent_id')
          .eq('id', WALLIAM_TENANT_ID)
          .single()
        console.log(`    fallback tenant.default_agent_id = ${tenantRow?.default_agent_id ?? 'NULL'}`)
        resolvedAgentId = tenantRow?.default_agent_id || null
      }

      // STEP 3 — BuildingPage.tsx:302 — getDisplayAgentForBuilding(host, buildingId)
      // For WALLiam (custom domain), this calls getAgentByCustomDomain('walliam.ca').
      console.log('\n  STEP 3 — getDisplayAgentForBuilding(host=walliam.ca, buildingId) → getAgentByCustomDomain')
      const { data: customDomainAgent, error: cdErr } = await supabase
        .from('agents')
        .select('id, full_name, custom_domain, is_active, tenant_id')
        .eq('custom_domain', WALLIAM_HOST)
        .eq('is_active', true)
        .maybeSingle()
      console.log(`    agents WHERE custom_domain='walliam.ca' AND is_active=true:`)
      if (customDomainAgent) {
        console.log(`      agent.id        = ${customDomainAgent.id}`)
        console.log(`      agent.full_name = ${customDomainAgent.full_name}`)
        console.log(`      agent.tenant_id = ${customDomainAgent.tenant_id}`)
      } else {
        console.log(`      (none)  error=${cdErr ? cdErr.message : '(no row)'}`)
      }

      // STEP 4 — BuildingPage.tsx:557-572 — render gate
      // {agent && !isHero ? EstimatorSeller agentId={agent.id}
      //   : isHero && walliamAgentId && tenantId ? EstimatorSeller agentId={walliamAgentId}
      //   : null}
      console.log('\n  STEP 4 — render gate (BuildingPage:557-572)')
      const agentVar = customDomainAgent  // the outer `agent` var
      const walliamAgentId = resolvedAgentId
      let mountedAgentId = null
      let mountedBranch = ''
      if (agentVar && false /* !isHero, but isHero=true on WALLiam */) {
        mountedAgentId = agentVar.id
        mountedBranch = 'agent.id (non-hero branch)'
      } else if (true /* isHero */ && walliamAgentId && WALLIAM_TENANT_ID) {
        mountedAgentId = walliamAgentId
        mountedBranch = 'walliamAgentId (hero branch)'
      } else {
        mountedAgentId = null
        mountedBranch = 'NULL — EstimatorSeller card does NOT render'
      }
      console.log(`    isHero=true, agent=${agentVar ? `<resolved: ${agentVar.full_name}>` : 'null'}, walliamAgentId=${walliamAgentId ?? 'null'}`)
      console.log(`    mounted-branch: ${mountedBranch}`)
      console.log(`    EstimatorSeller agentId prop = ${mountedAgentId ?? 'NULL (card never rendered)'}`)

      // STEP 5 — final agentId at EstimatorResults.tsx:111 gate
      console.log('\n  STEP 5 — agentId gate at EstimatorResults.tsx:111  (`if (!agentId) skip`)')
      if (mountedAgentId === null) {
        console.log('    Card never rendered → no submit possible → user cannot reach the gate.')
        console.log('    SURFACE A VERDICT: BLOCKED at MOUNT, not at GATE.')
      } else {
        const gateFires = !mountedAgentId
        console.log(`    agentId = ${mountedAgentId}`)
        console.log(`    gate FIRES (silent skip) = ${gateFires ? 'YES' : 'NO'}`)
        console.log(`    SURFACE A VERDICT: ${gateFires ? 'GATE FIRES — root cause confirmed' : 'GATE PASSES — agentId valid; failure must be downstream'}`)
      }
    }
    await pgClient.query('ROLLBACK')

    console.log('\n')

    // ─────────────────────────────────────────────────────────────────
    // SURFACE B — Home buyer modal (HomePropertyPage → HomePropertyPageClient → HomeEstimatorBuyerModal)
    // ─────────────────────────────────────────────────────────────────
    console.log('── SURFACE B — Home buyer modal (HomePropertyPage on a WALLiam home listing) ──\n')

    await pgClient.query('BEGIN READ ONLY')
    const homeRow = await pgClient.query(`
      SELECT id, listing_key, unparsed_address, property_subtype, property_type,
             community_id, municipality_id, standard_status
        FROM mls_listings
       WHERE property_type = 'Residential Freehold'
         AND standard_status = 'Active'
         AND community_id IS NOT NULL
         AND municipality_id IS NOT NULL
       LIMIT 1
    `)
    if (homeRow.rowCount === 0) {
      console.log('  FATAL: no active home listings with community_id; cannot probe home surface.')
    } else {
      const l = homeRow.rows[0]
      console.log(`  Test home listing: ${l.unparsed_address}`)
      console.log(`    id=${l.id}`)
      console.log(`    listing_key=${l.listing_key}`)
      console.log(`    property_subtype=${l.property_subtype}`)
      console.log(`    community=${l.community_id}, municipality=${l.municipality_id}\n`)

      // STEP 1 — HomePropertyPage.tsx:92 — getDisplayAgentForHome(host)
      // → getAgentFromHost('walliam.ca') → getAgentByCustomDomain('walliam.ca')
      console.log('  STEP 1 — getDisplayAgentForHome(host=walliam.ca) → getAgentByCustomDomain')
      const { data: customDomainAgent } = await supabase
        .from('agents')
        .select('id, full_name, custom_domain, is_active, can_create_children, tenant_id')
        .eq('custom_domain', WALLIAM_HOST)
        .eq('is_active', true)
        .maybeSingle()
      console.log(`    custom_domain match: ${customDomainAgent ? `${customDomainAgent.full_name} (${customDomainAgent.id})` : 'NULL'}`)

      // STEP 2 — HomePropertyPage.tsx:94-103 — fallback to WALLiam tenant agent
      // when no display agent (can_create_children = true).
      let agent = customDomainAgent
      if (!agent) {
        console.log('\n  STEP 2 — fallback: agents WHERE tenant_id=WALLIAM AND can_create_children=true')
        const { data: walliamAgent } = await supabase
          .from('agents')
          .select('id, full_name, tenant_id, can_create_children, is_active')
          .eq('tenant_id', WALLIAM_TENANT_ID)
          .eq('can_create_children', true)
          .single()
        console.log(`    fallback agent: ${walliamAgent ? `${walliamAgent.full_name} (${walliamAgent.id})` : 'NULL'}`)
        agent = walliamAgent
      }

      // STEP 3 — HomePropertyPage.tsx:105 — if (!agent) notFound()
      console.log('\n  STEP 3 — if (!agent) notFound() — page would 404 here')
      if (!agent) {
        console.log('    Both lookups returned NULL → page 404s; no estimator surface exists.')
        console.log('    SURFACE B VERDICT: BLOCKED at PAGE 404, not at GATE.')
      } else {
        console.log(`    agent resolved → page renders. agent.id = ${agent.id}`)

        // STEP 4 — HomePropertyPage.tsx:308 + :314 → HomePropertyPageClient
        // agent={isHero ? null : agent}             ← prop is null on WALLiam
        // walliamAgentId={agent?.id ?? null}        ← prop is the resolved id
        console.log('\n  STEP 4 — props passed to HomePropertyPageClient on WALLiam (isHero=true)')
        const propAgent = null  // {isHero ? null : agent} when isHero=true
        const propWalliamAgentId = agent.id
        console.log(`    agent prop          = ${propAgent === null ? 'null' : '<agent obj>'}`)
        console.log(`    walliamAgentId prop = ${propWalliamAgentId}`)

        // STEP 5 — HomePropertyPageClient.tsx:268 — final agentId expression
        // agentId={agent?.id || walliamAgentId || ''}
        const finalAgentId = propAgent?.id || propWalliamAgentId || ''
        console.log('\n  STEP 5 — HomePropertyPageClient.tsx:268: agentId={agent?.id || walliamAgentId || \'\'}')
        console.log(`    final agentId = "${finalAgentId}"`)

        // STEP 6 — HomeEstimatorResults.tsx:180 — if (!agentId) gate
        console.log('\n  STEP 6 — agentId gate at HomeEstimatorResults.tsx:180  (`if (!agentId) skip`)')
        const gateFires = !finalAgentId
        console.log(`    gate FIRES (silent skip) = ${gateFires ? 'YES' : 'NO'}`)
        console.log(`    SURFACE B VERDICT: ${gateFires ? 'GATE FIRES — root cause confirmed' : 'GATE PASSES — agentId valid; failure must be downstream'}`)
      }
    }
    await pgClient.query('ROLLBACK')

    // ─────────────────────────────────────────────────────────────────
    // SCRIPT 2 — only when both surfaces show valid agentId
    // ─────────────────────────────────────────────────────────────────
    // We'll always run Script 2 to give the operator the full picture
    // regardless of Surface A/B outcomes — but call out the conditional.
    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('SCRIPT 2 — Downstream pre-reqs (always-run to surface all evidence)')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    // CHECK 2.1 — tenants.resend_api_key for WALLiam (fingerprint only).
    console.log('── 2.1 tenants.resend_api_key for WALLiam (fingerprint only) ──')
    const { data: tenantSecret } = await supabase
      .from('tenants')
      .select('id, name, domain, brand_name, resend_api_key, default_agent_id, can_send_emails')
      .eq('id', WALLIAM_TENANT_ID)
      .single()
    if (!tenantSecret) {
      console.log('  WALLiam tenant row NOT FOUND — major break.')
    } else {
      const k = tenantSecret.resend_api_key
      const presence = k && k.length > 0 ? 'PRESENT' : 'NULL/EMPTY'
      const fingerprint = k && k.length >= 10
        ? `${k.slice(0, 6)}...${k.slice(-4)}  (length=${k.length})`
        : '(no fingerprint; key absent or too short)'
      console.log(`  resend_api_key:        ${presence}  ${fingerprint}`)
      console.log(`  can_send_emails flag:  ${tenantSecret.can_send_emails}`)
      console.log(`  tenant.default_agent_id: ${tenantSecret.default_agent_id}`)
      console.log(`  tenant.domain:         ${tenantSecret.domain}`)
      console.log(`  tenant.brand_name:     ${tenantSecret.brand_name}`)
      console.log(`  tenant.name:           ${tenantSecret.name}`)
    }

    // CHECK 2.2 — leads insert under WALLiam + resolved agent, BEGIN/ROLLBACK.
    console.log('\n── 2.2 leads insert under WALLiam + resolved agent (BEGIN/ROLLBACK) ──')

    // Resolve the agent the way the estimator would (custom domain match).
    const { data: cdAgent } = await supabase
      .from('agents')
      .select('id, full_name, tenant_id')
      .eq('custom_domain', WALLIAM_HOST)
      .eq('is_active', true)
      .maybeSingle()
    let probeAgentId = cdAgent?.id || null
    if (!probeAgentId) {
      const { data: childAgent } = await supabase
        .from('agents')
        .select('id, full_name, tenant_id')
        .eq('tenant_id', WALLIAM_TENANT_ID)
        .eq('can_create_children', true)
        .maybeSingle()
      probeAgentId = childAgent?.id || null
    }
    console.log(`  Probe agentId for insert: ${probeAgentId}`)

    if (!probeAgentId) {
      console.log('  No agent resolvable for WALLiam — skipping insert probe.')
    } else {
      const pgInsertClient = await pgPool.connect()
      try {
        await pgInsertClient.query('BEGIN')
        const insRes = await pgInsertClient.query(`
          INSERT INTO leads (
            tenant_id, agent_id,
            contact_name, contact_email,
            source, status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING id, tenant_id, agent_id, contact_email, source
        `, [
          WALLIAM_TENANT_ID,
          probeAgentId,
          'AGENTID-RUNTIME-PROBE',
          'probe@example.invalid',
          'estimator',
          'new',
        ]).catch(err => ({ error: err }))

        if (insRes.error) {
          console.log(`  INSERT REJECTED:`)
          console.log(`    code:    ${insRes.error.code}`)
          console.log(`    message: ${insRes.error.message}`)
          if (insRes.error.detail) console.log(`    detail:  ${insRes.error.detail}`)
          if (insRes.error.constraint) console.log(`    constraint: ${insRes.error.constraint}`)
        } else {
          console.log(`  INSERT SUCCEEDED (rolled back; zero state mutation):`)
          for (const r of insRes.rows) {
            console.log(`    id=${r.id}  tenant=${r.tenant_id}  agent=${r.agent_id}  email=${r.contact_email}  source=${r.source}`)
          }
        }
        await pgInsertClient.query('ROLLBACK')
        console.log('  Transaction ROLLED BACK — no row persisted.')
      } finally {
        pgInsertClient.release()
      }
    }

    // CHECK 2.3 — sendTenantEmail's preconditions for WALLiam.
    console.log('\n── 2.3 sendTenantEmail preconditions for WALLiam ──')
    // sendTenantEmail typically wants: tenant.resend_api_key + can_send_emails
    // + a configured `from` address. Check the existence of the from address
    // and any per-tenant overrides.
    const { data: tenantFull } = await supabase
      .from('tenants')
      .select('id, name, domain, brand_name, resend_api_key, can_send_emails, default_agent_id, from_email, from_name, support_email')
      .eq('id', WALLIAM_TENANT_ID)
      .maybeSingle()
    if (!tenantFull) {
      console.log('  Could not re-select tenant row.')
    } else {
      const fields = Object.keys(tenantFull)
      console.log(`  tenant row fields present: ${fields.join(', ')}`)
      // Print non-secret fields verbatim; never print the key.
      const safe = { ...tenantFull }
      if (safe.resend_api_key) {
        const k = safe.resend_api_key
        safe.resend_api_key = `${k.slice(0, 6)}...${k.slice(-4)}  (length=${k.length})`
      }
      console.log(`  values:`)
      for (const [k, v] of Object.entries(safe)) {
        console.log(`    ${k}: ${v === null ? 'NULL' : v}`)
      }
    }

  } finally {
    pgClient.release()
    await pgPool.end()
  }
})().catch(e => { console.error('FATAL', e); process.exit(1) })
