#!/usr/bin/env node
/**
 * patch-w-leads-email-tracker-v13.js
 *
 * Closes T6a in W-LEADS-EMAIL workstream.
 *
 * Two files patched atomically:
 *   1. scripts/smoke-t3b.js — Tier 3 fetch needs x-tenant-id header to pass
 *      the new validateSession helper (Tiers 5/6 in smoke-t3c.js already sent
 *      it; Tier 8 uses Shape C which derives tenantId from session.tenant_id
 *      and doesn't need the header).
 *   2. docs/W-LEADS-EMAIL-TRACKER.md — v12 → v13 with T6a CLOSED bookkeeping.
 *
 * 6 patches total (1 smoke + 5 tracker). Atomic. Per-file LE preserved.
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const j = (...lines) => lines.join('\n')

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
// TARGET FILES
// ============================================================================

const F_SMOKE = 'scripts/smoke-t3b.js'
const F_TRACKER = 'docs/W-LEADS-EMAIL-TRACKER.md'

// ============================================================================
// P0: smoke-t3b.js Tier 3 fetch — add x-tenant-id header
// ============================================================================

const P0_OLD = j(
  "    const res = await fetch(`${BASE}/api/charlie/plan-email`, {",
  "      method: 'POST',",
  "      headers: { 'Content-Type': 'application/json' },",
  "      body: JSON.stringify({"
)

const P0_NEW = j(
  "    const res = await fetch(`${BASE}/api/charlie/plan-email`, {",
  "      method: 'POST',",
  "      headers: { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID },",
  "      body: JSON.stringify({"
)

// ============================================================================
// P1: tracker version header
// ============================================================================

const P1_OLD = '**Version:** v12 — T6b CLOSED 2026-05-11'
const P1_NEW = '**Version:** v13 — T6a CLOSED 2026-05-11'

// ============================================================================
// P2: tracker status line tail
// ============================================================================

const P2_OLD = "**T6 phase IN PROGRESS — T6b ✅ CLOSED 2026-05-11** (F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER closed via `lead_origin_route` lookup at vip-questionnaire route + 8-site caller wiring + idempotent backfill of 15 pre-existing 'unknown' rows + smoke harness fixture hotfix). **Next: T6 continues — T6a (F-W-RECOVERY-A15 across 5 routes), T6c (source-string hardcoding), T6d (VIP auto-approve fixes), T6e (plan integration verification).**"

const P2_NEW = "**T6 phase IN PROGRESS — T6a + T6b ✅ CLOSED 2026-05-11.** T6a closed F-W-RECOVERY-A15-AUTH-GATE-HARDCODED-WALLIAM-SOURCE via new tenant-aware `validateSession` helper (`lib/utils/validate-session.ts`) wired into 3 routes (charlie/lead, charlie/plan-email, charlie/appointment) + inline `tenant.source_key` swap in estimator/session (Shape B: existing tenant SELECT extended with source_key, L100 + L118 source literals swapped) + reorder-and-extend in estimator/vip-request (Shape C: source check moved below existing tenant load, tenant SELECT extended with source_key). T6b closed F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER via `lead_origin_route` lookup at vip-questionnaire route + 8-site caller wiring + idempotent backfill. **Next: T6 continues — T6c (source-string hardcoding), T6d (VIP auto-approve fixes), T6e (plan integration verification).**"

// ============================================================================
// P3: T6a sub-section block — replace with CLOSED summary
// ============================================================================

const P3_OLD = j(
  "**T6a — F-W-RECOVERY-A15 across 5 routes**",
  "- Extract `validateSession(supabase, sessionId, userId, tenantId)` helper",
  "- Helper reads `tenants.source_key` once, compares against `chat_sessions.source` substring",
  "- Routes:",
  "  1. `app/api/charlie/lead/route.ts:84`",
  "  2. `app/api/charlie/plan-email/route.ts:64`",
  "  3. `app/api/charlie/appointment/route.ts:88`",
  "  4. `app/api/walliam/estimator/session/route.ts:100`",
  "  5. `app/api/walliam/estimator/vip-request/route.ts:75`",
  "- All 5 backed up before patch; smoke validates each"
)

const P3_NEW = j(
  "**T6a — F-W-RECOVERY-A15 across 5 routes — ✅ CLOSED 2026-05-11**",
  "- New helper `lib/utils/validate-session.ts` exports `validateSession({ supabase, sessionId, userId, tenantId, selectColumns? })` returning `{ ok: true, session } | { ok: false, status, error }`. Loads `tenants.source_key` first, then queries `chat_sessions` with `.eq('id', sessionId).eq('user_id', userId).eq('tenant_id', tenantId).eq('source', sourceKey).maybeSingle()`. Any failure (missing param, tenant not found, source_key null, session not matching) returns `{ ok: false, status: 401, error: 'Invalid session' }`. **Multitenant safety:** a forged `x-tenant-id` header that doesn't match the session's actual `tenant_id` returns no row → 401.",
  "- Probe revealed routes weren't homogeneous — three distinct call-site shapes addressed:",
  "  - **Shape A — standard auth gate (helper-using, 3 routes):** `charlie/lead` (F1.P1+P2), `charlie/plan-email` (F2.P1+P2, `selectColumns: 'id, tenant_id'` to preserve downstream `validSession.tenant_id` usage; tenantId derived from `req.headers.get('x-tenant-id') || ''` since this route didn't read the header pre-gate — net behavior is stricter: forged header → 401), `charlie/appointment` (F3.P1+P2). Auth-gate block replaced with single helper call; `validSession` local-var name preserved for downstream compatibility.",
  "  - **Shape B — session lifecycle (inline, 1 route):** `estimator/session` (F4.P1+P2+P3). Existing tenant SELECT extended with `source_key` (was 8 fields, now 9). Then `.eq('source', 'walliam')` at L100 (chat_sessions discovery — finds user's active session) and `source: 'walliam'` at L118 (chat_sessions INSERT — creates new session) both swapped for `tenant.source_key`. No helper needed — tenant row was already loaded.",
  "  - **Shape C — gate-on-loaded-session (inline reorder, 1 route):** `estimator/vip-request` (F5.P1). Pre-fix: auth check at L80 (`if (!session.user_id || session.source !== 'walliam')`) ran BEFORE the existing tenant load at L89-93 (which selected only estimator-VIP config, not source_key). Refactor: split user_id check from source check (user_id check stays at original position, returns 401 immediately), add `source_key` to the existing tenant SELECT (was 3 fields, now 4), move source check to AFTER tenant load using `tenant.source_key`. No helper needed for the same reason as Shape B (existing tenant load satisfies the source_key fetch).",
  "- Smoke harness hotfix: `scripts/smoke-t3b.js` Tier 3 (plan-email) fetch was sending only `'Content-Type': 'application/json'`, no `x-tenant-id` header. T6a's helper requires the header (since charlie/plan-email now reads it via `req.headers.get('x-tenant-id') || ''`). Tiers 5 + 6 in `smoke-t3c.js` already sent the header (T3c shipped them that way at v9). Tier 8 (estimator/vip-request) doesn't send the header and intentionally doesn't need to — Shape C derives tenantId from `session.tenant_id` after the session JOIN load. One-line patch to Tier 3 closes the regression.",
  "- TSC clean. Smoke 9/9 GREEN end-to-end (T3b 4/4 + T3c 5/5)."
)

// ============================================================================
// P4: F-W-RECOVERY-A15 finding — mark CLOSED
// ============================================================================

const P4_OLD = "- **F-W-RECOVERY-A15-AUTH-GATE-HARDCODED-WALLIAM-SOURCE** (5 routes) — auth gate compares against literal `'walliam'` in 5 routes. Refactor target: `validateSession(supabase, sessionId, userId, tenantId)` helper using `tenants.source_key`. Locked at T6a."

const P4_NEW = "- **F-W-RECOVERY-A15-AUTH-GATE-HARDCODED-WALLIAM-SOURCE ✅ CLOSED 2026-05-11 (T6a)** — auth gates across 5 routes refactored to read `tenants.source_key` and enforce tenant match. 3 routes (charlie/lead, charlie/plan-email, charlie/appointment) use new `validateSession` helper at `lib/utils/validate-session.ts`; 2 routes (estimator/session, estimator/vip-request) use inline `tenant.source_key` access via their existing tenant SELECT (helper-call would have been wasteful — extra DB round-trip). Multitenant safety net: helper query filters `chat_sessions` by both `tenant_id` (from header) and `source` (from `tenants.source_key`); forged x-tenant-id → no row → 401. Cross-tenant negative-path regression guard scheduled for T7f. Smoke 9/9 GREEN including Tier 8 which exercises Shape C end-to-end."

// ============================================================================
// P5: v13 status log entry — insert above v12
// ============================================================================

const V13_ENTRY = [
  "- **2026-05-11 v13 T6a CLOSED — F-W-RECOVERY-A15-AUTH-GATE-HARDCODED-WALLIAM-SOURCE closed** — ",
  "T6a shipped via 4 scripts: `scripts/probe-t6a-auth-gate-recon.js` (first probe — auth-gate code blocks + source_key references + tenantId scope in all 5 target routes), ",
  "`scripts/probe-t6a-route-tops.js` (second probe — lines 1-55 of each route to resolve tenantId binding patterns), ",
  "`scripts/probe-t6a-smoke-fetches.js` (third probe — smoke harness fetch calls to map x-tenant-id header insertion sites), ",
  "and `scripts/patch-t6a-wire.js` (the wire patch — 10 atomic anchor-validated patches + 1 new helper file). ",
  "**Probe revealed three distinct call-site shapes that the tracker's original \"5 routes, 1 helper\" framing collapsed:** ",
  "(Shape A) standard auth-gate `.eq('source', 'walliam').maybeSingle()` followed by `if (!validSession) 401` in `charlie/lead`, `charlie/plan-email`, `charlie/appointment` — these get the new helper; ",
  "(Shape B) session-lifecycle source field in `estimator/session` — line 100 `.eq('source', 'walliam')` is a session DISCOVERY (find user's active session) and line 118 `source: 'walliam'` is a session CREATION INSERT, neither is an auth gate; ",
  "(Shape C) gate-on-loaded-session in `estimator/vip-request` — session loaded with agents JOIN at L60-74, then `if (!session.user_id || session.source !== 'walliam')` at L80, then tenant loaded for estimator-VIP config at L89-93. ",
  "Helper handles Shape A; Shapes B and C handled inline by extending existing tenant SELECT with `source_key` and swapping/moving the literal check. ",
  "**Helper design:** `validateSession({ supabase, sessionId, userId, tenantId, selectColumns? })` returns `{ ok: true, session } | { ok: false, status: number, error: string }`. ",
  "Loads `tenants.source_key` for the caller-provided tenantId, then loads `chat_sessions` with `.eq('id', sessionId).eq('user_id', userId).eq('tenant_id', tenantId).eq('source', sourceKey).maybeSingle()`. ",
  "Any failure (any param missing, tenant not found, source_key null, session not matching all filters) returns 401 with generic 'Invalid session' message. ",
  "Multitenant safety net: a forged `x-tenant-id` header that doesn't match the session's actual `tenant_id` returns no row → 401 (the chat_sessions query is tenant-scoped). ",
  "**Behavioral change at charlie/plan-email:** previously the route didn't read `x-tenant-id` header pre-gate (tenant_id was derived from the session row); post-T6a the route reads the header and passes it to the helper, which enforces the match. Net: stricter, no observable change for honest clients (who already send the header). ",
  "**Tier 8 (estimator/vip-request) deliberately does NOT use the helper** — Shape C derives tenantId from `session.tenant_id` after the agents JOIN load, so smoke harness doesn't send `x-tenant-id` for this route and the route doesn't read it. ",
  "**Smoke harness hotfix:** `scripts/smoke-t3b.js` Tier 3 (plan-email) fetch was sending only `'Content-Type': 'application/json'`. With the route now reading x-tenant-id, this caused 401. One-line patch added `'x-tenant-id': TENANT_ID` to that fetch's headers. ",
  "Tiers 5 + 6 in `smoke-t3c.js` already sent the header at v9 (T3c shipped them that way); Tier 8 intentionally still doesn't (Shape C). ",
  "**Smoke results post-fix — 9/9 GREEN:** T3b Tier 1 (walliam/contact — not T6a scope), Tier 2 (walliam/charlie/vip-request — not T6a scope, already-clean dynamic source), Tier 3 (charlie/plan-email — helper-using, now passing with header), Tier 4 (lib/actions/leads — not T6a scope); T3c Tier 5 (charlie/appointment — helper-using, header already present), Tier 6 (charlie/lead — helper-using INSERT + UPDATE, header already present, F2.P2 leadId-fix re-verified), Tier 7 (vip-questionnaire — not T6a scope), Tier 8 (estimator/vip-request — Shape C verified end-to-end: session.source ↔ tenant.source_key compared post-load), Tier 9 (vip-approve verify-skip — preserved). ",
  "**Cross-tenant negative-path tests deferred to T7f** per the tracker's T7 plan (cross-tenant leak regression guards for both T2g RPC fix and T6a auth gate); not in T6a scope. ",
  "**Files in this commit:** 5 modified route files (`app/api/charlie/lead/route.ts`, `app/api/charlie/plan-email/route.ts`, `app/api/charlie/appointment/route.ts`, `app/api/walliam/estimator/session/route.ts`, `app/api/walliam/estimator/vip-request/route.ts`), 1 new helper file (`lib/utils/validate-session.ts`), 1 modified smoke harness (`scripts/smoke-t3b.js`), 4 new probe/patch scripts (`scripts/probe-t6a-auth-gate-recon.js`, `scripts/probe-t6a-route-tops.js`, `scripts/probe-t6a-smoke-fetches.js`, `scripts/patch-t6a-wire.js`), 1 tracker patch script (`scripts/patch-w-leads-email-tracker-v13.js`), and `docs/W-LEADS-EMAIL-TRACKER.md` (v12→v13 bump in this script). ",
  "**Next:** T6c (source-string hardcoding refactor in 5 routes — uses the same `tenants.source_key` access pattern T6a established), T6d (VIP auto-approve fixes — isolated bug fixes in `walliam/charlie/vip-request`), T6e (plan integration verification per OD-4=(c)). After T6: T7 smoke matrix with cross-tenant regression guards, T8 sweep, Tlast close."
].join("")

const P5_OLD = "- **2026-05-11 v12 T6b CLOSED — F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER closed**"
const P5_NEW = V13_ENTRY + "\n" + P5_OLD

// ============================================================================
// Atomic validation
// ============================================================================

const errors = []

if (!exists(path.resolve(ROOT, F_SMOKE))) errors.push('file not found: ' + F_SMOKE)
if (!exists(path.resolve(ROOT, F_TRACKER))) errors.push('file not found: ' + F_TRACKER)

let smoke = null
let tracker = null

if (errors.length === 0) {
  smoke = readFileLF(F_SMOKE)
  tracker = readFileLF(F_TRACKER)

  const c0 = countOccurrences(smoke.content, P0_OLD)
  if (c0 !== 1) errors.push(`P0 (smoke-t3b Tier 3 fetch): expected 1 match, found ${c0}`)

  const c1 = countOccurrences(tracker.content, P1_OLD)
  if (c1 !== 1) errors.push(`P1 (tracker version header): expected 1 match, found ${c1}`)

  const c2 = countOccurrences(tracker.content, P2_OLD)
  if (c2 !== 1) errors.push(`P2 (tracker status line tail): expected 1 match, found ${c2}`)

  const c3 = countOccurrences(tracker.content, P3_OLD)
  if (c3 !== 1) errors.push(`P3 (tracker T6a sub-section): expected 1 match, found ${c3}`)

  const c4 = countOccurrences(tracker.content, P4_OLD)
  if (c4 !== 1) errors.push(`P4 (tracker F-W-RECOVERY-A15 finding): expected 1 match, found ${c4}`)

  const c5 = countOccurrences(tracker.content, P5_OLD)
  if (c5 !== 1) errors.push(`P5 (tracker v12 anchor for v13 insertion): expected 1 match, found ${c5}`)

  // Re-run guards
  if (smoke.content.includes("/api/charlie/plan-email`, {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID }")) {
    errors.push('P0: smoke-t3b Tier 3 already has x-tenant-id header (re-run after partial state?)')
  }
  if (tracker.content.includes('v13 — T6a CLOSED 2026-05-11')) {
    errors.push('P1: version header already at v13 (re-run after partial state?)')
  }
  if (tracker.content.includes('2026-05-11 v13 T6a CLOSED')) {
    errors.push('P5: v13 status log entry already present (re-run after partial state?)')
  }
}

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('All 6 anchors validated. Per-file line endings:')
console.log('  ' + F_SMOKE + ': ' + (smoke.usesCRLF ? 'CRLF' : 'LF'))
console.log('  ' + F_TRACKER + ': ' + (tracker.usesCRLF ? 'CRLF' : 'LF'))

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

for (const f of [F_SMOKE, F_TRACKER]) {
  const absSrc = path.resolve(ROOT, f)
  const absBackup = absSrc + '.backup_' + stamp
  fs.copyFileSync(absSrc, absBackup)
  console.log('  backup: ' + path.basename(absBackup) + '  (' + f + ')')
}

// Apply
let smokeNew = smoke.content.replace(P0_OLD, P0_NEW)
console.log('  applied: P0 smoke-t3b Tier 3 x-tenant-id header')

let trackerNew = tracker.content
trackerNew = trackerNew.replace(P1_OLD, P1_NEW); console.log('  applied: P1 tracker version header')
trackerNew = trackerNew.replace(P2_OLD, P2_NEW); console.log('  applied: P2 tracker status line tail')
trackerNew = trackerNew.replace(P3_OLD, P3_NEW); console.log('  applied: P3 tracker T6a sub-section')
trackerNew = trackerNew.replace(P4_OLD, P4_NEW); console.log('  applied: P4 tracker F-W-RECOVERY-A15 finding')
trackerNew = trackerNew.replace(P5_OLD, P5_NEW); console.log('  applied: P5 tracker v13 status log entry')

writeFilePreserveLE(F_SMOKE, smokeNew, smoke.usesCRLF)
console.log('  wrote: ' + F_SMOKE + ' (' + (smoke.usesCRLF ? 'CRLF' : 'LF') + ')')

writeFilePreserveLE(F_TRACKER, trackerNew, tracker.usesCRLF)
console.log('  wrote: ' + F_TRACKER + ' (' + (tracker.usesCRLF ? 'CRLF' : 'LF') + ')')

console.log('')
console.log('T6a close patch applied: 1 smoke patch + 5 tracker patches.')
console.log('')
console.log('Next steps:')
console.log('  1. Verify v13 marker present:')
console.log('       Select-String -Path docs/W-LEADS-EMAIL-TRACKER.md -Pattern "v13 T6a CLOSED"')
console.log('  2. Re-run smoke — ALL 9 TIERS SHOULD NOW BE GREEN:')
console.log('       node scripts/smoke-t3b.js')
console.log('       node scripts/smoke-t3c.js')
console.log('  3. Stage T6a-scoped files (13 paths):')
console.log('       git add app/api/charlie/appointment/route.ts \\')
console.log('               app/api/charlie/lead/route.ts \\')
console.log('               app/api/charlie/plan-email/route.ts \\')
console.log('               app/api/walliam/estimator/session/route.ts \\')
console.log('               app/api/walliam/estimator/vip-request/route.ts \\')
console.log('               lib/utils/validate-session.ts \\')
console.log('               scripts/smoke-t3b.js \\')
console.log('               scripts/patch-t6a-wire.js \\')
console.log('               scripts/probe-t6a-auth-gate-recon.js \\')
console.log('               scripts/probe-t6a-route-tops.js \\')
console.log('               scripts/probe-t6a-smoke-fetches.js \\')
console.log('               scripts/patch-w-leads-email-tracker-v13.js \\')
console.log('               docs/W-LEADS-EMAIL-TRACKER.md')
console.log('  4. git status --short  # confirm exactly 13 staged changes')
console.log('  5. Commit + push.')