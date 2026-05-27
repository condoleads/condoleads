// scripts/patch-pinsview-p5-v2.js
// Switch PinsView from /api/admin-homes/agents/list (wrong site_type filter,
// no is_selling in response) to /api/admin-homes/territory/pins/agents-for-pinning
// (returns tenant-scoped active selling agents with the right shape).
//
// v1 failed because PinsView uses CRLF line endings; v2 preserves them.
// Idempotent.

const fs = require('fs')
const path = require('path')

const TARGET = path.join(
  process.cwd(),
  'components',
  'admin-homes',
  'cockpit',
  'territory',
  'PinsView.tsx'
)

if (!fs.existsSync(TARGET)) {
  console.error('ERROR: PinsView.tsx not found at', TARGET)
  process.exit(1)
}

const original = fs.readFileSync(TARGET, 'utf8')

if (original.includes('/api/admin-homes/territory/pins/agents-for-pinning')) {
  console.log('PinsView already patched. No changes needed.')
  process.exit(0)
}

const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const backup = `${TARGET}.backup_v2_${ts}`
fs.writeFileSync(backup, original, 'utf8')
console.log('Backup written:', backup)

// Detect line endings
const usesCRLF = original.includes('\r\n')
const NL = usesCRLF ? '\r\n' : '\n'
console.log(`Detected line endings: ${usesCRLF ? 'CRLF' : 'LF'}`)

function replace(text, oldStr, newStr, label) {
  const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = text.match(new RegExp(escaped, 'g')) || []
  if (matches.length !== 1) {
    throw new Error(`Edit "${label}": found ${matches.length} matches (expected 1)`)
  }
  return text.replace(oldStr, newStr)
}

let next = original

// Build the search and replacement strings with the correct line endings.
const oldBlock =
`      const res = await fetch(${NL}        \`/api/admin-homes/agents/list?tenant_id=\${encodeURIComponent(tenantId)}&is_active=true&is_selling=true\`${NL}      )${NL}      if (!res.ok) return${NL}      const body = await res.json()${NL}      const list = body.data || body.agents || []${NL}      setAgents(list)`

const newBlock =
`      const res = await fetch(${NL}        \`/api/admin-homes/territory/pins/agents-for-pinning?tenant_id=\${encodeURIComponent(tenantId)}\`${NL}      )${NL}      if (!res.ok) return${NL}      const body = await res.json()${NL}      const list = body.data || []${NL}      setAgents(list)`

next = replace(next, oldBlock, newBlock, 'agents fetch block')

fs.writeFileSync(TARGET, next, 'utf8')
console.log('Patched:', TARGET)
console.log('  + Switched to /api/admin-homes/territory/pins/agents-for-pinning')
console.log('  + Cleaned response-shape parse to body.data')