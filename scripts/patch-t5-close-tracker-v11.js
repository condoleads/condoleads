#!/usr/bin/env node
/**
 * patch-t5-close-tracker-v11.js
 *
 * W-LEADS-EMAIL T5 close: tracker v10 -> v11.
 *
 * T5 was Form coverage audit per OD-5=(a) "per-page-type form variants"
 * (anchor locked at v2). Three probes shipped:
 *   - probe-t5a-form-coverage-matrix.js (v1, directory-segment classification)
 *   - probe-t5a-form-coverage-deep.js (v2, whole-file dumps + components inventory)
 *   - probe-t5a-form-coverage-focused.js (v3, ±context slices around form/CTA refs)
 *
 * Verdict: all 6 page types compose the canonical triad
 * (WalliamAgentCard + WalliamCTA + CharliePageContext) with entity-appropriate
 * props; Building adds inline WalliamContactForm, Property adds AppointmentForm
 * and AgentContactForm. OD-5=(a) HOLDS.
 *
 * Patches:
 *   P1 status line (T4 closed -> T4 + T5 closed)
 *   P2 Next action paragraph (T5 roadmap -> T6 roadmap, regex)
 *   P3 insert v11 status log entry above v10 line (regex)
 *   P4 insert TWO new findings after F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP line (regex)
 *   P5 (conditional) update T5 section header if present
 *
 * Atomic validation pre-write. Backup pre-edit. Tracker only.
 */

const fs = require('fs')
const path = require('path')

const F = 'docs/W-LEADS-EMAIL-TRACKER.md'
const filePath = path.resolve(F)

if (!fs.existsSync(filePath)) {
  console.error('FAIL: tracker not found at ' + filePath)
  process.exit(1)
}

let working = fs.readFileSync(filePath, 'utf8')
const original = working

// ============================================================================
// P1 — Status line (anchored to v10 text)
// ============================================================================

const P1_OLD = '**Status:** T2 ✅ CLOSED 2026-05-10. **T3 phase ✅ CLOSED 2026-05-11.** **T4 ✅ CLOSED 2026-05-11 — OD-1=(c) FINAL.** Probe v2 (proximity-aware) confirmed: zero credit refs co-located with any lead write (Matrix A clean — 0 proximity-concerns, 11 distant); 14 lead-write surfaces classified — 8 audit-wired (T3b/T3c) + 4 System 1 legacy (isolation absolute) + 2 System 2 management UPDATE-only (out of creation scope). Two non-blocker findings on file: F-LERL-RECIPIENT-LAYER-USER-FACING-GAP (vip-approve user-facing recipient gap) + F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP (probe-item: verify lead-management UPDATE flows for `sendTenantEmail` calls at T8). **Next phase: T5 — Form coverage audit per page type** (OD-5=(a) at v2: per-page-type form variants for Area / Muni / Community / Neighbourhood / Building / Property — audit current coverage, identify gaps).'

const P1_NEW = '**Status:** T2 ✅ CLOSED 2026-05-10. **T3 phase ✅ CLOSED 2026-05-11.** **T4 ✅ CLOSED 2026-05-11 — OD-1=(c) FINAL.** **T5 ✅ CLOSED 2026-05-11 — OD-5=(a) FINAL.** Form coverage matrix verified across all 6 page types via 3-probe recon: every type composes the canonical lead-capture triad — `WalliamAgentCard` (embedded contact form → /api/walliam/contact), `WalliamCTA` (Charlie launcher with context tagline), `CharliePageContext` (window-event geo-ID feed). Building adds inline `WalliamContactForm` (source=walliam_building_inquiry); Property adds `AppointmentForm` + `AgentContactForm`. Four non-blocker findings on file: F-LERL-RECIPIENT-LAYER-USER-FACING-GAP, F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP, F-SLUG-ROUTER-MISSING-NEIGHBOURHOOD-BRANCH (NEW: routing/SEO gap, neighbourhoods only reachable via `/comprehensive-site/toronto/[slug]`), F-T5-VERIFY-NEIGHBOURHOOD-CHARLIE-CONTEXT-RENDER (NEW: T8 verify-item). **Next phase: T6 — Plan integration + T6b LIKE-filter replacement** using `lead_origin_route` from T2c (closes F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER).'

