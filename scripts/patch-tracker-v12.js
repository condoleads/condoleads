// scripts/patch-tracker-v12.js
//
// W-TERRITORY-TRACKER patch: v11 -> v12.
//
// Captures T4a recon results and locks T4a sub-phase scope per the
// product calls made 2026-05-07:
//   Q1: per-tenant view scope at /admin-homes/territory (mirrors existing
//       agents page auth pattern)
//   Q2: manager carving deferred to T4c (ships immediately after T4a in
//       same working block per Rule Zero - Nothing Deferred)
//   Q3: fix F-APA-DELETE-INSERT-CHURN in T4a-3 (route is touched anyway);
//       F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP fix is gated on caller
//       investigation at start of T4a-3 coding
//
// Patches applied:
//   P1. Status line update: 3 pieces -> 4 pieces (adds T4c), inline
//       sub-phase plan
//   P2. Insert v12 status log entry above v11
//   P3. Replace Next Action sections (3 -> 4): T4a (sub-phased) + T4c
//       (new) + T4b (renumbered) + T7 (renumbered)
//   P4. Findings append: F-APA-DELETE-INSERT-CHURN +
//       F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP
//
// Pre-flight: requires v11 marker present, v12 marker absent.
// Idempotent: skips if V12_MARKER already present.
// Atomic: all patches in memory, file written once at end on full success.

const fs = require('fs');
const path = require('path');

const TRACKER = path.join('docs', 'W-TERRITORY-TRACKER.md');

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exit(1);
}

if (!fs.existsSync(TRACKER)) {
  fail(TRACKER + ' not found at ' + path.resolve(TRACKER));
}

const original = fs.readFileSync(TRACKER, 'utf8');

const V11_MARKER = '- **2026-05-07 v11**';
const V12_MARKER = '- **2026-05-07 v12**';

if (original.indexOf(V12_MARKER) !== -1) {
  console.log('SKIP: V12_MARKER already present in tracker. No-op.');
  process.exit(0);
}

if (original.indexOf(V11_MARKER) === -1) {
  fail(
    'v11 state not detected. Expected V11_MARKER (' + V11_MARKER + ') to be present. ' +
    'Run scripts/patch-tracker-v11.js first to apply v11.'
  );
}

const now = new Date();
const pad = function (n) { return String(n).padStart(2, '0'); };
const stamp =
  now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' +
  pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
const backupPath = TRACKER + '.backup_' + stamp;
fs.writeFileSync(backupPath, original);
console.log('Backup: ' + backupPath + ' (' + original.length + ' chars)');

const NL = '\r\n';

// ===========================================================================
// Patch content
// ===========================================================================

// ---- P1: Status line update (tail-end replacement only) ----

const P1_OLD =
  "Three pieces remain for W-TERRITORY closure: T4a (admin UI at `/admin-homes/territory`), T4b (public geo page primary agent display), T7 (close ticket). **Next:** T4a recon then build, T4b recon then build, T7 close.";

const P1_NEW =
  "Four pieces remain for W-TERRITORY closure: T4a (admin UI — 4 sub-phases locked v12), T4c (manager carving — carved out of T4a; ships immediately after T4a in same working block per Rule Zero — Nothing Deferred), T4b (public geo page primary agent display), T7 (close ticket). **Next:** T4a-1 is_primary toggle, T4a-2 `/admin-homes/territory` coverage page, T4a-3 server-side diff fix for F-APA-DELETE-INSERT-CHURN, T4a-3b gated F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP fix (gate = caller probe at start of T4a-3 coding), then T4c, T4b, T7.";

// ---- P2: Insert v12 status log entry above v11 ----

const P2_ANCHOR =
  "- **2026-05-07 v11** — **T6 FULL CLOSURE + F-APA-NEIGHBOURHOOD-CHECK migration shipped + F-APA-UPDATE-AUDIT-GAP discovered and fixed.**";

