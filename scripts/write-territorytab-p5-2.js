// scripts/write-territorytab-p5-2.js
// W-TERRITORY-MASTER P5.2: Add 7th 'buildings' view to TerritoryTab.
// Full-file rewrite (P5.1 atomic pattern, not anchor-based JSX surgery).

const fs = require('fs')
const path = require('path')

const TARGET = path.join(
  process.cwd(),
  'components', 'admin-homes', 'cockpit', 'tabs', 'TerritoryTab.tsx'
)

const NL = '\r\n'

const lines = [
  `'use client'`,
  `// components/admin-homes/cockpit/tabs/TerritoryTab.tsx`,
  `// W-TERRITORY-OPS T1-3 -- Agents/Health/Detail toggle.`,
  `// W-TERRITORY-MASTER P5 -- Pins view (6th).`,
  `// W-TERRITORY-MASTER P5.2 -- Buildings view (7th).`,
  `// Agents (default): per-agent territory rollup with bulk actions.`,
  `// Health: View 4 driven by resolver_health_check.`,
  `// Detail: legacy TerritoryClient (Coverage/Matrix/Audit).`,
  `import { useState } from 'react'`,
  `import TerritoryClient from '@/components/admin-homes/TerritoryClient'`,
  `import HealthView from '@/components/admin-homes/cockpit/territory/HealthView'`,
  `import AgentsView from '@/components/admin-homes/cockpit/territory/AgentsView'`,
  `import CardsView from '@/components/admin-homes/cockpit/territory/CardsView'`,
  `import GeographyView from '@/components/admin-homes/cockpit/territory/GeographyView'`,
  `import PinsView from '@/components/admin-homes/cockpit/territory/PinsView'`,
  `import BuildingsView from '@/components/admin-homes/cockpit/territory/BuildingsView'`,
  `import QueueIndicator from '@/components/admin-homes/cockpit/territory/QueueIndicator'`,
  `import AuditSidebar from '@/components/admin-homes/cockpit/territory/AuditSidebar'`,
  `import TerritorySearchBar, { type SearchResult } from '@/components/admin-homes/cockpit/territory/TerritorySearchBar'`,
  `import { Activity, Building2, Map, Pin, Table, Users } from 'lucide-react'`,
  ``,
  `interface Props { tenantId: string; tenantName: string; actingAgentId: string | null }`,
  ``,
  `type View = 'agents' | 'cards' | 'geography' | 'pins' | 'buildings' | 'health' | 'detail'`,
  ``,
  `export default function TerritoryTab({ tenantId, tenantName, actingAgentId }: Props) {`,
  `  const [view, setView] = useState<View>('agents')`,
  `  const [cardsAgentFilter, setCardsAgentFilter] = useState<string | null>(null)`,
  `  const [cardsGeoFilter, setCardsGeoFilter] = useState<{ scope: string; scope_id: string; geo_name: string } | null>(null)`,
  ``,
  `  function onSearchSelect(r: SearchResult) {`,
  `    if (r.kind === 'agent') {`,
  `      setCardsGeoFilter(null)`,
  `      setCardsAgentFilter(r.id)`,
  `      setView('cards')`,
  `      return`,
  `    }`,
  `    setCardsAgentFilter(null)`,
  `    setCardsGeoFilter({ scope: r.kind, scope_id: r.id, geo_name: r.name })`,
  `    setView('cards')`,
  `  }`,
  `  const btn = (target: View, label: string, Icon: typeof Users, pos: 'l' | 'm' | 'r') => {`,
  `    const rounded = pos === 'l' ? 'rounded-l-md' : pos === 'r' ? 'rounded-r-md' : ''`,
  `    const border = pos === 'm' || pos === 'r' ? 'border-l border-gray-200' : ''`,
  `    const active = view === target`,
  `    return (`,
  `      <button`,
  `        type="button"`,
  `        onClick={() => setView(target)}`,
  `        className={`,
  `          \`px-3 py-1.5 text-xs font-medium \${rounded} \${border} flex items-center gap-1.5 \` +`,
  `          (active ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50')`,
  `        }`,
  `      >`,
  `        <Icon className="w-3.5 h-3.5" /> {label}`,
  `      </button>`,
  `    )`,
  `  }`,
  `  return (`,
  `    <div>`,
  `      <div className="flex items-center justify-between gap-3 mb-3">`,
  `        <div className="flex items-center gap-2 flex-1 min-w-0">`,
  `          <TerritorySearchBar tenantId={tenantId} onSelect={onSearchSelect} />`,
  `          <QueueIndicator tenantId={tenantId} />`,
  `        </div>`,
  `        <div className="inline-flex rounded-md shadow-sm border border-gray-200 bg-white" role="group">`,
  `          {btn('agents', 'Agents', Users, 'l')}`,
  `          {btn('cards', 'Cards', Table, 'm')}`,
  `          {btn('geography', 'Geography', Map, 'm')}`,
  `          {btn('pins', 'Pins', Pin, 'm')}`,
  `          {btn('buildings', 'Buildings', Building2, 'm')}`,
  `          {btn('health', 'Health', Activity, 'm')}`,
  `          {btn('detail', 'Detail', Table, 'r')}`,
  `        </div>`,
  `      </div>`,
  `      {view === 'agents'`,
  `        ? <AgentsView tenantId={tenantId} tenantName={tenantName} onViewCards={(agentId) => { setCardsAgentFilter(agentId); setView('cards') }} />`,
  `        : view === 'cards'`,
  `        ? <CardsView tenantId={tenantId} tenantName={tenantName} initialAgentFilter={cardsAgentFilter} onClearAgentFilter={() => setCardsAgentFilter(null)} initialGeoFilter={cardsGeoFilter} onClearGeoFilter={() => setCardsGeoFilter(null)} />`,
  `        : view === 'geography'`,
  `        ? <GeographyView tenantId={tenantId} tenantName={tenantName} onOpenCards={(f) => { setCardsAgentFilter(null); setCardsGeoFilter({ scope: f.scope, scope_id: f.scope_id, geo_name: '' }); setView('cards') }} />`,
  `        : view === 'pins'`,
  `        ? <PinsView tenantId={tenantId} actingAgentId={actingAgentId} />`,
  `        : view === 'buildings'`,
  `        ? <BuildingsView tenantId={tenantId} actingAgentId={actingAgentId} />`,
  `        : view === 'health'`,
  `        ? <HealthView tenantId={tenantId} tenantName={tenantName} />`,
  `        : <TerritoryClient tenantId={tenantId} tenantName={tenantName} seeAll={false} />}`,
  `      <AuditSidebar tenantId={tenantId} />`,
  `    </div>`,
  `  )`,
  `}`,
  ``
]

