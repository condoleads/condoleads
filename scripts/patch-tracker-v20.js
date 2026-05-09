#!/usr/bin/env node
// scripts/patch-tracker-v20.js
// W-TERRITORY tracker v19 -> v20: T4b CLOSED + F-IS-WALLIAM-DEAD-CONSTANT closed.
// 4 anchored edits, atomic, idempotent (alreadyMarker checks), CRLF/LF tolerant.
//
// Edits:
//   1. Status line tail: "T4b next" -> "T4b CLOSED v20" + T7 next
//   2. Status log: insert v20 entry before v19 entry
//   3. Findings: append F-IS-WALLIAM-DEAD-CONSTANT entry before --- separator
//   4. Next Action section 3 (T4b): replace pre-build spec with CLOSED summary

const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = process.cwd()
const TRACKER = 'docs/W-TERRITORY-TRACKER.md'

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
  if (matches === 0) throw new Error(`Anchor not found for "${label}"`)
  if (matches > 1) throw new Error(`Anchor matched ${matches} times for "${label}" — must be unique`)

  let updated = content.replace(oldStr, newStr)
  if (usesCRLF) updated = updated.replace(/\n/g, '\r\n')
  fs.writeFileSync(abs, updated, 'utf8')
  console.log(`  PATCHED: ${label}`)
  totalPatched++
}

console.log('\n=== W-TERRITORY tracker patch v19 -> v20 ===')
console.log(`Timestamp: ${TIMESTAMP}\n`)
console.log('--- Backup ---')
backup(TRACKER)
console.log()

// =======================================================================
// Edit 1: Status line tail — close T4b, open T7 next
// =======================================================================
tryEdit({
  file: TRACKER,
  label: 'P1: status line tail — T4b next -> T4b CLOSED v20, T7 next',
  oldStr: '**T4b next, this working block**: public-facing UI -- geo page primary agent display via `resolve_display_agent_for_context`. Then T7 (close ticket).',
  newStr: '**T4b ✅ CLOSED v20** (display resolver swap + neighbourhood_id pass-through across component / API route / server helper + Toronto neighbourhood page wired with neighbourhood_id; F-IS-WALLIAM-DEAD-CONSTANT closed; 12 anchored edits via `scripts/r-territory-t4b-patch.js`; TSC clean). **T7 next, this working block**: close ticket + flip `docs/W-LAUNCH-TRACKER.md` Section 4 W-TERRITORY row to CLOSED.',
  alreadyMarker: '**T4b ✅ CLOSED v20**',
})

// =======================================================================
// Edit 2: Status log — insert v20 entry before v19 entry
// =======================================================================

