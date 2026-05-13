const fs = require('fs')
const path = 'C:/Condoleads/project/docs/W-LAUNCH-TRACKER.md'

const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')
console.log('Detected line ending:', useCRLF ? 'CRLF' : 'LF')

let content = original.replace(/\r\n/g, '\n')

const replacements = [
  {
    name: 'Hierarchy row',
    old: '| Hierarchy (parent/child walker, role ladder) | _RECON PENDING_ | | | | Block 1 |',
    new: '| Hierarchy (parent/child walker, role ladder) | \u2705 | \u2705 | \u2705 | \ud83d\udfe1 | Walker in 7/7 lead routes. `agents.role` CHECK constrains 5 values. `lib/admin-homes/hierarchy.ts` shipped W-HIERARCHY. Visual org chart deferred (Phase 3.3b never shipped). |'
  },
  {
    name: 'Roles & Delegation row',
    old: '| Roles & Delegation (transitions, audit, can()) | _RECON PENDING_ | | | | Block 1 |',
    new: '| Roles & Delegation (transitions, audit, can()) | \u2705 | \ud83d\udfe1 | \u2705 | \u274c | W-ROLES-DELEGATION R1\u2013R4 shipped. 5 RPCs + `can()` + `role-transitions.ts` live. 73 cells passing. **R5 (delegation CRUD), R6 (workspace UI), R7 (delegate BCC overlay), R8 (full smoke matrix) NOT shipped \u2014 scope-defined, deferred per cohesion review.** Sister W-ADMIN-AUTH-LOCKDOWN: 13 routes still on legacy `api-auth.ts`. |'
  },
  {
    name: 'Leads & Email row',
    old: '| Leads & Email Flow (helper, fan-out, lead rows) | _RECON PENDING_ | | | | Block 1 |',
    new: '| Leads & Email Flow (helper, fan-out, lead rows) | \u2705 | \u2705 | \u2705 | \u2014 | Helper `lib/admin-homes/lead-email-recipients.ts` (8458B, 4 exports). 10 consumers, 7 walker consumers. `leads` enforces `tenant_id NOT NULL` + `agent_id NOT NULL`. **Delegation BCC overlay NOT live (depends on R7).** 6 admin email literals remain in System 1 + platform routes (F55 class, out-of-scope). `leads` table currently empty \u2014 fresh state. |'
  },
  {
    name: 'Status line',
    old: '**Status:** RECON IN PROGRESS \u2014 0/5 blocks complete',
    new: '**Status:** RECON IN PROGRESS \u2014 1/5 blocks complete'
  },
  {
    name: 'Next action',
    old: '**Block 1 recon** \u2014 Leads + Email. Verification commands in chat.',
    new: '**Block 2 recon** \u2014 User management (profiles, sessions, tenant linkage). Verification commands in chat.'
  },
]

for (const r of replacements) {
  const occurrences = content.split(r.old).length - 1
  if (occurrences === 0) { console.error('NOT FOUND:', r.name); process.exit(1) }
  if (occurrences > 1) { console.error('NOT UNIQUE:', r.name); process.exit(1) }
  content = content.replace(r.old, r.new)
  console.log('  Patched:', r.name)
}

const v0Marker = '- **2026-05-05 v0** \u2014 Skeleton created. Block 0 of 5 complete. Recon order: Leads/Email \u2192 User Mgmt \u2192 Credits \u2192 Dashboard UI \u2192 Territory.'
const v1Line = '\n- **2026-05-05 v1** \u2014 Block 1 (Leads + Email) recon complete. Hierarchy, Roles & Delegation, Leads & Email rows populated. Findings: helper + walker uniformity confirmed across 7 lead routes; R5\u2013R8 of W-ROLES-DELEGATION NOT shipped (deferred); 6 F55-class admin literals remain in System 1 + platform routes (out of scope); `leads` table currently empty.'

if (!content.includes(v0Marker)) { console.error('v0 marker not found'); process.exit(1) }
content = content.replace(v0Marker, v0Marker + v1Line)
console.log('  Appended v1 status log')

const finalContent = useCRLF ? content.replace(/\n/g, '\r\n') : content
fs.writeFileSync(path, finalContent, 'utf8')

console.log('Original size:', original.length)
console.log('New size:', finalContent.length)
console.log('Delta:', finalContent.length - original.length)