const fs = require('fs')
const path = 'C:/Condoleads/project/docs/W-LAUNCH-TRACKER.md'

const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')
console.log('Detected line ending:', useCRLF ? 'CRLF' : 'LF')

let content = original.replace(/\r\n/g, '\n')

const replacements = [
  {
    name: 'Territory row',
    old: '| Territory (geo cascade, building/listing assign) | _RECON PENDING_ | | | | Block 5 |',
    new: '| Territory (geo cascade, building/listing assign) | \ud83d\udfe1 | \ud83d\udfe1 | \u274c | \ud83d\udfe1 | **4 tables exist, schema-ready but data-empty.** `agent_property_access` (1 row, 1 muni-scoped). `agent_geo_buildings` schema is **flat `(agent_id, building_id)` \u2014 NOT junction-to-`assignment_id` as implementation plan described**. `tenant_property_access` (0 rows = full access per model). `agent_listing_assignments` (0 rows). RPC `resolve_agent_for_context` is the single resolver, **9 callers** across charlie/walliam/lib. 4 section components embedded in agent + tenant workspaces (March 2026). **No `/admin-homes/territory` page** (Phase 3 nav gap). **`agent_property_access.tenant_id` NULLABLE** (multi-tenant gap at DB level). No territory smoke tests. No migration files matching territory/geo/property_access/building keywords \u2014 tables created out-of-band. |'
  },
  {
    name: 'Status line',
    old: '**Status:** RECON IN PROGRESS \u2014 4/5 blocks complete',
    new: '**Status:** SECTION 1 COMPLETE \u2014 5/5 blocks. Sections 2\u20134 (integration matrix, launch blockers, tracker index) pending.'
  },
  {
    name: 'Next action',
    old: '**Block 5 recon** \u2014 Territory tables (`agent_property_access`, `agent_geo_buildings`, `tenant_property_access`, `agent_listing_assignments`) \u2014 schema + counts + code refs. **Final block before Sections 2\u20134 are written.**',
    new: '**Write Sections 2\u20134** \u2014 integration matrix, launch blockers, active execution tracker index. Synthesis from accumulated 5-block evidence; no further recon needed.'
  },
]

for (const r of replacements) {
  const occurrences = content.split(r.old).length - 1
  if (occurrences === 0) { console.error('NOT FOUND:', r.name); process.exit(1) }
  if (occurrences > 1) { console.error('NOT UNIQUE:', r.name); process.exit(1) }
  content = content.replace(r.old, r.new)
  console.log('  Patched:', r.name)
}

const v4Marker = 'Going forward: widen grep scope before claiming absence.**'
const v5Line = '\n- **2026-05-05 v5** \u2014 Block 5 (Territory) recon complete. **Section 1 closed (9/9 rows populated).** Findings: (i) 4 territory tables exist with mostly-correct multi-tenant column shape, but data is empty/sparse \u2014 feature is schema-ready, not yet configurable end-to-end; (ii) RPC `resolve_agent_for_context` is the single resolution path, heavily wired with 9 callers across charlie/walliam/lib; (iii) **`agent_geo_buildings` schema diverges from implementation plan** \u2014 flat `(agent_id, building_id)` instead of junction to `agent_property_access.id`; (iv) **`agent_property_access.tenant_id` is NULLABLE** \u2014 multi-tenant gap at DB level; (v) **no `/admin-homes/territory` page exists**; (vi) no territory smoke tests; no migration files matching territory keywords (out-of-band schema creation). One follow-up SQL: `agent_geo_buildings` count (failed in 9.5 due to wrong column reference) \u2014 will be filed in v5b. **Sections 2 (integration matrix), 3 (launch blockers), 4 (active tracker index) are next.**'

if (!content.includes(v4Marker)) { console.error('v4 marker not found'); process.exit(1) }
content = content.replace(v4Marker, v4Marker + v5Line)
console.log('  Appended v5 status log')

const finalContent = useCRLF ? content.replace(/\n/g, '\r\n') : content
fs.writeFileSync(path, finalContent, 'utf8')

console.log('Original size:', original.length)
console.log('New size:', finalContent.length)
console.log('Delta:', finalContent.length - original.length)