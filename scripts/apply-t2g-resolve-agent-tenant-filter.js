#!/usr/bin/env node
/**
 * apply-t2g-resolve-agent-tenant-filter.js
 *
 * W-LEADS-EMAIL T2g — apply resolve_agent_for_context RPC fix.
 *
 * Verifies post-apply via textual fingerprint of the function body:
 *   - P1 fix marker: "agent_listing_assignments ala" + "JOIN agents a"
 *   - P2 fix marker: "agent_geo_buildings agb" + "JOIN agents a"
 *   - P8 fix marker: "user_profiles up" + "JOIN agents a"
 *   - Old leak patterns absent: "FROM agent_listing_assignments WHERE listing_id"
 *     and "FROM agent_geo_buildings WHERE building_id" without JOIN
 *   - "(p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)" present 3 times
 *
 * Saves pre/post function body fingerprints for git diff.
 *
 * Required env: DATABASE_URL
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const MIGRATION_PATH = path.resolve('supabase', 'migrations', '20260510_t2g_resolve_agent_tenant_filter.sql')
const PRE_FINGERPRINT = path.resolve('recon', 'W-LEADS-EMAIL-T2G-PRE-fingerprint.json')
const POST_FINGERPRINT = path.resolve('recon', 'W-LEADS-EMAIL-T2G-POST-fingerprint.json')

async function captureFingerprint(client) {
  const fnRes = await client.query(`
    SELECT pg_get_functiondef(p.oid) AS body
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'resolve_agent_for_context'
  `)
  if (fnRes.rows.length === 0) {
    return { timestamp: new Date().toISOString(), exists: false }
  }
  const body = fnRes.rows[0].body
  return {
    timestamp: new Date().toISOString(),
    exists: true,
    body,
    body_length: body.length,
    body_lines: body.split('\n').length,
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL env var not set.')
    process.exit(1)
  }
  if (!fs.existsSync(MIGRATION_PATH)) {
    console.error(`ERROR: migration file missing: ${MIGRATION_PATH}`)
    process.exit(1)
  }

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log(`Migration loaded: ${MIGRATION_PATH} (${sql.length} bytes)`)

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  console.log('\n== Step 1: capturing pre-apply fingerprint ==')
  const pre = await captureFingerprint(client)
  if (!pre.exists) {
    console.error('ERROR: resolve_agent_for_context function not found pre-apply.')
    await client.end()
    process.exit(2)
  }
  console.log(`  function body: ${pre.body_length} bytes, ${pre.body_lines} lines`)

  // Pre-state should NOT have the JOIN agents pattern (else already applied)
  if (pre.body.includes('JOIN agents a ON a.id = ala.agent_id')) {
    console.error('\nERROR: P1 JOIN agents pattern already in function body. Migration appears to have been applied.')
    fs.mkdirSync(path.dirname(PRE_FINGERPRINT), { recursive: true })
    fs.writeFileSync(PRE_FINGERPRINT, JSON.stringify(pre, null, 2), 'utf8')
    await client.end()
    process.exit(2)
  }

  fs.mkdirSync(path.dirname(PRE_FINGERPRINT), { recursive: true })
  fs.writeFileSync(PRE_FINGERPRINT, JSON.stringify(pre, null, 2), 'utf8')
  console.log(`  pre-fingerprint saved: ${PRE_FINGERPRINT}`)

  console.log('\n== Step 2: applying migration ==')
  try {
    await client.query(sql)
    console.log('  migration executed without throwing')
  } catch (err) {
    console.error('  migration execution failed:', err.message)
    await client.end()
    process.exit(3)
  }

  console.log('\n== Step 3: post-apply textual verification ==')
  const post = await captureFingerprint(client)
  if (!post.exists) {
    console.error('VERIFICATION FAILED: function disappeared post-apply.')
    await client.end()
    process.exit(4)
  }
  console.log(`  function body: ${post.body_length} bytes, ${post.body_lines} lines (was ${pre.body_lines})`)

  const checks = []

  // P1 fix marker
  if (!post.body.includes('agent_listing_assignments ala') ||
      !post.body.includes('JOIN agents a ON a.id = ala.agent_id')) {
    checks.push('P1 fix marker missing (expected: agent_listing_assignments ala + JOIN agents a ON a.id = ala.agent_id)')
  }

  // P2 fix marker
  if (!post.body.includes('agent_geo_buildings agb') ||
      !post.body.includes('JOIN agents a ON a.id = agb.agent_id')) {
    checks.push('P2 fix marker missing (expected: agent_geo_buildings agb + JOIN agents a ON a.id = agb.agent_id)')
  }

  // P8 fix marker
  if (!post.body.includes('user_profiles up') ||
      !post.body.includes('JOIN agents a ON a.id = up.assigned_agent_id')) {
    checks.push('P8 fix marker missing (expected: user_profiles up + JOIN agents a ON a.id = up.assigned_agent_id)')
  }

  // Tenant filter clause should appear 3 times (P1, P2, P8)
  const tenantFilterRegex = /\(p_tenant_id IS NULL OR a\.tenant_id = p_tenant_id\)/g
  const tenantFilterMatches = (post.body.match(tenantFilterRegex) || []).length
  if (tenantFilterMatches !== 3) {
    checks.push(`tenant filter clause appears ${tenantFilterMatches} times, expected 3`)
  }

  // Old leak patterns must be ABSENT
  if (/FROM agent_listing_assignments\s+WHERE listing_id = p_listing_id;/.test(post.body)) {
    checks.push('OLD P1 leak pattern still present: bare FROM agent_listing_assignments WHERE')
  }
  if (/FROM agent_geo_buildings\s+WHERE building_id = p_building_id;/.test(post.body)) {
    checks.push('OLD P2 leak pattern still present: bare FROM agent_geo_buildings WHERE')
  }
  if (/SELECT assigned_agent_id INTO v_agent_id FROM user_profiles\s+WHERE id = p_user_id AND assigned_agent_id IS NOT NULL;/.test(post.body)) {
    checks.push('OLD P8 leak pattern still present: bare FROM user_profiles WHERE id = p_user_id')
  }

  // P3-P7, P9, P10 must remain unchanged (sanity check on preserved tiers)
  if (!post.body.includes("pick_routing_agent('neighbourhood'")) checks.push('P3 preserved tier missing')
  if (!post.body.includes("pick_routing_agent('community'")) checks.push('P4 preserved tier missing')
  if (!post.body.includes("pick_routing_agent('municipality'")) checks.push('P5 preserved tier missing')
  if (!post.body.includes("pick_routing_agent('area'")) checks.push('P6 preserved tier missing')
  if (!post.body.includes('FROM tenant_users')) checks.push('P7 preserved tier missing (tenant_users)')
  if (!post.body.includes('SELECT default_agent_id INTO v_agent_id FROM tenants')) {
    checks.push('P9 preserved tier missing (tenants.default_agent_id)')
  }
  if (!post.body.includes("WHERE tenant_id = p_tenant_id AND is_active = true\n    ORDER BY created_at ASC LIMIT 1")) {
    checks.push('P10 preserved tier missing (any active agent fallback)')
  }

  fs.writeFileSync(POST_FINGERPRINT, JSON.stringify(post, null, 2), 'utf8')
  console.log(`  post-fingerprint saved: ${POST_FINGERPRINT}`)

  if (checks.length) {
    console.error('\nVERIFICATION FAILED:')
    for (const c of checks) console.error(`  ${c}`)
    await client.end()
    process.exit(4)
  }

  console.log('  ✓ P1 fix marker present (agent_listing_assignments ala JOIN agents a)')
  console.log('  ✓ P2 fix marker present (agent_geo_buildings agb JOIN agents a)')
  console.log('  ✓ P8 fix marker present (user_profiles up JOIN agents a)')
  console.log('  ✓ tenant filter clause appears 3 times')
  console.log('  ✓ old leak patterns absent (P1, P2, P8)')
  console.log('  ✓ preserved tiers intact (P3, P4, P5, P6, P7, P9, P10)')

  await client.end()
  console.log('\n== T2g APPLIED SUCCESSFULLY ==')
  console.log('Note: full cross-tenant leak smoke deferred to T7 (smoke matrix).')
  console.log('Next: T2h delete app/actions/createLead.ts dead code (final T2 step).')
}

main().catch((err) => {
  console.error('Apply failed:', err)
  process.exit(1)
})