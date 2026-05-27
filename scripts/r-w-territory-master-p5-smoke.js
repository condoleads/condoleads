// scripts/r-w-territory-master-p5-smoke.js
// W-TERRITORY-MASTER P5 smoke: end-to-end validation of pin lifecycle.
//
// Runs in a single transaction with autocommit set OFF; ROLLBACK at the end
// so production state is untouched. Uses real WALLiam data (tenant, agent,
// listing) discovered at runtime — no fake values.
//
// Run: node scripts/r-w-territory-master-p5-smoke.js

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env.local not found at', envPath)
    process.exit(1)
  }
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const k = m[1]
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
}

loadDotEnvLocal()

const conn = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
if (!conn) {
  console.error('ERROR: SUPABASE_DB_URL not set in .env.local')
  process.exit(1)
}

const checks = []
function rec(name, pass, detail) {
  checks.push({ name, pass, detail: detail || '' })
  const tag = pass ? '✅' : '❌'
  console.log(`${tag} ${name}${detail ? '  -- ' + String(detail).slice(0, 200) : ''}`)
}

async function main() {
  const client = new Client({ connectionString: conn })
  await client.connect()

  let txStarted = false
  let restoreStatementTimeout = false

  try {
    // Step 0: discover real WALLiam IDs to use.
    console.log('=== STEP 0: discover real WALLiam IDs ===')
    const tenantRow = (await client.query(`
      SELECT id FROM tenants WHERE domain = 'walliam.ca' LIMIT 1;
    `)).rows[0]
    if (!tenantRow) throw new Error('WALLiam tenant not found by domain')
    const tenantId = tenantRow.id
    console.log('  WALLiam tenant:', tenantId)

    const agentRows = (await client.query(`
      SELECT id, full_name
      FROM agents
      WHERE tenant_id = $1 AND is_active = true AND is_selling = true
      ORDER BY created_at
      LIMIT 3;
    `, [tenantId])).rows
    if (agentRows.length < 2) {
      throw new Error(`Need ≥2 selling agents on WALLiam, found ${agentRows.length}`)
    }
    const agentA = agentRows[0]
    const agentB = agentRows[1]
    console.log('  Agent A:', agentA.full_name, agentA.id)
    console.log('  Agent B:', agentB.full_name, agentB.id)

    // Pick a real listing with no current pin and no card coverage (resolver should return NULL or geo-only).
    const listingRow = (await client.query(`
      SELECT id, listing_key, property_type, area_id, municipality_id, community_id, building_id
      FROM mls_listings
      WHERE assigned_agent_id IS NULL
        AND available_in_vow = true
        AND property_type IN ('Residential Condo & Other', 'Residential Freehold')
      ORDER BY id
      LIMIT 1;
    `)).rows[0]
    if (!listingRow) throw new Error('No suitable test listing found')
    const listingId = listingRow.id
    console.log('  Test listing:', listingRow.listing_key, listingId)

    // ========================================================================
    // Begin smoke transaction
    // ========================================================================
    console.log('')
    console.log('=== BEGIN smoke transaction (will ROLLBACK at end) ===')
    await client.query('BEGIN')
    txStarted = true

    // ------------------------------------------------------------------------
    // CHECK 1: schema — 4 new columns on ala
    // ------------------------------------------------------------------------
    const cols = (await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='agent_listing_assignments'
      ORDER BY column_name;
    `)).rows.map(r => r.column_name)
    const expected = ['is_active', 'deactivated_at', 'deactivated_by', 'pin_reason']
    const allPresent = expected.every(c => cols.includes(c))
    rec('1. ala has lifecycle columns (is_active, deactivated_at, deactivated_by, pin_reason)',
      allPresent, `present: ${expected.filter(c => cols.includes(c)).join(',')}`)

    // ------------------------------------------------------------------------
    // CHECK 2: old listing_id_key constraint dropped, uq_ala_listing dropped
    // ------------------------------------------------------------------------
    const oldConstraint = (await client.query(`
      SELECT 1 FROM pg_constraint
      WHERE conname = 'agent_listing_assignments_listing_id_key';
    `)).rows
    const oldIndex = (await client.query(`
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'uq_ala_listing' AND schemaname = 'public';
    `)).rows
    rec('2. Old listing_id_key constraint + uq_ala_listing index dropped',
      oldConstraint.length === 0 && oldIndex.length === 0,
      `constraint_exists=${oldConstraint.length} index_exists=${oldIndex.length}`)

    // ------------------------------------------------------------------------
    // CHECK 3: partial unique index uq_ala_listing_active exists
    // ------------------------------------------------------------------------
    const newIdx = (await client.query(`
      SELECT indexdef FROM pg_indexes
      WHERE indexname = 'uq_ala_listing_active' AND schemaname = 'public';
    `)).rows
    rec('3. uq_ala_listing_active partial unique index exists',
      newIdx.length === 1 && newIdx[0].indexdef.includes('WHERE') && newIdx[0].indexdef.includes('is_active'),
      newIdx[0]?.indexdef?.slice(0, 100))

    // ------------------------------------------------------------------------
    // CHECK 4: tac CHECK accepts 'pin_reactivated'
    // ------------------------------------------------------------------------
    const checkDef = (await client.query(`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conname = 'territory_assignment_changes_change_type_check';
    `)).rows[0]?.def || ''
    rec("4. tac change_type CHECK includes 'pin_reactivated'",
      checkDef.includes("'pin_reactivated'"))

    // ------------------------------------------------------------------------
    // CHECK 5: INSERT pin → 'pin_added' audit row + cache update
    // ------------------------------------------------------------------------
    const ins1 = (await client.query(`
      INSERT INTO agent_listing_assignments(agent_id, listing_id, assigned_by, pin_reason)
      VALUES ($1, $2, $3, 'P5 smoke test 1')
      RETURNING id, is_active;
    `, [agentA.id, listingId, agentA.id])).rows[0]
    rec('5a. Pin INSERT succeeded, is_active=true by default',
      ins1.is_active === true, `pin_id=${ins1.id}`)

    const auditAdded = (await client.query(`
      SELECT id FROM territory_assignment_changes
      WHERE scope = 'listing' AND scope_id = $1 AND change_type = 'pin_added'
      ORDER BY changed_at DESC LIMIT 1;
    `, [listingId])).rows
    rec("5b. 'pin_added' audit row written",
      auditAdded.length === 1, `audit_id=${auditAdded[0]?.id}`)

    // ------------------------------------------------------------------------
    // CHECK 6: cache (mls_listings.assigned_agent_id) updated to agentA
    // ------------------------------------------------------------------------
    const cacheAfterPin = (await client.query(`
      SELECT assigned_agent_id FROM mls_listings WHERE id = $1;
    `, [listingId])).rows[0]
    rec('6. mls_listings.assigned_agent_id = agentA after pin',
      cacheAfterPin.assigned_agent_id === agentA.id,
      `cache=${cacheAfterPin.assigned_agent_id?.slice(0, 8)} expected=${agentA.id.slice(0, 8)}`)

    // ------------------------------------------------------------------------
    // CHECK 7: Second active pin on same listing rejected (23505)
    // ------------------------------------------------------------------------
    let dup_err_code = null
    try {
      await client.query('SAVEPOINT before_dup')
      await client.query(`
        INSERT INTO agent_listing_assignments(agent_id, listing_id, assigned_by)
        VALUES ($1, $2, $3);
      `, [agentB.id, listingId, agentB.id])
      await client.query('RELEASE SAVEPOINT before_dup')
    } catch (e) {
      dup_err_code = e.code
      await client.query('ROLLBACK TO SAVEPOINT before_dup')
      await client.query('RELEASE SAVEPOINT before_dup')
    }
    rec('7. Duplicate active pin rejected with 23505 unique violation',
      dup_err_code === '23505', `error_code=${dup_err_code}`)

    // ------------------------------------------------------------------------
    // CHECK 8: UPDATE is_active=false → 'pin_removed' audit row
    // ------------------------------------------------------------------------
    await client.query(`
      UPDATE agent_listing_assignments
      SET is_active = false, deactivated_at = now(), deactivated_by = $1
      WHERE id = $2;
    `, [agentA.id, ins1.id])

    const auditRemoved = (await client.query(`
      SELECT id, change_type FROM territory_assignment_changes
      WHERE scope = 'listing' AND scope_id = $1 AND change_type = 'pin_removed'
      ORDER BY changed_at DESC LIMIT 1;
    `, [listingId])).rows
    rec("8. 'pin_removed' audit row written on soft-delete",
      auditRemoved.length === 1)

    // ------------------------------------------------------------------------
    // CHECK 9: Second pin INSERT now succeeds (first is inactive)
    // ------------------------------------------------------------------------
    const ins2 = (await client.query(`
      INSERT INTO agent_listing_assignments(agent_id, listing_id, assigned_by, pin_reason)
      VALUES ($1, $2, $3, 'P5 smoke test 2')
      RETURNING id;
    `, [agentB.id, listingId, agentB.id])).rows[0]
    rec('9. Second pin INSERT succeeds after first was deactivated',
      !!ins2.id, `new_pin_id=${ins2.id}`)

    // ------------------------------------------------------------------------
    // CHECK 10: cache re-resolves to agentB
    // ------------------------------------------------------------------------
    const cacheAfterSecond = (await client.query(`
      SELECT assigned_agent_id FROM mls_listings WHERE id = $1;
    `, [listingId])).rows[0]
    rec('10. Cache re-resolves to agentB after second pin',
      cacheAfterSecond.assigned_agent_id === agentB.id,
      `cache=${cacheAfterSecond.assigned_agent_id?.slice(0, 8)}`)

    // ------------------------------------------------------------------------
    // CHECK 11: Reactivating first pin while second is active fails (23505)
    // ------------------------------------------------------------------------
    let react_err_code = null
    try {
      await client.query('SAVEPOINT before_react')
      await client.query(`
        UPDATE agent_listing_assignments
        SET is_active = true, deactivated_at = NULL, deactivated_by = NULL
        WHERE id = $1;
      `, [ins1.id])
      await client.query('RELEASE SAVEPOINT before_react')
    } catch (e) {
      react_err_code = e.code
      await client.query('ROLLBACK TO SAVEPOINT before_react')
      await client.query('RELEASE SAVEPOINT before_react')
    }
    rec('11. Reactivating soft-deleted pin while another active pin exists rejected',
      react_err_code === '23505', `error_code=${react_err_code}`)

    // ------------------------------------------------------------------------
    // CHECK 12: Soft-delete second, reactivate first → 'pin_reactivated' audit
    // ------------------------------------------------------------------------
    await client.query(`
      UPDATE agent_listing_assignments
      SET is_active = false, deactivated_at = now(), deactivated_by = $1
      WHERE id = $2;
    `, [agentB.id, ins2.id])

    await client.query(`
      UPDATE agent_listing_assignments
      SET is_active = true, deactivated_at = NULL, deactivated_by = NULL
      WHERE id = $1;
    `, [ins1.id])

    const auditReact = (await client.query(`
      SELECT id, change_type FROM territory_assignment_changes
      WHERE scope = 'listing' AND scope_id = $1 AND change_type = 'pin_reactivated'
      ORDER BY changed_at DESC LIMIT 1;
    `, [listingId])).rows
    const cacheAfterReact = (await client.query(`
      SELECT assigned_agent_id FROM mls_listings WHERE id = $1;
    `, [listingId])).rows[0]
    rec("12. 'pin_reactivated' audit written + cache routes back to agentA",
      auditReact.length === 1 && cacheAfterReact.assigned_agent_id === agentA.id,
      `audit=${auditReact.length} cache=${cacheAfterReact.assigned_agent_id?.slice(0, 8)}`)

    // ------------------------------------------------------------------------
    // CHECK 13: Resolver respects is_active — deactivate ALL pins, resolver returns NULL or geo
    // ------------------------------------------------------------------------
    await client.query(`
      UPDATE agent_listing_assignments
      SET is_active = false, deactivated_at = now(), deactivated_by = $1
      WHERE listing_id = $2 AND is_active = true;
    `, [agentA.id, listingId])

    const resolverResult = (await client.query(`
      SELECT resolve_agent_for_context(
        $1::uuid, $2::uuid, NULL, $3::uuid, $4::uuid, $5::uuid, NULL, $6::uuid
      ) AS agent_id;
    `, [listingId, listingRow.building_id, listingRow.community_id, listingRow.municipality_id, listingRow.area_id, tenantId])).rows[0]

    // Resolver returns NULL or a geo-tier agent — must NOT return agentA (whose pin is inactive)
    // and must NOT return agentB (also inactive).
    const validResolve = resolverResult.agent_id !== agentA.id && resolverResult.agent_id !== agentB.id
    rec('13. After all pins inactive, resolver does NOT return either deactivated pin agent',
      validResolve, `resolver_returned=${resolverResult.agent_id?.slice(0, 8) || 'NULL'}`)

    // ------------------------------------------------------------------------
    // CHECK 14: P4 claim flow regression — INSERT with only 3 cols still works
    // ------------------------------------------------------------------------
    // Re-pin (must succeed because we just made all inactive). Use the minimal
    // shape that claim/route.ts writes (agent_id, listing_id, assigned_by).
    const claimIns = (await client.query(`
      INSERT INTO agent_listing_assignments(agent_id, listing_id, assigned_by)
      VALUES ($1, $2, $3)
      RETURNING id, is_active, pin_reason;
    `, [agentB.id, listingId, agentB.id])).rows[0]
    rec('14. P4 claim flow regression — INSERT with 3 cols works, defaults apply',
      claimIns.is_active === true && claimIns.pin_reason === null,
      `is_active=${claimIns.is_active} pin_reason=${claimIns.pin_reason}`)

    // ------------------------------------------------------------------------
    // CHECK 15: Cross-tenant trigger safety — verify the trigger writes
    //           the correct tenant_id (from the agent, not from a passed value)
    // ------------------------------------------------------------------------
    const lastAudit = (await client.query(`
      SELECT tenant_id FROM territory_assignment_changes
      WHERE scope = 'listing' AND scope_id = $1
      ORDER BY changed_at DESC LIMIT 1;
    `, [listingId])).rows[0]
    rec('15. Audit row tenant_id matches WALLiam (derived from agent)',
      lastAudit.tenant_id === tenantId,
      `audit_tenant=${lastAudit.tenant_id?.slice(0, 8)} expected=${tenantId.slice(0, 8)}`)

    // ------------------------------------------------------------------------
    // CHECK 16: Audit endpoint surfaces pin events (table-level test —
    //           confirms the existing audit-log endpoint will return them)
    // ------------------------------------------------------------------------
    const auditAll = (await client.query(`
      SELECT change_type, count(*) AS n
      FROM territory_assignment_changes
      WHERE scope = 'listing' AND scope_id = $1
      GROUP BY change_type;
    `, [listingId])).rows
    const seenTypes = new Set(auditAll.map(r => r.change_type))
    const hasAllThree = ['pin_added', 'pin_removed', 'pin_reactivated'].every(t => seenTypes.has(t))
    rec('16. All three pin change_types present in audit log for this listing',
      hasAllThree, `types=${[...seenTypes].join(',')}`)

    // ========================================================================
    // Always rollback the smoke transaction
    // ========================================================================
    console.log('')
    console.log('=== ROLLBACK smoke transaction ===')
    await client.query('ROLLBACK')
    txStarted = false
    console.log('ROLLBACK complete. Production state unchanged.')

    // Summary
    console.log('')
    const passed = checks.filter(c => c.pass).length
    const failed = checks.filter(c => !c.pass).length
    console.log(`=== SUMMARY: ${passed}/${checks.length} PASS, ${failed} FAIL ===`)
    if (failed > 0) {
      console.log('FAIL DETAILS:')
      for (const c of checks.filter(x => !x.pass)) {
        console.log(`  ❌ ${c.name}${c.detail ? ' -- ' + c.detail : ''}`)
      }
      process.exit(1)
    }
  } catch (err) {
    console.error('SMOKE ERROR:', err.message)
    if (txStarted) {
      try {
        await client.query('ROLLBACK')
        console.log('ROLLBACK complete on error.')
      } catch (_e) { /* swallow */ }
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()