const V20_ENTRY = `- **2026-05-09 v20** -- **T4b CLOSED.** Public-facing geo card swap from routing resolver -> display resolver + neighbourhood_id pass-through across component / API route / server helper + Toronto neighbourhood page caller fix. F-IS-WALLIAM-DEAD-CONSTANT closed in same batch.

  - **Files shipped this batch:**
    - \`components/WalliamAgentCard.tsx\`: \`neighbourhood_id?: string | null\` added to props interface, function destructure, fetch body, and useEffect deps (4 anchored edits). Component is now context-complete for neighbourhood-level pages.
    - \`app/api/walliam/resolve-agent/route.ts\`: request destructure picks up \`neighbourhood_id\`; \`p_neighbourhood_id: null\` placeholder from T3b-D replaced with \`p_neighbourhood_id: neighbourhood_id || null\`; **RPC swapped from \`resolve_agent_for_context\` to \`resolve_display_agent_for_context\`** (the public card is a display surface, not a routing surface; the display resolver is \`is_selling\`-aware); source detection extended to flag neighbourhood-scope as \`geo_assignment\` (3 anchored edits).
    - \`lib/utils/is-walliam.ts\`: \`resolveWalliamAgent\` params gain \`neighbourhood_id?: string | null\`; pass-through replaces hardcoded null. RPC stays \`resolve_agent_for_context\` (this helper feeds \`agentId\` to \`GeoPageTabs\` / \`NeighbourhoodPageTabs\` for lead routing -- the routing resolver is the right surface). Dead \`WALLIAM_TENANT_ID\` constant removed (F-IS-WALLIAM-DEAD-CONSTANT). 3 anchored edits.
    - \`app/comprehensive-site/toronto/[neighbourhood]/page.tsx\`: \`<WalliamAgentCard neighbourhood_id={neighbourhood.id} tenant_id={tenantId!} />\` (was \`tenant_id\` only) + \`resolveWalliamAgent({ neighbourhood_id: data.neighbourhood.id, tenant_id: tenantId })\` (uses \`data.neighbourhood.id\` because \`neighbourhood\` is destructured from \`data\` after the helper call). 2 anchored edits.
    - \`scripts/r-territory-t4b-patch.js\` (NEW): single Node patch script -- 4 timestamped backups + 12 anchored edits + idempotent \`alreadyMarker\` checks + CRLF/LF tolerant + atomic per-file. 12 PATCHED, 0 SKIPPED on first run.
    - \`scripts/patch-tracker-v20.js\` (NEW, this script).

  - **Resolver semantic divergence (probe-then-patch per v11 pattern):** dumped both function bodies via \`pg_get_functiondef\` before locking the design. **Routing resolver** (\`resolve_agent_for_context\`): 10-step cascade (listing pin -> building pin -> 4 geo levels via \`pick_routing_agent\` -> tenant_users -> user_profiles -> tenant default -> any active agent), no \`is_selling\` check. **Display resolver** (\`resolve_display_agent_for_context\`): tries \`is_primary\` at most-specific geo first (via \`resolve_geo_primary\`); accepts only if that primary is \`is_selling\`; falls through to routing resolver, then walks descendants then ancestors of the routing result up to depth 10 looking for a selling-capable agent; tenant default if selling; any selling agent in tenant; NULL only if no selling agent exists anywhere in the tenant tree. Net: display resolver guarantees the public card shows an agent who actually meets clients; routing resolver doesn't. Brand-card fallback in \`WalliamAgentCard\` triggers only on NULL, which now means "tenant has zero selling agents" -- a real edge case but not one to design around.

  - **Caller-site survey (Rule Zero -- No Regressions):** before patching, mapped every \`<WalliamAgentCard>\` JSX call site. 8 callers total. 7 were already wiring scope correctly (AreaPage / MunicipalityPage / CommunityPage / BuildingPage / PropertyPageContent / PropertyPageClient / HomePropertyPageClient). Only the Toronto neighbourhood page had the gap (passing tenant_id only). No other caller change needed -- TS optionals keep the new prop additive at every call site.

  - **F-IS-WALLIAM-DEAD-CONSTANT (CLOSED v20):** \`lib/utils/is-walliam.ts\` defined \`const WALLIAM_TENANT_ID = '<uuid>'\` near the top of the file but never referenced it -- pure dead code. Looked like a multi-tenant Rule Zero violation at first read (hardcoded tenant constant in production code), but verification confirmed no live runtime path. The file's \`getWalliamTenantId()\` helper resolves tenant_id from the host header, which is the correct multi-tenant pattern. Removed alongside the param-extension edits.

  - **Verification:**
    - Patch script: \`DONE: 12 patched, 0 skipped\`.
    - \`npx tsc --noEmit\`: clean.
    - Spot-check grep: route.ts L33 calls \`resolve_display_agent_for_context\`; route.ts L36 passes \`p_neighbourhood_id: neighbourhood_id || null\`; is-walliam.ts has 0 occurrences of \`WALLIAM_TENANT_ID\`; is-walliam.ts L70 passes \`p_neighbourhood_id: params.neighbourhood_id || null\`; Toronto neighbourhood page L184 (server helper) + L257 (JSX prop) both carry \`neighbourhood_id\`.

  - **Multi-tenant correctness preserved at every layer:** \`tenant_id\` flows from request context end-to-end (header for client path via \`WalliamAgentCard\` -> \`/api/walliam/resolve-agent\`, host-derived for server path via \`getWalliamTenantId()\`). No tenant constants in business logic post-cleanup.

  - **No regressions expected at the seven correctly-wired callers:** display resolver returns the same agent as routing resolver when a primary selling agent exists at the resolved scope (the common case for any tenant that has set primaries). It diverges only in edge cases where the routing resolver would have surfaced a non-selling manager -- and that divergence is the desired outcome for a public card.

  - **Manual smoke pending** on a Toronto neighbourhood URL + one standard geo URL post-deploy to confirm the display vs routing divergence behaves as expected in production. T7 covers that.

  - **Next:** T7 close + flip \`docs/W-LAUNCH-TRACKER.md\` Section 4 W-TERRITORY row to CLOSED with commit hashes for the major milestones (F-APA-NEIGHBOURHOOD-CHECK v11, F-APA-UPDATE-AUDIT-GAP v11, F-APA-DELETE-INSERT-CHURN v14, T4a sub-phases v13/v14, T4c sub-phases v16/v17/v19, T4b v20).

`

tryEdit({
  file: TRACKER,
  label: 'P2: status log — insert v20 entry before v19 entry',
  oldStr: '- **2026-05-09 v19** -- **T4c-3 CLOSED.**',
  newStr: V20_ENTRY + '- **2026-05-09 v19** -- **T4c-3 CLOSED.**',
  alreadyMarker: '- **2026-05-09 v20** -- **T4b CLOSED.**',
})

