#!/usr/bin/env node
/**
 * patch-w-leads-email-tracker-v16.js — closes T6f-B-1 + T6f-B-2 in W-LEADS-EMAIL.
 *
 * 4 patches to docs/W-LEADS-EMAIL-TRACKER.md:
 *   P1: version header v15 -> v16
 *   P2: T6 closed-list extension (adds T6f-B-1 + T6f-B-2)
 *   P3: master status line Next pointer (rewires to T6f-B-3 + T6f-B-4 + downstream)
 *   P4: new v16 status log entry inserted above v15 entry
 *
 * Atomic gate: all 4 anchors must match exactly once. Per-file LE preserved.
 * Timestamped backup before write.
 */

'use strict'
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

const F = 'docs/W-LEADS-EMAIL-TRACKER.md'

// ============================================================================
// P1 — Version header v15 -> v16
// ============================================================================

const P1_OLD = '**Version:** v15 — T6f-A CLOSED 2026-05-11'
const P1_NEW = '**Version:** v16 — T6f-B-1 + T6f-B-2 CLOSED 2026-05-11'

// ============================================================================
// P2 — T6 closed-list extension
// ============================================================================

const P2_OLD = '**T6 phase IN PROGRESS — T6a + T6b + T6c + T6f-A ✅ CLOSED 2026-05-11.**'
const P2_NEW = '**T6 phase IN PROGRESS — T6a + T6b + T6c + T6f-A + T6f-B-1 + T6f-B-2 ✅ CLOSED 2026-05-11.**'

// ============================================================================
// P3 — Next pointer (rewires to T6f-B-3 + T6f-B-4 + ...)
// ============================================================================

const P3_OLD =
  '**Next: T6 continues — T6f-B (brand + URL refactor across 4 estimator routes; recon already complete from T6f-A session — anchor data in `recon/W-LEADS-EMAIL-T6F-*.txt`), T6f-C (walliam/charlie/vip-approve + walliam/contact with new tenant load on contact route + T6c-leftover cleanup at contact L113/L175), T6d (VIP auto-approve fixes), T6e (plan integration verification per OD-4=(c)).**'

const P3_NEW =
  '**Next: T6 continues — T6f-B-3 (vip-approve — positional buildUserApprovalEmailHtml restructure + createHtmlResponse extension across 9 call sites + L218 page title brand-text), T6f-B-4 (vip-request — 2 helpers + URL refactor at L215 baseUrl assignment + 5 helper-body substitution sites including L432 user-fallback comparison conditional and L482 inline URL inside helper body), T6f-C (walliam/charlie/vip-approve + walliam/contact with new tenant load via getTenantContext helper from T6f-A + T6c-leftover cleanup at contact L113/L175), T6d (VIP auto-approve fixes), T6e (plan integration verification per OD-4=(c)).**'

// ============================================================================
// P4 — v16 status log entry inserted above v15 entry
// ============================================================================