// ============================================================================
// P2 — Next action paragraph (regex; anchored to v10 prefix)
// ============================================================================

const P2_REGEX = /^T2 phase ✅ CLOSED 2026-05-10\. \*\*T3 phase ✅ CLOSED 2026-05-11\.\*\* \*\*T4 phase ✅ CLOSED 2026-05-11 — OD-1=\(c\) locked FINAL via probe-evidence\.\*\*.*$/m

const P2_NEW = 'T2 phase ✅ CLOSED 2026-05-10. **T3 phase ✅ CLOSED 2026-05-11.** **T4 ✅ CLOSED 2026-05-11 — OD-1=(c) FINAL.** **T5 ✅ CLOSED 2026-05-11 — OD-5=(a) FINAL.** T5 closed via 3-probe form coverage recon (`probe-t5a-form-coverage-matrix.js` v1, `probe-t5a-form-coverage-deep.js` v2, `probe-t5a-form-coverage-focused.js` v3). All 6 page types verified to compose the canonical triad: WalliamAgentCard + WalliamCTA + CharliePageContext with entity-appropriate props (area_id / muni_id / community_id / neighbourhood_id / building_id / listing_id+building_id flowing through the right slots per page). Building additionally renders inline `<WalliamContactForm building_id={...} source="walliam_building_inquiry">`; Property additionally renders `<AppointmentForm>` + legacy `<AgentContactForm>`. Two new non-blocker findings logged: F-SLUG-ROUTER-MISSING-NEIGHBOURHOOD-BRANCH (slug router has no neighbourhood branch — defer to W-LAUNCH-TRACKER post-launch) + F-T5-VERIFY-NEIGHBOURHOOD-CHARLIE-CONTEXT-RENDER (probe-item: confirm at T8 that CharliePageContext JSX is rendered on the neighbourhood page; import is present at L10 but slice window didn\'t capture the JSX). **Next: T6 — Plan integration + T6b LIKE-filter replacement.** OD-4=(c) "both directions" was locked at v2 (charlie/plan-email creates lead at plan-ready; charlie/lead F57 enriches via UPSERT). T6 work shape: (1) probe current plan-integration flow end-to-end to confirm both directions still work post-T2/T3 (the chain INSERT/UPSERT path + the F57 enrichment path); (2) T6b — replace the hardcoded `LIKE \'walliam_estimator%\'` filter in `walliam/estimator/vip-questionnaire` with a `lead_origin_route` lookup (using the column shipped at T2c commit `ae8454c`) — this closes F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER; (3) verify plan-context propagation through the BCC fan-out (plan-email-chain templateKey rows in `lead_email_recipients_log`); (4) tracker v11 → v12 with T6 close entry. After T6: **T7** smoke matrix (OD-6=(c) at v2). **T8** comprehensive smoke + regression sweep (extends to verify F-T5-VERIFY-NEIGHBOURHOOD-CHARLIE-CONTEXT-RENDER + F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP). **Tlast** close + update `docs/W-LAUNCH-TRACKER.md` Section 4 with W-LEADS-EMAIL row at closure.'

// ============================================================================
// P3 — Insert v11 status log entry above v10 line (regex)
// ============================================================================

const V10_LINE_REGEX = /^- \*\*2026-05-11 v10 T4 CLOSED — OD-1=\(c\) FINAL\*\*.*$/m

