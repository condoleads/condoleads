// scripts/patch-w-leads-email-tracker-v17.js
//
// W-LEADS-EMAIL tracker v16 -> v17.
//
// Closes T6f-B sub-phase entirely with B-3 + B-4 paired entry (matching
// v15 -> v16 B-1+B-2 pairing pattern). 5 atomic anchor-validated patches:
//
//   P1  Version header v16 -> v17
//   P2A Status line mid-string: T6 IN PROGRESS chain extended (B-1+B-2 -> B-1+B-2+B-3+B-4)
//   P2B Status line tail: Next: drops B-3/B-4 mentions, adds commit chain
//   P3  v17 entry inserted above v16 (capturing B-3 60bc358 + B-4 529aeae)
//   P4  F-ESTIMATOR-VIP-REQUEST-MULTITENANT-DEBT marked CLOSED
//   P5  F-ESTIMATOR-VIP-APPROVE-MULTITENANT-DEBT marked CLOSED
//
// Re-runnable: re-run guards check for v17 markers; abort cleanly if present.
// CRLF-aware: normalizes on read, preserves on write.

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const F = 'docs/W-LEADS-EMAIL-TRACKER.md'

function exists(p) { try { fs.statSync(p); return true } catch { return false } }

function readFileLF(p) {
  const abs = path.resolve(ROOT, p)
  const raw = fs.readFileSync(abs, 'utf8')
  const usesCRLF = raw.includes('\r\n')
  const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw
  return { content, usesCRLF }
}

function writeFilePreserveLE(p, content, usesCRLF) {
  const abs = path.resolve(ROOT, p)
  const out = usesCRLF ? content.replace(/\n/g, '\r\n') : content
  fs.writeFileSync(abs, out, 'utf8')
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0
  let count = 0
  let i = 0
  while ((i = haystack.indexOf(needle, i)) !== -1) { count++; i += needle.length }
  return count
}

// ============================================================================
// P1 — Version header
// ============================================================================

const P1_OLD = "**Version:** v16 — T6f-B-1 + T6f-B-2 CLOSED 2026-05-11"
const P1_NEW = "**Version:** v17 — T6f-B FULLY CLOSED 2026-05-11 (B-1 + B-2 + B-3 + B-4 all shipped)"

// ============================================================================
// P2A — Status line mid-string: T6 phase IN PROGRESS chain
// ============================================================================

const P2A_OLD = "**T6 phase IN PROGRESS — T6a + T6b + T6c + T6f-A + T6f-B-1 + T6f-B-2 ✅ CLOSED 2026-05-11.**"
const P2A_NEW = "**T6 phase IN PROGRESS — T6a + T6b + T6c + T6f-A + T6f-B (B-1 + B-2 + B-3 + B-4) ✅ CLOSED 2026-05-11.**"

// ============================================================================
// P2B — Status line tail: Next: block
// ============================================================================

const P2B_OLD = "**Next: T6 continues — T6f-B-3 (vip-approve — positional buildUserApprovalEmailHtml restructure + createHtmlResponse extension across 9 call sites + L218 page title brand-text), T6f-B-4 (vip-request — 2 helpers + URL refactor at L215 baseUrl assignment + 5 helper-body substitution sites including L432 user-fallback comparison conditional and L482 inline URL inside helper body), T6f-C (walliam/charlie/vip-approve + walliam/contact with new tenant load via getTenantContext helper from T6f-A + T6c-leftover cleanup at contact L113/L175), T6d (VIP auto-approve fixes), T6e (plan integration verification per OD-4=(c)).**"

const P2B_NEW = "**Next: T6 continues — T6f-C (walliam/charlie/vip-approve + walliam/contact with new tenant load via getTenantContext helper from T6f-A + T6c-leftover cleanup at contact L113/L175), T6d (VIP auto-approve fixes), T6e (plan integration verification per OD-4=(c)). T6f-B fully closed: B-1 + B-2 (commit `99de227` v16) + B-3 (commit `60bc358`) + B-4 (commit `529aeae`).**"

// ============================================================================
// P3 — v17 entry insertion above v16
// ============================================================================

