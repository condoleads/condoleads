// scripts/fix-territory-tab-p5.js
// Restore TerritoryTab.tsx from backup and write a clean P5-integrated version.
// Approach: deterministic full-file rewrite using the backup as the base.
// No anchor-based JSX surgery — the previous patch attempted that and broke
// the ternary chain.
//
// Preserves CRLF line endings (Windows / VS Code default).

const fs = require('fs')
const path = require('path')

const TARGET = path.join(
  process.cwd(),
  'components',
  'admin-homes',
  'cockpit',
  'tabs',
  'TerritoryTab.tsx'
)

const dir = path.dirname(TARGET)
const base = path.basename(TARGET)

// Find the most recent backup
const backups = fs.readdirSync(dir)
  .filter(f => f.startsWith(base + '.backup_'))
  .sort()
  .reverse()

if (backups.length === 0) {
  console.error('ERROR: no backup found. Cannot safely restore.')
  process.exit(1)
}
const latestBackup = backups[0]
const backupPath = path.join(dir, latestBackup)
console.log('Using backup as base:', latestBackup)

const originalContent = fs.readFileSync(backupPath, 'utf8')

// Detect line endings from backup
const usesCRLF = originalContent.includes('\r\n')
const NL = usesCRLF ? '\r\n' : '\n'
console.log(`Detected line endings: ${usesCRLF ? 'CRLF' : 'LF'}`)

// Sanity check: backup should be the un-patched original.
if (originalContent.includes('PinsView')) {
  console.error('ERROR: backup already contains PinsView — wrong backup, or backup itself was patched.')
  process.exit(1)
}

// Save current (broken) file as additional safety backup before rewriting
const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const brokenBackup = `${TARGET}.broken_${ts}`
fs.writeFileSync(brokenBackup, fs.readFileSync(TARGET, 'utf8'), 'utf8')
console.log('Broken state preserved at:', brokenBackup)

// Now apply edits to the backup content, one at a time.
let next = originalContent

function replace(text, oldStr, newStr, label) {
  const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = text.match(new RegExp(escaped, 'g')) || []
  if (matches.length !== 1) {
    throw new Error(`Edit "${label}": found ${matches.length} matches (expected 1)`)
  }
  return text.replace(oldStr, newStr)
}

// Edit 1: add PinsView import after GeographyView import
next = replace(next,
  `import GeographyView from '@/components/admin-homes/cockpit/territory/GeographyView'`,
  `import GeographyView from '@/components/admin-homes/cockpit/territory/GeographyView'${NL}import PinsView from '@/components/admin-homes/cockpit/territory/PinsView'`,
  'PinsView import'
)

// Edit 2: add Pin to lucide-react imports
next = replace(next,
  `import { Activity, Map, Table, Users } from 'lucide-react'`,
  `import { Activity, Map, Pin, Table, Users } from 'lucide-react'`,
  'Pin icon import'
)

// Edit 3: extend Props with actingAgentId
next = replace(next,
  `interface Props { tenantId: string; tenantName: string }`,
  `interface Props { tenantId: string; tenantName: string; actingAgentId: string }`,
  'Props interface'
)

// Edit 4: extend function signature
next = replace(next,
  `export default function TerritoryTab({ tenantId, tenantName }: Props) {`,
  `export default function TerritoryTab({ tenantId, tenantName, actingAgentId }: Props) {`,
  'function signature'
)

// Edit 5: extend View union with 'pins'
next = replace(next,
  `type View = 'agents' | 'cards' | 'geography' | 'health' | 'detail'`,
  `type View = 'agents' | 'cards' | 'geography' | 'pins' | 'health' | 'detail'`,
  'View union'
)

// Edit 6: add Pins button between Geography and Health
next = replace(next,
  `          {btn('geography', 'Geography', Map, 'm')}${NL}          {btn('health', 'Health', Activity, 'm')}`,
  `          {btn('geography', 'Geography', Map, 'm')}${NL}          {btn('pins', 'Pins', Pin, 'm')}${NL}          {btn('health', 'Health', Activity, 'm')}`,
  'Pins button'
)

// Edit 7: add 'pins' render branch INSIDE the ternary, between geography and health.
// The original ternary chain is:
//   {view === 'agents' ? <Agents />
//    : view === 'cards' ? <Cards />
//    : view === 'geography' ? <Geography />
//    : view === 'health' ? <Health />
//    : <Detail />}
//
// We insert a new branch: `: view === 'pins' ? <PinsView />` between geography and health.

const oldTernary =
`        : view === 'geography'${NL}        ? <GeographyView tenantId={tenantId} tenantName={tenantName} onOpenCards={(f) => { setCardsAgentFilter(null); setCardsGeoFilter({ scope: f.scope, scope_id: f.scope_id, geo_name: '' }); setView('cards') }} />${NL}        : view === 'health'`

const newTernary =
`        : view === 'geography'${NL}        ? <GeographyView tenantId={tenantId} tenantName={tenantName} onOpenCards={(f) => { setCardsAgentFilter(null); setCardsGeoFilter({ scope: f.scope, scope_id: f.scope_id, geo_name: '' }); setView('cards') }} />${NL}        : view === 'pins'${NL}        ? <PinsView tenantId={tenantId} actingAgentId={actingAgentId} />${NL}        : view === 'health'`

next = replace(next, oldTernary, newTernary, 'pins ternary branch')

// Write the rewritten file with original line endings preserved
fs.writeFileSync(TARGET, next, 'utf8')
console.log('')
console.log('Rewrote:', TARGET)
console.log('Edits applied:')
console.log('  1. + PinsView import')
console.log('  2. + Pin icon import')
console.log("  3. + actingAgentId in Props")
console.log('  4. + actingAgentId in function signature')
console.log("  5. + 'pins' in View union")
console.log('  6. + Pins button (between Geography and Health)')
console.log("  7. + 'pins' branch in ternary (between geography and health)")
console.log('')
console.log('Verify with: npx tsc --noEmit')