// =======================================================================
// Edit 3: Findings — append F-IS-WALLIAM-DEAD-CONSTANT before --- before Status log
// =======================================================================

const F_DEAD_CONSTANT = `**F-IS-WALLIAM-DEAD-CONSTANT (2026-05-09, CLOSED v20):** \`lib/utils/is-walliam.ts\` defined \`const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'\` near top of file but never referenced it. The constant looked like a hardcoded tenant violation of Rule Zero -- Multitenant at Scale, but verification confirmed it was pure dead code (no live runtime path; the file's \`getWalliamTenantId()\` helper resolves tenant_id from the host header, which is the correct multi-tenant pattern). Removed in T4b's patch script (C1 edit) alongside the resolveWalliamAgent param extension. Hygiene cleanup; no behavior change.

`

tryEdit({
  file: TRACKER,
  label: 'P3: findings — append F-IS-WALLIAM-DEAD-CONSTANT before Status log',
  oldStr: 'cleanup non-urgent.\n\n---\n\n## Status log',
  newStr: 'cleanup non-urgent.\n\n' + F_DEAD_CONSTANT + '---\n\n## Status log',
  alreadyMarker: 'F-IS-WALLIAM-DEAD-CONSTANT (2026-05-09, CLOSED v20)',
})

// =======================================================================
// Edit 4: Next Action section 3 — T4b spec replaced with CLOSED summary
// =======================================================================

// Anchor uses em-dash (—) to match existing heading; emoji ✅ in replacement only.
const T4B_OLD = `### 3. T4b — Public-facing UI: geo page primary agent display

Public site renders area / muni / community / neighbourhood / building pages. Each needs to display the **primary agent** card sourced from \`resolve_display_agent_for_context\`.

**Pre-build recon:**

- Locate existing geo page routes + agent-card components.
- Confirm how they fetch agent data today.
- Decide whether to enhance \`app/api/walliam/resolve-agent/route.ts\` to accept \`neighbourhood_id\` from request body (forward compat for neighbourhood-level pages — F-APA-NEIGHBOURHOOD-CHECK closure means neighbourhood-scope assignments can now exist in apa).

**Building pages are a documented shared exception between System 1 and System 2** — handled with extreme care. Read the existing building page handling before changing anything; do not modify System 1 paths.`

const T4B_NEW = `### 3. T4b — Public-facing UI: geo page primary agent display ✅ CLOSED 2026-05-09 v20

Display resolver swap + \`neighbourhood_id\` pass-through across component / API route / server helper + Toronto neighbourhood page caller fix shipped via \`scripts/r-territory-t4b-patch.js\`. 12 anchored edits across 4 files; TSC clean. F-IS-WALLIAM-DEAD-CONSTANT closed in same batch.

- \`components/WalliamAgentCard.tsx\`: \`neighbourhood_id?: string | null\` added to props / destructure / fetch body / useEffect deps.
- \`app/api/walliam/resolve-agent/route.ts\`: RPC swapped to \`resolve_display_agent_for_context\` (is_selling-aware); \`p_neighbourhood_id\` now sourced from request body; source detection extended to flag neighbourhood-scope as \`geo_assignment\`.
- \`lib/utils/is-walliam.ts\`: \`resolveWalliamAgent\` params extended; RPC stays \`resolve_agent_for_context\` (routing surface for \`GeoPageTabs\` / \`NeighbourhoodPageTabs\`); dead \`WALLIAM_TENANT_ID\` constant removed.
- \`app/comprehensive-site/toronto/[neighbourhood]/page.tsx\`: only caller-site change needed (passes \`neighbourhood_id\` to both the server helper and the JSX); six other geo/property pages already wiring scope correctly per T4b recon.

**Building pages were preserved as the documented System 1 / System 2 shared exception** -- BuildingPage.tsx imports WalliamAgentCard but the integration was already correct; no System 1 path touched.

**Manual smoke pending** on a Toronto neighbourhood URL post-deploy to confirm display resolver behavior in production. T7 covers that.`

tryEdit({
  file: TRACKER,
  label: 'P4: Next Action section 3 — T4b spec replaced with CLOSED summary',
  oldStr: T4B_OLD,
  newStr: T4B_NEW,
  alreadyMarker: '### 3. T4b — Public-facing UI: geo page primary agent display ✅ CLOSED 2026-05-09 v20',
})

// =======================================================================
// Summary
// =======================================================================

console.log('\n=========================================================')
console.log(`DONE: ${totalPatched} patched, ${totalSkipped} skipped (already applied)`)
console.log('=========================================================\n')
console.log('Next: visual diff of docs/W-TERRITORY-TRACKER.md, then commit + push.')
console.log('Single commit covers: 4 source edits + scripts/r-territory-t4b-patch.js + scripts/patch-tracker-v20.js + docs/W-TERRITORY-TRACKER.md.\n')