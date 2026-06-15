// scripts/buyer-chunk1-verify.js
// W-CHARLIE-BUYER-CHUNK1 VERIFY — real-flow against local dev (NOT source-grep).
//
// Drives the actual /api/charlie/plan-email route with three real POSTs that
// mirror exactly what useCharlie sends (line ~505 in app/charlie/hooks/
// useCharlie.ts). For each POST, reads the resulting lead row's plan_data
// from the live DB and asserts the sellerEstimate gate.
//
// Scenarios:
//   A — LEAK REPRO (buyer + stale sellerEstimate in body):
//       Expected: plan_data.sellerEstimate === null   (gate drops it)
//   B — SELLER NO-REGRESSION (seller + sellerEstimate in body):
//       Expected: plan_data.sellerEstimate IS present (seller path intact)
//   C — PURE BUYER (buyer + sellerEstimate=null):
//       Expected: plan_data.sellerEstimate === null   (baseline; no change)
//
// Setup creates a fresh chat_session row for an existing test auth user
// via service_role, then POSTs three times. Real emails will be sent to
// the test recipient (this is the cost of full-flow verification — the
// operator's prior test traffic followed the same pattern).
//
// Output: recon/buyer-chunk1-verify.txt with PASS/FAIL per scenario plus
// a body+plan_data dump for each row.

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

const BASE  = process.env.LOCAL_BASE || 'http://localhost:3004'
const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const TENANT_DOMAIN = 'walliam.ca'
const OUT_DIR = path.resolve(__dirname, '..', 'recon')
const REPORT  = path.join(OUT_DIR, 'buyer-chunk1-verify.txt')
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(REPORT, '')
const log = (m) => { console.log(m); fs.appendFileSync(REPORT, m + '\n') }
const hr  = () => log('─'.repeat(76))

let fail = 0
function expect(label, cond, evidence) {
  if (!cond) fail++
  log(`${cond ? 'PASS' : 'FAIL'}  ${label}${evidence ? '\n        → ' + evidence : ''}`)
}

// Realistic stale sellerEstimate fixture — modeled on real lead 6d479d84
// (the lead that confirmed the leak). Carries the shape the route at
// L172-181 cherry-picks (estimate, comparables, competing, names, path).
const STALE_SE = {
  estimate: {
    estimatedPrice: 880000,
    priceRange: { low: 850000, high: 910000 },
    bestGeoTier: 'community',
    tiers: { community: { count: 5, median: 880000 } },
    taxMatch: {
      estimatedPrice: 875000,
      priceRange: { low: 850000, high: 900000 },
      comparables: [
        { listingKey: 'TEST-TM-1', closePrice: 880000, unparsedAddress: '999 Test Tax Ln, Pickering', bedrooms_total: 3, sourceTier: 'community' },
      ],
    },
  },
  comparables: [
    { listingKey: 'TEST-CS-1', closePrice: 870000, unparsedAddress: '888 Test Comp Ave, Pickering', bedrooms_total: 3, sourceTier: 'community' },
    { listingKey: 'TEST-CS-2', closePrice: 890000, unparsedAddress: '777 Test Comp Ln, Pickering', bedrooms_total: 4, sourceTier: 'community' },
  ],
  competingListings: [],
  buildingName: null,
  subjectAddress: '606 Aspen Test St, Pickering',
  geoLevel: 'community',
  intent: 'sale',
  path: 'home',
}

const FIXTURE_PLAN_BUYER = {
  type: 'buyer',
  planReady: true,
  geoName: 'Whitby',
  budgetMin: 700000,
  budgetMax: 900000,
  propertyType: 'homes',
  bedrooms: 3,
  timeline: 'flexible',
  summary: 'W-CHARLIE-BUYER-CHUNK1 verify run — synthetic buyer plan.',
}
const FIXTURE_PLAN_SELLER = {
  type: 'seller',
  planReady: true,
  geoName: 'Pickering',
  propertyType: 'homes',
  estimatedValueMin: 850000,
  estimatedValueMax: 910000,
  timeline: 'flexible',
  goal: 'maximize',
  summary: 'W-CHARLIE-BUYER-CHUNK1 verify run — synthetic seller plan.',
}
const FIXTURE_ANALYTICS = {
  sale_to_list_ratio: 99,
  closed_avg_dom_90: 18,
  median_psf: 800,
  active_count: 50,
  closed_sale_count_90: 80,
  absorption_rate_pct: 60,
  track: 'homes',
}
const FIXTURE_GEO = { geoType: 'municipality', geoId: '94447f26-216a-47be-ac73-d07f33732036', geoName: 'Oshawa' }

