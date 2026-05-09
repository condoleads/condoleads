#!/usr/bin/env node
// scripts/r-territory-t7-close.js
// W-TERRITORY T7 — workstream final close. Patches both trackers atomically.
//
// Files:
//   1. docs/W-TERRITORY-TRACKER.md  (3 edits: status line tail, v21 entry, Next Action T7)
//   2. docs/W-LAUNCH-TRACKER.md     (10 edits: Section 1 row, Section 2 provider lines, nav spec,
//                                    Section 3 P1-3, Section 4 row, closed tickets list, backlog
//                                    line, status log v13 entry)
//
// 13 anchored edits total. Atomic per file (timestamped backup before any write).
// Idempotent via alreadyMarker. CRLF/LF tolerant.
// T4b commit hash read at runtime via git rev-parse HEAD (no placeholders).

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const PROJECT_ROOT = process.cwd()
const W_TERRITORY = 'docs/W-TERRITORY-TRACKER.md'
const W_LAUNCH = 'docs/W-LAUNCH-TRACKER.md'

const TIMESTAMP = (() => {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  )
})()

// Read T4b commit hash from current HEAD (the v20 commit Shah just pushed).
const T4B_COMMIT = execSync('git rev-parse HEAD', { cwd: PROJECT_ROOT })
  .toString()
  .trim()
  .slice(0, 7)

let totalPatched = 0
let totalSkipped = 0

