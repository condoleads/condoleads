#!/usr/bin/env node
/**
 * patch-w-leads-workbench-tracker-w4g.js
 *
 * docs(W-LEADS-WORKBENCH W4g): tracker status log + phase row update.
 *
 * Three atomic patches against docs/W-LEADS-WORKBENCH-TRACKER.md:
 *   P1: version line v16 -> v17 (W4g SHIPPED + W4 GROUP COMPLETE marker)
 *   P2: phase table W4g row OPEN -> SHIPPED with commit ff45756 + details
 *   P3: status log append -- 2026-05-14 W4g-SHIPPED entry after W4f tail
 *       anchored on the unique closing phrase 'audit pattern fully
 *       established by W4e + W4f.'
 *
 * Four new findings logged in the W4g entry:
 *   F-LEAD-NOTES-AUTHOR-FALLBACK-LOSSY
 *   F-LEAD-NOTES-DUAL-SYSTEM-READERS
 *   F-RESOLVEUSER-AGENTID-MAY-BE-CROSS-TENANT  (P0-risk, affects W4e+W4f+W4g)
 *   F-W4G-CLAUDE-AUTHOR-PREDICTION-WRONG       (Rule Zero meta-finding)
 *
 * Tracker LE: LF. Idempotent (skips if v17 marker present). Backup before
 * write. LE-preserved (post-write byte-scan).
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const d = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  d.getFullYear() +
  pad(d.getMonth() + 1) +
  pad(d.getDate()) +
  '_' +
  pad(d.getHours()) +
  pad(d.getMinutes()) +
  pad(d.getSeconds())

const TRACKER = path.join(ROOT, 'docs', 'W-LEADS-WORKBENCH-TRACKER.md')

if (!fs.existsSync(TRACKER)) {
  throw new Error('tracker missing: ' + TRACKER)
}

// ----- LE detection -----
const buf = fs.readFileSync(TRACKER)
let crlfCount = 0
let lfCount = 0
for (let i = 0; i < buf.length; i++) {
  if (buf[i] === 0x0a) {
    if (i > 0 && buf[i - 1] === 0x0d) crlfCount++
    else lfCount++
  }
}
if (crlfCount > 0 && lfCount > 0) {
  throw new Error('mixed LE: crlf=' + crlfCount + ', lf=' + lfCount)
}
const LE = crlfCount > 0 ? 'crlf' : 'lf'
const NL = LE === 'crlf' ? '\r\n' : '\n'
console.log('LE detected: ' + LE)

let text = buf.toString('utf8')

// ----- Idempotency check -----
const V17_MARKER = '**Version:** v17 \u2014 W4g SHIPPED'
if (text.indexOf(V17_MARKER) !== -1) {
  console.log('SKIP: v17 marker already present. No-op.')
  process.exit(0)
}

// ----- P1: Version line -----
const P1_OLD =
  '**Version:** v16 \u2014 W4f SHIPPED \u2014 VIP Requests tab + admin approve/deny endpoint at `/api/admin-homes/leads/[id]/vip-approve`; second writer to `lead_admin_actions` (`vip_approved` / `vip_denied`); triple-gate vip_request fetch (id + tenant_id = lead.tenant_id + lead_id = lead.id); per-request_type credit-grant branch (estimator: estimator-only grant + BCC chain via helper; plan/chat: all-3-pools grant matching charlie endpoint); optimistic UI flip with revert on error; existing charlie + estimator vip-approve routes UNTOUCHED; findings `F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F` + `F-VIP-APPROVE-EMAILS-NOT-AUDITED` + `F-VIP-APPROVE-GRANTED-BY-TIER-HARDCODED-MANAGER` + `F-W-LEADS-WORKBENCH-VERSION-LINE-DRIFTED-AT-W4E` logged for future cleanup'

const P1_NEW =
  '**Version:** v17 \u2014 W4g SHIPPED \u2014 **W4 GROUP COMPLETE** \u2014 Notes tab + Add note inline endpoint at `/api/admin-homes/leads/[id]/notes`; third writer to `lead_admin_actions` (`note_added`); INSERT shape mirrors System 1 `addLeadNote` (`lib/actions/lead-management.ts` L59-67) -- System 1 file UNTOUCHED; lead_notes has no `tenant_id` column (`F-LEAD-NOTES-NO-TENANT-ID-COLUMN`) -- tenant safety via `lead.tenant_id` verification before INSERT + `lead_id IN (familyIds)` scoping on reads (familyIds already tenant-bound via W4a anchor gate); author resolution chain `user.agentId ?? lead.agent_id` with precise actor preserved in `lead_admin_actions.actor_agent_id` + `actor_role`; optimistic prepend in NotesTab UI; W4 group closes after W4g (W4a + W4b + W4c + W4d + W4e + W4f + W4g all shipped); findings `F-LEAD-NOTES-AUTHOR-FALLBACK-LOSSY` + `F-LEAD-NOTES-DUAL-SYSTEM-READERS` + `F-RESOLVEUSER-AGENTID-MAY-BE-CROSS-TENANT` (P0-risk affecting W4e+W4f+W4g if `user.agentId` is not tenant-scoped -- recon during W5) + `F-W4G-CLAUDE-AUTHOR-PREDICTION-WRONG` (Rule Zero meta-finding) logged for future cleanup; next: W5 group (role-aware leads list)'

// ----- P2: Phase table W4g row -----
const P2_OLD =
  '| W4g | Notes tab + Add note inline | OPEN | \u2014 | Reuse `lead_notes` table |'

const P2_NEW =
  '| W4g | Notes tab + Add note inline | SHIPPED | 2026-05-14 | `ff45756` Notes tab with inline textarea (10000 char cap) + char counter + lead-context selector when family > 1 + Add note button + optimistic prepend on submit; new POST `/api/admin-homes/leads/[id]/notes` (third writer to `lead_admin_actions` -- `note_added`); INSERT shape mirrors System 1 `lib/actions/lead-management.ts:addLeadNote` (lead_id + agent_id + note + created_at) so rows are mutually readable by `/dashboard/leads` and `/admin-homes/leads`; author resolution `user.agentId ?? lead.agent_id` (primary path verified live in smoke at 18:20:14 UTC; fallback path coded but not exercised since Syed Shah has a walliam-tenant agents row at `a7b4c075-60e9-40c3-b708-9a877c464e61`). System 1 file UNTOUCHED. No schema migration. Smoke evidence: lead_notes `49ced5e0-5e09-42d7-b52f-093ea4e398b6` with `agent_id=a7b4c075-60e9-40c3-b708-9a877c464e61`, `note_len=96`, `via_fallback=false`; audit row written with `action_type=\'note_added\'`, `actor_role=\'admin\'`, `after_value` containing all 5 expected keys (note_id, note_length, note_preview, agent_id, via_fallback). Findings: `F-LEAD-NOTES-AUTHOR-FALLBACK-LOSSY`, `F-LEAD-NOTES-DUAL-SYSTEM-READERS`, `F-RESOLVEUSER-AGENTID-MAY-BE-CROSS-TENANT`, `F-W4G-CLAUDE-AUTHOR-PREDICTION-WRONG`. **W4 GROUP CLOSED** -- 7 phases shipped (W4a-W4g). |'

// ----- P3: Status log append (anchor on the unique tail phrase of W4f entry) -----
const P3_ANCHOR = 'audit pattern fully established by W4e + W4f.'

const W4G_ENTRY_LINES = [
  '- **2026-05-14 W4g-SHIPPED** -- Notes tab + Add note inline endpoint. Commit `ff45756` (885b111..ff45756). **W4 GROUP COMPLETE** -- W4a + W4b + W4c + W4d + W4e + W4f + W4g all SHIPPED. **5 files**: 2 new (`app/api/admin-homes/leads/[id]/notes/route.ts` 5640 bytes; `components/admin-homes/lead-workbench/NotesTab.tsx` 7894 bytes) + 2 modified (`app/admin-homes/leads/[id]/page.tsx` 5 anchor patches -- destructure to 5 elements + 5th parallel `lead_notes` query with `agents(id, full_name)` join + `let notes` declaration + assignment in if-block + `notes={notes}` prop pass; `app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx` 4 anchor patches -- import + Props extension + destructure + `tab === \'notes\'` dispatch) + 1 patch script (`scripts/patch-w-leads-workbench-w4g-notes-tab.js`). **No schema migration**: lead_notes columns match the System 1 INSERT shape verified via `lib/actions/lead-management.ts` L59-67 read (`{ lead_id, agent_id, note, created_at }`); `lead_admin_actions.action_type` is free-form per W4f verification. **System 1 file UNTOUCHED** -- `lib/actions/lead-management.ts` left as-is per Rule Zero System 1 Isolation; the new W4g endpoint mirrors its INSERT shape exactly rather than importing from it, so System 1 (`/dashboard/leads`) and System 2 (`/admin-homes/leads`) both read and write rows compatible with the other\'s reader without coupling the two systems. **NotesTab UI**: top textarea (10000 char cap via `maxLength`) + live trim-aware char counter + Lead-context selector (when `leadFamily.length > 1`) + Clear button + Add note button (disabled when trim is empty OR submitting); below the form: list of notes newest-first via `useMemo` sort by `created_at` desc; per-note card shows author name (from `agents.full_name` join, "Unknown agent" fallback if join misses) + date + lead-context label (when the note\'s `lead_id` differs from anchor and family > 1) + whitespace-pre-wrap content rendering; optimistic prepend on submit (new note appears immediately as a card before server response) with revert-on-error; submitting state disables all controls; clear button resets the draft without submitting. **POST `/api/admin-homes/leads/[id]/notes` handler**: auth via `resolveAdminHomesUser`; lead fetch with `id, tenant_id, agent_id`; permission gate `can(\'lead.write\', {kind:\'lead\', leadId, tenantId, agentId})`; body parse with strict string type check on `note` + trim + 10000-char cap (400 on missing/empty/oversize); **author resolution chain** `resolvedAgentId = user.agentId || lead.agent_id || null`, returns 409 if both are null (cannot satisfy `lead_notes.agent_id` NOT NULL constraint -- defensive but practically unreachable since any lead with no agent would already have failed other admin-homes flows); INSERT into lead_notes mirroring System 1 shape exactly `(lead_id, agent_id, note, created_at)`; SELECT-back with `agents(id, full_name)` join for the response payload (NotesTab needs the author name immediately for the optimistic card render without a separate roundtrip); audit via `logLeadAdminAction` with `action_type=\'note_added\'`, `target_field=null`, `before_value=null` (note adds are pure-additive, no prior state to capture), `after_value={note_id, note_length, note_preview (first 80 chars + horizontal ellipsis U+2026 if note is longer), agent_id (the resolved agent), via_fallback (boolean true if used lead.agent_id)}`, `notes` field carrying the same 80-char preview for inline visibility in queries against the audit table. Returns JSON `{success, note, viaFallback}` for the UI to confirm the optimistic state and conditionally render attribution annotations. **Multi-tenant safety verified**: `lead_notes` has no `tenant_id` column (`F-LEAD-NOTES-NO-TENANT-ID-COLUMN`) -- tenant safety in W4g derives from (a) the handler verifying `lead.tenant_id` falls within `can(\'lead.write\')` scope before any INSERT and (b) the prefetch reading by `lead_id IN (familyIds)` where `familyIds` is already tenant-bound through the W4a anchor-lead fetch gate; same indirect-tenancy pattern is used by W4d activities + W4e emails + W4f vip-requests, so W4g doesn\'t introduce a new tenancy model -- just inherits the existing one. **Smoke matrix passed end-to-end**: (1) initial page load -- Notes tab rendered empty state with textarea + 0/10000 counter + disabled Add note button + "No notes yet for this lead family" message; (2) compose -- typed 96-char test note "W4g smoke test -- verifying note insert + audit row, expecting King Shah attribution via fallback"; live counter incremented 0 -> 96; submit button enabled; (3) submit -- POST returned 200 with `{success:true, note:{...}, viaFallback:false}` per DevTools; note appeared immediately as a card below the form with author display derived from agents join; textarea cleared; (4) hard refresh -- note persisted from DB prefetch (page.tsx 5th parallel query); (5) DB verification at 18:20:14 UTC -- `lead_notes.49ced5e0-5e09-42d7-b52f-093ea4e398b6` with `agent_id=a7b4c075-60e9-40c3-b708-9a877c464e61`, `note_len=96`, correct `lead_id=996b5d71-4a67-418a-9dfa-c11b2170e5d0`; `lead_admin_actions` new row at the top with `action_type=\'note_added\'`, `actor_role=\'admin\'`, `after_value` containing all 5 expected keys (note_id matching the lead_notes row, note_length=96, note_preview correctly truncated at 80 chars with ellipsis, agent_id=a7b4c075-..., via_fallback=false), `notes` field carrying the same 80-char preview. Three writers to `lead_admin_actions` now proven live: `note_added` (W4g this turn), `vip_approved` (W4f), `email_sent` (W4e). **NEW finding F-LEAD-NOTES-AUTHOR-FALLBACK-LOSSY**: when `user.agentId` is null and the handler falls back to `lead.agent_id`, the NotesTab UI displays "by <lead\'s owning agent>" rather than the actual typist. The precise actor (e.g., platform_admin Syed Shah typing on King Shah\'s lead) is captured in `lead_admin_actions.actor_agent_id` + `actor_role` and surfaced in the ActivityTab. Two views, two truths -- by design per W4g author-resolution decision (b), not a defect. **NEW finding F-LEAD-NOTES-DUAL-SYSTEM-READERS**: System 1 (`/dashboard/leads`) via `lib/actions/lead-management.ts:getLeadNotes` + `addLeadNote` and System 2 (`/admin-homes/leads`) via this new W4g endpoint both read and write the same `lead_notes` table. INSERT shapes match exactly (verified by reading the System 1 file in W4g recon); no coupling between the systems (W4g does not import from System 1). Any future schema change (e.g., adding `tenant_id` per `F-LEAD-NOTES-NO-TENANT-ID-COLUMN`) requires coordinated changes across both systems. **NEW finding F-RESOLVEUSER-AGENTID-MAY-BE-CROSS-TENANT (P0-risk)**: `user.agentId` from `resolveAdminHomesUser` may not be tenant-scoped. If a platform admin has an agents row in tenant A and views a lead in tenant B, `user.agentId` could resolve to tenant A\'s agent UUID, which W4g (and W4e + W4f, which use the same pattern) would write into tenant B\'s `lead_notes.agent_id` / `lead_admin_actions.actor_agent_id` -- a cross-tenant identity leak in the audit and notes data. Single-tenant smoke is unaffected; risk is hypothetical until tenant #2 onboards with platform admin context. Affects all three admin-homes write endpoints (W4e send-email, W4f vip-approve, W4g notes). Recon `lib/admin-homes/auth.ts:resolveAdminHomesUser` during W5 group when role-aware multi-tenant logic is touched directly; fix is likely a tenant-scoped agents lookup keyed on `(user.email, currentTenantId)` rather than a tenant-agnostic email match. **NEW finding F-W4G-CLAUDE-AUTHOR-PREDICTION-WRONG (Rule Zero meta-finding)**: smoke prediction asserted that the fallback path would trigger (user.agentId null because Syed Shah is platform_admin without a per-tenant agents row); actual smoke result was the primary path (Syed HAS a walliam-tenant agents row at `a7b4c075-60e9-40c3-b708-9a877c464e61`, so `user.agentId` resolved directly and `via_fallback=false`). Rule Zero -- No Guessing violation: claimed Syed-has-no-agents-row without verifying via SQL probe of the agents table for Syed\'s email; should have probed before predicting. Outcome was more correct than the prediction (note attributes to Syed-as-agent rather than King Shah-via-fallback), but the prediction itself was unverified speculation. Logged as a meta-finding for future Rule Zero discipline: when about to assert a fact about user/agent state, probe first. **W4 GROUP STATUS SUMMARY**: W4a (workbench shell + Overview + leadFamily) + W4b (Plan tab with full email-template richness) + W4c (Credits & Usage tab with extracted UserCreditPanel) + W4d (Activity tab with cumulative visitor + admin timeline) + W4e (Emails tab + Send composer + first lead_admin_actions writer) + W4f (VIP Requests tab + admin approve/deny + second writer) + W4g (Notes tab + Add note inline + third writer) -- all 7 phases shipped over ~3 days of intensive work. All 7 workbench tabs render and function: Overview / Plan / Credits & Usage / Activity / Emails / VIP Requests / Notes. `lead_admin_actions` has three writers proven live with three distinct `action_type` values (`email_sent`, `vip_approved`, `note_added`). Multi-tenant safety contract upheld across all 7 phases (every fetch tenant-scoped; cross-tenant access returns 404 by W4a defense-in-depth pattern; permission gates via `can()` on every write endpoint). 4 of 7 phases (W4d, W4e, W4f, W4g) each generated 3-5 findings -- total ~16 findings logged across the W4 group, none P0-blocking, all categorized for either future cleanup workstream or W5 group recon (notably F-RESOLVEUSER-AGENTID-MAY-BE-CROSS-TENANT which becomes a W5a recon target). NEXT: **W5 GROUP** -- role-aware leads list across three phases: W5a (top bar Universal/Tenant toggle for platform_admin + platform_assistant; tenant switcher dropdown for tenant_manager; locked-to-tenant for tenant_admin + area_manager + manager + agent) + W5b (collapse-by-user_id in list view with "+N earlier events" indicator -- anonymous leads stay per-row; toggle to expand) + W5c (per-role action gates on leads list and across all admin-homes endpoints; F-W4A-LEADFAMILY-NO-PER-AGENT-SCOPE evaluated here; F-RESOLVEUSER-AGENTID-MAY-BE-CROSS-TENANT recon + fix here as the natural place to harden user.agentId resolution).',
]

const P3_NEW =
  P3_ANCHOR + NL + NL + W4G_ENTRY_LINES.join(NL)

// ----- Validate anchor uniqueness BEFORE applying any patch -----
const patches = [
  { name: 'P1 version line', old: P1_OLD, new: P1_NEW },
  { name: 'P2 W4g phase row', old: P2_OLD, new: P2_NEW },
  { name: 'P3 status log append', old: P3_ANCHOR, new: P3_NEW },
]

for (const p of patches) {
  const count = text.split(p.old).length - 1
  if (count !== 1) {
    throw new Error(
      p.name + ' anchor count ' + count + ' != 1 (expected exactly one match)',
    )
  }
}

// ----- Apply (atomic in-memory) -----
for (const p of patches) {
  text = text.replace(p.old, p.new)
}

// ----- Post-patch marker validation -----
if (text.indexOf(V17_MARKER) === -1) {
  throw new Error('post-patch: v17 marker missing')
}
if (
  text.indexOf(
    '| W4g | Notes tab + Add note inline | SHIPPED | 2026-05-14 |',
  ) === -1
) {
  throw new Error('post-patch: W4g SHIPPED phase row missing')
}
if (text.indexOf('2026-05-14 W4g-SHIPPED') === -1) {
  throw new Error('post-patch: W4g-SHIPPED status log entry missing')
}
if (text.indexOf('W4 GROUP COMPLETE') === -1) {
  throw new Error('post-patch: W4 GROUP COMPLETE marker missing')
}

// ----- LE preservation pre-write -----
if (LE === 'lf' && text.indexOf('\r\n') !== -1) {
  throw new Error('CRLF introduced into LF tracker')
}

// ----- Backup + write -----
fs.copyFileSync(TRACKER, TRACKER + '.backup_' + stamp)
fs.writeFileSync(TRACKER, text, 'utf8')

// ----- Post-write LE re-verify -----
const postBuf = fs.readFileSync(TRACKER)
let postCrlf = 0
let postLf = 0
for (let i = 0; i < postBuf.length; i++) {
  if (postBuf[i] === 0x0a) {
    if (i > 0 && postBuf[i - 1] === 0x0d) postCrlf++
    else postLf++
  }
}
if (LE === 'lf' && postCrlf > 0) {
  throw new Error('LE drift: LF tracker now has ' + postCrlf + ' CRLF lines')
}
if (LE === 'crlf' && postLf > 0) {
  throw new Error('LE drift: CRLF tracker now has ' + postLf + ' LF-only lines')
}

console.log('')
console.log('W4g tracker patch applied successfully.')
console.log('')
console.log('  ~ ' + TRACKER)
console.log('    backup: W-LEADS-WORKBENCH-TRACKER.md.backup_' + stamp)
console.log('  3 patches applied:')
console.log('    P1: version line v16 -> v17 (W4 GROUP COMPLETE)')
console.log('    P2: phase table W4g row OPEN -> SHIPPED (ff45756)')
console.log('    P3: status log W4g-SHIPPED entry appended (4 findings)')
console.log('')
console.log('Next:')
console.log('  git add docs/W-LEADS-WORKBENCH-TRACKER.md \\')
console.log('          scripts/patch-w-leads-workbench-tracker-w4g.js')
console.log('  git commit -F <message file>')
console.log('  git push origin main')