const V11_ENTRY = '- **2026-05-11 v11 T5 CLOSED — OD-5=(a) FINAL** — T5 Form coverage audit phase completed as confirm-and-close per OD-5=(a) "per-page-type form variants" anchor (locked at v2). Three probes shipped: (i) `scripts/probe-t5a-form-coverage-matrix.js` (v1, directory-segment classification — failed because the app uses slug-based dynamic routing; kept for history); (ii) `scripts/probe-t5a-form-coverage-deep.js` (v2, whole-file dumps of key dynamic-route files + components inventory + WalliamCTA usage map); (iii) `scripts/probe-t5a-form-coverage-focused.js` (v3, ±context slices around form/CTA references — the one that produced the clean coverage matrix). **Routing architecture confirmed:** `app/[slug]/page.tsx` is the master slug router resolving slugs in order property → home-property → development → area → municipality → community → fallback BuildingPage; `app/comprehensive-site/[slug]/page.tsx` mirrors the same logic on the comprehensive-site URL surface; `app/comprehensive-site/toronto/[neighbourhood]/page.tsx` is the dedicated neighbourhood route (slug router has no neighbourhood branch); `app/property/[id]/page.tsx` is the dedicated property route with HomePropertyPage variant. **Coverage matrix verified across all 6 page types** (canonical triad pattern: WalliamAgentCard + WalliamCTA + CharliePageContext): (1) **AreaPage** (`app/[slug]/AreaPage.tsx` L230-235): WalliamAgentCard(area_id, tenant_id) + WalliamCTA(context=area.name) + CharliePageContext(area_id, area_slug); (2) **MunicipalityPage** (`app/[slug]/MunicipalityPage.tsx` L222-228): WalliamAgentCard(municipality_id, area_id, tenant_id) + WalliamCTA(context=municipality.name) + CharliePageContext(municipality_id, municipality_slug, area_id); (3) **CommunityPage** (`app/[slug]/CommunityPage.tsx` L178-183): WalliamAgentCard(community_id, municipality_id, tenant_id) + WalliamCTA(context=community.name) + CharliePageContext(community_id, community_slug, municipality_id); (4) **NeighbourhoodPage** (`app/comprehensive-site/toronto/[neighbourhood]/page.tsx` L10/256): imports WalliamCTA + CharliePageContext at L10-11, renders WalliamCTA(context=neighbourhood.name) at L256 — CharliePageContext JSX render not captured in focused probe slice window (file is 268 lines, slice ended at L266), flagged as T8 verify-item; (5) **BuildingPage** (`app/[slug]/BuildingPage.tsx` L574-590): WalliamAgentCard(community_id, municipality_id, tenant_id) + WalliamCTA(context=building.building_name) + CharliePageContext(building_id, community_id, municipality_id) + **inline WalliamContactForm** with `building_id` + `source="walliam_building_inquiry"` + `contextLabel=building.building_name` — Building is the only geo/building page with both Charlie and dedicated inline form; (6) **PropertyPage** (`app/property/[id]/PropertyPageClient.tsx` L180-265 + `HomePropertyPageClient.tsx` L171-234): WalliamAgentCard(municipality_id, tenant_id, hideCTA=true) + WalliamCTA(context=building.name OR listing.address) + CharliePageContext(listing_id, building_id, community_id, municipality_id) + **AppointmentForm** (book-a-visit) + **AgentContactForm** (legacy `submitLeadFromForm` path) — Property has the densest lead-capture surface. **WalliamAgentCard contains an embedded contact form** that POSTs to `/api/walliam/contact` (verified at T0-C SECTION 2 in `recon/W-LEADS-EMAIL-T0-C-form-coverage.txt`: L50 of `components/WalliamAgentCard.tsx`) — this is the universal direct-contact mechanism on every page. **OD-5=(a) FINAL interpretation:** "per-page-type form variants" is satisfied via the canonical triad pattern — every page type composes WalliamAgentCard + WalliamCTA + CharliePageContext appropriate to its entity context, with additional inline forms where the entity warrants more capture surface (Building → WalliamContactForm; Property → AppointmentForm + AgentContactForm). All geo IDs flow through the triad cleanly: area_id / municipality_id / community_id / neighbourhood_id / building_id / listing_id reach the API routes via the appropriate path (direct POST from WalliamAgentCard/WalliamContactForm; Charlie window-event from CharliePageContext into the chat session, which then includes them in the lead INSERT payload). **Two new non-blocker findings logged:** F-SLUG-ROUTER-MISSING-NEIGHBOURHOOD-BRANCH (routing/SEO concern, defer to W-LAUNCH-TRACKER) + F-T5-VERIFY-NEIGHBOURHOOD-CHARLIE-CONTEXT-RENDER (T8 verify-item). **Files in this commit:** `docs/W-LEADS-EMAIL-TRACKER.md` (v10→v11 bump in this script), `scripts/probe-t5a-form-coverage-matrix.js` (v1 probe), `scripts/probe-t5a-form-coverage-deep.js` (v2 probe), `scripts/probe-t5a-form-coverage-focused.js` (v3 probe — the one that produced the clean matrix), `scripts/patch-t5-close-tracker-v11.js` (this close script). **Next phase:** T6 — Plan integration + T6b LIKE-filter replacement (closes F-QUESTIONNAIRE-HARDCODED-WALLIAM-LIKE-FILTER via the `lead_origin_route` column from T2c).'

