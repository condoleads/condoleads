#!/usr/bin/env node
/**
 * patch-t6b-wire.js (v2 — fixes 3 v1 anchor failures)
 *
 * v1 failures and their root causes:
 *   - F4.P1, F5.P1: file likely has CRLF line endings, v1's j('\n') joiner
 *     produced LF-only anchors that didn't match the file's \r\n separators.
 *     Fix: normalize CRLF -> LF on read; preserve original line ending on write.
 *   - F9.P2: 8-space `.like('source', ...)` anchor was a substring of the
 *     10-space variant at L229, so split-count returned 2 not 1.
 *     Fix: prefix line-anchored substrings with '\n' to force a line-start
 *     match (and prefix the replacement too so the boundary stays).
 *
 * Everything else identical to v1.
 *
 * New files (2):
 *   1. lib/utils/lead-origin-route.ts
 *   2. supabase/migrations/20260511_t6b_lead_origin_route_backfill.sql
 *
 * Modified files (8) - 10 patches total. Atomic: validates all 10 anchors +
 * F6.P1 import anchor + new-file paths before any write. Backups on all
 * modified files. Line endings preserved per-file (LF for new files).
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const j = (...lines) => lines.join('\n')

// ============================================================================
// Line-ending-aware file IO
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
// NEW FILE 1: lib/utils/lead-origin-route.ts (LF newlines)
// ============================================================================

const HELPER_PATH = 'lib/utils/lead-origin-route.ts'

const HELPER_CONTENT = `/**
 * Lead origin route derivation.
 *
 * The \`leads.lead_origin_route\` column (added at T2c, commit ae8454c) is a
 * tenant-agnostic controlled vocabulary identifying the upstream surface
 * that created a lead. It enables indexed equality lookups via
 * \`idx_leads_tenant_origin_route (tenant_id, lead_origin_route)\` to
 * replace LIKE filters on the loosely-shaped \`source\` text column.
 *
 * This helper mirrors the SQL CASE in
 *   supabase/migrations/20260510_t2c_lead_origin_route.sql
 * exactly, so TS callers can derive the value at INSERT time without
 * round-tripping through SQL. The SQL CASE remains the canonical source
 * for backfill operations (re-run at T6b 2026-05-11).
 *
 * IMPORTANT: if the controlled vocabulary changes, update both this file
 * AND the SQL CASE in the migration. Otherwise the TS path and the SQL
 * backfill path will produce different values for the same source string.
 */

export type LeadOriginRoute =
  | 'charlie_vip_request'
  | 'estimator_vip_request'
  | 'estimator_questionnaire'
  | 'estimator'
  | 'charlie'
  | 'contact_form'
  | 'registration'
  | 'property_inquiry'
  | 'building_visit'
  | 'sale_evaluation'
  | 'unknown'

export function deriveLeadOriginRoute(source: string | null | undefined): LeadOriginRoute {
  if (!source) return 'unknown'

  // Order mirrors the T2c SQL CASE: more-specific patterns before less-specific.
  if (/_charlie_vip_request$/.test(source)) return 'charlie_vip_request'
  if (/_estimator_vip_request$/.test(source)) return 'estimator_vip_request'
  if (/_estimator_questionnaire$/.test(source)) return 'estimator_questionnaire'
  if (/_estimator/.test(source)) return 'estimator'
  if (/_charlie$/.test(source)) return 'charlie'
  if (/_contact$/.test(source)) return 'contact_form'

  if (source === 'contact_form' || source === 'message_agent' || source === 'building_page') {
    return 'contact_form'
  }
  if (source === 'estimator') return 'estimator'
  if (source === 'registration') return 'registration'
  if (source === 'property_inquiry') return 'property_inquiry'
  if (source === 'building_visit_request') return 'building_visit'
  if (source === 'sale_evaluation_request') return 'sale_evaluation'

  return 'unknown'
}
`

// ============================================================================
// NEW FILE 2: supabase/migrations/20260511_t6b_lead_origin_route_backfill.sql
// ============================================================================

const MIGRATION_PATH = 'supabase/migrations/20260511_t6b_lead_origin_route_backfill.sql'

const MIGRATION_CONTENT = `-- W-LEADS-EMAIL T6b - backfill of lead_origin_route for rows still at 'unknown'.
--
-- The T2c migration (20260510_t2c_lead_origin_route.sql) added the column with
-- DEFAULT 'unknown' and ran a tenant-agnostic CASE UPDATE to map existing
-- rows. However at T2c migration time the leads table was effectively empty,
-- so the UPDATE matched 0 rows. All rows inserted since (17 as of 2026-05-11)
-- defaulted to 'unknown' because no caller wired the column.
--
-- T6b ships the application half: caller wiring forward + this backfill UPDATE.
-- This SQL is byte-for-byte the same CASE as T2c, re-applied. Idempotent: WHERE
-- clause filters to rows still at 'unknown', so re-runs are safe.
--
-- All in one transaction; partial-failure rolls back to pre-state.

