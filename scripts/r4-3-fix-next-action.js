const fs = require('fs')
const path = 'C:/Condoleads/project/docs/W-ROLES-DELEGATION-TRACKER.md'

const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')
console.log('Detected line ending:', useCRLF ? 'CRLF' : 'LF')

const contentLF = original.replace(/\r\n/g, '\n')

// We need to find the existing "Next action" section. Could be either of these
// shapes depending on which patches landed earlier today.
const possibleOldHeaders = [
  '## Next action\n\n**R4 \u2014 transition state machine.**',
  '## Next action\n\nPer Shah roadmap (locked 2026-05-04):',
  '## Next action\n\n**R3 \u2014 permission middleware.**',
]

let foundOld = null
for (const h of possibleOldHeaders) {
  if (contentLF.includes(h)) {
    foundOld = h
    console.log('Found existing Next action header variant:', JSON.stringify(h.substring(0, 60)))
    break
  }
}

if (!foundOld) {
  console.error('No known Next action variant found. Manual inspection needed.')
  // Print all lines that say "## Next action" with surrounding context
  const lines = contentLF.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('## Next action')) {
      console.error('Found Next action header at line', i+1, ':')
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        console.error('  ' + (j+1) + ': ' + lines[j])
      }
    }
  }
  process.exit(1)
}

// Find the start of this Next action section and the start of the next ## section
const startIdx = contentLF.indexOf('## Next action')
if (startIdx === -1) {
  console.error('## Next action header not found')
  process.exit(1)
}

// Find next ## header (or end of file)
const afterStart = contentLF.indexOf('\n## ', startIdx + 1)
const sectionEnd = afterStart === -1 ? contentLF.length : afterStart

const oldSection = contentLF.substring(startIdx, sectionEnd)
console.log('Replacing section of length', oldSection.length, 'chars')

const newSection = [
  '## Next action',
  '',
  '**Master launch tracker first.** Per session 2026-05-04 strategic pivot: produce docs/W-LAUNCH-TRACKER.md before any further feature ticket. Rationale: scattered backend pieces shipped without top-down cohesion check; no master view of how systems integrate; UI not yet seen end-to-end.',
  '',
  'Master tracker recon order (next session):',
  '1. Read W-HIERARCHY-TRACKER.md + this tracker (known good baselines)',
  '2. Recon leads + email flow (recipients helper, sendActivityEmail, every lead-creating route)',
  '3. Recon user management (user_profiles, chat_sessions, user_credit_overrides, user-tenant linkage)',
  '4. Recon credit system (lib/credits/*, smoke-w-credit-verify.js)',
  '5. Recon dashboard UI (every /admin-homes page + component)',
  '6. Recon territory tables (agent_property_access, agent_geo_buildings, tenant_property_access)',
  '7. Write W-LAUNCH-TRACKER.md with: systems status grid, integration matrix, launch blockers, active execution trackers',
  '',
  '**After master tracker exists**, decide next ticket based on what recon reveals. Likely candidates: territory backend, user-tenant assignment ticket, dashboard UI ticket, or wiring fixes between existing systems.',
  '',
  '### Open sister tickets (do not block roadmap)',
  '',
  '- **W-ADMIN-AUTH-LOCKDOWN** \u2014 migrate the 13 production routes still calling api-auth.ts onto can() + role-transitions.ts. After all 13 ship, lib/admin-homes/api-auth.ts deletion becomes safe. Scope: app/api/admin-homes/{activities, agents/[id]/*, agents/list, leads/[id], tenants/*, users/override}/route.ts. Independent of feature roadmap; can ship anytime.',
  '',
].join('\n')

const updatedLF = contentLF.substring(0, startIdx) + newSection + contentLF.substring(sectionEnd)
const updated = useCRLF ? updatedLF.replace(/\n/g, '\r\n') : updatedLF
fs.writeFileSync(path, updated, 'utf8')

console.log('Next action section rewritten.')
console.log('Original size:', original.length)
console.log('New size:', updated.length)
console.log('Delta:', updated.length - original.length)