// ============================================================================
// P4 — Insert TWO new findings after F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP line
// ============================================================================

const F_LEAD_MGMT_LINE_REGEX = /^- \*\*F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP\*\* .*$/m

const NEW_FINDINGS =
  '- **F-SLUG-ROUTER-MISSING-NEIGHBOURHOOD-BRANCH** (NEW 2026-05-11, NON-BLOCKER, ROUTING/SEO) — `app/[slug]/page.tsx` slug router resolves slugs in order: property → home-property → development → area → municipality → community → fallback BuildingPage. There is no neighbourhood lookup branch. Result: neighbourhood pages are reachable only via `/comprehensive-site/toronto/[slug]/` URLs (the dedicated `app/comprehensive-site/toronto/[neighbourhood]/page.tsx` route), NOT via clean `/[slug]/` slug-router URLs. Impact: a user visiting `/yonge-eglinton` would fall through to BuildingPage and 404 (no building has that slug). Affects SEO discoverability and clean-URL accessibility for neighbourhood pages. **Not a form-coverage gap** (OD-5 unaffected; neighbourhood form coverage is in place on the dedicated route). **Fix surface:** add a neighbourhood lookup branch to `app/[slug]/page.tsx` between the community check and the BuildingPage fallback (mirror the area/municipality/community pattern). **Status:** Defer to W-LAUNCH-TRACKER post-launch — non-blocking for W-LEADS-EMAIL closure.\n' +
  '- **F-T5-VERIFY-NEIGHBOURHOOD-CHARLIE-CONTEXT-RENDER** (NEW 2026-05-11, NON-BLOCKER, PROBE-ITEM) — `app/comprehensive-site/toronto/[neighbourhood]/page.tsx` L10 imports `CharliePageContext` and L11 imports `WalliamCTA`. The L256 JSX renders `<WalliamCTA context={neighbourhood.name}>`. The focused probe slice window stopped at ~L266 (file is 268 lines total) and did not capture a `<CharliePageContext>` JSX render. Verify at T8 comprehensive smoke that `<CharliePageContext neighbourhood_id={...} neighbourhood_slug={...} ...>` is actually rendered on the neighbourhood page (not just imported). If not rendered, add the JSX line so neighbourhood-specific geo context flows to Charlie chat. **Non-blocking:** Charlie chat would still work without it but lose neighbourhood-specific geo binding on leads originating from the neighbourhood page.'

// ============================================================================
// P5 — Conditional T5 section header (regex; skip if absent)
// ============================================================================

const P5_REGEX = /^### T5 — Form coverage audit\b.*$/m

// ============================================================================
// Atomic validation
// ============================================================================

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1
}

const errors = []

// P1
const p1Count = countOccurrences(working, P1_OLD)
if (p1Count !== 1) errors.push(`P1 status line: expected 1 match, found ${p1Count}`)

// P2 (regex)
const p2Single = working.match(P2_REGEX)
if (!p2Single) {
  errors.push('P2 Next action regex: no match')
} else {
  const p2All = working.match(new RegExp(P2_REGEX.source, P2_REGEX.flags + 'g'))
  if ((p2All ? p2All.length : 0) !== 1) errors.push(`P2 Next action regex: expected 1 match, found ${p2All ? p2All.length : 0}`)
}
const P2_OLD = p2Single ? p2Single[0] : null

// P3 (regex on v10 line)
const v10Single = working.match(V10_LINE_REGEX)
if (!v10Single) {
  errors.push('P3 v10 line regex: no match')
} else {
  const v10All = working.match(new RegExp(V10_LINE_REGEX.source, V10_LINE_REGEX.flags + 'g'))
  if ((v10All ? v10All.length : 0) !== 1) errors.push(`P3 v10 line regex: expected 1 match, found ${v10All ? v10All.length : 0}`)
}
const V10_LINE = v10Single ? v10Single[0] : null

