const fs = require('fs')
const path = 'C:/Condoleads/project/docs/W-LAUNCH-TRACKER.md'

const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')
console.log('Detected line ending:', useCRLF ? 'CRLF' : 'LF')

let content = original.replace(/\r\n/g, '\n')

const replacements = [
  {
    name: 'Hierarchy row (AgentOrgChart correction)',
    old: '| Hierarchy (parent/child walker, role ladder) | \u2705 | \u2705 | \u2705 | \ud83d\udfe1 | Walker in 7/7 lead routes. `agents.role` CHECK constrains 5 values. `lib/admin-homes/hierarchy.ts` shipped W-HIERARCHY. Visual org chart deferred (Phase 3.3b never shipped). |',
    new: '| Hierarchy (parent/child walker, role ladder) | \u2705 | \u2705 | \u2705 | \u2705 | Walker in 7/7 lead routes. `agents.role` CHECK constrains 5 values. `lib/admin-homes/hierarchy.ts` shipped W-HIERARCHY. **`AgentOrgChart` shipped** (`components/admin-homes/AgentOrgChart.tsx` 10.3KB Apr 25 + `app/admin-homes/agents/tree/page.tsx` 2KB) \u2014 corrects v1 claim. |'
  },
  {
    name: 'Dashboard UI row',
    old: '| Dashboard UI (/admin-homes pages + components) | _RECON PENDING_ | | | | Block 4 |',
    new: '| Dashboard UI (/admin-homes pages + components) | \u2705 | \ud83d\udfe1 | \u274c | \ud83d\udfe1 | **10 pages, 16 components.** Substantial: `SettingsClient` 35.8KB, `BulkSyncClient` 27.2KB + `CommandCenter` 25.4KB, `AdminHomesLeadsClient` 26.9KB, `EditTenantModal` 34.4KB. Per Phase 3 spec sidebar has 9 nav items; **6 pages shipped (Dashboard, Leads, Users, Agents, Settings, Tenants); 3 missing (Territory, Approvals, Tickets)**. AgentOrgChart wired at `/admin-homes/agents/tree`. Modal layer kept during deprecation window per Phase 3.3 spec. **Sidebar role-gating logic not verified from grep \u2014 needs file inspection** (per Phase 3.2 spec each role should see different nav). No UI smoke tests located. R5\u2013R6 delegation UI not shipped. |'
  },
  {
    name: 'Status line',
    old: '**Status:** RECON IN PROGRESS \u2014 3/5 blocks complete',
    new: '**Status:** RECON IN PROGRESS \u2014 4/5 blocks complete'
  },
  {
    name: 'Next action',
    old: '**Block 4 recon** \u2014 Dashboard UI (every `app/admin-homes/**/page.tsx` + `components/admin-homes/**`, stub vs functional). Verification commands in chat.',
    new: '**Block 5 recon** \u2014 Territory tables (`agent_property_access`, `agent_geo_buildings`, `tenant_property_access`, `agent_listing_assignments`) \u2014 schema + counts + code refs. **Final block before Sections 2\u20134 are written.**'
  },
]

for (const r of replacements) {
  const occurrences = content.split(r.old).length - 1
  if (occurrences === 0) { console.error('NOT FOUND:', r.name); process.exit(1) }
  if (occurrences > 1) { console.error('NOT UNIQUE:', r.name); process.exit(1) }
  content = content.replace(r.old, r.new)
  console.log('  Patched:', r.name)
}

const v3Marker = '(v) 2 stale `useCharlie.ts` backups on disk. **Section 3 launch-blocker candidates queueing up.**'
const v4Line = '\n- **2026-05-05 v4** \u2014 Block 4 (Dashboard UI) recon complete. **Another v1 claim corrected:** `AgentOrgChart.tsx` exists (10.3KB Apr 25) and is wired at `/admin-homes/agents/tree` \u2014 Phase 3.3b is shipped, not deferred. **New findings:** (i) 10 pages + 16 components, with substantial client files (35.8KB SettingsClient, 27.2KB BulkSyncClient); (ii) per Phase 3 nav spec, **3 pages missing: Territory, Approvals, Tickets**; (iii) modal layer (EditTenantModal etc.) still alive during Phase 3.3 deprecation window; (iv) sidebar role-gating logic not visible from grep \u2014 needs file inspection (per Phase 3.2 spec); (v) no UI smoke tests located; (vi) R5\u2013R6 delegation UI NOT shipped. **Pattern: too-narrow recon greps in earlier blocks (v1 + v2) caused two false-claim regressions. v3 fixed v2 (`tenant_users` orphan); v4 fixes v1 (org chart). Going forward: widen grep scope before claiming absence.**'

if (!content.includes(v3Marker)) { console.error('v3 marker not found'); process.exit(1) }
content = content.replace(v3Marker, v3Marker + v4Line)
console.log('  Appended v4 status log')

const finalContent = useCRLF ? content.replace(/\n/g, '\r\n') : content
fs.writeFileSync(path, finalContent, 'utf8')

console.log('Original size:', original.length)
console.log('New size:', finalContent.length)
console.log('Delta:', finalContent.length - original.length)