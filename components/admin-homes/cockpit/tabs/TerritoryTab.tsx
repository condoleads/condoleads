'use client'
// components/admin-homes/cockpit/tabs/TerritoryTab.tsx
// W-TERRITORY-OPS T1-3 -- Agents/Health/Detail toggle.
// W-TERRITORY-MASTER P5 -- Pins view (6th).
// W-TERRITORY-MASTER P5.2 -- Buildings view (7th).
// Agents (default): per-agent territory rollup with bulk actions.
// Health: View 4 driven by resolver_health_check.
// Detail: legacy TerritoryClient (Coverage/Matrix/Audit).
import { useState } from 'react'
import TerritoryClient from '@/components/admin-homes/TerritoryClient'
import HealthView from '@/components/admin-homes/cockpit/territory/HealthView'
import AgentsView from '@/components/admin-homes/cockpit/territory/AgentsView'
import CardsView from '@/components/admin-homes/cockpit/territory/CardsView'
import GeographyView from '@/components/admin-homes/cockpit/territory/GeographyView'
import PinsView from '@/components/admin-homes/cockpit/territory/PinsView'
import BuildingsView from '@/components/admin-homes/cockpit/territory/BuildingsView'
import QueueIndicator from '@/components/admin-homes/cockpit/territory/QueueIndicator'
import AuditSidebar from '@/components/admin-homes/cockpit/territory/AuditSidebar'
import TerritorySearchBar, { type SearchResult } from '@/components/admin-homes/cockpit/territory/TerritorySearchBar'
import { Activity, Building2, Map, Pin, Table, Users } from 'lucide-react'

// W-TERRITORY-VIEW UNIT 30: optional `defaultView` prop lets the standalone
// /admin-homes/territory page (new in this unit) land directly on
// GeographyView (the "who owns what" picture). Cockpit callers omit the
// prop and keep the prior default of 'agents'. No behavior change for
// existing call sites.
interface Props { tenantId: string; tenantName: string; actingAgentId: string | null; defaultView?: View }

type View = 'agents' | 'cards' | 'geography' | 'pins' | 'buildings' | 'health' | 'detail'

export default function TerritoryTab({ tenantId, tenantName, actingAgentId, defaultView = 'agents' }: Props) {
  const [view, setView] = useState<View>(defaultView)
  const [cardsAgentFilter, setCardsAgentFilter] = useState<string | null>(null)
  const [cardsGeoFilter, setCardsGeoFilter] = useState<{ scope: string; scope_id: string; geo_name: string } | null>(null)

  function onSearchSelect(r: SearchResult) {
    if (r.kind === 'agent') {
      setCardsGeoFilter(null)
      setCardsAgentFilter(r.id)
      setView('cards')
      return
    }
    setCardsAgentFilter(null)
    setCardsGeoFilter({ scope: r.kind, scope_id: r.id, geo_name: r.name })
    setView('cards')
  }
  const btn = (target: View, label: string, Icon: typeof Users, pos: 'l' | 'm' | 'r') => {
    const rounded = pos === 'l' ? 'rounded-l-md' : pos === 'r' ? 'rounded-r-md' : ''
    const border = pos === 'm' || pos === 'r' ? 'border-l border-gray-200' : ''
    const active = view === target
    return (
      <button
        type="button"
        onClick={() => setView(target)}
        className={
          `px-3 py-1.5 text-xs font-medium ${rounded} ${border} flex items-center gap-1.5 ` +
          (active ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50')
        }
      >
        <Icon className="w-3.5 h-3.5" /> {label}
      </button>
    )
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <TerritorySearchBar tenantId={tenantId} onSelect={onSearchSelect} />
          <QueueIndicator tenantId={tenantId} />
        </div>
        <div className="inline-flex rounded-md shadow-sm border border-gray-200 bg-white" role="group">
          {btn('agents', 'Agents', Users, 'l')}
          {btn('cards', 'Cards', Table, 'm')}
          {btn('geography', 'Geography', Map, 'm')}
          {btn('pins', 'Pins', Pin, 'm')}
          {btn('buildings', 'Buildings', Building2, 'm')}
          {btn('health', 'Health', Activity, 'm')}
          {btn('detail', 'Detail', Table, 'r')}
        </div>
      </div>
      {view === 'agents'
        ? <AgentsView tenantId={tenantId} tenantName={tenantName} onViewCards={(agentId) => { setCardsAgentFilter(agentId); setView('cards') }} />
        : view === 'cards'
        ? <CardsView tenantId={tenantId} tenantName={tenantName} initialAgentFilter={cardsAgentFilter} onClearAgentFilter={() => setCardsAgentFilter(null)} initialGeoFilter={cardsGeoFilter} onClearGeoFilter={() => setCardsGeoFilter(null)} />
        : view === 'geography'
        ? <GeographyView tenantId={tenantId} tenantName={tenantName} onOpenCards={(f) => { setCardsAgentFilter(null); setCardsGeoFilter({ scope: f.scope, scope_id: f.scope_id, geo_name: '' }); setView('cards') }} />
        : view === 'pins'
        ? <PinsView tenantId={tenantId} actingAgentId={actingAgentId} />
        : view === 'buildings'
        ? <BuildingsView tenantId={tenantId} actingAgentId={actingAgentId} />
        : view === 'health'
        ? <HealthView tenantId={tenantId} tenantName={tenantName} />
        : <TerritoryClient tenantId={tenantId} tenantName={tenantName} seeAll={false} />}
      <AuditSidebar tenantId={tenantId} />
    </div>
  )
}