const V17_ENTRY =
  "- **2026-05-11 v17 T6f-B FULLY CLOSED — brand-strings + URL refactor across remaining 2 estimator routes (vip-approve + vip-request)** — " +
  "T6f-B sub-phase complete: v16 captured B-1 + B-2 closure; v17 captures B-3 + B-4 closure (commits `60bc358` + `529aeae`) matching the v15 → v16 pairing pattern. " +
  "Total 4-of-4 estimator routes refactored: vip-questionnaire (B-1), session (B-2), vip-approve (B-3), vip-request (B-4). " +
  "**T6f-B-3 (vip-approve, commit `60bc358`):** 246-line CRLF no-BOM file. Brand-strings + URL refactor. " +
  "Probe captured 13 /walliam/i hits, 0 BASE_URL identifier refs (clean — no module-level constant to relocate), " +
  "1 inline `process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca'` inside helper body at L198. " +
  "Two tenant SELECTs in conditional branches (L69 happy-path + L102 already-processed path) — both extended in parallel with `brand_name, name, domain` appended after existing source_key field. " +
  "brandName + domain declared at function scope post initial tenant SELECT via T6c sourceKey pattern. " +
  "`buildUserApprovalEmailHtml(userName, agentName, attemptsGranted)` positional helper at L186 extended with 3 appended positional params (brandName, domain, baseUrl). " +
  "`createHtmlResponse` factory at L205 extended for tenant-aware page title at L218 (HTML title brand wordmark swapped to brandName template). " +
  "5 call sites of createHtmlResponse extended with brandName argument. Subject at L156 + agent-fallback at L159 templated. " +
  "Tier 9 (vip-approve verify-skip) HTTP 200 + status transition pending → approved confirmed end-to-end. " +
  "**T6f-B-4 (vip-request, commit `529aeae`):** 490-line LF no-BOM file, 17 atomic anchors via `scripts/patch-t6f-b-4-vip-request-wire.js`. " +
  "Densest estimator route — 31 /walliam/i hits per probe. **Anchors:** " +
  "(A1) import `buildBaseUrl` from `lib/utils/tenant-brand` (T6f-A helper); " +
  "(A2) tenant SELECT extended with `brand_name, name, domain` (3 estimator_* columns preserved); " +
  "(A3) brandName + domain declarations appended after L101 T6c sourceKey decl; " +
  "(A4-A5-A8) three user-name fallback strings at L166 (vip_requests INSERT full_name), L196 (leads INSERT contact_name), L220 (buildApprovalEmailHtml typed-object call fullName field) — distinguishable by indent prefix (8/10/6 spaces) so atomic-anchor matches passed 1× each; " +
  "(A6) L203 lead message brand-string templated with buildingName ternary preserved verbatim; " +
  "(A7) L215 baseUrl: env fallback replaced with `buildBaseUrl(domain)` (env fallback eliminated — tenant.domain is NOT NULL per W-TENANT-AUTH Phase 2 schema); " +
  "(A9) L245 chain subject templated; " +
  "(A10) L331-L332 auto-approve user email path — subject + positional buildUserApprovalEmailHtml call extended with 3 new positional args (brandName, domain, baseUrl); " +
  "(A11) buildApprovalEmailHtml typed-object signature at L407-L416 — brandName: string field appended; " +
  "(A12) L420 helper wordmark templated; " +
  "(A13) L432 user-fallback comparison `data.fullName !== 'WALLiam User'` → comparison against template-literal `\\\`${data.brandName} User\\\`` — **multitenant-correctness fix** (without this, tenant-2 auto-fallback like \"BrandX User\" would never be suppressed by the conditional, since the comparison was against a tenant-1 literal); " +
  "(A14) buildUserApprovalEmailHtml positional sig at L467 — appended 3 new positional params; " +
  "(A15-A16-A17) 3 helper body sites — brand line, inline URL, link text. " +
  "Tier 8 (estimator/vip-request POST) HTTP 200 + lead `08990c18-...` created with source `walliam_estimator_vip_request` + 2 audit rows + resend_message_id confirmed. " +
  "**Pattern consistent with v16 lesson:** Shape B/C routes extend their EXISTING tenant SELECT inline rather than calling `getTenantContext` helper — " +
  "saves a DB roundtrip when the route already loads tenant for other config purposes (T6c sourceKey or estimator config). " +
  "`getTenantContext` remains the right entry point for routes with NO existing tenant SELECT (T6f-C's walliam/contact route which currently has zero tenant load). " +
  "**TSC silent both patches.** **Smoke 9/9 GREEN both wires** — Tier 9 verifies B-3, Tier 8 verifies B-4, Tiers 1-7 stay GREEN (no transitive regression). " +
  "For WALLiam tenant `b16e1039-38ed-43d7-bbc5-dd02bb651bc9` brandName resolves to \"WALLiam\" via fallback chain and domain to \"walliam.ca\" — observable HTTP 200 + lead/audit shape byte-identical with multitenant-correct architecture for future tenants. " +
  "**Findings retired in v17:** F-ESTIMATOR-VIP-REQUEST-MULTITENANT-DEBT (T6c retired source-strings + T6f-B-4 retired brand/URL), F-ESTIMATOR-VIP-APPROVE-MULTITENANT-DEBT (T6f-B-3 retired entirely — T6c probe confirmed vip-approve has zero source-field hits, all brand-strings, so deferred from T6c to T6f-B-3). " +
  "**Files in v17 scope:** 2 modified routes (`app/api/walliam/estimator/vip-approve/route.ts`, `app/api/walliam/estimator/vip-request/route.ts`), " +
  "2 new wire patch scripts (`scripts/patch-t6f-b-3-vip-approve-wire.js`, `scripts/patch-t6f-b-4-vip-request-wire.js`), " +
  "1 tracker state probe script (`scripts/probe-w-leads-email-tracker-v16-state.js`), " +
  "`scripts/patch-w-leads-email-tracker-v17.js` (this script), and `docs/W-LEADS-EMAIL-TRACKER.md` (v16 → v17 in this script). " +
  "**Next:** T6f-C (walliam/charlie/vip-approve + walliam/contact with new tenant load via getTenantContext helper from T6f-A + T6c-leftover cleanup at contact L113/L175 source literals), " +
  "T6d (VIP auto-approve fixes — isolated bug fixes in walliam/charlie/vip-request predating this session), " +
  "T6e (plan integration verification per OD-4=(c)). After T6: T7 smoke matrix with cross-tenant regression guards, T8 sweep, Tlast close."

