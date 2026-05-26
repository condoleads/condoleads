'use client'
// components/admin-homes/cockpit/tabs/TerritoryTab.tsx
// W-TERRITORY-OPS T1-3 -- Agents/Health/Detail toggle.
// Agents (default): per-agent territory rollup with bulk actions.
// Health: View 4 driven by resolver_health_check.
// Detail: legacy TerritoryClient (Coverage/Matrix/Audit) -- preserved per Rule
// Zero so operators retain full inspection capability while T1-4/T1-5 ship.
import { useState } from 'react'
import TerritoryClient from '@/components/admin-homes/TerritoryClient'
import HealthView from '@/components/admin-homes/cockpit/territory/HealthView'
import AgentsView from '@/components/admin-homes/cockpit/territory/AgentsView'
import CardsView from '@/components/admin-homes/cockpit/territory/CardsView'
import GeographyView from '@/components/admin-homes/cockpit/territory/GeographyView'
import { Activity, Map, Table, Users } from 'lucide-react'

interface Props { tenantId: string; tenantName: string }

type View = 'agents' | 'cards' | 'geography' | 'health' | 'detail'

export default function TerritoryTab({ tenantId, tenantName }: Props) {
  const [view, setView] = useState<View>('agents')
  const [cardsAgentFilter, setCardsAgentFilter] = useState<string | null>(null)
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
      <div className="flex justify-end mb-3">
        <div className="inline-flex rounded-md shadow-sm border border-gray-200 bg-white" role="group">
          {btn('agents', 'Agents', Users, 'l')}
          {btn('cards', 'Cards', Table, 'm')}
          {btn('geography', 'Geography', Map, 'm')}
          {btn('health', 'Health', Activity, 'm')}
          {btn('detail', 'Detail', Table, 'r')}
        </div>
      </div>
      {view === 'agents'
        ? <AgentsView tenantId={tenantId} tenantName={tenantName} onViewCards={(agentId) => { setCardsAgentFilter(agentId); setView('cards') }} />
        : view === 'cards'
        ? <CardsView tenantId={tenantId} tenantName={tenantName} initialAgentFilter={cardsAgentFilter} onClearAgentFilter={() => setCardsAgentFilter(null)} />
        : view === 'geography'
        ? <GeographyView tenantId={tenantId} tenantName={tenantName} onOpenCards={() => { setCardsAgentFilter(null); setView('cards') }} />
        : view === 'health'
        ? <HealthView tenantId={tenantId} tenantName={tenantName} />
        : <TerritoryClient tenantId={tenantId} tenantName={tenantName} seeAll={false} />}
    </div>
  )
}
