// scripts/test-p-leads-fix.js
// P-LEADS-FIX SAVEPOINT-isolated test. BEGIN/ROLLBACK. NO lead persisted to prod.
//
// Asserts:
//   1. NEW wiring: (agent_id=King Shah, tenant_id=WALLiam) satisfies BOTH FKs.
//      Insert succeeds inside transaction → ROLLBACK.
//   2. OLD wiring: (agent_id=WALLiam tenant UUID, tenant_id=WALLiam) FK-rejects.
//   3. Email recipients resolution now returns King Shah (not empty).
//   4. False-submit fix: a simulated failed lead-write leaves leadSucceeded=false.
//   5. Mutation check: leads row count delta = 0 (savepoint rollback preserved).

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')

const KING_SHAH    = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'
const WALLIAM_TEN  = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

function dbCfg() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.DIRECT_URL
  if (!url) throw new Error('DATABASE_URL not in env')
  return { connectionString: url, ssl: { rejectUnauthorized: false } }
}

async function leadsCount(c) {
  const r = await c.query('SELECT COUNT(*) AS n FROM leads')
  return parseInt(r.rows[0].n, 10)
}

async function tryInsert(c, agentIdValue, label) {
  await c.query('SAVEPOINT sp')
  try {
    await c.query(
      `INSERT INTO leads (tenant_id, agent_id, contact_name, contact_email, source, status)
       VALUES ($1, $2, $3, $4, $5, 'new')`,
      [WALLIAM_TEN, agentIdValue, 'P-LEADS-FIX TEST (rollback)', 'test+p-leads-fix@example.invalid', 'estimator'],
    )
    await c.query('ROLLBACK TO SAVEPOINT sp')
    return { ok: true, label, value: agentIdValue }
  } catch (err) {
    await c.query('ROLLBACK TO SAVEPOINT sp')
    return { ok: false, label, value: agentIdValue, code: err.code, message: err.message, constraint: err.constraint }
  }
}

async function emailRecipientsProbe(c) {
  // Inline minimal mirror of getLeadEmailRecipients Layer 1 — find agent.email
  // for a given agent_id. The full helper resolves managers/etc up the chain;
  // this is the smoking-gun bit: with the new wiring, agent_id=King Shah
  // resolves to a real email; with the old wiring (tenant UUID) it returns null.
  const newWiring = await c.query(
    `SELECT id, email, full_name FROM agents WHERE id = $1`, [KING_SHAH],
  )
  const oldWiring = await c.query(
    `SELECT id, email, full_name FROM agents WHERE id = $1`, [WALLIAM_TEN],
  )
  return {
    newWiring_resolved: newWiring.rows[0] || null,
    oldWiring_resolved: oldWiring.rows[0] || null,
  }
}

function simulateFalseSubmitFix() {
  // Mirror the EstimatorResults.tsx fixed logic. If leadResult.success=false,
  // leadSucceeded stays false, setSubmitted is NOT called, setSubmitError IS.
  const cases = [
    { name: 'success path', leadResult: { success: true }                       },
    { name: 'reject path',  leadResult: { success: false, error: 'FK rejected' } },
    { name: 'throw path',   throws: true                                         },
  ]
  const results = []
  for (const tc of cases) {
    let leadSucceeded = false
    let submitError = null
    let submitted = false
    try {
      const leadResult = tc.throws ? (() => { throw new Error('exception') })() : tc.leadResult
      if (!leadResult.success) {
        submitError = leadResult.error || 'We could not submit your request right now. Please try again.'
      } else {
        leadSucceeded = true
      }
    } catch {
      submitError = 'We could not submit your request right now. Please try again.'
    }
    if (leadSucceeded) submitted = true
    results.push({ name: tc.name, leadSucceeded, submitted, submitError })
  }
  return results
}

(async () => {
  const c = new Client(dbCfg())
  await c.connect()
  console.log('[test] connected to PG')

  const before = await leadsCount(c)
  console.log(`[test] leads row count BEFORE: ${before}`)

  await c.query('BEGIN')
  console.log('\n=== Test 1+2: FK satisfaction (SAVEPOINT-isolated, rolled back) ===')
  const newWiring = await tryInsert(c, KING_SHAH, 'NEW wiring (King Shah agent_id)')
  console.log('NEW wiring →', newWiring)
  const oldWiring = await tryInsert(c, WALLIAM_TEN, 'OLD wiring (tenant UUID as agent_id)')
  console.log('OLD wiring →', oldWiring)
  await c.query('ROLLBACK')

  console.log('\n=== Test 3: Email recipient resolution (read-only) ===')
  const rec = await emailRecipientsProbe(c)
  console.log('NEW wiring resolves →', rec.newWiring_resolved)
  console.log('OLD wiring resolves →', rec.oldWiring_resolved)

  console.log('\n=== Test 4: false-submit fix (logic simulation) ===')
  const sim = simulateFalseSubmitFix()
  for (const r of sim) console.log(' ', r)

  console.log('\n=== Test 5: Mutation check ===')
  const after = await leadsCount(c)
  console.log(`leads row count AFTER:  ${after}`)
  console.log(`delta: ${after - before}`)

  await c.end()

  console.log('\n=== VERDICTS ===')
  const v1 = newWiring.ok === true
  const v2 = oldWiring.ok === false && (oldWiring.constraint === 'leads_agent_id_fkey' || oldWiring.constraint === 'leads_agent_tenant_consistency')
  const v3a = rec.newWiring_resolved && rec.newWiring_resolved.email === 'kingshahone@gmail.com'
  const v3b = rec.oldWiring_resolved === null
  const v4 = sim[0].submitted === true && sim[0].submitError === null
            && sim[1].submitted === false && sim[1].submitError !== null
            && sim[2].submitted === false && sim[2].submitError !== null
  const v5 = (after - before) === 0
  console.log(`1 NEW wiring satisfies BOTH FKs:       ${v1 ? 'PASS' : 'FAIL'}`)
  console.log(`2 OLD wiring FK-rejects (constraint):  ${v2 ? 'PASS' : 'FAIL'}  ${oldWiring.constraint || ''}`)
  console.log(`3a Recipients resolve King Shah email: ${v3a ? 'PASS' : 'FAIL'}`)
  console.log(`3b Recipients of OLD wiring are empty: ${v3b ? 'PASS' : 'FAIL'}`)
  console.log(`4 False-submit fix (sim):              ${v4 ? 'PASS' : 'FAIL'}`)
  console.log(`5 Mutation delta = 0:                  ${v5 ? 'PASS' : 'FAIL'}`)
  const all = v1 && v2 && v3a && v3b && v4 && v5
  console.log(`\nOVERALL: ${all ? 'PASS' : 'FAIL'}`)
  process.exit(all ? 0 : 1)
})().catch(e => { console.error('[test] failed:', e); process.exit(2) })