const P3_OLD = "- **2026-05-11 v16 T6f-B-1 + T6f-B-2 CLOSED — brand-strings + URL refactor across 2 of 4 estimator routes (Shape B/C pattern)**"
const P3_NEW = V17_ENTRY + "\n" + P3_OLD

// ============================================================================
// P4 — F-ESTIMATOR-VIP-REQUEST-MULTITENANT-DEBT closure
// ============================================================================

const P4_OLD = "- **F-ESTIMATOR-VIP-REQUEST-MULTITENANT-DEBT** — 6 hardcoded `'walliam'` references. T6c."
const P4_NEW = "- **F-ESTIMATOR-VIP-REQUEST-MULTITENANT-DEBT ✅ CLOSED 2026-05-11 (T6c + T6f-B-4 `529aeae`)** — 6 hardcoded `'walliam'` references retired across vip-request route: 3 source-strings via T6c (`${sourceKey}_*` templates), 3 brand-strings + URL fallback via T6f-B-4 (`${brandName}` + `buildBaseUrl(domain)` via T6f-A helper). 17 atomic anchors in T6f-B-4 wire. Smoke 9/9 GREEN, TSC silent."

// ============================================================================
// P5 — F-ESTIMATOR-VIP-APPROVE-MULTITENANT-DEBT closure
// ============================================================================

