#!/usr/bin/env node
/**
 * patch-w-leads-email-tracker-v15.js — closes T6f-A in W-LEADS-EMAIL workstream.
 *
 * 4 patches to docs/W-LEADS-EMAIL-TRACKER.md:
 *   P1: version header v14 -> v15
 *   P2: T6 closed-list extension (adds T6f-A to the master status line list)
 *   P3: master status line tail — T6f-A summary + Next pointer update
 *   P4: new v15 status log entry inserted above v14 entry
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
// P1 — Version header v14 -> v15
// ============================================================================

const P1_OLD = '**Version:** v14 — T6c CLOSED 2026-05-11'
const P1_NEW = '**Version:** v15 — T6f-A CLOSED 2026-05-11'

// ============================================================================
// P2 — T6 closed-list extension
// ============================================================================

const P2_OLD = '**T6 phase IN PROGRESS — T6a + T6b + T6c ✅ CLOSED 2026-05-11.**'
const P2_NEW = '**T6 phase IN PROGRESS — T6a + T6b + T6c + T6f-A ✅ CLOSED 2026-05-11.**'

// ============================================================================
// P3 — Master status line tail (T6f-A summary + Next pointer)
// ============================================================================

const P3_OLD =
  'Both smokes 9/9 GREEN post-patch. **Next: T6 continues — T6d (VIP auto-approve fixes), T6e (plan integration verification), T6f (brand-strings & URL hardcoding — newly split from F-ESTIMATOR-VIP-REQUEST-MULTITENANT-DEBT during T6c recon).**'

const P3_NEW =
  'Both smokes 9/9 GREEN post-patch. ' +
  'T6f-A closed brand-strings & URL hardcoding across Shape A (3 routes + 2 helpers): extended validateSession with brandName + domain; new `lib/utils/tenant-brand.ts` helper (`getTenantContext` + `buildBaseUrl`); 3 Shape A routes wired with handler-scope `BASE_URL = buildBaseUrl(domain)`, 5 email-builder helper signatures extended with brandName/domain/baseUrl typed params, wordmark split-tag replaced with single-span `\${brandName}` render, footer + CTA + subject lines templated. 36 atomic anchors in wire patch. ' +
  'Regression caught + fixed in-session per Rule Zero "no regressions": removing module-level BASE_URL exposed 13 `\${BASE_URL}` refs inside helper bodies that the initial `/walliam/i` probe filter missed (those lines don\'t contain the substring "walliam"). fix-v1 blanket replaceAll failed atomic validation; fix-v2 ships context-aware mixed strategy (replaceAll where all hits are in-helper safe + per-line for context-sensitive lines + 1 POST-handler `\${BASE_URL}` preserved at appointment L177 where BASE_URL is correctly in handler scope). Lesson logged: module-constant removal requires a dedicated all-identifier-references probe before wire patch lands. ' +
  '9/9 GREEN re-verified post-Resend-Pro-upgrade with inbox visual confirmation. ' +
  '**Resend production finding (CRITICAL — new ticket W-EMAIL-RESILIENCE):** smoke iterations exhausted Resend free-tier daily quota (100/day) → all email-sending tiers failed silently with 429 daily_quota_exceeded, F67 catch swallowed the error → "HTTP 200 + lead inserted + no audit rows" smoke failure pattern misleadingly suggested code regression. Diagnosed via dev-server.log capture. Production implication: F67 try/catch design persists lead data to DB before email send, so leads are never lost across Resend outages/quota events, BUT agent email notifications can be missed. Pre-launch hardening required: (1) per-tenant Resend paid tier, (2) pre-write audit row in PENDING status + UPDATE on outcome, (3) retry queue for transient failures, (4) dashboard badge for failed notifications, (5) per-tenant quota monitoring. ' +
  '**Next: T6 continues — T6f-B (brand + URL refactor across 4 estimator routes; recon already complete from T6f-A session — anchor data in `recon/W-LEADS-EMAIL-T6F-*.txt`), T6f-C (walliam/charlie/vip-approve + walliam/contact with new tenant load on contact route + T6c-leftover cleanup at contact L113/L175), T6d (VIP auto-approve fixes), T6e (plan integration verification per OD-4=(c)).**'

// ============================================================================
// P4 — v15 status log entry inserted above v14 entry
// ============================================================================

const V15_ENTRY =
  '- **2026-05-11 v15 T6f-A CLOSED — brand-strings & URL hardcoding refactor across Shape A (3 routes + 2 helpers)** — ' +
  'T6f-A shipped via 4 read-only probes + 3 patch scripts + 1 tracker patch script. ' +
  '**Probes:** `scripts/probe-t6f-brand-context.js` (user-facing `/walliam/i` line hits with enclosing-function tags via brace-tracking walk across 9 candidate route files); `scripts/probe-t6f-function-map.js` (corrected enclosing-fn detection by walking column-0 declarations only after the brace-counter bug misnamed local arrow-vars as enclosing fns); `scripts/probe-t6f-anchor-prep.js` (full helper signatures + call sites + post-validateSession destructure blocks + existing tenant SELECT contexts for atomic-anchor design); `scripts/probe-t6f-residual.js` (session route tenant SELECT + split-tag wordmark sites with `WALL</span>` pattern that the `/walliam/i` filter missed because broken-up HTML tags don\'t contain the literal substring "walliam" + contact route POST body opening for the new-tenant-load anchor location T6f-C will use). ' +
  '**Wire patch (`scripts/patch-t6f-a-wire.js`):** 36 atomic anchor patches across 4 modified files + 1 new helper file. ' +
  '**Helper extension (`lib/utils/validate-session.ts`):** `ValidateSessionResult` success variant gained `brandName: string` + `domain: string`; SELECT extended from `\'source_key\'` to `\'source_key, brand_name, name, domain\'`; return uses `tenant.brand_name || tenant.name` as the brandName fallback chain (covers tenants where brand_name is unset, falls through to name which is NOT NULL per migration). ' +
  '**New helper (`lib/utils/tenant-brand.ts`):** exports `getTenantContext(supabase, tenantId): Promise<{sourceKey, brandName, domain} | null>` for Shape B/C routes that don\'t go through validateSession (used in T6f-B/T6f-C), plus `buildBaseUrl(domain): string` respecting `NEXT_PUBLIC_APP_URL` env override and falling back to `https://<tenant.domain>` for production. ' +
  '**Shape A routes (charlie/lead, charlie/plan-email, charlie/appointment):** module-level `const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || \'https://walliam.ca\'` replaced with T6f relocation comment; handler-scope `const BASE_URL = buildBaseUrl(domain)` inserted into post-T6c destructure block (anchor shared across all 3 files); 5 email-builder helper signatures extended (buildUserPlanEmail, buildAgentLeadEmail, buildRichPlanEmail, buildUserConfirmationEmail, buildAgentNotificationEmail) with `brandName: string, domain: string, baseUrl: string` typed params; call sites pass `{...existing, brandName, domain, baseUrl: BASE_URL}`. Helper body substitutions: wordmark split-tag pattern `<span>WALL</span><span...>iam</span>` replaced with `<span style="font-weight: 900;">\${brandName}</span>` (multi-tenant correctness — drops WALLiam-specific 4/3 char split aesthetic for arbitrary tenant brand text); footer brand `WALLiam · walliam.ca` → `\${brandName} · \${domain}`; CTA brand `Continue on WALLiam` → `Continue on \${brandName}`; subject lines `Your WALLiam Plan` → `Your \${brandName} Plan`; BASE_URL refs inside helpers → `\${baseUrl}` (the destructured param). Per-file LE preserved (LF for 3 files, CRLF for plan-email — same exception caught in T6b). ' +
  '**Regression caught + fixed in same session per Rule Zero "no regressions":** initial probe `/walliam/i` filter returned only lines containing the substring "walliam"; this missed 13 `\${BASE_URL}` template-literal references inside email-builder helper bodies because those lines don\'t have "walliam" in them. Removing module-level BASE_URL constant before auditing all references created 13 TSC errors (`Cannot find name \'BASE_URL\'. Did you mean \'baseUrl\'?`) + runtime ReferenceError caught silently by F67 try/catch, surfaced via "no audit rows" smoke failure (HTTP 200 + lead inserted + zero audit rows = email build helper threw → sendTenantEmail caught → logEmailRecipients gated on sendResult.id never fired). ' +
  '**fix-v1 (`scripts/patch-t6f-a-fix.js`)** attempted blanket replaceAll `\${BASE_URL}` → `\${baseUrl}` per file — failed atomic validation because (a) 2 of plan-email\'s 6 TSC errors used bare `BASE_URL` inside `\${b.url || BASE_URL}` and `\${r.url || BASE_URL}` expressions (not `\${BASE_URL}` literals), (b) appointment\'s 4 `\${BASE_URL}` count exceeded the 3 TSC errors because 1 at L177 is a valid POST-handler ref (`const rescheduleUrl = \\\`\${BASE_URL}/reschedule?token=\${lead.reschedule_token}\\\``) where BASE_URL is correctly in handler scope. v1 kept in commit for traceability of the diagnostic chain. ' +
  '**fix-v2 (`scripts/patch-t6f-a-fix-v2.js`)** ships context-aware mixed strategy: charlie/lead → replaceAll `\${BASE_URL}` → `\${baseUrl}` (4 hits, all in helpers, safe); charlie/plan-email → replaceAll for 4 `\${BASE_URL}` helper hits + 2 per-line swaps for bare `BASE_URL` → `baseUrl` at L281/L302; charlie/appointment → 3 per-line swaps for L293/L371/L408 helper hits, post-state count validation requires exactly 1 remaining `\${BASE_URL}` (the POST-handler L177 ref preserved). Atomic gate validated pre-state AND post-state counts per file. ' +
  '**Lesson logged for future workstreams:** when removing a module-level constant, run a dedicated probe that finds ALL identifier references (not just user-facing strings filtered by tenant-related keywords) before the wire patch lands. The `/walliam/i` filter is appropriate for finding brand-text substitution sites but inadequate for variable-removal audits. New workflow rule: "module-constant removal requires a complete-identifier-reference probe pass." ' +
  '**Resend quota production finding (CRITICAL — logged as new ticket W-EMAIL-RESILIENCE):** smoke iterations during T6f-A diagnosis burned through Resend\'s free-tier 100/day quota; smoke failures with HTTP 200 + lead inserted + zero audit rows turned out to be `daily_quota_exceeded` 429 errors from Resend\'s API, caught silently by F67 catch blocks. Surfaced via dev-server.log capture (`npm run dev 2>&1 | Tee-Object -FilePath dev-server.log` to redirect Next.js dev stdout to file; `Get-Content dev-server.log -Tail 500` after smoke revealed `[charlie/appointment] resend send failed: ... {"statusCode":429,"message":"You have reached your daily email sending quota.","name":"daily_quota_exceeded"}` lines from every failing tier). ' +
  '**Production implication:** F67 try/catch design persists lead data to DB BEFORE email send attempt, so leads are never lost even under Resend outages/quota events — but agent email notifications can be missed. Pre-launch hardening required (new W-EMAIL-RESILIENCE ticket scope): (1) per-tenant Resend paid tier with appropriate volume cap (Resend Pro = $20/mo for 50k/mo, ample for early tenants); (2) pre-write audit row in PENDING status before sendTenantEmail + UPDATE to delivered/failed/bounced based on outcome (gives visibility into attempted-but-failed sends, currently invisible because logEmailRecipients only writes on success); (3) retry queue for transient failures (429, 5xx, network) via Vercel Cron / Inngest / pg_cron; (4) dashboard badge on `/admin-homes/leads` surfacing leads with failed notifications + manual retry button; (5) per-tenant quota monitoring with proactive alerts before exhaustion. ' +
  'Resolved for development by upgrading to Resend Pro ($20/mo); downgrade plan: keep Pro through W-LEADS-EMAIL T6/T7/T8/Tlast close, optionally downgrade after first paying tenants bring their own Resend keys per the multi-tenant `tenants.resend_api_key` architecture. ' +
  '**Smoke verification post-fix-v2 + Resend-Pro-upgrade:** TSC silent (`npx tsc --noEmit`); T3b 4/4 GREEN (Tier 1 walliam/contact, Tier 2 walliam/charlie/vip-request, Tier 3 charlie/plan-email post-fix from 500 to 200+audit, Tier 4 lib/actions/leads via dev endpoint); T3c 5/5 GREEN (Tier 5 charlie/appointment, Tier 6 charlie/lead INSERT+UPDATE with F2.P2 leadId-fix re-verified, Tier 7 walliam/estimator/vip-questionnaire enriches fixture via lead_origin_route lookup, Tier 8 walliam/estimator/vip-request fresh insert, Tier 9 walliam/estimator/vip-approve verify-skip); 9/9 GREEN total. Inbox visual confirmation at notifications@condoleads.ca: `\${brandName}` substitutions render as "WALLiam" and `\${domain}` renders as "walliam.ca" — byte-for-byte identical observable output for tenant `b16e1039-38ed-43d7-bbc5-dd02bb651bc9` with multitenant-correct architecture for future tenants. ' +
  '**Files in commit:** 4 modified (`lib/utils/validate-session.ts`, `app/api/charlie/lead/route.ts`, `app/api/charlie/plan-email/route.ts`, `app/api/charlie/appointment/route.ts`), 1 new helper (`lib/utils/tenant-brand.ts`), 8 new probe/patch scripts (`scripts/probe-t6f-brand-context.js`, `scripts/probe-t6f-function-map.js`, `scripts/probe-t6f-anchor-prep.js`, `scripts/probe-t6f-residual.js`, `scripts/patch-t6f-a-wire.js`, `scripts/patch-t6f-a-fix.js` [v1 — failed atomic validation, kept for traceability], `scripts/patch-t6f-a-fix-v2.js`, `scripts/patch-w-leads-email-tracker-v15.js`), and `docs/W-LEADS-EMAIL-TRACKER.md` (v14→v15 bump in this script). ' +
  '**Next:** T6f-B (brand + URL refactor across 4 estimator routes: walliam/estimator/{vip-request, vip-approve, session, vip-questionnaire}; recon already complete from T6f-A session — anchor data captured in `recon/W-LEADS-EMAIL-T6F-*.txt`), T6f-C (walliam/charlie/vip-approve + walliam/contact with new tenant load added to contact route which currently has zero tenant SELECT; also covers T6c-leftover at contact L113/L175 `source: source || \'walliam_contact\'` literals), T6d (VIP auto-approve fixes — isolated bug fixes in walliam/charlie/vip-request predating this session), T6e (plan integration verification per OD-4=(c)). After T6: T7 smoke matrix with cross-tenant regression guards, T8 sweep, Tlast close.'

const P4_OLD = '- **2026-05-11 v14 T6c CLOSED'
const P4_NEW = V15_ENTRY + '\n' + P4_OLD

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
  if (state.content.includes('v15 T6f-A CLOSED')) errors.push('v15 marker already present (re-run after partial state?)')
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

// Apply 4 patches in sequence
let working = state.content
working = working.replace(P1_OLD, P1_NEW); console.log('  applied: P1 version header v14 -> v15')
working = working.replace(P2_OLD, P2_NEW); console.log('  applied: P2 T6 closed-list extension')
working = working.replace(P3_OLD, P3_NEW); console.log('  applied: P3 master status line tail (T6f-A summary + Next pointer)')
working = working.replace(P4_OLD, P4_NEW); console.log('  applied: P4 v15 status log entry inserted above v14')

writeFilePreserveLE(F, working, state.usesCRLF)
const delta = working.length - state.content.length
console.log('  wrote: ' + F + ' (' + (state.usesCRLF ? 'CRLF' : 'LF') + ', delta ' + (delta >= 0 ? '+' : '') + delta + ' chars)')

console.log('')
console.log('T6f-A close patch applied: 4 tracker patches.')
console.log('')
console.log('Next steps:')
console.log('  1. Verify v15 marker present:')
console.log('       Select-String -Path docs/W-LEADS-EMAIL-TRACKER.md -Pattern "v15 T6f-A CLOSED"')
console.log('  2. Stage T6f-A-scoped files (14 paths) + commit + push.')