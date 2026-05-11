#!/usr/bin/env node
/**
 * patch-w-leads-email-tracker-v14.js
 *
 * Closes T6c in W-LEADS-EMAIL workstream.
 *
 * One file modified atomically:
 *   docs/W-LEADS-EMAIL-TRACKER.md — v13 → v14 with T6c CLOSED bookkeeping.
 *
 * 3 atomic patches:
 *   P1: version header v13 → v14
 *   P2: status line — promote T6c from "Next:" to "CLOSED", introduce T6f as new "Next:"
 *   P3: insert v14 status log entry above the v13 entry
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const F = 'docs/W-LEADS-EMAIL-TRACKER.md'

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
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
}

// ============================================================================
// P1: version header
// ============================================================================

const P1_OLD = "**Version:** v13 — T6a CLOSED 2026-05-11"
const P1_NEW = "**Version:** v14 — T6c CLOSED 2026-05-11"

// ============================================================================
// P2: status line (full v13 line → full v14 line)
// ============================================================================

const P2_OLD = "**T6 phase IN PROGRESS — T6a + T6b ✅ CLOSED 2026-05-11.** T6a closed F-W-RECOVERY-A15-AUTH-GATE-HARDCODED-WALLIAM-SOURCE via new tenant-aware `validateSession` helper (`lib/utils/validate-session.ts`) wired into 3 routes (charlie/lead, charlie/plan-email, charlie/appointment) + inline `tenant.source_key` swap in estimator/session (Shape B: existing tenant SELECT extended with source_key, L100 + L118 source literals swapped) + reorder-and-extend in estimator/vip-request (Shape C: source check moved below existing tenant load, tenant SELECT extended with source_key). T6b closed F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER via `lead_origin_route` lookup at vip-questionnaire route + 8-site caller wiring + idempotent backfill. **Next: T6 continues — T6c (source-string hardcoding), T6d (VIP auto-approve fixes), T6e (plan integration verification).**"

const P2_NEW = "**T6 phase IN PROGRESS — T6a + T6b + T6c ✅ CLOSED 2026-05-11.** T6a closed F-W-RECOVERY-A15-AUTH-GATE-HARDCODED-WALLIAM-SOURCE via new tenant-aware `validateSession` helper (`lib/utils/validate-session.ts`) wired into 3 routes (charlie/lead, charlie/plan-email, charlie/appointment) + inline `tenant.source_key` swap in estimator/session (Shape B: existing tenant SELECT extended with source_key, L100 + L118 source literals swapped) + reorder-and-extend in estimator/vip-request (Shape C: source check moved below existing tenant load, tenant SELECT extended with source_key). T6b closed F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER via `lead_origin_route` lookup at vip-questionnaire route + 8-site caller wiring + idempotent backfill. T6c closed source-string hardcoding refactor across 5 routes: `validateSession` helper extended to also return `sourceKey`; 3 Shape A routes destructure sourceKey from helper return; estimator/vip-request promotes existing `tenant.source_key` to const post T6a check; estimator/vip-questionnaire adds conditional tenant SELECT with ternary fallback. 17 atomic anchors across 6 files; substring-overlap bug at P5.4/P6.3 caught by atomic validation gate, fixed via `\\n` line-boundary prefix on those 2 anchors. Both smokes 9/9 GREEN post-patch. **Next: T6 continues — T6d (VIP auto-approve fixes), T6e (plan integration verification), T6f (brand-strings & URL hardcoding — newly split from F-ESTIMATOR-VIP-REQUEST-MULTITENANT-DEBT during T6c recon).**"

// ============================================================================
// P3: v14 status log entry (inserted above v13 entry)
// ============================================================================

const V14_ENTRY = [
  "- **2026-05-11 v14 T6c CLOSED — source-string hardcoding refactor across 5 routes** — ",
  "T6c shipped via 5 scripts: 3 read-only probes (`scripts/probe-t6c-source-hardcodes.js` enumerated `/walliam/i` line hits + sourceKey-scope status + source-field assignments across 7 candidate route files plus helper full dump, ",
  "`scripts/probe-t6c-context.js` dumped line-context windows around validateSession call sites + tenant load regions + lead INSERT regions for anchor-design, ",
  "`scripts/probe-t6c-diag.js` JSON-dumped exact line content for the P5.4/P6.3 anchor failure analysis), ",
  "`scripts/patch-t6c-wire.js` (the wire patch — 17 atomic anchor patches across 6 files), and ",
  "`scripts/patch-t6c-anchor-fix.js` (line-boundary `\\n` prefix added to 4 anchor strings for P5.4 + P6.3 after first validation gate caught the 8-space anchors matching as substrings of their deeper-indented siblings P5.3 (10-space) / P6.2 (12-space)). ",
  "**Final T6c scope: 5 routes, not 7.** Probe-t6c-source-hardcodes revealed (1) `estimator/vip-approve` has zero source-field hits — entire file is brand-strings, pushed to T6f; (2) `estimator/session` L86 `let agentName = 'WALLiam'` is a display fallback not a source field, also pushed to T6f. ",
  "**Helper extension (`lib/utils/validate-session.ts`):** `ValidateSessionResult` success variant gained `sourceKey: string` field; L76 return statement now returns `tenant.source_key`, guaranteed non-null after the L59 narrowing check. Backward-compatible additive change — existing callers that don't read sourceKey still compile and run. ",
  "**Shape A routes (charlie/lead, charlie/plan-email, charlie/appointment):** auth-gate region extended from 4 lines to 5 with `const sourceKey = _sessionCheck.sourceKey  // T6c — for source-field templating` immediately after `const validSession = _sessionCheck.session`. Source-field literals replaced with `${sourceKey}_charlie` template (3 routes) and `${sourceKey}_appointment` (charlie/appointment L250). charlie/lead L172 `.eq('source', ...)` filter also templated. ",
  "**Shape C route (estimator/vip-request):** T6a already loaded `tenant.source_key` in the existing tenant SELECT at L87-91; T6c added `const sourceKey = tenant.source_key  // T6c` immediately after the T6a check at L98 (where source_key is guaranteed non-null), then replaced 3 hardcoded literals — L169 `request_source: 'walliam_estimator'`, L198 + L280 `source: 'walliam_estimator_vip_request'` — with `${sourceKey}_*` templates. ",
  "**Shape D route (estimator/vip-questionnaire) — no existing tenant load:** added conditional tenant SELECT block before the L136 lead block (`let sourceKey: string | null = null` + conditional load gated on `tenantId` truthy via a `t6cTenant` variable name to avoid collision with any future tenant binding). Used ternary fallback `sourceKey ? `${sourceKey}_estimator_questionnaire` : 'walliam_estimator_questionnaire'` at both literal sites (L182 defensive INSERT + L272 activity tracking) — fallback preserves prior behavior on the degenerate `tenantId === null` path, multitenant-correct on the happy path. ",
  "**Anchor design bug caught by atomic validation gate:** initial P5.4 + P6.3 anchors (8-space-indented source-field lines) were string substrings of P5.3 (10-space at L198) and P6.2 (12-space at L182) at offset 2 / offset 4 respectively. `countOccurrences()` returned 2 instead of 1 for each → validation FAIL → zero writes (atomic protection held perfectly). Fix added `\\n` prefix to OLD+NEW for both, forcing line-boundary match; re-run gave count=1 for both, 17 anchors validated, 6 files patched with original per-file LE preserved (LF for 5 files, CRLF for charlie/plan-email). ",
  "**Verification post-patch:** structural spot-check confirms 11 `${sourceKey}_*` template literals + 5 sourceKey declarations + 1 helper return-type extension. TSC clean (`npx tsc --noEmit` silent). Smoke regression: T3b 4/4 GREEN, T3c 5/5 GREEN — 9/9 total. Tier 8 (estimator/vip-request Shape C) explicitly logged `source=walliam_estimator_vip_request` in the inserted lead row, confirming the template literal evaluates correctly at runtime (sourceKey resolves to `'walliam'` for tenant `b16e1039-38ed-43d7-bbc5-dd02bb651bc9`, byte-for-byte identical to pre-T6c output — zero observable behavior change for tenant #1, multitenant-correct for tenant #2+ onboarding). ",
  "**T6f scope created during T6c recon** (not deferred — same-session sequence per Rule Zero): brand-strings & URL hardcoding refactor covering BASE_URL fallbacks (5 routes), HTML email branding strings (`WALLiam`, `walliam.ca`), email subject lines, `userName || 'WALLiam User'` fallbacks (5 sites), `agentName = 'WALLiam'` at estimator/session L86 (F-ESTIMATOR-SESSION-HARDCODED-WALLIAM-AGENT-NAME-FALLBACK), and entire `estimator/vip-approve/route.ts` file (zero source-field hits — all brand-strings). ",
  "**Files in this commit:** 1 modified helper (`lib/utils/validate-session.ts`), 5 modified route files (charlie/lead, charlie/plan-email, charlie/appointment, walliam/estimator/vip-request, walliam/estimator/vip-questionnaire), 5 new probe/patch scripts (`scripts/probe-t6c-source-hardcodes.js`, `scripts/probe-t6c-context.js`, `scripts/probe-t6c-diag.js`, `scripts/patch-t6c-wire.js`, `scripts/patch-t6c-anchor-fix.js`), 1 tracker patch script (`scripts/patch-w-leads-email-tracker-v14.js`), and `docs/W-LEADS-EMAIL-TRACKER.md` (v13→v14 bump in this script). ",
  "**Next:** T6d (VIP auto-approve fixes — isolated bug fixes in `walliam/charlie/vip-request` per existing tracker scope), T6e (plan integration verification per OD-4=(c)), T6f (brand-strings & URL hardcoding refactor as above). After T6: T7 smoke matrix with cross-tenant regression guards, T8 sweep, Tlast close."
].join("")

const P3_OLD = "- **2026-05-11 v13 T6a CLOSED — F-W-RECOVERY-A15-AUTH-GATE-HARDCODED-WALLIAM-SOURCE closed**"
const P3_NEW = V14_ENTRY + "\n" + P3_OLD

// ============================================================================
// VALIDATION + APPLY
// ============================================================================

if (!exists(path.resolve(ROOT, F))) {
  console.error('FAIL: file not found: ' + F)
  process.exit(1)
}

const file = readFileLF(F)
const errors = []

if (countOccurrences(file.content, P1_OLD) !== 1) errors.push('P1 (version header): expected 1 match')
if (countOccurrences(file.content, P2_OLD) !== 1) errors.push('P2 (status line tail): expected 1 match')
if (countOccurrences(file.content, P3_OLD) !== 1) errors.push('P3 (v13 anchor for v14 insertion): expected 1 match')

// Re-run guards
if (file.content.includes("**Version:** v14 — T6c CLOSED 2026-05-11")) {
  errors.push('P1: version header already at v14 (re-run state)')
}
if (file.content.includes("2026-05-11 v14 T6c CLOSED")) {
  errors.push('P3: v14 entry already present (re-run state)')
}

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('All 3 anchors validated. File line-endings: ' + (file.usesCRLF ? 'CRLF' : 'LF'))

const ts = makeTimestamp()
const backupRel = F + '.backup_' + ts
const backupBytes = file.usesCRLF ? file.content.replace(/\n/g, '\r\n') : file.content
fs.writeFileSync(path.resolve(ROOT, backupRel), backupBytes, 'utf8')
console.log('  backup: ' + backupRel)

const updated = file.content
  .replace(P1_OLD, P1_NEW)
  .replace(P2_OLD, P2_NEW)
  .replace(P3_OLD, P3_NEW)

writeFilePreserveLE(F, updated, file.usesCRLF)
console.log('  wrote:  ' + F + ' (' + (file.usesCRLF ? 'CRLF' : 'LF') + ')')

console.log('')
console.log('T6c close patch applied: 3 atomic patches (version + status line + v14 entry).')
console.log('')
console.log('Verify v14 marker:')
console.log('  Select-String -Path ' + F + ' -Pattern "v14 T6c CLOSED"')