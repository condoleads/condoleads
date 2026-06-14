// scripts/charlie-email-fix-verify.js
// W-CHARLIE-EMAIL-FIX STEP 2 — real-render verify.
// Renders the email builder against TWO real leads (SAVEPOINT read):
//   63b48f13 (10 tax-comps) — populated path; must remain BYTE-IDENTICAL
//                              vs the pre-fix recon render
//                              (recon/real-email-render-63b48f13.html)
//   1b2a5b50 (0 tax-comps)  — empty-state path; must NOW render the
//                              Tax-Matched header + honest empty-state
//                              line (previously silent-omitted)
//
// Asserts from rendered HTML, NOT source-grep.

require('tsx/cjs')
const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const OUT = path.resolve(__dirname, '..', 'recon', 'REAL-EMAIL-FIX-VERIFY.txt')
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, '')
const log = (m) => { console.log(m); fs.appendFileSync(OUT, m + '\n') }
const hr = () => log('─'.repeat(76))

const { buildRichPlanEmail } = require('../lib/email/charlie-plan-email-html.ts')

function renderFor(lead) {
  const pd = lead.plan_data || {}
  return buildRichPlanEmail({
    userName:        lead.contact_name || 'there',
    userEmail:       lead.contact_email || 'test@test.com',
    planType:        pd.planType,
    plan:            pd.plan,
    analytics:       pd.analytics,
    listings:        [],
    agent:           null,
    geoName:         pd.plan?.geoName || null,
    comparables:     [],
    sellerEstimate:  pd.sellerEstimate || null,
    vipCreditUsed:   false,
    vipCreditPlansUsed: 0,
    vipCreditTotal:  1,
    blocks:          [],
    brandName:       'WALLiam',
    domain:          'walliam.ca',
    baseUrl:         'https://www.walliam.ca',
    sourceUrl:       null,
  })
}

function sha12(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 12) }

