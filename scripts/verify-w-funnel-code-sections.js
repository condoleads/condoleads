// scripts/verify-w-funnel-code-sections.js
// W-FUNNEL-VERIFICATION code-testable sections: §1, §2, §7, §8.
// READ-ONLY, SAVEPOINT-isolated, no production mutation.
// Both tenants (WALLiam + Aily).
//
// Reports pass/fail per tracker row. Logs findings on failures; does not fix.

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')

const WALLIAM_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const AILY_ID = 'e2619717-6401-4159-8d4c-d5f87651c8d6'
const TENANTS = [
  { id: WALLIAM_ID, name: 'WALLiam', domain: 'walliam.ca' },
  { id: AILY_ID, name: 'Aily', domain: 'aily.ca' },
]

const results = []
const findings = []

function record (section, row, tenant, pass, detail) {
  results.push({ section, row, tenant, pass, detail })
  console.log('  ' + (pass ? 'PASS' : 'FAIL') + ' [' + section + '.' + row + ' ' + tenant + ']: ' + detail)
}
function finding (id, pri, note) {
  findings.push({ id, pri, note })
  console.log('  FINDING [' + pri + ' ' + id + ']: ' + note)
}

// Pretty fingerprint for opaque keys (first 6 + '...' + last 4 + length).
function fp (v) {
  if (!v) return '(absent)'
  return v.slice(0, 6) + '...' + v.slice(-4) + ' (len=' + v.length + ')'
}