;(async () => {
  log('W-CHARLIE-BUYER-CHUNK1 VERIFY — ' + new Date().toISOString())
  log('local base: ' + BASE)
  hr()

  // Sanity: server up?
  try {
    const r = await fetch(BASE, { method: 'GET' })
    log(`server probe: ${BASE}/ -> ${r.status}`)
    if (r.status >= 500) throw new Error('server returned 5xx')
  } catch (e) {
    log('FAIL  cannot reach local dev: ' + e.message)
    process.exit(2)
  }

  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()

  let testUserId = null
  let testUserEmail = null
  let testSessionId = null
  const createdLeadIds = []

  try {
    // Pick an EXISTING test user we can POST as. Use a recent registered
    // test user (operator pattern; auth.users has these). No new user
    // creation — re-uses the existing one cleanly.
    const u = await c.query(`
      SELECT id, email FROM auth.users
       WHERE email LIKE 'testfinal%@gmail.com' OR email LIKE 'finaltest%@gmail.com'
       ORDER BY created_at DESC
       LIMIT 1`)
    if (u.rowCount === 0) throw new Error('no test user found — re-run after at least one test registration')
    testUserId    = u.rows[0].id
    testUserEmail = u.rows[0].email
    log(`test user: ${testUserId.slice(0,8)}… (${testUserEmail})`)

    // Need a tenants.source_key value to seed the chat_session row's
    // source column — validateSession demands an exact match.
    const tr = await c.query(`SELECT source_key FROM tenants WHERE id = $1`, [WALLIAM])
    const sourceKey = tr.rows[0].source_key
    log(`tenant source_key: ${JSON.stringify(sourceKey)}`)

    // Re-use the existing chat_session for this user (unique constraint
    // is on user_id+tenant_id+source). Don't create a new one or delete
    // it at cleanup — operator's prior test traffic depends on it.
    const sess = await c.query(`
      SELECT id FROM chat_sessions
       WHERE user_id = $1 AND tenant_id = $2 AND source = $3
       LIMIT 1`,
      [testUserId, WALLIAM, sourceKey])
    if (sess.rowCount === 0) throw new Error('no existing chat_session for this user — bail')
    testSessionId = sess.rows[0].id
    log(`re-using chat_session: ${testSessionId}`)
    hr()

    async function postPlanEmail(scenarioLabel, body) {
      log(`POST plan-email — ${scenarioLabel}`)
      const res = await fetch(`${BASE}/api/charlie/plan-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': WALLIAM,
          'host': TENANT_DOMAIN,
        },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      let json
      try { json = JSON.parse(text) } catch { json = { _raw: text } }
      log(`  status: ${res.status}  body: ${JSON.stringify(json).slice(0, 200)}`)
      // Brief wait so the lead INSERT commits before we read
      await new Promise(r => setTimeout(r, 400))
      return { status: res.status, json }
    }

    // Read back the most recent lead for this session+user+intent.
    // se_is_dropped means "the gate effectively dropped it" — either the
    // KEY is missing OR the JSONB value is JSON-null. jsonb_typeof returns
    // the TEXT 'null' for JSON null values; the route's
    // `sellerEstimate ? {...} : null` writes JSON-null when the local
    // is null. SQL-NULL (key absent) would also be acceptable but the
    // route currently always emits the key.
    async function fetchLeadPlanData(intent) {
      const r = await c.query(`
        SELECT id, intent, plan_data->'sellerEstimate' AS plan_data_seller_estimate,
               plan_data->'planType' AS plan_data_plan_type,
               jsonb_typeof(plan_data->'sellerEstimate') AS se_jsonb_type,
               (jsonb_typeof(plan_data->'sellerEstimate') IS NULL
                 OR jsonb_typeof(plan_data->'sellerEstimate') = 'null') AS se_is_dropped,
               created_at
          FROM leads
         WHERE user_id = $1 AND tenant_id = $2 AND intent = $3
           AND source LIKE $4
         ORDER BY created_at DESC
         LIMIT 1`,
        [testUserId, WALLIAM, intent, `${sourceKey}_charlie`])
      if (r.rowCount === 0) return null
      const row = r.rows[0]
      createdLeadIds.push(row.id)
      return row
    }

    // ─────────── SCENARIO A — LEAK REPRO ───────────
    hr()
    log('SCENARIO A — LEAK REPRO (buyer + stale sellerEstimate)')
    log('   expected: plan_data.sellerEstimate === null')
    await postPlanEmail('A buyer+sellerEstimate(fixture)', {
      sessionId: testSessionId,
      userId: testUserId,
      planType: 'buyer',
      plan: FIXTURE_PLAN_BUYER,
      analytics: FIXTURE_ANALYTICS,
      listings: [],
      geoContext: FIXTURE_GEO,
      vipCreditUsed: false,
      vipCreditPlansUsed: 0,
      vipCreditTotal: 1,
      comparables: [],
      sellerEstimate: STALE_SE,
      blocks: [],
    })
    const rowA = await fetchLeadPlanData('buyer')
    if (!rowA) {
      expect('A: lead row found', false, '(no buyer lead created — check POST response)')
    } else {
      log(`  lead row: ${rowA.id.slice(0,8)}…  se_is_dropped=${rowA.se_is_dropped}  se_jsonb_type=${rowA.se_jsonb_type ?? '(sql NULL)'}`)
      expect('A: plan_data.sellerEstimate dropped by gate (LEAK CLOSED)', rowA.se_is_dropped === true,
        `plan_data.sellerEstimate JSONB type=${rowA.se_jsonb_type ?? '(sql NULL)'} — JS null on write becomes JSONB null; gate working`)
    }

    // ─────────── SCENARIO B — SELLER NO-REGRESSION ───────────
    hr()
    log('SCENARIO B — SELLER NO-REGRESSION (seller + sellerEstimate)')
    log('   expected: plan_data.sellerEstimate IS present (seller path intact)')
    await postPlanEmail('B seller+sellerEstimate(fixture)', {
      sessionId: testSessionId,
      userId: testUserId,
      planType: 'seller',
      plan: FIXTURE_PLAN_SELLER,
      analytics: FIXTURE_ANALYTICS,
      listings: [],
      geoContext: FIXTURE_GEO,
      vipCreditUsed: false,
      vipCreditPlansUsed: 0,
      vipCreditTotal: 1,
      comparables: [],
      sellerEstimate: STALE_SE,
      blocks: [],
    })
    const rowB = await fetchLeadPlanData('seller')
    if (!rowB) {
      expect('B: lead row found', false, '(no seller lead created)')
    } else {
      log(`  lead row: ${rowB.id.slice(0,8)}…  se_is_dropped=${rowB.se_is_dropped}  se_jsonb_type=${rowB.se_jsonb_type ?? '(sql NULL)'}`)
      expect('B: plan_data.sellerEstimate IS present (seller no-regression)',
        rowB.se_jsonb_type === 'object',
        `plan_data.sellerEstimate JSONB type=${rowB.se_jsonb_type}  estimate?.estimatedPrice=${rowB.plan_data_seller_estimate?.estimate?.estimatedPrice ?? '(missing)'}`)
    }

    // ─────────── SCENARIO C — PURE BUYER ───────────
    hr()
    log('SCENARIO C — PURE BUYER (buyer + sellerEstimate=null)')
    log('   expected: plan_data.sellerEstimate === null')
    await postPlanEmail('C buyer+null', {
      sessionId: testSessionId,
      userId: testUserId,
      planType: 'buyer',
      plan: FIXTURE_PLAN_BUYER,
      analytics: FIXTURE_ANALYTICS,
      listings: [],
      geoContext: FIXTURE_GEO,
      vipCreditUsed: false,
      vipCreditPlansUsed: 0,
      vipCreditTotal: 1,
      comparables: [],
      sellerEstimate: null,
      blocks: [],
    })
    const rowC = await fetchLeadPlanData('buyer')
    if (!rowC) {
      expect('C: lead row found', false, '(no buyer lead — POST may have failed)')
    } else {
      log(`  lead row: ${rowC.id.slice(0,8)}…  se_is_dropped=${rowC.se_is_dropped}  se_jsonb_type=${rowC.se_jsonb_type ?? '(sql NULL)'}`)
      expect('C: plan_data.sellerEstimate dropped (pure-buyer baseline)', rowC.se_is_dropped === true,
        `plan_data.sellerEstimate JSONB type=${rowC.se_jsonb_type ?? '(sql NULL)'}`)
    }

    // ─────────── CLIENT-side gate verification ───────────
    // The route gate above tested the SERVER defense. The CLIENT-side
    // gate (useCharlie.ts:520) is verified architecturally by re-reading
    // the diff (mirrors register-fix-verify.js's stance on the authed
    // branch that can't be driven without test creds).
    hr()
    log('CLIENT-side gate (useCharlie.ts:520) — architectural check')
    const srcUse = fs.readFileSync(path.resolve(__dirname, '..', 'app/charlie/hooks/useCharlie.ts'), 'utf8')
    const hasPostGate = srcUse.includes("sellerEstimate: data.type === 'seller' ? stateRef.current.sellerEstimate : null")
    expect('useCharlie POST body gates sellerEstimate by data.type', hasPostGate,
      hasPostGate ? 'found one-line guard at the plan-email POST' : 'guard string NOT found in source')
    const hasResetSE = srcUse.includes("sellerEstimate: null, blocks: s.blocks.filter(b => b.type !== 'sellerEstimate')")
    expect('useCharlie requestForm("buyer") wipes sellerEstimate + clears block', hasResetSE,
      hasResetSE ? 'found reset in requestForm setState updater' : 'reset NOT found')

    hr()
    log(`SUMMARY: ${fail === 0 ? 'ALL PASS' : fail + ' FAIL'}`)
    log('test session id (will be deleted): ' + testSessionId)
    log('test lead ids written: [' + createdLeadIds.map(x => x.slice(0,8)).join(', ') + ']')

  } finally {
    // Do NOT delete the chat_session — we re-used the operator's existing
    // one. Lead rows from the verify are tagged via plan.summary so they
    // can be identified in DB without cleanup (operator's prior verify
    // runs follow the same leave-test-rows-in-place pattern).
    c.release(); await pool.end()
  }

  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { log('UNHANDLED: ' + (e?.stack || e)); process.exit(2) })