;(async () => {
  log('W-CHARLIE-EMAIL-FIX STEP 2 — real-render verify')
  log(`run: ${new Date().toISOString()}`)
  log('handle: live buildRichPlanEmail (post-fix) + tsx/cjs, real plan_data from prod DB')
  log('')

  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  let lead63, lead1b
  try {
    await c.query('BEGIN'); await c.query('SAVEPOINT s1'); await c.query("SET LOCAL statement_timeout = 0")
    const r1 = await c.query(`SELECT id, contact_name, contact_email, plan_data, created_at FROM leads WHERE id = $1`,
      ['63b48f13-8a03-46be-b4ce-91007da0794a'])
    lead63 = r1.rows[0]
    const r2 = await c.query(`SELECT id, contact_name, contact_email, plan_data, created_at FROM leads WHERE id::text LIKE '1b2a5b50%' LIMIT 1`)
    lead1b = r2.rows[0]
    await c.query('ROLLBACK')
  } finally { c.release(); await pool.end() }

  hr(); log('PART 1 — POPULATED PATH (63b48f13, 10 tax-comps)'); hr()
  const html63 = renderFor(lead63)
  const out63 = path.resolve(__dirname, '..', 'recon', 'real-email-fix-render-63b48f13.html')
  fs.writeFileSync(out63, html63)
  log(`  rendered: ${html63.length} chars → ${out63}`)
  log(`  SHA12: ${sha12(html63)}`)

  // Byte-identical against the pre-fix recon render
  const preFixPath = path.resolve(__dirname, '..', 'recon', 'real-email-render-63b48f13.html')
  let preFixOk = false
  if (fs.existsSync(preFixPath)) {
    const preFix = fs.readFileSync(preFixPath, 'utf8')
    const preFixSha = sha12(preFix)
    const sameSha = preFixSha === sha12(html63)
    log(`  pre-fix recon SHA12:           ${preFixSha}`)
    log(`  populated-path byte-identical? ${sameSha ? 'PASS' : 'FAIL — DIFF (see below)'}`)
    if (!sameSha) {
      // Show first diff char position
      let i = 0
      while (i < Math.min(preFix.length, html63.length) && preFix[i] === html63[i]) i++
      log(`  first diff at char ${i}:`)
      log(`    pre-fix : ${JSON.stringify(preFix.slice(Math.max(0, i-30), i+60))}`)
      log(`    post-fix: ${JSON.stringify(html63.slice(Math.max(0, i-30), i+60))}`)
    }
    preFixOk = sameSha
  } else {
    log(`  WARN: pre-fix render not found at ${preFixPath} — recon may have been moved`)
  }

  // Sectional assertions (the must-still-be-there set)
  const probes63 = [
    ['Tax-Matched (10)',          /Tax-Matched \(10\)/],
    ['Tax-matched estimate pill', /Tax-matched estimate/],
    ['Tier rail',                 /Confidence by Area/],
    ['Price card',                /Estimated Value/],
    ['Comparable Sold',           /Comparable Sold \(5\)/],
    ['Competing For Sale',        /Competing For Sale/],
    ['no empty-state on populated', /No tax-matched comparables for this property/],
  ]
  log('')
  log('  populated-section probes:')
  log('  ' + '-'.repeat(72))
  let fail = 0
  for (const [name, re] of probes63) {
    const m = html63.match(re)
    const expectPresent = !name.startsWith('no ')
    const present = !!m
    const ok = present === expectPresent
    if (!ok) fail++
    log(`  ${name.padEnd(36)} ${ok ? 'PASS' : 'FAIL'} (${present ? 'present' : 'absent'})`)
  }
  // shape checks
  const condoleadsHrefs = (html63.match(/href="[^"]*condoleads\.ca/g) || []).length
  const walliamHrefs    = (html63.match(/href="https:\/\/www\.walliam\.ca/g) || []).length
  log(`  walliam.ca hrefs:            ${walliamHrefs}  → ${walliamHrefs > 0 ? 'PASS' : 'FAIL'}`)
  log(`  condoleads.ca leak count:    ${condoleadsHrefs}  → ${condoleadsHrefs === 0 ? 'PASS' : 'FAIL'}`)
  if (condoleadsHrefs > 0) fail++
  const undefStr = (html63.match(/undefined|NaN|\$0(?!\d)/g) || []).length
  log(`  undefined/NaN/$0 leaks:      ${undefStr}  → ${undefStr === 0 ? 'PASS' : 'FAIL'}`)
  if (undefStr > 0) fail++
  if (!preFixOk) fail++

  hr(); log('PART 2 — EMPTY-STATE PATH (1b2a5b50, 0 tax-comps)'); hr()
  const html1b = renderFor(lead1b)
  const out1b = path.resolve(__dirname, '..', 'recon', 'real-email-fix-render-1b2a5b50.html')
  fs.writeFileSync(out1b, html1b)
  log(`  rendered: ${html1b.length} chars → ${out1b}`)

  const probes1b = [
    ['Tax-Matched (0) header NOW renders',  /Tax-Matched \(0\)/, true],
    ['Empty-state honest line NOW renders',  /No tax-matched comparables for this property/, true],
    ['Tax-matched estimate pill ABSENT',     /Tax-matched estimate/, false],
    ['No tile section header creep',         /Same-municipality sales with similar property tax/, true],
    // Preservation
    ['Tier rail still present',              /Confidence by Area/, true],
    ['Price card still present',             /Estimated Value/, true],
    ['Comparable Sold still present',        /Comparable Sold \(\d+\)/, true],
    ['Competing For Sale still present',     /Competing For Sale/, true],
  ]
  log('')
  log('  empty-state + preservation probes:')
  log('  ' + '-'.repeat(72))
  for (const [name, re, expectPresent] of probes1b) {
    const present = re.test(html1b)
    const ok = present === expectPresent
    if (!ok) fail++
    log(`  ${name.padEnd(40)} ${ok ? 'PASS' : 'FAIL'} (${present ? 'present' : 'absent'})`)
  }

  // shape checks on 1b2a5b50
  const condoleadsHrefs1 = (html1b.match(/href="[^"]*condoleads\.ca/g) || []).length
  const walliamHrefs1    = (html1b.match(/href="https:\/\/www\.walliam\.ca/g) || []).length
  const undef1           = (html1b.match(/undefined|NaN|\$0(?!\d)/g) || []).length
  log(`  walliam.ca hrefs:            ${walliamHrefs1}  → ${walliamHrefs1 > 0 ? 'PASS' : 'FAIL'}`)
  log(`  condoleads.ca leak count:    ${condoleadsHrefs1}  → ${condoleadsHrefs1 === 0 ? 'PASS' : 'FAIL'}`)
  log(`  undefined/NaN/$0 leaks:      ${undef1}  → ${undef1 === 0 ? 'PASS' : 'FAIL'}`)
  if (condoleadsHrefs1 > 0 || undef1 > 0) fail++

  hr(); log('FINAL VERDICT'); hr()
  log(`${fail === 0 ? 'PASS' : 'FAIL'}  ${fail} assertion failure(s) across both leads`)
  log('')
  log('Files:')
  log(`  ${OUT}`)
  log(`  ${out63}`)
  log(`  ${out1b}`)
})().catch(e => { log('CRASH: ' + e.stack); process.exit(1) })