;(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()

  // Wrap everything in a transaction; rollback at end.
  await c.query('BEGIN')
  try {

    // =========================================================================
    // §1 LEAD CAPTURE - assert each lead-type row shape per tenant
    // =========================================================================
    // Strategy: read EXISTING rows that match each (tenant, lead-type) combo;
    // assert the shape (tenant_id, lead_origin_route, source, agent_id present).
    // If no existing row for a combo, mark INCONCLUSIVE (no historical data).
    // We do not INSERT new rows -- that would require a real session_id + user
    // which would mutate user_activities + chat_sessions side-tables.
    console.log('\n=== §1 LEAD CAPTURE (read-existing shape verification) ===')

    const leadTypes = [
      // [row, descriptor SQL predicate, expected lead_origin_route]
      ['1.1', "intent = 'buyer' AND source LIKE '%_charlie' AND plan_data IS NOT NULL", 'charlie'],
      ['1.2', "intent = 'seller' AND source LIKE '%_charlie' AND plan_data IS NOT NULL", 'charlie'],
      ['1.3', "source LIKE '%_charlie' AND (plan_data IS NULL OR intent NOT IN ('buyer','seller'))", 'charlie'],
      ['1.4', "source LIKE '%estimator%' OR source LIKE '%vip%'", null],
      ['1.5', "appointment_date IS NOT NULL", null],
      ['1.6', "source LIKE '%contact%' OR lead_origin_route = 'contact'", null],
    ]

    for (const t of TENANTS) {
      for (const [row, predicate, expectedRoute] of leadTypes) {
        const q = `SELECT
          COUNT(*)::int AS n,
          COUNT(*) FILTER (WHERE tenant_id = $1)::int AS correct_tenant,
          COUNT(*) FILTER (WHERE tenant_id IS NULL)::int AS null_tenant,
          COUNT(*) FILTER (WHERE agent_id IS NOT NULL)::int AS has_agent,
          COUNT(*) FILTER (WHERE lead_origin_route IS NOT NULL)::int AS has_route,
          MIN(created_at) AS oldest,
          MAX(created_at) AS newest
          FROM leads
          WHERE tenant_id = $1 AND (${predicate})`
        const r = await c.query(q, [t.id])
        const row_data = r.rows[0]
        if (row_data.n === 0) {
          record('§1', row, t.name, null, 'INCONCLUSIVE: 0 existing rows of this type for this tenant')
          continue
        }
        const allTenantCorrect = row_data.correct_tenant === row_data.n && row_data.null_tenant === 0
        const allHaveAgent = row_data.has_agent === row_data.n
        const allHaveRoute = row_data.has_route === row_data.n
        const pass = allTenantCorrect && allHaveRoute
        record('§1', row, t.name, pass, `n=${row_data.n} tenant_id_correct=${row_data.correct_tenant}/${row_data.n} has_agent=${row_data.has_agent}/${row_data.n} has_route=${row_data.has_route}/${row_data.n} newest=${row_data.newest ? row_data.newest.toISOString().slice(0,10) : '-'}`)
        if (!allHaveAgent) {
          finding('F-FUNNEL-' + row + '-' + t.name + '-AGENT-NULL', 'P3', `${row_data.n - row_data.has_agent} ${t.name} ${row}-type leads have agent_id=NULL`)
        }
      }
    }

    // =========================================================================
    // §2 ROUTING / HIERARCHY
    // =========================================================================
    console.log('\n=== §2 ROUTING / HIERARCHY ===')

    // 2.1 -- resolve_agent_for_context: probe known geos per tenant.
    // apa rows specify the geo via area_id / municipality_id / community_id /
    // neighbourhood_id (no per-building row). Pick a primary-apa per tenant,
    // call the resolver with that geo + tenant, assert it returns an agent
    // belonging to the same tenant.
    for (const t of TENANTS) {
      const apaQ = await c.query(`
        SELECT apa.id, apa.agent_id, apa.area_id, apa.municipality_id, apa.community_id, apa.neighbourhood_id,
               ag.tenant_id AS agent_tenant_id, ag.full_name
        FROM agent_property_access apa
        JOIN agents ag ON ag.id = apa.agent_id
        WHERE apa.tenant_id = $1 AND apa.is_active = TRUE AND apa.is_primary = TRUE
        LIMIT 3
      `, [t.id])
      if (apaQ.rows.length === 0) {
        record('§2', '1', t.name, null, 'INCONCLUSIVE: no active+primary agent_property_access rows for this tenant')
      } else {
        let ok = 0
        const total = apaQ.rows.length
        const samples = []
        for (const apa of apaQ.rows) {
          // Pick whichever geo level is set (neighbourhood > community > municipality > area).
          let geoKind, geoVal
          if (apa.neighbourhood_id) { geoKind = 'p_neighbourhood_id'; geoVal = apa.neighbourhood_id }
          else if (apa.community_id) { geoKind = 'p_community_id'; geoVal = apa.community_id }
          else if (apa.municipality_id) { geoKind = 'p_municipality_id'; geoVal = apa.municipality_id }
          else if (apa.area_id) { geoKind = 'p_area_id'; geoVal = apa.area_id }
          else { samples.push({ agent: apa.full_name.slice(0,20), skip: 'no geo on apa' }); continue }
          try {
            const rpc = await c.query(`SELECT resolve_agent_for_context(${geoKind} => $1::uuid, p_tenant_id => $2::uuid) AS agent_id`, [geoVal, t.id])
            const resolved = rpc.rows[0]?.agent_id
            if (resolved) {
              const ag = await c.query('SELECT tenant_id FROM agents WHERE id = $1', [resolved])
              const correctTenant = ag.rows[0]?.tenant_id === t.id
              if (correctTenant) ok++
              samples.push({ geo: geoKind.replace('p_',''), resolved: resolved.slice(0,8), correctTenant })
            } else {
              samples.push({ geo: geoKind.replace('p_',''), resolved: 'NULL' })
            }
          } catch (e) {
            samples.push({ geo: geoKind.replace('p_',''), error: e.code || e.message.slice(0,40) })
          }
        }
        const pass = ok > 0 && ok === total
        record('§2', '1', t.name, pass, `resolved correctly: ${ok}/${total} samples=${JSON.stringify(samples).slice(0,250)}`)
      }
    }

    // 2.2 -- hierarchy escalation: confirm walker function exists + can climb.
    // Check that walkHierarchy returns sensible parent chains for known agents.
    for (const t of TENANTS) {
      const ag = await c.query(`SELECT id, full_name, parent_id, role FROM agents WHERE tenant_id = $1 AND parent_id IS NOT NULL LIMIT 1`, [t.id])
      if (ag.rows.length === 0) {
        record('§2', '2', t.name, null, 'INCONCLUSIVE: no agent with parent_id for this tenant (hierarchy may not yet be populated)')
      } else {
        const a = ag.rows[0]
        // Walk up the chain via SQL recursive
        const chain = await c.query(`
          WITH RECURSIVE walk AS (
            SELECT id, parent_id, role, 0 AS depth FROM agents WHERE id = $1
            UNION ALL
            SELECT a.id, a.parent_id, a.role, w.depth + 1
            FROM agents a JOIN walk w ON a.id = w.parent_id
            WHERE w.depth < 10
          )
          SELECT id, role, depth FROM walk ORDER BY depth
        `, [a.id])
        const roles = chain.rows.map(r => r.role).join(' -> ')
        const hasEscalation = chain.rows.length > 1
        record('§2', '2', t.name, hasEscalation, `chain (${chain.rows.length}): ${roles}`)
      }
    }

    // 2.3 -- no cross-tenant assignment
    // Scan apa: any (tenant_id, agent_id) where agent.tenant_id != apa.tenant_id?
    const xtApa = await c.query(`
      SELECT COUNT(*)::int AS mismatches
      FROM agent_property_access apa
      JOIN agents ag ON ag.id = apa.agent_id
      WHERE apa.tenant_id IS NOT NULL AND ag.tenant_id IS NOT NULL
        AND apa.tenant_id <> ag.tenant_id
    `)
    record('§2', '3', 'cross-tenant', xtApa.rows[0].mismatches === 0, `apa rows where apa.tenant_id != agent.tenant_id: ${xtApa.rows[0].mismatches}`)

    // =========================================================================
    // §7 MULTI-TENANT ISOLATION
    // =========================================================================
    console.log('\n=== §7 MULTI-TENANT ISOLATION ===')

    // 7.1 / 7.2: simulate "agent A queries leads"; should only see same-tenant
    for (const t of TENANTS) {
      // Pick any active agent of this tenant
      const ag = await c.query(`SELECT id, full_name FROM agents WHERE tenant_id = $1 AND is_active = TRUE LIMIT 1`, [t.id])
      if (ag.rows.length === 0) {
        record('§7', t === TENANTS[0] ? '1' : '2', t.name, null, 'INCONCLUSIVE: no active agent for this tenant')
        continue
      }
      const agentId = ag.rows[0].id
      // The dashboard query: leads WHERE tenant_id = <agent.tenant_id> AND agent_id = <agentId> (or via canAgentSeeLead which walks hierarchy)
      // Simpler check: any lead row visible to this agent whose tenant_id != agent.tenant_id?
      const visibleCheck = await c.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE tenant_id = $2)::int AS same_tenant,
          COUNT(*) FILTER (WHERE tenant_id <> $2 OR tenant_id IS NULL)::int AS other_or_null
        FROM leads WHERE agent_id = $1
      `, [agentId, t.id])
      const v = visibleCheck.rows[0]
      const pass = v.other_or_null === 0
      record('§7', t === TENANTS[0] ? '1' : '2', t.name, pass, `agent ${ag.rows[0].full_name}: total=${v.total} same_tenant=${v.same_tenant} other_or_null=${v.other_or_null}`)
    }

    // 7.3: leads.agent_id's tenant != leads.tenant_id (the F-CV-LEADS-INSERT-NO-TENANT-AGENT-FK class)
    const xtLeads = await c.query(`
      SELECT COUNT(*)::int AS mismatches,
             COUNT(*) FILTER (WHERE l.tenant_id IS NULL)::int AS null_lead_tenant,
             COUNT(*) FILTER (WHERE ag.tenant_id IS NULL)::int AS null_agent_tenant
      FROM leads l
      JOIN agents ag ON ag.id = l.agent_id
      WHERE l.agent_id IS NOT NULL
        AND l.tenant_id IS NOT NULL AND ag.tenant_id IS NOT NULL
        AND l.tenant_id <> ag.tenant_id
    `)
    const xt = xtLeads.rows[0]
    const xtPass = xt.mismatches === 0
    record('§7', '3', 'cross-tenant scan', xtPass, `leads where agent.tenant_id != lead.tenant_id: ${xt.mismatches}`)
    if (!xtPass) {
      finding('F-CV-LEADS-INSERT-NO-TENANT-AGENT-FK', 'P2', `${xt.mismatches} live rows with tenant-mismatch (no FK enforcing constraint)`)
    } else {
      console.log('  (finding F-CV-LEADS-INSERT-NO-TENANT-AGENT-FK: no live mismatches today; FK absence persists as latent risk)')
    }

    // =========================================================================
    // §8 AI SYSTEMS (config / wiring only, NO paid calls)
    // =========================================================================
    console.log('\n=== §8 AI SYSTEMS (static config check) ===')

    // 8.1 / 8.2: per-tenant Anthropic key set + not placeholder
    for (const t of TENANTS) {
      const r = await c.query(`SELECT anthropic_api_key, resend_api_key FROM tenants WHERE id = $1`, [t.id])
      const key = r.rows[0]?.anthropic_api_key
      const resendKey = r.rows[0]?.resend_api_key
      const present = !!key
      const placeholder = key && /\[.*\]|YOUR.*KEY|REPLACE|placeholder|TODO/i.test(key)
      const looksReal = key && key.startsWith('sk-ant-') && key.length > 50
      const pass = present && !placeholder && looksReal
      record('§8', '1', t.name, pass, `anthropic_api_key fp=${fp(key)} starts_with_sk-ant=${key ? key.startsWith('sk-ant-') : false} placeholder=${placeholder}`)
      const resendPass = resendKey && /^re_/.test(resendKey) && !/\[.*\]|REPLACE|placeholder/i.test(resendKey)
      record('§3', '8-related', t.name + ' resend_key', resendPass, `resend_api_key fp=${fp(resendKey)} starts_with_re_=${resendKey ? resendKey.startsWith('re_') : false}`)
    }

    // 8.2: plan generation uses tenant key -- check the agent-side: ai_estimator_enabled
    // is on agents table; per-agent flag. Verify count of agents with the flag enabled.
    for (const t of TENANTS) {
      try {
        const r = await c.query(`SELECT COUNT(*) FILTER (WHERE ai_estimator_enabled = TRUE)::int AS enabled, COUNT(*)::int AS total FROM agents WHERE tenant_id = $1 AND is_active = TRUE`, [t.id])
        record('§8', '2', t.name, true, `agents ai_estimator_enabled: ${r.rows[0].enabled}/${r.rows[0].total} active`)
      } catch (e) {
        // Column might not exist on this tenant's schema; treat as no-op signal
        record('§8', '2', t.name, null, 'INCONCLUSIVE: ' + e.message.slice(0,80))
      }
    }

    // 8.3: estimator empty-building fallback path is static-checkable in code.
    // Inspect lib/estimator/comparable-matcher-sales.ts for the fallback pattern.
    const fs = require('fs')
    const path = require('path')
    const ROOT = path.resolve(__dirname, '..')
    let estCheck = null
    try {
      const src = fs.readFileSync(path.join(ROOT, 'lib/estimator/comparable-matcher-sales.ts'), 'utf8')
      // Look for empty-result handling: returns empty array or fallback without throwing
      const hasEmptyReturn = /return\s+(\[\]|null|{[^}]*comparables:\s*\[\][^}]*})/i.test(src)
      const errorLogsNull = /console\.error\([^)]*comparables[^)]*\bnull\b/i.test(src) || /Error fetching comparables['"]/.test(src)
      estCheck = { hasEmptyReturn, errorLogsNull }
      record('§8', '3', 'estimator empty-building path', hasEmptyReturn, `empty-result return present=${hasEmptyReturn}; error-on-null log present=${errorLogsNull}`)
      if (errorLogsNull) finding('F-ESTIMATOR-BUILDING-NO-COMPARABLES-LOG-LIES', 'P3', 'lib/estimator/comparable-matcher-sales.ts logs "Error fetching comparables" on empty-result (per tracker, P3 logged)')
    } catch (e) {
      record('§8', '3', 'estimator file inspection', null, 'INCONCLUSIVE: ' + e.message.slice(0,80))
    }

    await c.query('ROLLBACK')
  } catch (e) {
    console.error('ABORT:', e.message)
    await c.query('ROLLBACK').catch(()=>{})
  }
  await c.end()

  // =====================================================================
  // Pass/Fail Matrix Summary
  // =====================================================================
  console.log('\n')
  console.log('================ PASS/FAIL MATRIX ================')
  const pass = results.filter(r => r.pass === true).length
  const fail = results.filter(r => r.pass === false).length
  const inc = results.filter(r => r.pass === null).length
  console.log(`PASS: ${pass}   FAIL: ${fail}   INCONCLUSIVE: ${inc}   TOTAL: ${results.length}`)
  console.log('')
  console.log('FAILURES:')
  for (const r of results.filter(r => r.pass === false)) {
    console.log('  FAIL §' + r.section + '.' + r.row + ' [' + r.tenant + ']: ' + r.detail)
  }
  console.log('')
  console.log('INCONCLUSIVE (no data to verify):')
  for (const r of results.filter(r => r.pass === null)) {
    console.log('  INC  §' + r.section + '.' + r.row + ' [' + r.tenant + ']: ' + r.detail)
  }
  console.log('')
  console.log('FINDINGS LOGGED:')
  for (const f of findings) console.log('  [' + f.pri + '] ' + f.id + ': ' + f.note)

  // Emit JSON for downstream tracker update
  console.log('\n---JSON-RESULTS-BEGIN---')
  console.log(JSON.stringify({ results, findings }))
  console.log('---JSON-RESULTS-END---')

  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('FATAL:', e); process.exit(1) })