const V12_ENTRY_LINES = [
  "- **2026-05-07 v12** — **T4a recon complete; sub-phase scope locked; F-APA-DELETE-INSERT-CHURN + F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP findings logged.** Pre-T4a recon revealed a spec/reality gap: tracker said \"4 currently-embedded section components\" with names that don't match disk. Actual existing components are `GeoAssignmentSection` (per-agent territory assignment, 355 lines), `BuildingAssignmentSection`, `ListingAssignmentSection`, `DelegationsSection` — all four mounted on `app/admin-homes/agents/[id]/page.tsx`. Plus `TenantGeoAssignmentSection` (226 lines) on `app/admin-homes/tenants/[id]/page.tsx`, which writes to `tenant_property_access` (tpa) — a separate parallel table from `agent_property_access` not previously surfaced in this tracker. The v11 vision of T4a as \"consolidating\" 4 embedded components was inaccurate — the per-agent page already groups its 4 sections coherently. T4a's actual job: (a) add an `is_primary` toggle that doesn't exist in any UI yet, (b) build a new `/admin-homes/territory` cross-agent coverage page that doesn't exist, (c) fix the delete-then-insert geo POST route, (d) gate-fix the older TS resolver if its callers warrant it.",
  "",
  "  - **Files dumped + read for T4a recon:** `components/admin-homes/GeoAssignmentSection.tsx` (per-agent assignment UI; manager/standalone vs managed-agent inheritance modes), `components/admin-homes/TenantGeoAssignmentSection.tsx` (tpa restrictions UI), `app/admin-homes/agents/[id]/page.tsx` (mounts the 4 per-agent sections), `app/admin-homes/tenants/[id]/page.tsx` (mounts tpa restrictions), `app/api/admin-homes/agents/[id]/geo/route.ts` (geo POST handler — uses delete-then-insert), `lib/utils/territory.ts` (effective-territories resolver: manual → manager inheritance → tenant pool), `lib/comprehensive/access-resolver.ts` (older TS resolver, 125 lines, missing neighbourhood case), `lib/comprehensive/types.ts` (older type definitions, scope union missing `'neighbourhood'`).",
  "",
  "  - **T4a sub-phase scope locked (Rule Zero — Comprehensive Work Only):**",
  "    - **T4a-1: `is_primary` toggle in `GeoAssignmentSection`.** Add `is_primary` to the Assignment interface; per-row toggle UI; extend POST payload; backend (T2a partial unique indexes) already enforces single primary per geo. Single-component, single-route change.",
  "    - **T4a-2: New `/admin-homes/territory` page.** Per-tenant view scope (mirrors `app/admin-homes/agents/page.tsx` auth pattern: `seeAll = isPlatformAdmin && !tenantId; scopedTenantId = user.tenantId`). Three sections: coverage table (which agent owns each geo + holes), audit log viewer paging `territory_assignment_changes`, stats card. New API routes: `GET /api/admin-homes/territory/coverage`, `GET /api/admin-homes/territory/audit`. Auth pattern: `resolveAdminHomesUser()` + `can()` + `createServiceClient()` (verbatim mirror of existing geo route).",
  "    - **T4a-3: F-APA-DELETE-INSERT-CHURN comprehensive fix.** Replace `DELETE WHERE agent_id = $1` + `INSERT (all rows)` in `app/api/admin-homes/agents/[id]/geo/route.ts` POST with server-side diff: fetch existing, build keys for both sets, only DELETE removed rows, INSERT added rows, UPDATE rows whose access flags / `is_primary` changed. Audit volume drops from 2N per save to (actual_changes) per save.",
  "    - **T4a-3b (gated): F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP fix.** Gate runs at start of T4a-3 coding: `grep -r resolveAgentAccess` and `grep -r hasComprehensiveAccess` across `app/`, `lib/`, `components/`. If any caller is reached from a public-facing System 2 route, fix in T4a-3b (add `case 'neighbourhood':` to switch in `lib/comprehensive/access-resolver.ts`; add `'neighbourhood'` to `GeoAssignment.scope` union in `lib/comprehensive/types.ts`). If callers are dormant/legacy/test-only, log as accepted technical debt; no code change in T4a. Decision lands in v13 status log entry.",
  "",
  "  - **T4c carved out (deferred from T4a):** Manager carving — explicit \"distribute territory to managed agents\" UX. Currently a managed agent without manual rows automatically inherits from `parent_id` manager via `lib/utils/territory.ts`. T4c adds the explicit subdivide-to-managed-agents flow. UX shape (drag-drop vs checkbox grid vs table) is an open product call to resolve at T4c kickoff. **T4c ships in same working block as T4a** per Rule Zero — Nothing Deferred (\"Phase 2 acceptable when each phase ships within the same working block, in sequence, with no gap\"). Sub-phase order: T4a-1 → T4a-2 → T4a-3 → T4a-3b (if warranted) → T4c → T4b → T7.",
  "",
  "  - **Architectural facts established by recon (not findings, just context for T4a build):**",
  "    - `tenant_property_access` (tpa) is a separate parallel table from apa; tenant-level restrictions follow an \"empty = full access\" model with same scope dimensions (area/muni/community/neighbourhood). Mostly orthogonal to T4a but T4a-2's coverage page should hint at tpa restrictions on the tenant.",
  "    - Inheritance UX in `GeoAssignmentSection` is already polished: managed agents see \"Inherited from [Manager]\" (read-only, locked-icon rows) + \"Manual Overrides\" (editable amber rows). Standalone agents see \"Your Territories\" (editable green rows). T4a-1's `is_primary` toggle must work in both modes.",
  "    - Auth pattern in admin-homes routes: `resolveAdminHomesUser()` returns user with `tenantId` + `isPlatformAdmin` + `permissions`. Tenant scoping via session + target row's `tenant_id` (NOT `x-tenant-id` header — that's the walliam-route pattern). T4a's new routes mirror this verbatim.",
  "    - Service client (`@/lib/admin-homes/service-client`) bypasses RLS post-permission-check. Pattern: load target row → `can(...)` → if ok, use service client for DB mutations.",
  "",
  "  - **Two new findings logged** (full text in Findings section): F-APA-DELETE-INSERT-CHURN, F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP.",
  "",
  "  - **Next:** start T4a-1 (`is_primary` toggle in `GeoAssignmentSection`).",
  ""
];