const P5_OLD = "- **F-ESTIMATOR-VIP-APPROVE-MULTITENANT-DEBT** — same. T6c."
const P5_NEW = "- **F-ESTIMATOR-VIP-APPROVE-MULTITENANT-DEBT ✅ CLOSED 2026-05-11 (T6f-B-3 `60bc358`)** — brand-strings refactored to tenant-aware `${brandName}` / `${domain}` / `${baseUrl}` templates via T6f-B-3. T6c-probe-confirmed vip-approve has zero source-field hits (all brand-strings), deferred from T6c to T6f-B-3. Positional buildUserApprovalEmailHtml extended with 3 new params; createHtmlResponse factory + page title + 5 call sites extended. Smoke 9/9 GREEN (Tier 9 verify-skip)."

// ============================================================================
// Patch list
// ============================================================================

const patches = [
  { name: 'P1 version header v16 -> v17', old: P1_OLD, new: P1_NEW },
  { name: 'P2A status line T6 IN PROGRESS chain extended', old: P2A_OLD, new: P2A_NEW },
  { name: 'P2B status line Next: tail rewritten', old: P2B_OLD, new: P2B_NEW },
  { name: 'P3 v17 entry insertion above v16', old: P3_OLD, new: P3_NEW },
  { name: 'P4 F-ESTIMATOR-VIP-REQUEST-MULTITENANT-DEBT closure', old: P4_OLD, new: P4_NEW },
  { name: 'P5 F-ESTIMATOR-VIP-APPROVE-MULTITENANT-DEBT closure', old: P5_OLD, new: P5_NEW },
]

// ============================================================================
// Validation
// ============================================================================

const errors = []

if (!exists(path.resolve(ROOT, F))) {
  errors.push('file not found: ' + F)
}

let fileState = null
if (errors.length === 0) {
  fileState = readFileLF(F)

  for (const p of patches) {
    const c = countOccurrences(fileState.content, p.old)
    if (c !== 1) errors.push(p.name + ': expected 1 anchor match, found ' + c)
  }

  // Re-run guards
  const reRunMarkers = [
    { name: 'P1 re-run', needle: '**Version:** v17 — T6f-B FULLY CLOSED' },
    { name: 'P3 re-run', needle: '2026-05-11 v17 T6f-B FULLY CLOSED' },
    { name: 'P4 re-run', needle: 'F-ESTIMATOR-VIP-REQUEST-MULTITENANT-DEBT ✅ CLOSED' },
    { name: 'P5 re-run', needle: 'F-ESTIMATOR-VIP-APPROVE-MULTITENANT-DEBT ✅ CLOSED' },
  ]
  for (const m of reRunMarkers) {
    if (fileState.content.includes(m.needle)) {
      errors.push(m.name + ': new content already present (re-run after partial state?). Aborting.')
    }
  }
}

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('All 6 anchors validated. Line endings: ' + (fileState.usesCRLF ? 'CRLF' : 'LF'))

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

console.log('\nBackup suffix: .backup_' + stamp + '\n')

const absSrc = path.resolve(ROOT, F)
const absBackup = absSrc + '.backup_' + stamp
fs.copyFileSync(absSrc, absBackup)
console.log('  backup: ' + path.basename(absBackup))

let content = fileState.content
for (const p of patches) {
  content = content.replace(p.old, p.new)
  console.log('  applied: ' + p.name)
}

writeFilePreserveLE(F, content, fileState.usesCRLF)
console.log('  wrote: ' + F + ' (' + (fileState.usesCRLF ? 'CRLF' : 'LF') + ')')

console.log('')
console.log('v16 -> v17 tracker patch applied. T6f-B fully closed in tracker.')
console.log('')
console.log('Next steps:')
console.log('  1. Verify v17 markers present:')
console.log('       Select-String -Path docs\\W-LEADS-EMAIL-TRACKER.md -Pattern "v17 T6f-B FULLY CLOSED" -SimpleMatch')
console.log('       Select-String -Path docs\\W-LEADS-EMAIL-TRACKER.md -Pattern "F-ESTIMATOR-VIP-REQUEST-MULTITENANT-DEBT" -SimpleMatch')
console.log('  2. git add docs/W-LEADS-EMAIL-TRACKER.md scripts/patch-w-leads-email-tracker-v17.js scripts/probe-w-leads-email-tracker-v16-state.js')
console.log('     git status --short')
console.log('  3. Commit + push (Paste 48), then T6f-B is fully closed and T6f-C is next.')