const V16_ENTRY =
  '- **2026-05-11 v16 T6f-B-1 + T6f-B-2 CLOSED — brand-strings + URL refactor across 2 of 4 estimator routes (Shape B/C pattern)** — ' +
  'T6f-B split into 4 atomic per-route wire patches to keep blast radius small given per-route structural quirks (typed-object vs positional helpers, URL refactor needed vs not, BOM/CRLF variance). v16 captures B-1 + B-2 closure; T6f-B-3 + T6f-B-4 ship in same working block per Rule Zero "Nothing Deferred". ' +
  '**Pre-wire recon discipline (carries T6f-A lesson on complete-identifier-reference pass):** `scripts/probe-t6f-b-fresh.js` captured per-route uncapped /walliam/i hits + complete BASE_URL/baseUrl identifier reference pass + inline NEXT_PUBLIC_APP_URL refs + tenant SELECT blocks with context + helper signatures. Output `recon/W-LEADS-EMAIL-T6F-B-FRESH.txt` (16,472 bytes). Secondary probe `scripts/probe-t6f-b-scope.js` extracted T6f-B-relevant subsets from existing T6f-A recon files for cross-reference (27 hits across 5 of 6 recon files). Helper call-site recon via PowerShell Select-String captured invocation patterns (positional vs typed-object) enabling per-helper sig-extension-or-append decisions. ' +
  '**T6f-B-1 (vip-questionnaire):** 8 atomic anchors. Brand-strings only (probe verified 0 BASE_URL/baseUrl refs and 0 inline NEXT_PUBLIC_APP_URL in this route). Tenant SELECT extended from `\'source_key\'` to `\'source_key, brand_name, name\'`. brandName declared at function scope as `let brandName: string = \'\'` with empty default for unhappy-path safety (NEVER hardcoded \'WALLiam\' fallback per Rule Zero multitenant-at-scale — that would render wrong brand for tenant #2/N/1000). Assigned inside existing if(tenantId) block as `brandName = (t6cTenant?.brand_name || t6cTenant?.name) ?? \'\'`. Substitutions: enrichedMessage subject at L148, contact_name fallback x2 at L169+L190 via atomic replaceAll with count=2 pre-state + count=0 post-state assertion (defensive against single-line ambiguous anchors), buildQuestionnaireEmailHtml call site + userName fallback combined anchor at L207-L208, subject at L247. Helper typed-object signature extended with `brandName: string` field. Helper body subs: wordmark at L312 and footer at L357 both use `${data.brandName}` (helper accesses via `data.X` not destructure — verified via L320 `${data.userName}` style). File LF + no-BOM, delta +276 chars. T3c 5/5 GREEN. ' +
  '**T6f-B-2 (session):** 5 atomic anchors. Brand-strings + URL refactor. CRLF + BOM preserved (route has UTF-8 BOM at L1 per probe). Imported `buildBaseUrl` from `lib/utils/tenant-brand` (the helper shipped in T6f-A close `fdbf02c`). Tenant SELECT (multi-line backtick template) extended with `brand_name, name, domain` appended after `source_key` with comma-separator hygiene. brandName + baseUrl declared at function scope post tenant-null-check (post L51 closing brace, pre L53 estimator_nonai_enabled gate): `const brandName: string = (tenant.brand_name || tenant.name) ?? \'\'` + `const baseUrl: string = buildBaseUrl(tenant.domain)`. Substitutions: agentName fallback at L86 (`\'WALLiam\'` literal → `brandName` variable — initial value when no agent resolved) + inline `process.env.NEXT_PUBLIC_APP_URL || \'https://walliam.ca\'` at L191 fetch → `baseUrl`. File CRLF + BOM, delta +301 chars. T3b 4/4 + T3c 5/5 = 9/9 GREEN comprehensive (session route is upstream entry point for all session-dependent tiers — full smoke confirms no regression in adjacent routes). ' +
  '**Pattern lesson encoded for T6f-B-3/B-4/C:** Shape B/C routes (header-derived tenantId, no validateSession) extend their EXISTING tenant SELECT inline rather than calling `getTenantContext` helper — saves a DB roundtrip per request when the route already loads tenant for other config purposes (estimator config, source_key, etc.). `getTenantContext` remains the right entry point for routes with no existing tenant SELECT (T6f-C\'s walliam/contact route which currently has zero tenant load). ' +
  '**Files in v16 scope:** 2 modified routes (`app/api/walliam/estimator/vip-questionnaire/route.ts` +276 chars, `app/api/walliam/estimator/session/route.ts` +301 chars), 4 new scripts (`scripts/probe-t6f-b-scope.js`, `scripts/probe-t6f-b-fresh.js`, `scripts/patch-t6f-b-1-vip-questionnaire-wire.js`, `scripts/patch-t6f-b-2-session-wire.js`), `scripts/patch-w-leads-email-tracker-v16.js` (this script), and `docs/W-LEADS-EMAIL-TRACKER.md` (v15 → v16 in this script). ' +
  '**Next:** T6f-B-3 (vip-approve — positional buildUserApprovalEmailHtml restructure with brandName/domain/baseUrl appended params + createHtmlResponse extension across 9 call sites + L218 page title brand-text + L156 subject + L159 agent-fallback), T6f-B-4 (vip-request — 2 helpers + URL refactor at L215 baseUrl handler-scope assignment + 5 helper-body substitution sites including L432 user-fallback comparison conditional `data.fullName !== \'WALLiam User\'` and L482 inline URL inside buildUserApprovalEmailHtml helper body). After T6f-B-4 closes: T6f-C, T6d, T6e, then T7 smoke matrix with cross-tenant regression guards, T8 sweep, Tlast close.'

const P4_OLD = '- **2026-05-11 v15 T6f-A CLOSED'
const P4_NEW = V16_ENTRY + '\n' + P4_OLD

// ============================================================================
// ATOMIC VALIDATION
// ============================================================================

const errors = []
if (!exists(path.resolve(ROOT, F))) errors.push('file not found: ' + F)

let state = null
if (errors.length === 0) {
  state = readFileLF(F)
  for (const [name, old] of [['P1', P1_OLD], ['P2', P2_OLD], ['P3', P3_OLD], ['P4', P4_OLD]]) {
    const c = countOccurrences(state.content, old)
    if (c !== 1) errors.push(name + ': expected 1 match, found ' + c)
  }
  if (state.content.includes('v16 T6f-B-1 + T6f-B-2 CLOSED')) {
    errors.push('v16 marker already present (re-run after partial state?)')
  }
}

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('All 4 anchors validated. LE: ' + (state.usesCRLF ? 'CRLF' : 'LF'))

// ============================================================================
// BACKUP + WRITE
// ============================================================================

const ts = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) +
  '_' + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds())

console.log('Backup suffix: .backup_' + stamp)

const absSrc = path.resolve(ROOT, F)
const absBackup = absSrc + '.backup_' + stamp
fs.copyFileSync(absSrc, absBackup)
console.log('  backup: ' + path.basename(absBackup) + '  (' + F + ')')

let working = state.content
working = working.replace(P1_OLD, P1_NEW); console.log('  applied: P1 version header v15 -> v16')
working = working.replace(P2_OLD, P2_NEW); console.log('  applied: P2 T6 closed-list extension')
working = working.replace(P3_OLD, P3_NEW); console.log('  applied: P3 master status line Next pointer')
working = working.replace(P4_OLD, P4_NEW); console.log('  applied: P4 v16 status log entry inserted above v15')

writeFilePreserveLE(F, working, state.usesCRLF)
const delta = working.length - state.content.length
console.log('  wrote: ' + F + ' (' + (state.usesCRLF ? 'CRLF' : 'LF') + ', delta ' + (delta >= 0 ? '+' : '') + delta + ' chars)')

console.log('')
console.log('T6f-B-1 + T6f-B-2 close patch applied: 4 tracker patches.')