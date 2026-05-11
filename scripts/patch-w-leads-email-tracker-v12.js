#!/usr/bin/env node
/**
 * patch-w-leads-email-tracker-v12.js
 *
 * Bumps docs/W-LEADS-EMAIL-TRACKER.md to v12 documenting T6b CLOSED:
 * F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER closed via lead_origin_route
 * wire + backfill + smoke harness hotfix.
 *
 * 9 patches, atomic. Validates all anchors before any write.
 * Per-file LE preserved. Backup before write.
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const TARGET = 'docs/W-LEADS-EMAIL-TRACKER.md'

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
// P1: version header bump
// ============================================================================

const P1_OLD = '**Version:** v2 — T0 RECON COMPLETE + T1 DECISION LOCKED'
const P1_NEW = '**Version:** v12 — T6b CLOSED 2026-05-11'

// ============================================================================
// P2: status line tail — replace "Next phase: T6 — Plan integration..."
// ============================================================================

const P2_OLD = '**Next phase: T6 — Plan integration + T6b LIKE-filter replacement** using `lead_origin_route` from T2c (closes F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER).'

const P2_NEW = '**T6 phase IN PROGRESS — T6b ✅ CLOSED 2026-05-11** (F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER closed via `lead_origin_route` lookup at vip-questionnaire route + 8-site caller wiring + idempotent backfill of 15 pre-existing \'unknown\' rows + smoke harness fixture hotfix). **Next: T6 continues — T6a (F-W-RECOVERY-A15 across 5 routes), T6c (source-string hardcoding), T6d (VIP auto-approve fixes), T6e (plan integration verification).**'

// ============================================================================
// P3: T2c sub-phase header tail — flip "T6b application-half pending"
// ============================================================================

const P3_OLD = '(commit `ae8454c`); T6b application-half pending**'
const P3_NEW = '(commit `ae8454c`); T6b application-half ✅ CLOSED 2026-05-11**'

// ============================================================================
// P4: T6b sub-section block — replace 3-line block with CLOSED summary
// ============================================================================

const P4_OLD = [
  '**T6b — F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER**',
  '- Replace `LIKE \'walliam_estimator%\'` with `lead_origin_route = $1` lookup using T2c column',
  '- File: `app/api/walliam/estimator/vip-questionnaire/route.ts:~146`'
].join('\n')

const P4_NEW = [
  '**T6b — F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER — ✅ CLOSED 2026-05-11**',
  '- Replaced `.like(\'source\', \'walliam_estimator%\')` at L147 (8-space indent) and L229 (10-space indent) of `app/api/walliam/estimator/vip-questionnaire/route.ts` with `.eq(\'lead_origin_route\', \'estimator_vip_request\')` (tenant-agnostic, indexed equality).',
  '- Caller-wiring shipped across 8 lead-write sites — every INSERT/UPSERT now sets `lead_origin_route` at write time. `lib/actions/leads.ts` calls `deriveLeadOriginRoute(source)` from the new helper at `lib/utils/lead-origin-route.ts`; other routes hardcode the appropriate route value per their semantic (e.g. `\'charlie\'`, `\'estimator_vip_request\'`, `\'contact_form\'`).',
  '- Idempotent backfill migration `supabase/migrations/20260511_t6b_lead_origin_route_backfill.sql` flipped 15 pre-existing \'unknown\' rows to their proper routes (7 `walliam_charlie` → `charlie`, 3 `walliam_charlie_vip_request` → `charlie_vip_request`, 5 `walliam_estimator_vip_request` → `estimator_vip_request`).',
  '- Smoke harness hotfix: F-T3C-FIXTURE-BYPASSES-LEAD-ORIGIN-ROUTE-WIRE discovered + fixed in passing — `fxInsertLead` in `scripts/smoke-t3c.js` now derives `lead_origin_route` via a JS mirror of the TS helper (third source of truth; lockstep workflow rule added below).',
  '- TSC clean. Smoke 9/9 GREEN (T3b 4/4 + T3c 5/5 including Tier 7 vip-questionnaire end-to-end via `.eq` lookup).'
].join('\n')

// ============================================================================
// P5: F-QUESTIONNAIRE finding — mark CLOSED
// ============================================================================

const P5_OLD = '- **F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER** — `LIKE \'walliam_estimator%\'` in vip-questionnaire route. Fix at T6b via `lead_origin_route` lookup (depends on T2c).'

const P5_NEW = '- **F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER ✅ CLOSED 2026-05-11 (T6b)** — `.like(\'source\', \'walliam_estimator%\')` at L147 + L229 of `app/api/walliam/estimator/vip-questionnaire/route.ts` replaced with `.eq(\'lead_origin_route\', \'estimator_vip_request\')`. Tenant-agnostic, indexed equality lookup. Application-half complete (8-site caller wiring + new helper `lib/utils/lead-origin-route.ts` + idempotent backfill migration mapping 15 pre-existing \'unknown\' rows). Smoke 9/9 GREEN.'

// ============================================================================
// P6: lead writer inventory row 7 — flip T6b column
// ============================================================================

const P6_OLD = '| 7 | `app/api/walliam/estimator/vip-questionnaire/route.ts` | API F57-class UPSERT | Hardcoded LIKE filter | T6b |'
const P6_NEW = '| 7 | `app/api/walliam/estimator/vip-questionnaire/route.ts` | API F57-class UPSERT | ✅ CLOSED 2026-05-11 (T6b) | T6b ✅ |'

// ============================================================================
// P7: new finding F-T3C-FIXTURE-BYPASSES-LEAD-ORIGIN-ROUTE-WIRE
//     append immediately after F-LEADS-REFERER-SOURCE-FALLBACK-FRAGILE
// ============================================================================

const P7_ANCHOR = '- **F-LEADS-REFERER-SOURCE-FALLBACK-FRAGILE** — `lib/actions/leads.ts:139-148` referer-based source detection. Low. Document at T6.'

const P7_NEW_FINDING = '- **F-T3C-FIXTURE-BYPASSES-LEAD-ORIGIN-ROUTE-WIRE ✅ CLOSED 2026-05-11 (T6b hotfix)** — discovered during T6b smoke verification. The `fxInsertLead` helper in `scripts/smoke-t3c.js` was creating tier-7 fixture leads via direct `supabase.from(\'leads\').insert()`, bypassing route-layer wiring that populates `lead_origin_route`. After F9.P2/F9.P3 replaced vip-questionnaire\'s `.like(\'source\', \'walliam_estimator%\')` with `.eq(\'lead_origin_route\', \'estimator_vip_request\')`, the new lookup couldn\'t find fixture leads (column default `\'unknown\'`), and the route fell through to the F9.P1 defensive INSERT path — creating orphan `walliam_estimator_questionnaire` leads instead of enriching the fixture vip-request lead. Smoke checked the fixture\'s audit rows, found 0 (audit rows landed on the orphan), reported FAIL. **Fix:** added JS mirror of `deriveLeadOriginRoute` at top of `smoke-t3c.js` (matching the TS helper at `lib/utils/lead-origin-route.ts` and the SQL CASE in `supabase/migrations/20260510_t2c_lead_origin_route.sql`) + wired `fxInsertLead` to call it on the `source` param. Side effect: TS helper docstring updated to acknowledge the JS mirror as the third source of truth. Workflow rule added below to enforce lockstep updates.'

const P7_OLD = P7_ANCHOR
const P7_NEW = P7_ANCHOR + '\n' + P7_NEW_FINDING

// ============================================================================
// P8: workflow rule — three-source-of-truth lockstep
//     insert between savepoint-isolation rule and local-smoke-first rule
// ============================================================================

const P8_OLD = [
  '- Smoke-via-savepoint-isolation (W-TERRITORY v13).',
  '- Local smoke first; never Vercel preview.'
].join('\n')

const P8_NEW = [
  '- Smoke-via-savepoint-isolation (W-TERRITORY v13).',
  '- **Three-source-of-truth lockstep (W-LEADS-EMAIL T6b 2026-05-11):** the lead-origin-route controlled vocabulary lives in three sites — SQL CASE in `supabase/migrations/20260510_t2c_lead_origin_route.sql`, TS helper at `lib/utils/lead-origin-route.ts`, and JS mirror at top of `scripts/smoke-t3c.js`. All three must update in lockstep when the vocabulary changes; otherwise production routes, backfill SQL, and smoke fixtures will produce different values for the same source string. Each site\'s docstring/comment references the other two.',
  '- Local smoke first; never Vercel preview.'
].join('\n')

// ============================================================================
// P9: v12 status log entry — insert above v11
// ============================================================================

const V12_LINE = [
  '- **2026-05-11 v12 T6b CLOSED — F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER closed** — T6b shipped via 3 patch scripts: ',
  '`scripts/patch-t6b-wire.js` (v2 with CRLF-aware line-ending handling + atomic 10-anchor validation), ',
  '`scripts/patch-smoke-t3c-fixture-lead-origin-route.js` (harness fixture fix), and ',
  '`scripts/probe-smoke-t3c-tier7-fixture.js` (read-only probe of the smoke harness before patching). ',
  '**Wire changes across 8 lead-write sites:** `app/api/walliam/contact/route.ts` F3.P1 (hardcoded `lead_origin_route: \'contact_form\'`), ',
  '`app/api/walliam/charlie/vip-request/route.ts` F4.P1 (`\'charlie_vip_request\'`), ',
  '`app/api/charlie/plan-email/route.ts` F5.P1 (`\'charlie\'`), ',
  '`lib/actions/leads.ts` F6.P1+F6.P2 (helper import + `deriveLeadOriginRoute(source)` derivation in INSERT — canonical multitenant pattern), ',
  '`app/api/charlie/appointment/route.ts` F7.P1 (`\'charlie\'`), ',
  '`app/api/charlie/lead/route.ts` F8.P1 (`\'charlie\'`), ',
  '`app/api/walliam/estimator/vip-questionnaire/route.ts` F9.P1+F9.P2+F9.P3 (defensive INSERT `\'estimator_questionnaire\'` + two `.like(\'source\', \'walliam_estimator%\')` filters at L147 (8-space indent) and L229 (10-space indent) replaced with `.eq(\'lead_origin_route\', \'estimator_vip_request\')`), ',
  '`app/api/walliam/estimator/vip-request/route.ts` F10.P1 (`\'estimator_vip_request\'`). ',
  '**2 new files:** `lib/utils/lead-origin-route.ts` (TS helper exporting `deriveLeadOriginRoute(source)` + `LeadOriginRoute` type, mirrors T2c SQL CASE) + `supabase/migrations/20260511_t6b_lead_origin_route_backfill.sql` (idempotent backfill `WHERE lead_origin_route = \'unknown\'`, applied in production, flipped 15 pre-existing rows: 7 `walliam_charlie` → `charlie`, 3 `walliam_charlie_vip_request` → `charlie_vip_request`, 5 `walliam_estimator_vip_request` → `estimator_vip_request`). ',
  '**Two v1 failure modes hit during patch development, both root-caused and fixed in v2:** (a) F4.P1 + F5.P1 anchors failed with 0 matches because `app/api/walliam/charlie/vip-request/route.ts` and `app/api/charlie/plan-email/route.ts` are CRLF (the rest of the codebase is LF) and the `j(\'\\n\')` joiner produced LF-only anchors — v2 normalizes CRLF→LF on read, validates against the LF buffer, and writes back with the original per-file line ending preserved (LE detection map: `app/api/walliam/contact/route.ts` LF, `app/api/walliam/charlie/vip-request/route.ts` CRLF, `app/api/charlie/plan-email/route.ts` CRLF, `lib/actions/leads.ts` LF, all others LF); ',
  '(b) F9.P2 anchor matched twice because the 8-space `.like(...)` substring is a substring of the 10-space variant at L229 — v2 prefixes line-anchored substrings with `\\n` to force line-start anchoring (and prefixes the replacement too to preserve the line boundary). ',
  '**Regression discovered and fixed during smoke verification** — F-T3C-FIXTURE-BYPASSES-LEAD-ORIGIN-ROUTE-WIRE (logged in findings catalog under Bug fixes T6 section): the `fxInsertLead` helper in `scripts/smoke-t3c.js` was creating tier-7 fixture leads via direct DB insert, bypassing the new route-layer wire. After F9.P2 changed vip-questionnaire\'s existing-lead lookup, the new `.eq` couldn\'t find fixture leads (column defaulted to `\'unknown\'`) and the route fell through to F9.P1 defensive INSERT — creating orphan `walliam_estimator_questionnaire` leads instead of enriching the fixture. Smoke checked the fixture\'s audit rows, found 0, reported FAIL. ',
  '**Fix:** added JS mirror of `deriveLeadOriginRoute` to top of `smoke-t3c.js` (matching the TS helper and SQL CASE at the vocabulary level) + wired `fxInsertLead` to call `deriveLeadOriginRoute(source)` in its INSERT. Side effect: TS helper docstring at `lib/utils/lead-origin-route.ts` updated to acknowledge the JS mirror as a third source of truth — new workflow rule added to enforce lockstep updates across all three sites. ',
  '**Final smoke 9/9 GREEN:** T3b Tier 1-4 (route insertions populate `lead_origin_route` at write time via helper derivation in `lib/actions/leads.ts` for tier 4, hardcoded values for tiers 1-3); T3c Tier 5/6 (charlie/appointment + charlie/lead with INSERT+UPDATE paths, F2.P2 leadId-fix re-verified end-to-end), Tier 7 (vip-questionnaire enriches the fixture lead via `.eq(\'lead_origin_route\', \'estimator_vip_request\')` — the new tenant-agnostic lookup), Tier 8 (vip-request fresh insert + audit, source=`walliam_estimator_vip_request` → `estimator_vip_request`), Tier 9 (vip-approve verify-skip preserved per F-LERL-RECIPIENT-LAYER-USER-FACING-GAP). ',
  '**Post-backfill verify:** 0 backfillable production rows remain at `\'unknown\'`. The 13 remaining `\'unknown\'` rows are all smoke-fixture sources (`t3b_smoke`, `t3b_smoke_tier1`, `t3b_smoke_tier4`) that intentionally don\'t match any production source pattern in the CASE — acceptable and expected (e.g. `t3b_smoke_tier4` is the tier-4 smoke source string that goes through `lib/actions/leads.ts::getOrCreateLead` and falls through `deriveLeadOriginRoute` to `\'unknown\'` because it doesn\'t match any pattern). ',
  '**Files in this commit:** 8 modified route/lib files (wire: `app/api/walliam/contact/route.ts`, `app/api/walliam/charlie/vip-request/route.ts`, `app/api/charlie/plan-email/route.ts`, `lib/actions/leads.ts`, `app/api/charlie/appointment/route.ts`, `app/api/charlie/lead/route.ts`, `app/api/walliam/estimator/vip-questionnaire/route.ts`, `app/api/walliam/estimator/vip-request/route.ts`), 1 modified harness file (`scripts/smoke-t3c.js`), 2 new files (`lib/utils/lead-origin-route.ts` + `supabase/migrations/20260511_t6b_lead_origin_route_backfill.sql`), 4 new patch/probe scripts (`scripts/patch-t6b-wire.js`, `scripts/patch-smoke-t3c-fixture-lead-origin-route.js`, `scripts/probe-smoke-t3c-tier7-fixture.js`, `scripts/patch-w-leads-email-tracker-v12.js`), `docs/W-LEADS-EMAIL-TRACKER.md` (v11→v12 bump in this script). ',
  '**Next:** T6 continues — T6a (F-W-RECOVERY-A15 across 5 routes: extract `validateSession` helper using `tenants.source_key`), T6c (source-string hardcoding refactor in 5 routes), T6d (VIP auto-approve fixes for F-VIP-AUTO-APPROVE-ONLY-WRITES-BUYER-PLAN-LIMIT + F-VIP-AUTO-APPROVE-USES-CHAT-LIMIT-FOR-PLAN-REQUESTS), T6e (plan integration verification per OD-4=(c)). After T6: T7 smoke matrix (OD-6=(c)), T8 regression sweep, Tlast close.'
].join('')

const P9_OLD = '- **2026-05-11 v11 T5 CLOSED — OD-5=(a) FINAL**'
const P9_NEW = V12_LINE + '\n' + P9_OLD

// ============================================================================
// Atomic validation
// ============================================================================

if (!exists(path.resolve(ROOT, TARGET))) {
  console.error('FAIL: ' + TARGET + ' not found at ' + path.resolve(ROOT, TARGET))
  process.exit(1)
}

const { content: original, usesCRLF } = readFileLF(TARGET)

const patches = [
  { name: 'P1 version header', old: P1_OLD, new: P1_NEW },
  { name: 'P2 status line tail', old: P2_OLD, new: P2_NEW },
  { name: 'P3 T2c sub-phase tail', old: P3_OLD, new: P3_NEW },
  { name: 'P4 T6b sub-section block', old: P4_OLD, new: P4_NEW },
  { name: 'P5 F-QUESTIONNAIRE finding', old: P5_OLD, new: P5_NEW },
  { name: 'P6 lead writer inventory row 7', old: P6_OLD, new: P6_NEW },
  { name: 'P7 F-T3C-FIXTURE finding append', old: P7_OLD, new: P7_NEW },
  { name: 'P8 three-source-of-truth workflow rule', old: P8_OLD, new: P8_NEW },
  { name: 'P9 v12 status log entry', old: P9_OLD, new: P9_NEW },
]

const errors = []
for (const p of patches) {
  const c = countOccurrences(original, p.old)
  if (c !== 1) errors.push(p.name + ': expected 1 anchor match, found ' + c)
}

// Re-run guards
if (original.includes('v12 — T6b CLOSED 2026-05-11')) {
  errors.push('P1: version already at v12 (re-run after partial state?)')
}
if (original.includes('T6b application-half ✅ CLOSED 2026-05-11')) {
  errors.push('P3: T2c entry already shows T6b CLOSED (re-run after partial state?)')
}
if (original.includes('F-T3C-FIXTURE-BYPASSES-LEAD-ORIGIN-ROUTE-WIRE')) {
  errors.push('P7: F-T3C-FIXTURE finding already present (re-run after partial state?)')
}
if (original.includes('Three-source-of-truth lockstep')) {
  errors.push('P8: workflow rule already present (re-run after partial state?)')
}
if (original.includes('2026-05-11 v12 T6b CLOSED')) {
  errors.push('P9: v12 status log entry already present (re-run after partial state?)')
}

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('All 9 anchors validated. Line endings: ' + (usesCRLF ? 'CRLF' : 'LF'))

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

const absSrc = path.resolve(ROOT, TARGET)
const absBackup = absSrc + '.backup_' + stamp
fs.copyFileSync(absSrc, absBackup)
console.log('backup: ' + path.basename(absBackup))

let content = original
for (const p of patches) {
  content = content.replace(p.old, p.new)
  console.log('  applied: ' + p.name)
}

writeFilePreserveLE(TARGET, content, usesCRLF)
console.log('wrote: ' + TARGET + ' (' + (usesCRLF ? 'CRLF' : 'LF') + ')')

console.log('')
console.log('Tracker bumped: v11 → v12. T6b CLOSED documented.')
console.log('')
console.log('Next steps:')
console.log('  1. Verify v12 marker present:')
console.log('       Select-String -Path docs/W-LEADS-EMAIL-TRACKER.md -Pattern "v12 T6b CLOSED"')
console.log('  2. Stage T6b-scoped files only (15 paths):')
console.log('       git add app/api/charlie/appointment/route.ts \\')
console.log('               app/api/charlie/lead/route.ts \\')
console.log('               app/api/charlie/plan-email/route.ts \\')
console.log('               app/api/walliam/charlie/vip-request/route.ts \\')
console.log('               app/api/walliam/contact/route.ts \\')
console.log('               app/api/walliam/estimator/vip-questionnaire/route.ts \\')
console.log('               app/api/walliam/estimator/vip-request/route.ts \\')
console.log('               lib/actions/leads.ts \\')
console.log('               lib/utils/lead-origin-route.ts \\')
console.log('               scripts/smoke-t3c.js \\')
console.log('               scripts/patch-t6b-wire.js \\')
console.log('               scripts/patch-smoke-t3c-fixture-lead-origin-route.js \\')
console.log('               scripts/probe-smoke-t3c-tier7-fixture.js \\')
console.log('               scripts/patch-w-leads-email-tracker-v12.js \\')
console.log('               supabase/migrations/20260511_t6b_lead_origin_route_backfill.sql \\')
console.log('               docs/W-LEADS-EMAIL-TRACKER.md')
console.log('  3. Verify exactly 15 changes staged:')
console.log('       git status --short')
console.log('       (15 lines starting with M or A; rest stays untracked)')
console.log('  4. Commit + push.')