const V12_ENTRY = V12_ENTRY_LINES.join(NL) + NL;
const P2_NEW = V12_ENTRY + P2_ANCHOR;

// ---- P3: Replace Next Action sections (3 -> 4) ----

const P3_OLD_START = "### 1. T4a — Admin UI at `/admin-homes/territory`";
const P3_OLD_END = "### Optional / parallel:";

const P3_NEW = [
  "### 1. T4a — Admin UI work (4 sub-phases)",
  "",
  "T4a is sub-phased per Rule Zero — Comprehensive Work Only. Each sub-phase ships within this working block in sequence; T4c (manager carving), T4b, and T7 follow after T4a closes.",
  "",
  "**T4a-1: `is_primary` toggle in `GeoAssignmentSection`**",
  "",
  "- File touched: `components/admin-homes/GeoAssignmentSection.tsx`",
  "- Add `is_primary?: boolean` to the `Assignment` interface; default `false` on new rows.",
  "- Per-row UI: a small toggle/badge that flips the flag (visually distinct between primary and non-primary rows). Works in both modes — manager/standalone (\"Your Territories\") and managed-agent (\"Manual Overrides\").",
  "- Wire to extended POST: payload now includes `is_primary` per row.",
  "- Server-side validation: T2a's partial unique indexes (one per scope: area / municipality / community / neighbourhood) enforce single primary per geo. Conflict surfaces as `unique_violation` from the trigger; route returns 409 with a useful message.",
  "- No new endpoint — extend existing `app/api/admin-homes/agents/[id]/geo/route.ts` POST handler to read `is_primary` from each incoming row.",
  "",
  "**T4a-2: New `/admin-homes/territory` page**",
  "",
  "- File created: `app/admin-homes/territory/page.tsx` (server component for initial fetch + client islands for filters / pagination).",
  "- Per-tenant view scope. Auth pattern mirrors `app/admin-homes/agents/page.tsx`:",
  "  - `seeAll = user.isPlatformAdmin === true && !user.tenantId`",
  "  - `scopedTenantId = user.tenantId`",
  "  - Platform admin without a tenant context gets a tenant-picker; tenant admins see only their own tenant's coverage.",
  "- Three on-page sections:",
  "  1. **Coverage table.** For the active tenant, list every geo unit (area / municipality / community / neighbourhood) and show: which agent(s) hold an apa row covering it, which agent is `is_primary`, holes (geos with no apa coverage). Click a row → jumps to per-agent edit at `/admin-homes/agents/[id]`.",
  "  2. **Audit log viewer.** Paginated table reading from `territory_assignment_changes` for the tenant. Filters: agent, scope, `change_type`, date range. Page size 50; cursor-paginated by `created_at desc`.",
  "  3. **Stats card.** Total apa rows (active), total primaries set, distinct agents covering territory, holes count.",
  "- New API routes:",
  "  - `GET /api/admin-homes/territory/coverage` — aggregated coverage data for the scoped tenant.",
  "  - `GET /api/admin-homes/territory/audit` — paged audit rows with filter params.",
  "- Both routes use the established auth pattern: `resolveAdminHomesUser()` → load any target row needed → `can(user.permissions, 'agent.read', { ... })` → if ok, use `createServiceClient()` for DB reads.",
  "- **Multi-tenant by default** — every query scoped by `scopedTenantId` (or all tenants for platform admin only). No `walliam` or `condoleads` constants. Code must work identically for tenant #2, #50, #1000.",
  "",
  "**T4a-3: F-APA-DELETE-INSERT-CHURN comprehensive fix**",
  "",
  "- File touched: `app/api/admin-homes/agents/[id]/geo/route.ts` POST.",
  "- Replace the current `DELETE WHERE agent_id = $1` + `INSERT (all rows)` pattern with a server-side diff:",
  "  1. Fetch existing rows for this agent (`SELECT * FROM agent_property_access WHERE agent_id = $1 AND is_active = true`).",
  "  2. Build a key for each row from `(agent_id, scope, area_id, municipality_id, community_id, neighbourhood_id)` — the natural identity of an assignment.",
  "  3. Compute three sets: `removed` (in existing, not in incoming), `added` (in incoming, not in existing), `modified` (in both, with different access flags / `is_primary` / `buildings_mode`).",
  "  4. Run only the necessary mutations: DELETE `removed`, INSERT `added`, UPDATE `modified`.",
  "- Net effect: audit rows in `territory_assignment_changes` reflect actual user intent. Save with one row changed → 1 audit row, not 2N.",
  "- **Verification step before commit:** smoke a save with no changes → confirm 0 audit rows written. Save with one row added → confirm exactly 1 `assignment_granted` audit row.",
  "",
  "**T4a-3b (gated): F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP fix**",
  "",
  "- **Gate:** at start of T4a-3 coding, run:",
  "  ```",
  "  Get-ChildItem -Recurse -Include *.ts,*.tsx -Path app,lib,components |",
  "    Select-String -Pattern 'resolveAgentAccess|hasComprehensiveAccess' -SimpleMatch",
  "  ```",
  "- **If any caller is reached from a public-facing System 2 route** (e.g., a `/comprehensive/*` page or a non-admin API): fix in T4a-3b. File `lib/comprehensive/access-resolver.ts` — add `case 'neighbourhood':` to the switch (neighbourhood-scope rows have `area_id` set and no community link; expand to area + munis + communities of that area, mirroring the area case but skipping the muni-only resolution). File `lib/comprehensive/types.ts` — add `'neighbourhood'` to the `GeoAssignment.scope` union.",
  "- **If callers are dormant/legacy/test-only**: log F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP as accepted technical debt; no code change in T4a-3b. Decision documented in v13 status log entry.",
  "- Either way, the investigation completes within this working block per Rule Zero — Nothing Deferred.",
  "",
  "",
  "### 2. T4c — Manager carving (deferred from T4a, ships immediately after T4a)",
  "",
  "Currently a managed agent without manual apa rows automatically inherits their manager's territory via `lib/utils/territory.ts` (manual → inherited from manager → inherited from tenant pool). T4c adds the **explicit** manager-driven distribution: a manager opens a UI and explicitly carves their territory into specific managed agents (creating manual rows that override the implicit inheritance).",
  "",
  "Open product question to resolve at T4c kickoff:",
  "",
  "- Drag-drop assignment? Checkbox grid (managed-agent × geo)? Table per managed-agent with row toggles?",
  "- Per-agent split (manager picks which geos go to which managed agent), or per-geo split (manager picks which managed agent gets each geo)?",
  "- Auto-distribute button (split N geos across M managed agents using the same hash-distribute as `distribute_geo_to_children`)?",
  "",
  "T4c **ships in same working block as T4a** per Rule Zero — Nothing Deferred. Sub-phase order: T4a-1 → T4a-2 → T4a-3 → T4a-3b (if warranted) → T4c → T4b → T7.",
  "",
  "",
  "### 3. T4b — Public-facing UI: geo page primary agent display",
  "",
  "Public site renders area / muni / community / neighbourhood / building pages. Each needs to display the **primary agent** card sourced from `resolve_display_agent_for_context`.",
  "",
  "**Pre-build recon:**",
  "",
  "- Locate existing geo page routes + agent-card components.",
  "- Confirm how they fetch agent data today.",
  "- Decide whether to enhance `app/api/walliam/resolve-agent/route.ts` to accept `neighbourhood_id` from request body (forward compat for neighbourhood-level pages — F-APA-NEIGHBOURHOOD-CHECK closure means neighbourhood-scope assignments can now exist in apa).",
  "",
  "**Building pages are a documented shared exception between System 1 and System 2** — handled with extreme care. Read the existing building page handling before changing anything; do not modify System 1 paths.",
  "",
  "",
  "### 4. T7 — Close ticket",
  "",
  "After T4a + T4c + T4b ship and a final smoke matrix run:",
  "",
  "1. Apply the closing tracker patch (final closure entry, status line marked CLOSED with commit hashes for the major milestones — F-APA-NEIGHBOURHOOD-CHECK, F-APA-UPDATE-AUDIT-GAP, F-APA-DELETE-INSERT-CHURN, T4a sub-phases, T4c, T4b).",
  "2. Flip `docs/W-LAUNCH-TRACKER.md` Section 4 W-TERRITORY row from in-progress to **CLOSED**, with commit hashes for: T6 closure (v11), T4a sub-phases, T4c, T4b.",
  "3. Notify any downstream workstreams (W-LAUNCH P1-3, public-page rendering) that territory is unblocked end-to-end.",
  "4. W-TERRITORY workstream complete.",
  "",
  ""
].join(NL);

