#!/usr/bin/env node
/**
 * patch-smoke-t3c-fixture-lead-origin-route.js
 *
 * Fixes tier 7 smoke regression caused by F9.P2/F9.P3 in patch-t6b-wire v2.
 *
 * Background:
 *   - F9.P2/F9.P3 changed vip-questionnaire's existing-lead lookup from
 *     `.like('source', 'walliam_estimator%')` (broken multitenant) to
 *     `.eq('lead_origin_route', 'estimator_vip_request')` (correct,
 *     indexed, tenant-agnostic). This is the proper fix for
 *     F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER.
 *   - In production, leads created via the vip-request route are wired by
 *     F10.P1 to set lead_origin_route = 'estimator_vip_request', so the
 *     new lookup finds them.
 *   - The smoke harness creates tier 7's "pre-existing lead" fixture via
 *     direct supabase.from('leads').insert (in fxInsertLead at line 149).
 *     This INSERT bypasses the route wire, so lead_origin_route defaults
 *     to 'unknown'. The new lookup misses, route falls through to F9.P1
 *     defensive INSERT, creates an orphan walliam_estimator_questionnaire
 *     lead, emails fire on the orphan, smoke checks fixture's audit rows,
 *     finds 0 -> FAIL.
 *
 * Fix (two files, atomic):
 *
 *   P1. scripts/smoke-t3c.js (CRLF):
 *       - Insert deriveLeadOriginRoute JS mirror before fxInsertLead.
 *       - Wire fxInsertLead's INSERT to call it on the source param.
 *
 *   P2. lib/utils/lead-origin-route.ts (LF):
 *       - Update IMPORTANT comment to acknowledge the JS mirror as the
 *         third source of truth alongside the SQL CASE.
 *
 * Atomic: validates all 4 anchors before any write. Per-file LE preserved.
 * Backups on both modified files.
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

// ============================================================================
// Line-ending-aware IO
// ============================================================================

function readFileLF(p) {
  const raw = fs.readFileSync(path.resolve(ROOT, p), 'utf8')
  const usesCRLF = /\r\n/.test(raw)
  const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw
  return { content, usesCRLF }
}

function writeFilePreserveLE(p, contentLF, usesCRLF) {
  const out = usesCRLF ? contentLF.replace(/\n/g, '\r\n') : contentLF
  fs.writeFileSync(path.resolve(ROOT, p), out, 'utf8')
}

function exists(p) { try { fs.accessSync(p); return true } catch { return false } }
function countOccurrences(text, needle) { return text.split(needle).length - 1 }

// ============================================================================
// Targets
// ============================================================================

const F_SMOKE = 'scripts/smoke-t3c.js'
const F_TS_HELPER = 'lib/utils/lead-origin-route.ts'

// ============================================================================
// P1: smoke-t3c.js — insert deriveLeadOriginRoute helper before fxInsertLead
// ============================================================================

const HELPER_FN_LINES = [
  '// Mirrors lib/utils/lead-origin-route.ts deriveLeadOriginRoute (and the SQL',
  '// CASE at supabase/migrations/20260510_t2c_lead_origin_route.sql). If the',
  '// controlled vocabulary changes, update all three sites in lockstep.',
  'function deriveLeadOriginRoute(source) {',
  "  if (!source) return 'unknown'",
  "  if (/_charlie_vip_request$/.test(source)) return 'charlie_vip_request'",
  "  if (/_estimator_vip_request$/.test(source)) return 'estimator_vip_request'",
  "  if (/_estimator_questionnaire$/.test(source)) return 'estimator_questionnaire'",
  "  if (/_estimator/.test(source)) return 'estimator'",
  "  if (/_charlie$/.test(source)) return 'charlie'",
  "  if (/_contact$/.test(source)) return 'contact_form'",
  "  if (source === 'contact_form' || source === 'message_agent' || source === 'building_page') return 'contact_form'",
  "  if (source === 'estimator') return 'estimator'",
  "  if (source === 'registration') return 'registration'",
  "  if (source === 'property_inquiry') return 'property_inquiry'",
  "  if (source === 'building_visit_request') return 'building_visit'",
  "  if (source === 'sale_evaluation_request') return 'sale_evaluation'",
  "  return 'unknown'",
  '}',
  '',
]
const HELPER_FN = HELPER_FN_LINES.join('\n')

const P1_OLD = "async function fxInsertLead({ tenantId, userId, agentId, contactName, contactEmail, source }) {"
const P1_NEW = HELPER_FN + P1_OLD

// ============================================================================
// P2: smoke-t3c.js — wire lead_origin_route into fxInsertLead's INSERT
// ============================================================================

const P2_OLD = [
  "    source,",
  "    status: 'new',",
].join('\n')

const P2_NEW = [
  "    source,",
  "    lead_origin_route: deriveLeadOriginRoute(source),",
  "    status: 'new',",
].join('\n')

// ============================================================================
// P3: lib/utils/lead-origin-route.ts — update IMPORTANT comment
// ============================================================================

const P3_OLD = [
  ' * IMPORTANT: if the controlled vocabulary changes, update both this file',
  ' * AND the SQL CASE in the migration. Otherwise the TS path and the SQL',
  ' * backfill path will produce different values for the same source string.',
].join('\n')

const P3_NEW = [
  ' * IMPORTANT: if the controlled vocabulary changes, update three sites in',
  ' * lockstep: this file, the SQL CASE in',
  ' * supabase/migrations/20260510_t2c_lead_origin_route.sql, AND the JS mirror',
  ' * deriveLeadOriginRoute at the top of scripts/smoke-t3c.js. Otherwise the',
  ' * TS path, SQL backfill path, and test fixture path will produce different',
  ' * values for the same source string.',
].join('\n')

// ============================================================================
// Atomic validation
// ============================================================================

const errors = []

if (!exists(path.resolve(ROOT, F_SMOKE))) {
  errors.push('file not found: ' + F_SMOKE)
}
if (!exists(path.resolve(ROOT, F_TS_HELPER))) {
  errors.push('file not found: ' + F_TS_HELPER)
}

let smoke = null
let helper = null

if (errors.length === 0) {
  smoke = readFileLF(F_SMOKE)
  helper = readFileLF(F_TS_HELPER)

  const c1 = countOccurrences(smoke.content, P1_OLD)
  if (c1 !== 1) errors.push(`P1 (fxInsertLead signature in ${F_SMOKE}): expected 1 match, found ${c1}`)

  const c2 = countOccurrences(smoke.content, P2_OLD)
  if (c2 !== 1) errors.push(`P2 (source,/status:'new', in ${F_SMOKE}): expected 1 match, found ${c2}`)

  const c3 = countOccurrences(helper.content, P3_OLD)
  if (c3 !== 1) errors.push(`P3 (IMPORTANT comment in ${F_TS_HELPER}): expected 1 match, found ${c3}`)

  // Re-run guards
  if (smoke.content.includes('function deriveLeadOriginRoute')) {
    errors.push(`P1: deriveLeadOriginRoute already defined in ${F_SMOKE} (re-run after partial state?)`)
  }
  if (smoke.content.includes('lead_origin_route: deriveLeadOriginRoute(source)')) {
    errors.push(`P2: fxInsertLead INSERT already wired (re-run after partial state?)`)
  }
  if (helper.content.includes('JS mirror')) {
    errors.push(`P3: docstring already mentions JS mirror (re-run after partial state?)`)
  }
}

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('All 3 anchors validated. Per-file line endings:')
console.log('  ' + F_SMOKE + ': ' + (smoke.usesCRLF ? 'CRLF' : 'LF'))
console.log('  ' + F_TS_HELPER + ': ' + (helper.usesCRLF ? 'CRLF' : 'LF'))

// ============================================================================
// Backup + write
// ============================================================================

const ts = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  ts.getFullYear() +
  pad(ts.getMonth() + 1) +
  pad(ts.getDate()) +
  '_' +
  pad(ts.getHours()) +
  pad(ts.getMinutes()) +
  pad(ts.getSeconds())

console.log(`\nBackup suffix: .backup_${stamp}\n`)

// Backups (copy raw on-disk bytes — preserves original LE)
for (const f of [F_SMOKE, F_TS_HELPER]) {
  const absSrc = path.resolve(ROOT, f)
  const absBackup = absSrc + '.backup_' + stamp
  fs.copyFileSync(absSrc, absBackup)
  console.log('  backup: ' + path.basename(absBackup) + '  (' + f + ')')
}

// Apply in memory (LF content)
let smokeNew = smoke.content.replace(P1_OLD, P1_NEW)
smokeNew = smokeNew.replace(P2_OLD, P2_NEW)
const helperNew = helper.content.replace(P3_OLD, P3_NEW)

// Write with original LE preserved per file
writeFilePreserveLE(F_SMOKE, smokeNew, smoke.usesCRLF)
console.log('  wrote: ' + F_SMOKE + ' (' + (smoke.usesCRLF ? 'CRLF' : 'LF') + ')')

writeFilePreserveLE(F_TS_HELPER, helperNew, helper.usesCRLF)
console.log('  wrote: ' + F_TS_HELPER + ' (' + (helper.usesCRLF ? 'CRLF' : 'LF') + ')')

console.log('')
console.log('Applied: deriveLeadOriginRoute JS mirror + fxInsertLead wire + TS docstring update.')
console.log('')
console.log('Next steps:')
console.log('  1. npx tsc --noEmit')
console.log('  2. Verify backfill SQL has been applied (paste in Supabase, separate from any other SQL):')
console.log('       SELECT lead_origin_route, source, COUNT(*) FROM leads GROUP BY 1, 2 ORDER BY 3 DESC;')
console.log("     Expected: walliam_charlie -> charlie, walliam_charlie_vip_request -> charlie_vip_request,")
console.log("               walliam_estimator_vip_request -> estimator_vip_request (no longer 'unknown').")
console.log('  3. Re-run BOTH smoke harnesses (no regression check):')
console.log('       node scripts/smoke-t3b.js')
console.log('       node scripts/smoke-t3c.js')
console.log('     Expected: ALL TIERS GREEN including tier 7.')
console.log('  4. Final fresh-insert verify (paste in Supabase):')
console.log("       SELECT lead_origin_route, source, COUNT(*) FROM leads")
console.log("         WHERE created_at > NOW() - INTERVAL '15 minutes'")
console.log("         GROUP BY 1, 2 ORDER BY 3 DESC;")
console.log("     Expected: NO rows with source='walliam_estimator_vip_request' + lead_origin_route='unknown'.")
console.log('  5. Paste all outputs. Next turn delivers T6 close patch (tracker v11 -> v12).')