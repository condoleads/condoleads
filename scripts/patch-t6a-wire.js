#!/usr/bin/env node
/**
 * patch-t6a-wire.js
 *
 * W-LEADS-EMAIL T6a: F-W-RECOVERY-A15-AUTH-GATE-HARDCODED-WALLIAM-SOURCE
 *
 * Creates lib/utils/validate-session.ts and replaces the hardcoded
 * .eq('source', 'walliam') auth-gate pattern across 5 routes. Three shapes:
 *
 *   Shape A — standard auth gate (uses helper):
 *     - app/api/charlie/lead/route.ts             (LF)
 *     - app/api/charlie/plan-email/route.ts       (CRLF)
 *     - app/api/charlie/appointment/route.ts      (LF)
 *
 *   Shape B — session lifecycle source field (inline tenant.source_key):
 *     - app/api/walliam/estimator/session/route.ts (CRLF)
 *       L100 SELECT filter + L118 INSERT field
 *
 *   Shape C — gate-on-loaded-session (inline tenant.source_key, reordered):
 *     - app/api/walliam/estimator/vip-request/route.ts (LF)
 *       move auth check below tenant load + extend tenant SELECT
 *
 * 11 patches total (1 new file + 3 import insertions + 3 gate replacements
 * for Shape A + 3 inline edits for Shape B + 1 combined refactor for Shape C).
 * Atomic: validates all anchors before any write. Per-file LE preserved.
 * Backups on all modified files.
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const j = (...lines) => lines.join('\n')

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
// NEW FILE: lib/utils/validate-session.ts (LF newlines)
// ============================================================================

const HELPER_PATH = 'lib/utils/validate-session.ts'

const HELPER_CONTENT = `/**
 * Tenant-aware session validation gate.
 *
 * Replaces the hardcoded \`.eq('source', 'walliam')\` pattern across the
 * auth-gate sites in W-LEADS-EMAIL T6a target routes:
 *   - app/api/charlie/lead/route.ts
 *   - app/api/charlie/plan-email/route.ts
 *   - app/api/charlie/appointment/route.ts
 *
 * For routes where the session is already loaded (estimator/vip-request) or
 * where source is used for non-gate operations (estimator/session), this
 * helper is NOT used; those routes inline \`tenant.source_key\` access via
 * their existing tenant SELECT.
 *
 * Implementation:
 *   1. Verify sessionId, userId, tenantId all non-empty -> 401 if any missing
 *   2. Load \`tenants.source_key\` for tenantId
 *   3. Load \`chat_sessions\` WHERE id=sessionId AND user_id=userId AND
 *      tenant_id=tenantId AND source=source_key
 *   4. Any failure -> 401 'Invalid session'
 *   5. Success -> return the loaded session row
 *
 * Multitenant safety: the chat_sessions query enforces both tenant_id and
 * source filters. A forged x-tenant-id header that doesn't match the
 * session's actual tenant_id will not match (returns no row -> 401).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ValidateSessionParams {
  supabase: SupabaseClient
  sessionId: string | null | undefined
  userId: string | null | undefined
  tenantId: string | null | undefined
  selectColumns?: string // default 'id'
}

export type ValidateSessionResult =
  | { ok: true; session: Record<string, any> }
  | { ok: false; status: number; error: string }

export async function validateSession(params: ValidateSessionParams): Promise<ValidateSessionResult> {
  const { supabase } = params
  const sessionId = params.sessionId
  const userId = params.userId
  const tenantId = params.tenantId
  const selectColumns = params.selectColumns ?? 'id'

  if (!sessionId || !userId || !tenantId) {
    return { ok: false, status: 401, error: 'Invalid session' }
  }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('source_key')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantError || !tenant?.source_key) {
    return { ok: false, status: 401, error: 'Invalid session' }
  }

  const { data: session, error: sessionError } = await supabase
    .from('chat_sessions')
    .select(selectColumns)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('source', tenant.source_key)
    .maybeSingle()

  if (sessionError || !session) {
    return { ok: false, status: 401, error: 'Invalid session' }
  }

  return { ok: true, session: session as Record<string, any> }
}
`

// ============================================================================
// File-level patches (all anchors operate on LF-normalized content)
// ============================================================================

const F1 = 'app/api/charlie/lead/route.ts'              // LF
const F2 = 'app/api/charlie/plan-email/route.ts'         // CRLF
const F3 = 'app/api/charlie/appointment/route.ts'        // LF
const F4 = 'app/api/walliam/estimator/session/route.ts'  // CRLF
const F5 = 'app/api/walliam/estimator/vip-request/route.ts' // LF

// ---- Common import anchor ----
const HELPER_IMPORT_LINE = "import { validateSession } from '@/lib/utils/validate-session'"
const COMMON_IMPORT_ANCHOR = "import { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'"

// ---- F1 (charlie/lead) ----

const F1_P1_OLD = COMMON_IMPORT_ANCHOR
const F1_P1_NEW = COMMON_IMPORT_ANCHOR + '\n' + HELPER_IMPORT_LINE

const F1_P2_OLD = j(
  "    // W-RECOVERY A1.5 auth gate — verify session belongs to userId",
  "    const { data: validSession } = await supabase",
  "      .from('chat_sessions')",
  "      .select('id')",
  "      .eq('id', sessionId)",
  "      .eq('user_id', userId)",
  "      .eq('source', 'walliam')",
  "      .maybeSingle()",
  "    if (!validSession) {",
  "      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })",
  "    }",
  "    // END W-RECOVERY A1.5 auth gate"
)

const F1_P2_NEW = j(
  "    // T6a — F-W-RECOVERY-A15: tenant-aware auth gate via validateSession helper",
  "    const _sessionCheck = await validateSession({ supabase, sessionId, userId, tenantId })",
  "    if (!_sessionCheck.ok) {",
  "      return NextResponse.json({ error: _sessionCheck.error }, { status: _sessionCheck.status })",
  "    }",
  "    const validSession = _sessionCheck.session",
  "    // END T6a auth gate"
)

// ---- F2 (charlie/plan-email) — CRLF, _gateSupabase preserved ----

const F2_P1_OLD = COMMON_IMPORT_ANCHOR
const F2_P1_NEW = COMMON_IMPORT_ANCHOR + '\n' + HELPER_IMPORT_LINE

const F2_P2_OLD = j(
  "    // W-RECOVERY A1.5 auth gate — verify session belongs to userId before any email fires",
  "    const _gateSupabase = createServiceClient()",
  "    const { data: validSession } = await _gateSupabase",
  "      .from('chat_sessions')",
  "      .select('id, tenant_id')",
  "      .eq('id', sessionId)",
  "      .eq('user_id', userId)",
  "      .eq('source', 'walliam')",
  "      .maybeSingle()",
  "    if (!validSession) {",
  "      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })",
  "    }",
  "    // END W-RECOVERY A1.5 auth gate"
)

const F2_P2_NEW = j(
  "    // T6a — F-W-RECOVERY-A15: tenant-aware auth gate via validateSession helper",
  "    const _gateSupabase = createServiceClient()",
  "    const _sessionCheck = await validateSession({",
  "      supabase: _gateSupabase,",
  "      sessionId,",
  "      userId,",
  "      tenantId: req.headers.get('x-tenant-id') || '',",
  "      selectColumns: 'id, tenant_id',",
  "    })",
  "    if (!_sessionCheck.ok) {",
  "      return NextResponse.json({ error: _sessionCheck.error }, { status: _sessionCheck.status })",
  "    }",
  "    const validSession = _sessionCheck.session",
  "    // END T6a auth gate"
)

// ---- F3 (charlie/appointment) ----

const F3_P1_OLD = COMMON_IMPORT_ANCHOR
const F3_P1_NEW = COMMON_IMPORT_ANCHOR + '\n' + HELPER_IMPORT_LINE

const F3_P2_OLD = j(
  "    // W-RECOVERY A1.5 auth gate — verify session belongs to userId",
  "    const { data: validSession } = await supabase",
  "      .from('chat_sessions')",
  "      .select('id')",
  "      .eq('id', sessionId)",
  "      .eq('user_id', userId)",
  "      .eq('source', 'walliam')",
  "      .maybeSingle()",
  "    if (!validSession) {",
  "      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })",
  "    }",
  "    // END W-RECOVERY A1.5 auth gate"
)

const F3_P2_NEW = j(
  "    // T6a — F-W-RECOVERY-A15: tenant-aware auth gate via validateSession helper",
  "    const _sessionCheck = await validateSession({ supabase, sessionId, userId, tenantId })",
  "    if (!_sessionCheck.ok) {",
  "      return NextResponse.json({ error: _sessionCheck.error }, { status: _sessionCheck.status })",
  "    }",
  "    const validSession = _sessionCheck.session",
  "    // END T6a auth gate"
)

// ---- F4 (estimator/session) — CRLF, Shape B ----

// F4.P1: add source_key to the existing tenant SELECT template literal
const F4_P1_OLD = j(
  "        estimator_ai_enabled,",
  "        anthropic_api_key",
  "      `)"
)

const F4_P1_NEW = j(
  "        estimator_ai_enabled,",
  "        anthropic_api_key,",
  "        source_key",
  "      `)"
)

// F4.P2: SELECT filter at L100 — swap 'walliam' for tenant.source_key
const F4_P2_OLD = j(
  "      .from('chat_sessions')",
  "      .select('*')",
  "      .eq('source', 'walliam')"
)

const F4_P2_NEW = j(
  "      .from('chat_sessions')",
  "      .select('*')",
  "      .eq('source', tenant.source_key)"
)

// F4.P3: INSERT field at L118 — swap 'walliam' for tenant.source_key
const F4_P3_OLD = j(
  "          tenant_id: tenantId,",
  "          source: 'walliam',",
  "          session_token: crypto.randomUUID(),"
)

const F4_P3_NEW = j(
  "          tenant_id: tenantId,",
  "          source: tenant.source_key,",
  "          session_token: crypto.randomUUID(),"
)

// ---- F5 (estimator/vip-request) — Shape C: reorder + extend tenant SELECT ----

const F5_P1_OLD = j(
  "    if (sessionError || !session) {",
  "      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })",
  "    }",
  "    // W-RECOVERY A1.5 auth gate (part 2) — verify session belongs to a registered walliam user",
  "    if (!session.user_id || session.source !== 'walliam') {",
  "      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })",
  "    }",
  "    // END W-RECOVERY A1.5 auth gate",
  "",
  "    const agent = session.agents",
  "    const tenantId = session.tenant_id || null",
  "",
  "    // Load tenant estimator config (auto-approve lives on tenant, not agent)",
  "    const { data: tenant, error: tenantError } = await supabase",
  "      .from('tenants')",
  "      .select('estimator_vip_auto_approve, estimator_auto_approve_attempts, estimator_manual_approve_attempts')",
  "      .eq('id', tenantId)",
  "      .single()",
  "",
  "    if (tenantError || !tenant) {",
  "      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })",
  "    }"
)

const F5_P1_NEW = j(
  "    if (sessionError || !session) {",
  "      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })",
  "    }",
  "    if (!session.user_id) {",
  "      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })",
  "    }",
  "",
  "    const agent = session.agents",
  "    const tenantId = session.tenant_id || null",
  "",
  "    // Load tenant estimator config (auto-approve lives on tenant, not agent)",
  "    const { data: tenant, error: tenantError } = await supabase",
  "      .from('tenants')",
  "      .select('source_key, estimator_vip_auto_approve, estimator_auto_approve_attempts, estimator_manual_approve_attempts')",
  "      .eq('id', tenantId)",
  "      .single()",
  "",
  "    if (tenantError || !tenant) {",
  "      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })",
  "    }",
  "",
  "    // T6a — F-W-RECOVERY-A15: tenant-aware auth gate (replaces hardcoded 'walliam' check)",
  "    if (session.source !== tenant.source_key) {",
  "      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })",
  "    }"
)

// ============================================================================
// Atomic validation
// ============================================================================

const patches = [
  { file: F1, name: 'F1.P1 charlie/lead import',          old: F1_P1_OLD, new: F1_P1_NEW },
  { file: F1, name: 'F1.P2 charlie/lead auth gate',       old: F1_P2_OLD, new: F1_P2_NEW },
  { file: F2, name: 'F2.P1 charlie/plan-email import',    old: F2_P1_OLD, new: F2_P1_NEW },
  { file: F2, name: 'F2.P2 charlie/plan-email auth gate', old: F2_P2_OLD, new: F2_P2_NEW },
  { file: F3, name: 'F3.P1 charlie/appointment import',   old: F3_P1_OLD, new: F3_P1_NEW },
  { file: F3, name: 'F3.P2 charlie/appointment auth gate',old: F3_P2_OLD, new: F3_P2_NEW },
  { file: F4, name: 'F4.P1 estimator/session SELECT extend', old: F4_P1_OLD, new: F4_P1_NEW },
  { file: F4, name: 'F4.P2 estimator/session SELECT swap',   old: F4_P2_OLD, new: F4_P2_NEW },
  { file: F4, name: 'F4.P3 estimator/session INSERT swap',   old: F4_P3_OLD, new: F4_P3_NEW },
  { file: F5, name: 'F5.P1 estimator/vip-request reorder',   old: F5_P1_OLD, new: F5_P1_NEW },
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

// New file path must NOT exist (don't clobber)
if (exists(path.resolve(ROOT, HELPER_PATH))) {
  errors.push(`NEW file already exists: ${HELPER_PATH} (delete to re-run)`)
}

// Re-run guards
for (const [p, { content }] of fileState.entries()) {
  if (content.includes(HELPER_IMPORT_LINE)) {
    errors.push(`${p}: validateSession import already present (re-run after partial state?)`)
  }
}

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('All 10 patch anchors + new-file path validated.')
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

// Apply text patches in memory (LF-normalized content)
const fileNewContent = new Map()
for (const p of patches) {
  let content = fileNewContent.get(p.file) || fileState.get(p.file).content
  content = content.replace(p.old, p.new)
  fileNewContent.set(p.file, content)
  console.log(`  applied: ${p.name}`)
}

// Backups (copy raw on-disk bytes — preserves original LE)
for (const f of fileNewContent.keys()) {
  const absSrc = path.resolve(ROOT, f)
  const absBackup = absSrc + '.backup_' + stamp
  fs.copyFileSync(absSrc, absBackup)
  console.log(`  backup: ${path.basename(absBackup)}  (${f})`)
}

// Write modified files with original LE preserved
for (const [f, content] of fileNewContent.entries()) {
  const { usesCRLF } = fileState.get(f)
  writeFilePreserveLE(f, content, usesCRLF)
  console.log(`  wrote: ${f} (${usesCRLF ? 'CRLF' : 'LF'})`)
}

// Write new helper file (LF newlines)
function ensureDir(p) {
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}
const helperAbs = path.resolve(ROOT, HELPER_PATH)
ensureDir(helperAbs)
fs.writeFileSync(helperAbs, HELPER_CONTENT, 'utf8')
console.log(`  created: ${HELPER_PATH} (LF)`)

console.log('')
console.log('T6a wire applied: 10 patches + 1 new helper file.')
console.log('')
console.log('Next steps:')
console.log('  1. npx tsc --noEmit')
console.log('')
console.log('  2. Run smoke (EXPECT FAILURES on Tier 3, Tier 5, Tier 6 — the')
console.log('     smoke harnesses do not yet send x-tenant-id header, which the')
console.log('     new helper requires. Tiers 7, 8, 9 should still pass — they')
console.log('     do not use the helper):')
console.log('       node scripts/smoke-t3b.js   # Tier 3 will fail with 401')
console.log('       node scripts/smoke-t3c.js   # Tiers 5, 6 will fail with 401')
console.log('')
console.log('  3. Probe smoke harness fetch calls to map x-tenant-id insertion sites:')
console.log('       node scripts/probe-t6a-smoke-fetches.js')
console.log('')
console.log('  4. Paste TSC + 2 smoke outputs + probe output. Next turn delivers:')
console.log('     - patch-smoke-t6a-tenant-header.js (smoke harness x-tenant-id wiring)')
console.log('     - patch-w-leads-email-tracker-v13.js (T6a CLOSED bookkeeping)')
console.log('     - commit + push sequence')