// ---- P4: Findings append ----

const P4_ANCHOR =
  "**F-RACE-DEADLOCK (2026-05-07, CLOSED v10):** Race harness initially wrapped concurrent INSERTs in explicit `BEGIN; INSERT; COMMIT;` inside `Promise.allSettled`. Both pg.Pool connections deadlocked at the application layer — Postgres cannot detect a stall where one client holds a transaction open while waiting on its own concurrent client to commit. Fix: drop the explicit transaction wrapping. Autocommit per statement allows the trigger's xact-scoped advisory lock to acquire-and-release within the implicit autocommit boundary, which is what serializes parallel attempts. Encoded in `scripts/r-territory-t6-followup-race.js` header DESIGN NOTE block. Pattern applies to any future test of trigger behaviour under concurrent client connections.";

const P4_NEW_FINDINGS_LINES = [
  "",
  "**F-APA-DELETE-INSERT-CHURN (2026-05-07, surfaced v12, fix tracked T4a-3):** `app/api/admin-homes/agents/[id]/geo/route.ts` POST handler runs `DELETE FROM agent_property_access WHERE agent_id = $1` followed by `INSERT (all rows)`. Pattern predates W-TERRITORY (existed before T3b-C triggers). Post-F-APA-UPDATE-AUDIT-GAP closure (v11), every such save writes 2N audit rows in `territory_assignment_changes` (N revokes from delete cascade + N grants from insert cascade) regardless of how many rows actually changed. Append-only correctness preserved; not a regression. Comprehensive fix tracked in T4a-3: server-side diff (compute `removed = existing \\ incoming`, `added = incoming \\ existing`, `modified = intersection with changed flags`; only DELETE removed, INSERT added, UPDATE modified). Audit volume drops from 2N per save to (actual_changes) per save. Same pattern likely lives in `app/api/admin-homes/tenants/[id]/geo` for tpa — check during T4a-3 implementation; fix in same batch if present.",
  "",
  "**F-COMPREHENSIVE-RESOLVER-NEIGHBOURHOOD-GAP (2026-05-07, surfaced v12, fix gated T4a-3b):** `lib/comprehensive/access-resolver.ts` exports `resolveAgentAccess(agentId)` whose `switch (assignment.scope)` covers `'area' | 'municipality' | 'community'` only — no `'neighbourhood'` case. Default switch behaviour drops the row from the expanded geo IDs returned in `ResolvedAccess`. Type definition in `lib/comprehensive/types.ts` `GeoAssignment.scope` union is also missing `'neighbourhood'`. Predates W-TERRITORY entirely (file is older System 2 path; PL/pgSQL `resolve_agent_for_context` from T3a is the modern replacement and does handle neighbourhood). Post-F-APA-NEIGHBOURHOOD-CHECK closure (v11), neighbourhood-scope rows can now legitimately be created — and will be the moment T4a's UI persists them. Fix scope is gated on caller analysis: if `resolveAgentAccess` / `hasComprehensiveAccess` are reached from any production route, T4a-3b ships the fix (add `case 'neighbourhood':` to switch + update type union); if callers are legacy/dormant, finding is logged as accepted technical debt. Caller probe runs at start of T4a-3 coding."
];