function backup(relPath) {
  const abs = path.join(PROJECT_ROOT, relPath)
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${relPath}`)
  const bak = abs + `.backup_${TIMESTAMP}`
  fs.copyFileSync(abs, bak)
  console.log(`  BACKUP: ${relPath}.backup_${TIMESTAMP}`)
}

function tryEdit({ file, label, oldStr, newStr, alreadyMarker }) {
  const abs = path.join(PROJECT_ROOT, file)
  const raw = fs.readFileSync(abs, 'utf8')
  const usesCRLF = raw.includes('\r\n')
  const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw

  if (alreadyMarker && content.includes(alreadyMarker)) {
    console.log(`  SKIP (already applied): ${label}`)
    totalSkipped++
    return
  }

  const matches = content.split(oldStr).length - 1
  if (matches === 0) throw new Error(`Anchor not found for "${label}" in ${file}`)
  if (matches > 1) throw new Error(`Anchor matched ${matches} times for "${label}" in ${file} — must be unique`)

  let updated = content.replace(oldStr, newStr)
  if (usesCRLF) updated = updated.replace(/\n/g, '\r\n')
  fs.writeFileSync(abs, updated, 'utf8')
  console.log(`  PATCHED: ${label}`)
  totalPatched++
}

console.log('\n=== W-TERRITORY T7 — workstream final close ===')
console.log(`Timestamp: ${TIMESTAMP}`)
console.log(`T4b commit (HEAD): ${T4B_COMMIT}\n`)

console.log('--- Backups ---')
backup(W_TERRITORY)
backup(W_LAUNCH)
console.log()

// =======================================================================
// W-TERRITORY-TRACKER.md
// =======================================================================
console.log(`--- File 1: ${W_TERRITORY} ---`)

// E1: Status line tail — close T7
tryEdit({
  file: W_TERRITORY,
  label: 'E1: status line tail — T7 next -> T7 CLOSED v21',
  oldStr: '12 anchored edits via `scripts/r-territory-t4b-patch.js`; TSC clean). **T7 next, this working block**: close ticket + flip `docs/W-LAUNCH-TRACKER.md` Section 4 W-TERRITORY row to CLOSED.',
  newStr: '12 anchored edits via `scripts/r-territory-t4b-patch.js`; TSC clean; local smoke PASS on Whitby + Midtown Central; commit `' + T4B_COMMIT + '`). **T7 ✅ CLOSED v21** -- W-TERRITORY workstream COMPLETE. All locked-scope items shipped (T1-T7). `docs/W-LAUNCH-TRACKER.md` Section 4 row flipped to CLOSED. Conditional-defer findings carried forward (F-DISTRIBUTE-AUDIT-STATE-INCOMPLETE, F-INHERITANCE-DEPTH-1, F-AREA-MANAGER-SUBTREE-DEPTH-INCONSISTENCY, F-RESET-TO-INHERITED-BUILDER-DEPENDENCY). T2b (percentage mode) remains optional/parallel and unscoped.',
  alreadyMarker: '**T7 ✅ CLOSED v21**',
})

// E2: Status log — insert v21 entry before v20 entry
const V21_ENTRY = `- **2026-05-09 v21** -- **T7 CLOSED. W-TERRITORY WORKSTREAM COMPLETE.** All seven phases shipped (T1 decision lock, T2a schema, T3a-D resolver+distribution+triggers+caller updates, T4a-1/2/3/3b admin UI sub-phases, T4c-1/2/3 manager carving sub-phases, T4b public geo card, T6 smoke + followups, T7 close). Database / triggers / resolvers / race safety / audit coverage / admin UI / public UI layers all functionally complete and verified end-to-end.

  - **Workstream summary by phase (commit hashes for major milestones):**
    - **T1** (decision lock, v2): all 7 OD-* product calls resolved.
    - **T2a** (core schema): 4 migrations -- \`tenant_id NOT NULL\`, \`is_primary\` + 4 partial unique indexes, 2 audit tables with append-only triggers.
    - **T3a** (resolver baseline + v2 refactor): \`resolve_agent_for_context\` (10-step routing cascade) + \`resolve_display_agent_for_context\` (is_selling-aware display) + \`resolve_geo_primary\` (single-scope) + \`pick_routing_agent\` helper. 8/8 smoke PASS.
    - **T3b-A**: \`mls_listings.assigned_agent_id\` cache column + partial index.
    - **T3b-B**: 4 distribution functions (\`distribute_geo_to_children\`, \`distribute_listings_at_geo\`, \`reroll_listings_at_geo\`, \`reresolve_listing\`). Set-based UPDATE rewrite via F-AREA-REROLL-TIMEOUT v9.
    - **T3b-C**: 3 apa triggers (\`handle_apa_insert/update/delete\`) with recursion guard via \`pg_trigger_depth() > 1\`. F-APA-UPDATE-AUDIT-GAP v11 closed (added direct-state-change audit writes). F-APA-PRIMARY-AUDIT-GAP v13 closed (commit \`c85174e\`) added is_primary + access-toggle audit writes.
    - **T3b-D** (commit \`fd3cbcf\`): 9 callers (later 10) threaded \`p_neighbourhood_id\` through the resolver RPC contract.
    - **T6** (smoke matrix): core 6/6 PASS + race-safety 3/3 PASS (T6-followup-A) + multi-level cascade resolver 3/3 PASS + is_active-flip-fires-reroll PASS (T6-followup-B/C). F-RACE-DEADLOCK closed via autocommit pattern. F-APA-NEIGHBOURHOOD-CHECK closed via CHECK constraint migration.
    - **T4a-1** (commit \`167c477\`): \`is_primary\` toggle in \`GeoAssignmentSection\` + auto-reassign in geo POST route. Code smoke 9/9 PASS.
    - **T4a-2** (commit \`d8ef4c5\`): new \`/admin-homes/territory\` page with coverage table + audit log + 5-card stats; 2 GET API routes.
    - **T4a-3 + T4a-3b** (v14): F-APA-DELETE-INSERT-CHURN comprehensive fix via \`computeApaDiff\` server-side diff in apa + tpa POST routes. F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP fix in \`lib/comprehensive/access-resolver.ts\`. Smoke 9/9 PASS.
    - **T4c-1** (v16): \`POST /api/admin-homes/territory/bulk-assign\` route with per-agent permission gating + per-tenant scoping + atomic single-transaction apply. Smoke 6/6 PASS.
    - **T4c-2** (v17): cross-agent territory matrix component + page + builder/serializer at \`lib/admin-homes/territory-matrix.ts\` + GET API route at \`app/api/admin-homes/territory/matrix/route.ts\`. Builder smoke 8/8 PASS.
    - **T4c-3** (commits \`d18578b\` Phase 1 mobile, \`eac3afa\` Phase 2 a11y, \`00a312b\` Phases 3+4 inheritance preview + kebab menu): mobile responsive + a11y basic floor + inheritance preview + 3 bulk row actions. F-RESET-TO-INHERITED-BUILDER-DEPENDENCY logged (4th kebab action deferred pending builder change).
    - **T4b** (commit \`${T4B_COMMIT}\`): public-facing geo card -- \`WalliamAgentCard\` extended with \`neighbourhood_id\` prop; \`/api/walliam/resolve-agent\` swapped to \`resolve_display_agent_for_context\`; \`lib/utils/is-walliam.ts::resolveWalliamAgent\` extended with \`neighbourhood_id\` param; Toronto neighbourhood page caller fixed; F-IS-WALLIAM-DEAD-CONSTANT closed. 12 anchored edits via \`scripts/r-territory-t4b-patch.js\`. TSC clean. Local smoke PASS on Whitby (MunicipalityPage caller) + Midtown Central (Toronto neighbourhood page).

  - **Sister tracker updates (this commit):**
    - \`docs/W-LAUNCH-TRACKER.md\` Section 1 Territory row: 🟡/🟡/❌/🟡 -> ✅/✅/✅/✅ with full closure summary.
    - Section 2 "Territory as provider" subsection: all three lines flipped (\`resolve_agent_for_context\` -> 10 callers ✅; Territory data ✅; Territory -> UI ✅).
    - Section 2 nav spec: 6/9 -> 7/9 (Territory shipped; Approvals + Tickets remain).
    - Section 3 P1-3 (Territory configurability): marked CLOSED with sub-item resolution.
    - Section 4 trackers index: "Territory ticket (not yet started) | NOT STARTED" row replaced with W-TERRITORY tracker pointer + commit hashes.
    - Section 4 Closed tickets reference list: W-TERRITORY (2026-05-09) added.
    - Bottom backlog line: "W-TERRITORY: largest open feature; required before tenant-2 onboarding" -> CLOSED.
    - Status log: v13 entry documenting workstream closure.

  - **Conditional-defer findings carried forward (architectural debt accepted by prior session decisions):**
    - **F-DISTRIBUTE-AUDIT-STATE-INCOMPLETE**: \`distribute_geo_to_children\` audit rows have NULL state JSON. Data-quality, not routing-correctness. Cleanup non-urgent; fix would add \`to_jsonb(NEW)\` capture.
    - **F-INHERITANCE-DEPTH-1**: depth-1 ancestor walk in inheritance preview (per-agent + matrix surfaces both). Benign for current org shapes (depth 1-2), real bug for deeper. Defer to dedicated patch when affected tenant onboards; fix via shared \`getAncestorApa()\` helper.
    - **F-AREA-MANAGER-SUBTREE-DEPTH-INCONSISTENCY**: \`computeManagedAgentIds\` returns depth-2 for area_managers; \`permissions.ts\` comments specify FULL SUBTREE. Same conditional shape as F-INHERITANCE-DEPTH-1. Fix via \`getDescendantIds\` from \`lib/admin-homes/hierarchy.ts\`.
    - **F-RESET-TO-INHERITED-BUILDER-DEPENDENCY**: kebab "Reset to inherited" deferred pending builder \`inheritedFallback\` map extension. ~30 LOC across builder + smoke + component when picked up.
    - **Pre-existing (from v6)**: estimator session route (\`app/api/walliam/estimator/session/route.ts\`) missing \`p_tenant_id\` arg (multi-tenant gap, predates T3a; not a regression). Belongs to W-MULTITENANT cleanup.

  - **Optional / parallel never-started:**
    - **T2b** (percentage mode): architected for via \`agent_property_access.percentage NUMERIC NULL\` + DB-level CHECK + auto-renormalize trigger. Can ship anytime; doesn't block any other workstream.

  - **W-TERRITORY workstream complete.** Tracker is now reference-only. Downstream workstreams (W-LAUNCH P1-3, public-page rendering, tenant-2 onboarding) unblocked end-to-end.

  - **Files shipped this batch:**
    - \`docs/W-TERRITORY-TRACKER.md\`: status line tail update + v21 status log entry + Next Action section 4 (T7) marked CLOSED.
    - \`docs/W-LAUNCH-TRACKER.md\`: 10 edits across Section 1 / Section 2 / Section 3 / Section 4 / status log / bottom backlog.
    - \`scripts/r-territory-t7-close.js\` (NEW, this script).

`

tryEdit({
  file: W_TERRITORY,
  label: 'E2: status log — insert v21 entry before v20 entry',
  oldStr: '- **2026-05-09 v20** -- **T4b CLOSED.**',
  newStr: V21_ENTRY + '- **2026-05-09 v20** -- **T4b CLOSED.**',
  alreadyMarker: '- **2026-05-09 v21** -- **T7 CLOSED. W-TERRITORY WORKSTREAM COMPLETE.**',
})

// E3: Next Action section 4 (T7) — mark CLOSED
const T7_OLD = `### 4. T7 — Close ticket

After T4a + T4c + T4b ship and a final smoke matrix run:

1. Apply the closing tracker patch (final closure entry, status line marked CLOSED with commit hashes for the major milestones — F-APA-NEIGHBOURHOOD-CHECK, F-APA-UPDATE-AUDIT-GAP, F-APA-DELETE-INSERT-CHURN, T4a sub-phases, T4c, T4b).
2. Flip \`docs/W-LAUNCH-TRACKER.md\` Section 4 W-TERRITORY row from in-progress to **CLOSED**, with commit hashes for: T6 closure (v11), T4a sub-phases, T4c, T4b.
3. Notify any downstream workstreams (W-LAUNCH P1-3, public-page rendering) that territory is unblocked end-to-end.
4. W-TERRITORY workstream complete.`

const T7_NEW = `### 4. T7 — Close ticket ✅ CLOSED 2026-05-09 v21

W-TERRITORY workstream COMPLETE. All locked-scope items shipped (T1 -> T7).

- **T7 deliverables:** (1) closing tracker patch applied (this commit, v21 entry); (2) \`docs/W-LAUNCH-TRACKER.md\` Section 4 W-TERRITORY row flipped from "not yet started" to CLOSED with commit hashes (Section 1 row + Section 2 provider lines + Section 3 P1-3 + bottom backlog line all updated comprehensively per Rule Zero); (3) downstream workstreams (W-LAUNCH P1-3, public-page rendering, tenant-2 onboarding) unblocked end-to-end.

- **Workstream complete.** Tracker is now reference-only. Conditional-defer findings carried forward to dedicated patches as their triggers fire (tenant-onboarding-driven for the depth-1 / subtree findings; non-urgent for the audit-state-JSON finding). T2b (percentage mode) remains optional/parallel and can ship anytime without blocking.`

tryEdit({
  file: W_TERRITORY,
  label: 'E3: Next Action section 4 (T7) — mark CLOSED',
  oldStr: T7_OLD,
  newStr: T7_NEW,
  alreadyMarker: '### 4. T7 — Close ticket ✅ CLOSED 2026-05-09 v21',
})

// =======================================================================
// W-LAUNCH-TRACKER.md
// =======================================================================
console.log(`\n--- File 2: ${W_LAUNCH} ---`)

// E4: Section 1 Territory row — full row replacement
tryEdit({
  file: W_LAUNCH,
  label: 'E4: Section 1 Territory row -> ✅/✅/✅/✅ CLOSED',
  oldStr: '| Territory (geo cascade, building/listing assign) | 🟡 | 🟡 | ❌ | 🟡 | **4 tables exist, schema-ready but data-empty.** `agent_property_access` (1 row, 1 muni-scoped). `agent_geo_buildings` (9 rows, 1 agent, 9 buildings) schema is **flat `(agent_id, building_id)` — NOT junction-to-`assignment_id` as implementation plan described**. `tenant_property_access` (0 rows = full access per model). `agent_listing_assignments` (0 rows). RPC `resolve_agent_for_context` is the single resolver, **9 callers** across charlie/walliam/lib. 4 section components embedded in agent + tenant workspaces (March 2026). **No `/admin-homes/territory` page** (Phase 3 nav gap). **`agent_property_access.tenant_id` NULLABLE** (multi-tenant gap at DB level). No territory smoke tests. No migration files matching territory/geo/property_access/building keywords — tables created out-of-band. |',
  newStr: '| Territory (geo cascade, building/listing assign) | ✅ | ✅ | ✅ | ✅ | **W-TERRITORY workstream CLOSED 2026-05-09 v21.** Full system shipped: `agent_property_access` (apa) with `is_primary` flag + 4 partial unique indexes + tenant_id NOT NULL (T2a); `agent_geo_buildings` flat `(agent_id, building_id)` schema confirmed-final (OD-1 lock); 4 distribution functions + 3 apa triggers with recursion guard (T3b-B/C); `mls_listings.assigned_agent_id` cache + autonomous reroll (T3b-A); 3 resolver functions -- routing (`resolve_agent_for_context`), display (`resolve_display_agent_for_context`, is_selling-aware), single-scope (`resolve_geo_primary`); 10 callers wired through `p_neighbourhood_id` (T3b-D `fd3cbcf`). **Admin UI**: `/admin-homes/territory` page with coverage table + audit log + cross-agent matrix component (T4a-2 `d8ef4c5`, T4c-2 v17, T4c-3 `d18578b`/`eac3afa`/`00a312b`). **Public UI**: `WalliamAgentCard` wired across 8 callers using display resolver (T4b commit `' + T4B_COMMIT + '`). **Audit coverage**: `territory_assignment_changes` actively written for every state change (post-F-APA-UPDATE-AUDIT-GAP v11 + F-APA-PRIMARY-AUDIT-GAP `c85174e`). **T6 smoke**: 6/6 core + 3/3 race-safety + 3/3 multi-level cascade + is_active flip PASS. Conditional-defer findings open (F-DISTRIBUTE-AUDIT-STATE-INCOMPLETE, F-INHERITANCE-DEPTH-1, F-AREA-MANAGER-SUBTREE-DEPTH-INCONSISTENCY, F-RESET-TO-INHERITED-BUILDER-DEPENDENCY) -- accepted as deferred per dedicated tenant-onboarding triggers. T2b percentage mode remains optional/parallel. |',
  alreadyMarker: '| Territory (geo cascade, building/listing assign) | ✅ | ✅ | ✅ | ✅ |',
})

// E5: Section 2 — resolve_agent_for_context callers count
tryEdit({
  file: W_LAUNCH,
  label: 'E5: Section 2 — resolve_agent_for_context 9 callers -> 10 callers',
  oldStr: '- **resolve_agent_for_context → 9 callers**: ✅ charlie session/lead/appointment, walliam session/contact/estimator/assign-user-agent/resolve-agent, lib leads, is-walliam.',
  newStr: '- **resolve_agent_for_context → 10 callers**: ✅ charlie session/lead/appointment, walliam session/contact/estimator/assign-user-agent/resolve-agent, lib leads, is-walliam, app/actions/createLead. All callers thread `p_neighbourhood_id` post-T3b-D. Public card now uses `resolve_display_agent_for_context` (is_selling-aware) per T4b v20.',
  alreadyMarker: '- **resolve_agent_for_context → 10 callers**',
})

// E6: Section 2 — Territory data → resolution
tryEdit({
  file: W_LAUNCH,
  label: 'E6: Section 2 — Territory data resolution 🟡 -> ✅',
  oldStr: '- **Territory data → resolution**: 🟡 1 muni-scoped assignment + 9 building picks (1 agent). Cascade is mostly fall-through to tenant default.',
  newStr: '- **Territory data → resolution**: ✅ Cascade resolves end-to-end via 10-step routing chain + 4-step display chain. Autonomous reroll on apa state change via T3b-C triggers. Multi-level cascade verified (area/community/neighbourhood) per T6-followup-B 3/3 PASS.',
  alreadyMarker: '- **Territory data → resolution**: ✅',
})

// E7: Section 2 — Territory → UI
tryEdit({
  file: W_LAUNCH,
  label: 'E7: Section 2 — Territory UI ❌ -> ✅',
  oldStr: '- **Territory → UI**: ❌ No `/admin-homes/territory` page; configuration is fragmented across 4 embedded section components.',
  newStr: '- **Territory → UI**: ✅ Admin page at `/admin-homes/territory` shipped (T4a-2 `d8ef4c5`) with coverage table + audit log viewer + 5-card stats + cross-agent matrix component (T4c-2 v17 / T4c-3 `00a312b`). Public geo cards across 8 callers (Area / Muni / Community / Building / 3 property pages + Toronto neighbourhood) wired through display resolver (T4b `' + T4B_COMMIT + '`).',
  alreadyMarker: '- **Territory → UI**: ✅',
})

// E8: Section 2 — nav spec 6/9 -> 7/9
tryEdit({
  file: W_LAUNCH,
  label: 'E8: Section 2 — nav spec 6/9 -> 7/9',
  oldStr: '- **Pages → /admin-homes nav spec**: 🟡 6/9 nav items shipped. Missing: Territory, Approvals, Tickets.',
  newStr: '- **Pages → /admin-homes nav spec**: 🟡 7/9 nav items shipped (Territory ✅ added via T4a-2 `d8ef4c5`). Missing: Approvals, Tickets.',
  alreadyMarker: '- **Pages → /admin-homes nav spec**: 🟡 7/9 nav items shipped',
})

// E9: Section 3 P1-3 — mark CLOSED
tryEdit({
  file: W_LAUNCH,
  label: 'E9: Section 3 P1-3 Territory configurability — CLOSED',
  oldStr: `**P1-3. Territory configurability**
- Three sub-items: (a) build \`/admin-homes/territory\` page; (b) make \`agent_property_access.tenant_id\` NOT NULL (after backfill from \`agents.tenant_id\`); (c) decide whether \`agent_geo_buildings\` migrates to \`(assignment_id, building_id)\` junction or stays flat.
- Verify: tenant onboarding can configure territory end-to-end without DB writes.`,
  newStr: `**P1-3. Territory configurability** ✅ CLOSED 2026-05-09 via W-TERRITORY workstream.
- Sub-items resolved: (a) \`/admin-homes/territory\` page shipped (T4a-2 commit \`d8ef4c5\`) with coverage + audit + matrix; (b) \`agent_property_access.tenant_id NOT NULL\` shipped via T2a; (c) \`agent_geo_buildings\` flat \`(agent_id, building_id)\` schema confirmed-final per OD-1 lock -- no junction migration needed.
- Verified: tenant onboarding can configure territory end-to-end via the UI; no DB-level intervention required. T6 smoke matrix 6/6 + race-safety 3/3 + multi-level cascade 3/3 PASS.`,
  alreadyMarker: '**P1-3. Territory configurability** ✅ CLOSED',
})

// E10: Section 4 — Territory ticket row replacement
tryEdit({
  file: W_LAUNCH,
  label: 'E10: Section 4 — Territory ticket row -> CLOSED',
  oldStr: '| Territory ticket (not yet started) | NOT STARTED | Per W-ROLES-DELEGATION model: "Defaults cascade. Assignments override. Leads follow ownership." Schema 70%, UI 0%. |',
  newStr: '| `docs/W-TERRITORY-TRACKER.md` | CLOSED 2026-05-09 (T4b `' + T4B_COMMIT + '`; T4c-3 `00a312b`; T4a-2 `d8ef4c5`; T4a-1 `167c477`; F-APA-PRIMARY-AUDIT-GAP `c85174e`; T3b-D `fd3cbcf`) | Conditional-defer findings: F-DISTRIBUTE-AUDIT-STATE-INCOMPLETE, F-INHERITANCE-DEPTH-1, F-AREA-MANAGER-SUBTREE-DEPTH-INCONSISTENCY, F-RESET-TO-INHERITED-BUILDER-DEPENDENCY. T2b (percentage mode) remains optional/parallel. |',
  alreadyMarker: '| `docs/W-TERRITORY-TRACKER.md` | CLOSED 2026-05-09',
})

// E11: Section 4 — Closed tickets reference list — add W-TERRITORY
tryEdit({
  file: W_LAUNCH,
  label: 'E11: Section 4 — Closed tickets list -> add W-TERRITORY',
  oldStr: `- W-RECOVERY A1 + Wave 1–2 + Chunk 6 logging confirmed

---`,
  newStr: `- W-RECOVERY A1 + Wave 1–2 + Chunk 6 logging confirmed
- W-TERRITORY (2026-05-09)

---`,
  alreadyMarker: '- W-TERRITORY (2026-05-09)',
})

// E12: Bottom backlog line — flip
tryEdit({
  file: W_LAUNCH,
  label: 'E12: Bottom backlog line — W-TERRITORY -> CLOSED',
  oldStr: '- W-TERRITORY: largest open feature; required before tenant-2 onboarding.',
  newStr: '- W-TERRITORY: ✅ CLOSED 2026-05-09 (v21 FINAL -- all 7 phases T1-T7 shipped; tracker `docs/W-TERRITORY-TRACKER.md` is now reference-only). Tenant-2 onboarding unblocked.',
  alreadyMarker: '- W-TERRITORY: ✅ CLOSED 2026-05-09',
})

// E13: Status log — insert v13 entry before Post-P0 backlog section
const V13_ENTRY = `- **2026-05-09 v13** — **W-TERRITORY WORKSTREAM CLOSED.** All seven phases (T1 decision lock, T2a schema, T3a-D resolver+distribution+triggers+caller updates, T4a-1/2/3/3b admin UI, T4c-1/2/3 manager carving, T4b public geo card, T6 smoke + followups, T7 close) shipped. Database / triggers / resolvers / race safety / audit coverage / admin UI / public UI layers all functionally complete. Section 1 Territory row flipped to ✅/✅/✅/✅; Section 2 "Territory as provider" subsection all three lines flipped (10 callers, autonomous resolution, public + admin UI shipped); Section 2 nav spec 6/9 -> 7/9 (Territory shipped, Approvals + Tickets remain); Section 3 P1-3 marked CLOSED with sub-item resolution; Section 4 "Territory ticket (not yet started)" row replaced with \`docs/W-TERRITORY-TRACKER.md | CLOSED 2026-05-09\` + commit hashes; Closed tickets reference list updated; bottom backlog line flipped. Major milestone commits: T4b \`${T4B_COMMIT}\`; T4c-3 \`00a312b\`; T4a-2 \`d8ef4c5\`; T4a-1 \`167c477\`; F-APA-PRIMARY-AUDIT-GAP \`c85174e\`; T3b-D \`fd3cbcf\`. Conditional-defer findings carried forward (F-DISTRIBUTE-AUDIT-STATE-INCOMPLETE, F-INHERITANCE-DEPTH-1, F-AREA-MANAGER-SUBTREE-DEPTH-INCONSISTENCY, F-RESET-TO-INHERITED-BUILDER-DEPENDENCY). T2b (percentage mode) remains optional/parallel and unscoped. **Tenant-2 onboarding now unblocked end-to-end.**

`

tryEdit({
  file: W_LAUNCH,
  label: 'E13: Status log — append v13 W-TERRITORY closure entry',
  oldStr: '\n**Post-P0 backlog** (not blocking launch — see Section 3 P1/P2 + Section 4 trackers for detail):',
  newStr: '\n' + V13_ENTRY + '**Post-P0 backlog** (not blocking launch — see Section 3 P1/P2 + Section 4 trackers for detail):',
  alreadyMarker: '- **2026-05-09 v13** — **W-TERRITORY WORKSTREAM CLOSED.**',
})

// =======================================================================
// Summary
// =======================================================================

console.log('\n=========================================================')
console.log(`DONE: ${totalPatched} patched, ${totalSkipped} skipped (already applied)`)
console.log('=========================================================\n')
console.log('Next: visual diff both trackers, then commit + push.')
console.log('Single commit covers: docs/W-TERRITORY-TRACKER.md + docs/W-LAUNCH-TRACKER.md + scripts/r-territory-t7-close.js.')
console.log('After push: W-TERRITORY workstream is officially CLOSED.\n')