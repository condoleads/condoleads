#!/usr/bin/env node
/**
 * patch-t6c-wire.js
 *
 * W-LEADS-EMAIL T6c — source-string hardcoding refactor.
 *
 * 17 atomic patches across 6 files. Atomic: validates all anchors + re-run
 * guards before any write. Backups on all modified files (timestamped local).
 * Line endings preserved per-file.
 *
 * Files modified:
 *   1. lib/utils/validate-session.ts         (helper: extend return shape)
 *   2. app/api/charlie/lead/route.ts         (Shape A + 2 swaps)
 *   3. app/api/charlie/plan-email/route.ts   (Shape A + 1 split-replace x2)
 *   4. app/api/charlie/appointment/route.ts  (Shape A + 2 swaps)
 *   5. app/api/walliam/estimator/vip-request/route.ts        (decl + 3 swaps)
 *   6. app/api/walliam/estimator/vip-questionnaire/route.ts  (load + 2 swaps)
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

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

function makeTimestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

// ============================================================================
// FILES
// ============================================================================

const F_HELPER = 'lib/utils/validate-session.ts'
const F_LEAD   = 'app/api/charlie/lead/route.ts'
const F_PLAN   = 'app/api/charlie/plan-email/route.ts'
const F_APPT   = 'app/api/charlie/appointment/route.ts'
const F_VIPREQ = 'app/api/walliam/estimator/vip-request/route.ts'
const F_VIPQ   = 'app/api/walliam/estimator/vip-questionnaire/route.ts'

// ============================================================================
// PATCH 1: validate-session.ts — extend return shape
// ============================================================================

const P1_1_OLD = [
  'export type ValidateSessionResult =',
  '  | { ok: true; session: Record<string, any> }',
  '  | { ok: false; status: number; error: string }',
].join('\n')

const P1_1_NEW = [
  'export type ValidateSessionResult =',
  '  | { ok: true; session: Record<string, any>; sourceKey: string }',
  '  | { ok: false; status: number; error: string }',
].join('\n')

const P1_2_OLD = '  return { ok: true, session: session as Record<string, any> }'
const P1_2_NEW = '  return { ok: true, session: session as Record<string, any>, sourceKey: tenant.source_key }'

// ============================================================================
// PATCH 2-4: Shape A — same auth-gate anchor across 3 routes
// ============================================================================

const SHAPE_A_OLD = [
  '    if (!_sessionCheck.ok) {',
  '      return NextResponse.json({ error: _sessionCheck.error }, { status: _sessionCheck.status })',
  '    }',
  '    const validSession = _sessionCheck.session',
].join('\n')

const SHAPE_A_NEW = [
  '    if (!_sessionCheck.ok) {',
  '      return NextResponse.json({ error: _sessionCheck.error }, { status: _sessionCheck.status })',
  '    }',
  '    const validSession = _sessionCheck.session',
  '    const sourceKey = _sessionCheck.sourceKey  // T6c — for source-field templating',
].join('\n')

const SHAPE_A_RERUN_MARKER = 'const sourceKey = _sessionCheck.sourceKey'

// charlie/lead specifics
const P2_2_OLD = "      .eq('source', 'walliam_charlie')"
const P2_2_NEW = "      .eq('source', `${sourceKey}_charlie`)"
const P2_3_OLD = "          source: 'walliam_charlie',"
const P2_3_NEW = "          source: `${sourceKey}_charlie`,"

// charlie/plan-email specifics — split-replace count=2
const P3_2_OLD = "      source: 'walliam_charlie',"
const P3_2_NEW = "      source: `${sourceKey}_charlie`,"
const P3_2_COUNT = 2

// charlie/appointment specifics
const P4_2_OLD = "        source: 'walliam_charlie',"
const P4_2_NEW = "        source: `${sourceKey}_charlie`,"
const P4_3_OLD = "      source: 'walliam_appointment',"
const P4_3_NEW = "      source: `${sourceKey}_appointment`,"

// ============================================================================
// PATCH 5: estimator/vip-request — declare sourceKey + 3 swaps
// ============================================================================

const P5_1_OLD = [
  "    // T6a — F-W-RECOVERY-A15: tenant-aware auth gate (replaces hardcoded 'walliam' check)",
  '    if (session.source !== tenant.source_key) {',
  "      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })",
  '    }',
].join('\n')

const P5_1_NEW = [
  "    // T6a — F-W-RECOVERY-A15: tenant-aware auth gate (replaces hardcoded 'walliam' check)",
  '    if (session.source !== tenant.source_key) {',
  "      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })",
  '    }',
  '    const sourceKey = tenant.source_key  // T6c — for source-field templating',
].join('\n')

const P5_1_RERUN_MARKER = 'const sourceKey = tenant.source_key  // T6c'

const P5_2_OLD = "        request_source: 'walliam_estimator',"
const P5_2_NEW = "        request_source: `${sourceKey}_estimator`,"
const P5_3_OLD = "          source: 'walliam_estimator_vip_request',"
const P5_3_NEW = "          source: `${sourceKey}_estimator_vip_request`,"
const P5_4_OLD = "\n        source: 'walliam_estimator_vip_request',"
const P5_4_NEW = "\n        source: `${sourceKey}_estimator_vip_request`,"

// ============================================================================
// PATCH 6: estimator/vip-questionnaire — load sourceKey + 2 swaps
// ============================================================================

const P6_1_OLD = [
  '    if (userEmail && userId && tenantId) {',
  "      const enrichedMessage = `WALLiam Estimator Questionnaire — ${buyerTypeDisplay} | Budget: ${budgetDisplay} | Timeline: ${timelineDisplay}${requirements ? ` | Notes: ${requirements}` : ''}`",
].join('\n')

const P6_1_NEW = [
  '    // T6c — F-QUESTIONNAIRE-DEFENSIVE-INSERT-HARDCODED-SOURCE: load tenant source_key',
  '    let sourceKey: string | null = null',
  '    if (tenantId) {',
  '      const { data: t6cTenant } = await supabase',
  "        .from('tenants')",
  "        .select('source_key')",
  "        .eq('id', tenantId)",
  '        .maybeSingle()',
  '      sourceKey = t6cTenant?.source_key ?? null',
  '    }',
  '',
  '    if (userEmail && userId && tenantId) {',
  "      const enrichedMessage = `WALLiam Estimator Questionnaire — ${buyerTypeDisplay} | Budget: ${budgetDisplay} | Timeline: ${timelineDisplay}${requirements ? ` | Notes: ${requirements}` : ''}`",
].join('\n')

const P6_1_RERUN_MARKER = 'let sourceKey: string | null = null'

const P6_2_OLD = "            source: 'walliam_estimator_questionnaire',"
const P6_2_NEW = "            source: sourceKey ? `${sourceKey}_estimator_questionnaire` : 'walliam_estimator_questionnaire',"
const P6_3_OLD = "\n        source: 'walliam_estimator_questionnaire',"
const P6_3_NEW = "\n        source: sourceKey ? `${sourceKey}_estimator_questionnaire` : 'walliam_estimator_questionnaire',"

// ============================================================================
// ATOMIC VALIDATION
// ============================================================================

const errors = []
const files = {}

for (const f of [F_HELPER, F_LEAD, F_PLAN, F_APPT, F_VIPREQ, F_VIPQ]) {
  if (!exists(path.resolve(ROOT, f))) {
    errors.push(`file not found: ${f}`)
  } else {
    files[f] = readFileLF(f)
  }
}

if (errors.length === 0) {
  // Helper — count-only guards (NEW differs in middle of anchor)
  if (countOccurrences(files[F_HELPER].content, P1_1_OLD) !== 1) errors.push('P1.1 (helper type def): expected 1 match')
  if (countOccurrences(files[F_HELPER].content, P1_2_OLD) !== 1) errors.push('P1.2 (helper return): expected 1 match')

  // Shape A — same anchor in 3 files, each must be exactly 1
  for (const [f, label] of [[F_LEAD, 'charlie/lead'], [F_PLAN, 'charlie/plan-email'], [F_APPT, 'charlie/appointment']]) {
    if (countOccurrences(files[f].content, SHAPE_A_OLD) !== 1) {
      errors.push(`Shape A anchor in ${label}: expected 1 match`)
    }
    // Explicit re-run guard: NEW contains OLD as prefix substring
    if (files[f].content.includes(SHAPE_A_RERUN_MARKER)) {
      errors.push(`${label}: sourceKey extraction already present (re-run state)`)
    }
  }

  // charlie/lead
  if (countOccurrences(files[F_LEAD].content, P2_2_OLD) !== 1) errors.push('P2.2: expected 1 match')
  if (countOccurrences(files[F_LEAD].content, P2_3_OLD) !== 1) errors.push('P2.3: expected 1 match')

  // charlie/plan-email — split-replace count=2
  if (countOccurrences(files[F_PLAN].content, P3_2_OLD) !== P3_2_COUNT) {
    errors.push(`P3.2: expected ${P3_2_COUNT} matches, found ${countOccurrences(files[F_PLAN].content, P3_2_OLD)}`)
  }

  // charlie/appointment
  if (countOccurrences(files[F_APPT].content, P4_2_OLD) !== 1) errors.push('P4.2: expected 1 match')
  if (countOccurrences(files[F_APPT].content, P4_3_OLD) !== 1) errors.push('P4.3: expected 1 match')

  // vip-request
  if (countOccurrences(files[F_VIPREQ].content, P5_1_OLD) !== 1) errors.push('P5.1: expected 1 match')
  if (countOccurrences(files[F_VIPREQ].content, P5_2_OLD) !== 1) errors.push('P5.2: expected 1 match')
  if (countOccurrences(files[F_VIPREQ].content, P5_3_OLD) !== 1) errors.push('P5.3: expected 1 match')
  if (countOccurrences(files[F_VIPREQ].content, P5_4_OLD) !== 1) errors.push('P5.4: expected 1 match')
  if (files[F_VIPREQ].content.includes(P5_1_RERUN_MARKER)) {
    errors.push('P5.1: vip-request sourceKey decl already present (re-run state)')
  }

  // vip-questionnaire
  if (countOccurrences(files[F_VIPQ].content, P6_1_OLD) !== 1) errors.push('P6.1: expected 1 match')
  if (countOccurrences(files[F_VIPQ].content, P6_2_OLD) !== 1) errors.push('P6.2: expected 1 match')
  if (countOccurrences(files[F_VIPQ].content, P6_3_OLD) !== 1) errors.push('P6.3: expected 1 match')
  if (files[F_VIPQ].content.includes(P6_1_RERUN_MARKER)) {
    errors.push('P6.1: vip-questionnaire sourceKey load already present (re-run state)')
  }
}

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

// ============================================================================
// APPLY (backups first, then writes)
// ============================================================================

const ts = makeTimestamp()
console.log('All 17 anchors validated. Applying with backup suffix: .backup_' + ts)
console.log('Per-file line endings:')
for (const f of [F_HELPER, F_LEAD, F_PLAN, F_APPT, F_VIPREQ, F_VIPQ]) {
  console.log('  ' + f + ': ' + (files[f].usesCRLF ? 'CRLF' : 'LF'))
}
console.log('')

function backupAndWrite(f, singleReplaces, splitReplaces) {
  // Backup original (preserve original LE)
  const backupRel = `${f}.backup_${ts}`
  const backupAbs = path.resolve(ROOT, backupRel)
  const originalBytes = files[f].usesCRLF ? files[f].content.replace(/\n/g, '\r\n') : files[f].content
  fs.writeFileSync(backupAbs, originalBytes, 'utf8')
  console.log('  backup: ' + backupRel)

  // Apply patches to LF-normalized content
  let content = files[f].content
  for (const { old, neu } of singleReplaces) {
    content = content.replace(old, neu)
  }
  for (const { old, neu } of (splitReplaces || [])) {
    content = content.split(old).join(neu)
  }

  writeFilePreserveLE(f, content, files[f].usesCRLF)
  console.log('  wrote:  ' + f + ' (' + (files[f].usesCRLF ? 'CRLF' : 'LF') + ')')
}

backupAndWrite(F_HELPER, [
  { old: P1_1_OLD, neu: P1_1_NEW },
  { old: P1_2_OLD, neu: P1_2_NEW },
])
backupAndWrite(F_LEAD, [
  { old: SHAPE_A_OLD, neu: SHAPE_A_NEW },
  { old: P2_2_OLD, neu: P2_2_NEW },
  { old: P2_3_OLD, neu: P2_3_NEW },
])
backupAndWrite(F_PLAN, [
  { old: SHAPE_A_OLD, neu: SHAPE_A_NEW },
], [
  { old: P3_2_OLD, neu: P3_2_NEW },
])
backupAndWrite(F_APPT, [
  { old: SHAPE_A_OLD, neu: SHAPE_A_NEW },
  { old: P4_2_OLD, neu: P4_2_NEW },
  { old: P4_3_OLD, neu: P4_3_NEW },
])
backupAndWrite(F_VIPREQ, [
  { old: P5_1_OLD, neu: P5_1_NEW },
  { old: P5_2_OLD, neu: P5_2_NEW },
  { old: P5_3_OLD, neu: P5_3_NEW },
  { old: P5_4_OLD, neu: P5_4_NEW },
])
backupAndWrite(F_VIPQ, [
  { old: P6_1_OLD, neu: P6_1_NEW },
  { old: P6_2_OLD, neu: P6_2_NEW },
  { old: P6_3_OLD, neu: P6_3_NEW },
])

console.log('')
console.log('T6c wire applied: 17 atomic patches across 6 files (1 helper + 5 routes).')
console.log('')
console.log('Verify sequence:')
console.log('  1. npx tsc --noEmit              # confirm types compile')
console.log('  2. node scripts/smoke-t3b.js     # 4/4 GREEN expected')
console.log('  3. node scripts/smoke-t3c.js     # 5/5 GREEN expected')
console.log('  4. Verify in fresh leads that source field contains sourceKey-prefixed values')