const P4_NEW_FINDINGS = P4_NEW_FINDINGS_LINES.join(NL);
const P4_NEW = P4_ANCHOR + NL + P4_NEW_FINDINGS;

// ===========================================================================
// Apply patches
// ===========================================================================

const patches = [
  { name: "P1: status line tail update", kind: "replace", old: P1_OLD, new: P1_NEW },
  { name: "P2: insert v12 entry above v11", kind: "replace", old: P2_ANCHOR, new: P2_NEW },
  { name: "P3: Next Action sections (3 -> 4)", kind: "span-replace", startAnchor: P3_OLD_START, endAnchor: P3_OLD_END, new: P3_NEW },
  { name: "P4: Findings append (2 new findings)", kind: "replace", old: P4_ANCHOR, new: P4_NEW }
];

let content = original;
const results = [];

for (const p of patches) {
  if (p.kind === "replace") {
    const idx = content.indexOf(p.old);
    if (idx === -1) {
      results.push({ name: p.name, status: "FAIL", reason: "old anchor not found" });
      continue;
    }
    if (content.indexOf(p.old, idx + 1) !== -1) {
      results.push({ name: p.name, status: "FAIL", reason: "old anchor not unique" });
      continue;
    }
    content = content.slice(0, idx) + p.new + content.slice(idx + p.old.length);
    results.push({ name: p.name, status: "OK", delta: p.new.length - p.old.length });
  } else if (p.kind === "span-replace") {
    const startIdx = content.indexOf(p.startAnchor);
    if (startIdx === -1) {
      results.push({ name: p.name, status: "FAIL", reason: "startAnchor not found" });
      continue;
    }
    if (content.indexOf(p.startAnchor, startIdx + 1) !== -1) {
      results.push({ name: p.name, status: "FAIL", reason: "startAnchor not unique" });
      continue;
    }
    const endIdx = content.indexOf(p.endAnchor, startIdx + p.startAnchor.length);
    if (endIdx === -1) {
      results.push({ name: p.name, status: "FAIL", reason: "endAnchor not found after startAnchor" });
      continue;
    }
    const oldSpan = content.slice(startIdx, endIdx);
    content = content.slice(0, startIdx) + p.new + content.slice(endIdx);
    results.push({ name: p.name, status: "OK", delta: p.new.length - oldSpan.length });
  } else {
    results.push({ name: p.name, status: "FAIL", reason: "unknown kind: " + p.kind });
  }
}

console.log("\nPatch results:");
for (const r of results) {
  let line = "  " + r.status + ": " + r.name;
  if (r.reason) line += " — " + r.reason;
  if (typeof r.delta === "number") line += " (delta " + (r.delta >= 0 ? "+" : "") + r.delta + " chars)";
  console.log(line);
}

const failed = results.filter(function (r) { return r.status === "FAIL"; });
if (failed.length > 0) {
  console.error("\nFAIL: " + failed.length + " patch(es) failed. Original file untouched. Backup at " + backupPath + " (identical to original — discardable).");
  process.exit(1);
}

if (content === original) {
  console.log("\nNo-op: file already at target state. Backup is identical to original (discardable).");
  process.exit(0);
}

fs.writeFileSync(TRACKER, content);
console.log("\nWrote: " + TRACKER + " (" + content.length + " chars; net delta " + (content.length - original.length) + " chars)");
console.log("Diff: git diff -- " + TRACKER);
console.log("Restore (if needed): cp \"" + backupPath + "\" \"" + TRACKER + "\"");