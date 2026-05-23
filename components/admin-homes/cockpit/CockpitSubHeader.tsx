// components/admin-homes/cockpit/CockpitSubHeader.tsx
// W-COCKPIT P-A-3 -- cockpit-local sub-header.
//
// SD-4: Agent dropdown now populated from tenant-scoped agents passed in by
// CockpitShell. Geo dropdown stays empty until Phase B (needs treb_areas /
// municipalities / communities / neighbourhoods data path -- those are already
// in the parent page, but Phase B chooses the right interaction shape).

'use client'

import { Users, MapPin, Building2, Activity, Play, Settings } from 'lucide-react'
import { useCockpit, type CockpitTab } from './CockpitContext'

const TABS: { id: CockpitTab; label: string; icon: typeof Users }[] = [
  { id: 'people',     label: 'People',     icon: Users },
  { id: 'territory',  label: 'Territory',  icon: MapPin },
  { id: 'inventory',  label: 'Inventory',  icon: Building2 },
  { id: 'live',       label: 'Live',       icon: Activity },
  { id: 'simulator',  label: 'Simulator',  icon: Play },
  { id: 'settings',   label: 'Settings',   icon: Settings },
]

interface Props {
  agents: { id: string; full_name: string }[]
}

export default function CockpitSubHeader({ agents }: Props) {
  const { activeTab, setActiveTab, agentId, setAgentId, geoScopeType, geoScopeId, setGeo } = useCockpit()

  return (
    <div className="sticky top-[57px] z-20 bg-white border-b border-gray-200">
      {/* Selector row */}
      <div className="px-6 py-2 flex items-center gap-3 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Scope</span>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Agent</label>
          <select
            value={agentId ?? ''}
            onChange={e => setAgentId(e.target.value || null)}
            className="text-sm border border-gray-200 rounded px-2 py-1 bg-white"
          >
            <option value="">All agents ({agents.length})</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Geo</label>
          <select
            value={geoScopeType && geoScopeId ? `${geoScopeType}:${geoScopeId}` : ''}
            onChange={e => {
              const v = e.target.value
              if (!v) { setGeo(null, null); return }
              const [type, id] = v.split(':') as [string, string]
              setGeo(type as any, id)
            }}
            className="text-sm border border-gray-200 rounded px-2 py-1 bg-white"
          >
            <option value="">All geos</option>
            {/* Phase B populates real options */}
          </select>
        </div>

        {(agentId || geoScopeId) && (
          <button
            type="button"
            onClick={() => { setAgentId(null); setGeo(null, null) }}
            className="ml-auto text-xs text-gray-500 hover:text-gray-900"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Tab strip */}
      <nav className="px-6 flex gap-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = id === activeTab
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={
                'flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ' +
                (active
                  ? 'border-green-600 text-green-700'
                  : 'border-transparent text-gray-600 hover:text-gray-900')
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