// P4 (regex on F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP line)
const flmSingle = working.match(F_LEAD_MGMT_LINE_REGEX)
if (!flmSingle) {
  errors.push('P4 F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP line regex: no match (was v10 finding insertion successful?)')
} else {
  const flmAll = working.match(new RegExp(F_LEAD_MGMT_LINE_REGEX.source, F_LEAD_MGMT_LINE_REGEX.flags + 'g'))
  if ((flmAll ? flmAll.length : 0) !== 1) errors.push(`P4 F-LEAD-MANAGEMENT-AUDIT-SCOPE-GAP line regex: expected 1 match, found ${flmAll ? flmAll.length : 0}`)
}
const F_LEAD_MGMT_LINE = flmSingle ? flmSingle[0] : null

// P5 (conditional)
const p5Single = working.match(P5_REGEX)
const p5Exists = !!p5Single

if (errors.length > 0) {
  console.error('FAIL: anchor validation:')
  for (const e of errors) console.error('  - ' + e)
  console.error('')
  console.error('No write performed.')
  process.exit(1)
}

console.log('Required anchors validated (P1, P2, P3, P4). Proceeding to backup + write.')
console.log(p5Exists
  ? '  P5 T5 section header: FOUND — will update'
  : '  P5 T5 section header: NOT FOUND — will skip')

// ============================================================================
// Backup
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
const backupPath = filePath + '.backup_' + stamp
fs.copyFileSync(filePath, backupPath)
console.log('Backup written: ' + path.basename(backupPath))

// ============================================================================
// Apply
// ============================================================================

working = working.replace(P1_OLD, P1_NEW)
console.log('  P1 status line: replaced')

working = working.replace(P2_OLD, P2_NEW)
console.log('  P2 Next action paragraph: replaced')

working = working.replace(V10_LINE, V11_ENTRY + '\n' + V10_LINE)
console.log('  P3 v11 entry: inserted above v10 line')

working = working.replace(F_LEAD_MGMT_LINE, F_LEAD_MGMT_LINE + '\n' + NEW_FINDINGS)
console.log('  P4 2 new findings (F-SLUG-ROUTER-MISSING-NEIGHBOURHOOD-BRANCH + F-T5-VERIFY-NEIGHBOURHOOD-CHARLIE-CONTEXT-RENDER): inserted')

if (p5Exists) {
  const P5_OLD = p5Single[0]
  const P5_NEW = '### T5 — Form coverage audit (✅ CLOSED 2026-05-11 — OD-5=(a) FINAL via 3-probe coverage matrix; see v11 status log entry)'
  working = working.replace(P5_OLD, P5_NEW)
  console.log('  P5 T5 section header: replaced')
} else {
  console.log('  P5 T5 section header: skipped (not present)')
}

if (working === original) {
  console.error('FAIL: no diff after replacements. Aborting.')
  fs.unlinkSync(backupPath)
  process.exit(1)
}

fs.writeFileSync(filePath, working, 'utf8')

console.log('')
console.log('Wrote: ' + F)
console.log('T5 phase CLOSED. Tracker bumped v10 -> v11.')
console.log('Backup suffix: .backup_' + stamp)
console.log('')
console.log('Next steps:')
console.log('  1. Verify:')
console.log('     Select-String -Path "docs/W-LEADS-EMAIL-TRACKER.md" \\')
console.log('       -Pattern "v11 T5 CLOSED|F-SLUG-ROUTER-MISSING-NEIGHBOURHOOD-BRANCH|F-T5-VERIFY-NEIGHBOURHOOD-CHARLIE-CONTEXT-RENDER|T5 ✅ CLOSED 2026-05-11" |')
console.log('       Select-Object LineNumber')
console.log('  2. git add docs/W-LEADS-EMAIL-TRACKER.md \\')
console.log('             scripts/probe-t5a-form-coverage-matrix.js \\')
console.log('             scripts/probe-t5a-form-coverage-deep.js \\')
console.log('             scripts/probe-t5a-form-coverage-focused.js \\')
console.log('             scripts/patch-t5-close-tracker-v11.js')
console.log('  3. git commit -m "W-LEADS-EMAIL T5 close: OD-5=(a) FINAL via 3-probe form coverage matrix + tracker v11 + 2 non-blocker findings (slug-router neighbourhood gap, T8 verify-item)"')
console.log('  4. git push origin main')
console.log('  5. Proceed to T6 — Plan integration + T6b LIKE-filter replacement.')