const content = lines.join(NL)

// ASCII purity
for (let i = 0; i < content.length; i++) {
  const code = content.charCodeAt(i)
  if (code > 127) {
    throw new Error(`Non-ASCII char (code ${code}) at offset ${i}`)
  }
}
console.log('ASCII purity verified.')

if (!fs.existsSync(TARGET)) {
  console.error('ERROR: target file not found')
  process.exit(1)
}
const existing = fs.readFileSync(TARGET, 'utf8')
if (existing === content) {
  console.log('Already at target state. No write.')
  process.exit(0)
}

// Sanity: existing must be the P5 TerritoryTab (has 'pins' view, lacks 'buildings')
if (!existing.includes("'pins'") || existing.includes("'buildings'")) {
  console.error('ABORT: existing file is not the expected P5 state.')
  console.error('  Has pins:', existing.includes("'pins'"))
  console.error('  Has buildings (should be false):', existing.includes("'buildings'"))
  process.exit(1)
}

const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const backup = `${TARGET}.backup_p5_2_${ts}`
fs.writeFileSync(backup, existing, 'utf8')
console.log('Backup:', path.basename(backup))

fs.writeFileSync(TARGET, content, 'utf8')
console.log('Wrote:', TARGET)
console.log(`Line count: ${lines.length}`)

const written = fs.readFileSync(TARGET, 'utf8')
console.log('')
console.log('Post-write sanity:')
console.log('  Has BuildingsView import:', written.includes('import BuildingsView'))
console.log('  Has Building2 icon import:', written.includes('Building2'))
console.log("  Has 'buildings' in View union:", written.includes("'buildings'"))
console.log('  Has Buildings button:', written.includes("btn('buildings'"))
console.log('  Has buildings render branch:', written.includes("view === 'buildings'"))