BEGIN;

UPDATE leads SET lead_origin_route = CASE
  WHEN source LIKE '%\\_charlie\\_vip\\_request' ESCAPE '\\' THEN 'charlie_vip_request'
  WHEN source LIKE '%\\_estimator\\_vip\\_request' ESCAPE '\\' THEN 'estimator_vip_request'
  WHEN source LIKE '%\\_estimator\\_questionnaire' ESCAPE '\\' THEN 'estimator_questionnaire'
  WHEN source LIKE '%\\_estimator%' ESCAPE '\\' THEN 'estimator'
  WHEN source LIKE '%\\_charlie' ESCAPE '\\' THEN 'charlie'
  WHEN source LIKE '%\\_contact' ESCAPE '\\' THEN 'contact_form'
  WHEN source IN ('contact_form', 'message_agent', 'building_page') THEN 'contact_form'
  WHEN source = 'estimator' THEN 'estimator'
  WHEN source = 'registration' THEN 'registration'
  WHEN source = 'property_inquiry' THEN 'property_inquiry'
  WHEN source = 'building_visit_request' THEN 'building_visit'
  WHEN source = 'sale_evaluation_request' THEN 'sale_evaluation'
  ELSE 'unknown'
END
WHERE lead_origin_route = 'unknown';

COMMIT;
`

// ============================================================================
// File-level patches (all anchors operate on LF-normalized content)
// ============================================================================

const F3 = 'app/api/walliam/contact/route.ts'
const F4 = 'app/api/walliam/charlie/vip-request/route.ts'
const F5 = 'app/api/charlie/plan-email/route.ts'
const F6 = 'lib/actions/leads.ts'
const F7 = 'app/api/charlie/appointment/route.ts'
const F8 = 'app/api/charlie/lead/route.ts'
const F9 = 'app/api/walliam/estimator/vip-questionnaire/route.ts'
const F10 = 'app/api/walliam/estimator/vip-request/route.ts'

const F3_P1_OLD = j(
  "      source: source || 'walliam_contact',",
  "      building_id: building_id || null,"
)
const F3_P1_NEW = j(
  "      source: source || 'walliam_contact',",
  "      lead_origin_route: 'contact_form',",
  "      building_id: building_id || null,"
)

const F4_P1_OLD = j(
  "        source: `${sourceKey}_charlie_vip_request`,",
  "        intent: planType || 'buyer',"
)
const F4_P1_NEW = j(
  "        source: `${sourceKey}_charlie_vip_request`,",
  "        lead_origin_route: 'charlie_vip_request',",
  "        intent: planType || 'buyer',"
)

const F5_P1_OLD = j(
  "      source: 'walliam_charlie',",
  "      intent: planType,"
)
const F5_P1_NEW = j(
  "      source: 'walliam_charlie',",
  "      lead_origin_route: 'charlie',",
  "      intent: planType,"
)

const F6_NEW_IMPORT = "import { deriveLeadOriginRoute } from '@/lib/utils/lead-origin-route'"

const F6_P2_OLD = j(
  "      source: source,",
  "      assignment_source: resolvedAgentId ? 'geo' : 'admin',"
)
const F6_P2_NEW = j(
  "      source: source,",
  "      lead_origin_route: deriveLeadOriginRoute(source),",
  "      assignment_source: resolvedAgentId ? 'geo' : 'admin',"
)

const F7_P1_OLD = j(
  "        source: 'walliam_charlie',",
  "        intent,"
)
const F7_P1_NEW = j(
  "        source: 'walliam_charlie',",
  "        lead_origin_route: 'charlie',",
  "        intent,"
)

const F8_P1_OLD = j(
  "          source: 'walliam_charlie',",
  "          intent,"
)
const F8_P1_NEW = j(
  "          source: 'walliam_charlie',",
  "          lead_origin_route: 'charlie',",
  "          intent,"
)

const F9_P1_OLD = j(
  "            source: 'walliam_estimator_questionnaire',",
  "            source_url: vipRequest.page_url,"
)
const F9_P1_NEW = j(
  "            source: 'walliam_estimator_questionnaire',",
  "            lead_origin_route: 'estimator_questionnaire',",
  "            source_url: vipRequest.page_url,"
)

// v2: prefix with '\n' to force line-start anchoring (prevents substring match
// of 8-space anchor inside the 10-space variant at L229).
const F9_P2_OLD = "\n        .like('source', 'walliam_estimator%')"
const F9_P2_NEW = "\n        .eq('lead_origin_route', 'estimator_vip_request')"

const F9_P3_OLD = "\n          .like('source', 'walliam_estimator%')"
const F9_P3_NEW = "\n          .eq('lead_origin_route', 'estimator_vip_request')"

const F10_P1_OLD = j(
  "          source: 'walliam_estimator_vip_request',",
  "          source_url: pageUrl,"
)
const F10_P1_NEW = j(
  "          source: 'walliam_estimator_vip_request',",
  "          lead_origin_route: 'estimator_vip_request',",
  "          source_url: pageUrl,"
)

// ============================================================================
// Atomic validation
// ============================================================================

const patches = [
  { file: F3, name: 'F3.P1 walliam/contact INSERT', old: F3_P1_OLD, new: F3_P1_NEW },
  { file: F4, name: 'F4.P1 walliam/charlie/vip-request INSERT', old: F4_P1_OLD, new: F4_P1_NEW },
  { file: F5, name: 'F5.P1 charlie/plan-email INSERT', old: F5_P1_OLD, new: F5_P1_NEW },
  { file: F6, name: 'F6.P2 lib/actions/leads.ts INSERT', old: F6_P2_OLD, new: F6_P2_NEW },
  { file: F7, name: 'F7.P1 charlie/appointment INSERT', old: F7_P1_OLD, new: F7_P1_NEW },
  { file: F8, name: 'F8.P1 charlie/lead defensive INSERT', old: F8_P1_OLD, new: F8_P1_NEW },
  { file: F9, name: 'F9.P1 vip-questionnaire defensive INSERT', old: F9_P1_OLD, new: F9_P1_NEW },
  { file: F9, name: 'F9.P2 vip-questionnaire LIKE at L147 (8-indent, line-anchored)', old: F9_P2_OLD, new: F9_P2_NEW },
  { file: F9, name: 'F9.P3 vip-questionnaire LIKE at L229 (10-indent, line-anchored)', old: F9_P3_OLD, new: F9_P3_NEW },
  { file: F10, name: 'F10.P1 vip-request INSERT', old: F10_P1_OLD, new: F10_P1_NEW },
]

const errors = []
const fileState = new Map() // path -> { content (LF), usesCRLF }

for (const p of patches) {
  if (!fileState.has(p.file)) {
    if (!exists(path.resolve(ROOT, p.file))) {
      errors.push(`${p.name}: file not found: ${p.file}`)
      continue
    }
    fileState.set(p.file, readFileLF(p.file))
  }
  const { content } = fileState.get(p.file)
  const count = countOccurrences(content, p.old)
  if (count !== 1) errors.push(`${p.name}: expected 1 anchor match, found ${count}`)
}

// F6.P1 import (regex on last existing import line)
if (!fileState.has(F6)) {
  if (!exists(path.resolve(ROOT, F6))) errors.push('F6.P1 import: file not found')
  else fileState.set(F6, readFileLF(F6))
}
let f6LastImport = null
if (fileState.has(F6)) {
  const { content } = fileState.get(F6)
  const re = /^import\s+[^\n]+;?\s*$/gm
  let m
  while ((m = re.exec(content)) !== null) f6LastImport = m
  if (!f6LastImport) errors.push('F6.P1 import: no existing import line found to anchor against in lib/actions/leads.ts')
  if (content.includes(F6_NEW_IMPORT)) errors.push('F6.P1: helper import already present (re-run after partial state?)')
}

// New file paths must NOT exist (don't clobber)
if (exists(path.resolve(ROOT, HELPER_PATH))) errors.push(`NEW file already exists: ${HELPER_PATH} (delete to re-run)`)
if (exists(path.resolve(ROOT, MIGRATION_PATH))) errors.push(`NEW file already exists: ${MIGRATION_PATH} (delete to re-run)`)

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('All 10 patch anchors + F6.P1 import anchor + new-file paths validated.')
console.log('Line endings detected per file:')
for (const [p, { usesCRLF }] of fileState.entries()) {
  console.log(`  ${p}: ${usesCRLF ? 'CRLF' : 'LF'}`)
}

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

// Apply text patches in memory (still LF-normalized content)
const fileNewContent = new Map() // path -> updated LF content
for (const p of patches) {
  let content = fileNewContent.get(p.file) || fileState.get(p.file).content
  content = content.replace(p.old, p.new)
  fileNewContent.set(p.file, content)
  console.log(`  applied: ${p.name}`)
}

// F6.P1 import insertion (operating on LF-normalized content)
{
  let content = fileNewContent.get(F6) || fileState.get(F6).content
  const re = /^import\s+[^\n]+;?\s*$/gm
  let last = null
  let m
  while ((m = re.exec(content)) !== null) last = m
  const insertAt = last.index + last[0].length
  content = content.slice(0, insertAt) + '\n' + F6_NEW_IMPORT + content.slice(insertAt)
  fileNewContent.set(F6, content)
  console.log('  applied: F6.P1 lib/actions/leads.ts helper import (inserted after last existing import)')
}

// Backups (of original raw content - preserve original LE by using copyFileSync on the actual on-disk bytes)
for (const f of fileNewContent.keys()) {
  const absSrc = path.resolve(ROOT, f)
  const absBackup = absSrc + '.backup_' + stamp
  fs.copyFileSync(absSrc, absBackup)
  console.log(`  backup: ${path.basename(absBackup)}`)
}

// Write modified files with original line ending preserved
for (const [f, content] of fileNewContent.entries()) {
  const { usesCRLF } = fileState.get(f)
  writeFilePreserveLE(f, content, usesCRLF)
  console.log(`  wrote: ${f} (${usesCRLF ? 'CRLF' : 'LF'})`)
}

// Write new files (LF newlines)
function ensureDir(p) {
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}
const helperAbs = path.resolve(ROOT, HELPER_PATH)
ensureDir(helperAbs)
fs.writeFileSync(helperAbs, HELPER_CONTENT, 'utf8')
console.log(`  created: ${HELPER_PATH} (LF)`)

const migAbs = path.resolve(ROOT, MIGRATION_PATH)
ensureDir(migAbs)
fs.writeFileSync(migAbs, MIGRATION_CONTENT, 'utf8')
console.log(`  created: ${MIGRATION_PATH} (LF)`)

console.log('')
console.log('T6b wire applied: 10 text patches + F6.P1 import + 2 new files.')
console.log('')
console.log('Next steps:')
console.log('  1. npx tsc --noEmit')
console.log('')
console.log(`  2. Paste contents of ${MIGRATION_PATH} into Supabase Studio SQL editor.`)
console.log('     Then verify (separate paste):')
console.log("       SELECT lead_origin_route, source, COUNT(*) FROM leads GROUP BY 1, 2 ORDER BY 3 DESC;")
console.log('')
console.log('  3. Re-run smoke (additive change - should still all-green):')
console.log('       node scripts/smoke-t3b.js')
console.log('       node scripts/smoke-t3c.js')
console.log('     Then verify fresh lead_origin_route population (separate paste):')
console.log("       SELECT lead_origin_route, source, COUNT(*) FROM leads")
console.log("         WHERE created_at > NOW() - INTERVAL '15 minutes'")
console.log("         GROUP BY 1, 2 ORDER BY 3 DESC;")
console.log('')
console.log('  4. Paste all outputs. Next turn delivers the T6 close patch (tracker v11 -> v12).')