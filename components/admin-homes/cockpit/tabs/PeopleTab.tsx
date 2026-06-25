// components/admin-homes/cockpit/tabs/PeopleTab.tsx
// W-COCKPIT P-B-1 -- Lens 1 now has Chart/Table view toggle.
//
// Chart view (default): mounts the existing AgentOrgChart (React Flow + dagre,
// shipped Phase 3.3b) scoped to the URL tenant. Node click updates spine
// agentId so other lenses (Live, Territory once Phase B lands fully) filter
// in response. Drag-to-reassign hierarchy stays enabled per locked decision
// (the cockpit IS the ownership-graph design surface).
//
// Table view: existing AgentsManagementClient unchanged (P-A-3 mount).
//
// Both views share the same tenant-scoped agents array fetched in the parent
// page; AgentOrgChart fetches its own enriched tree (lead_count_30d, role
// derived flags) via /api/admin-homes/agents/tree-data?tenant_id=<id>.

'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Users, Network } from 'lucide-react'
import AgentsManagementClient from '@/components/admin-homes/AgentsManagementClient'
import { useCockpit } from '../CockpitContext'

// AgentOrgChart uses React Flow which is browser-only -- dynamic import with
// ssr: false matches the standalone /admin-homes/agents/tree route pattern.
const AgentOrgChart = dynamic(
  () => import('@/components/admin-homes/AgentOrgChart'),
  { ssr: false, loading: () => <div className="p-8 text-gray-500">Loading org chart…</div> }
)

interface Agent {
  id: string
  full_name: string
  email: string
  cell_phone: string | null
  profile_photo_url: string | null
  is_active: boolean
  parent_id: string | null
  can_create_children: boolean
  tenant_id: string | null
  notification_email: string | null
  brokerage_name: string | null
  title: string | null
  created_at: string
  total_leads: number
  new_leads: number
  hot_leads: number
  geo_territories: number
  assigned_buildings: number
  subdomain: string
}

interface Tenant { id: string; name: string; domain: string }

export interface PeopleTabProps {
  agents: Agent[]
  tenants: Tenant[]
}

interface MountProps extends PeopleTabProps {
  tenantId: string
  tenantName: string
  tenantBrandName: string | null
  tenantDomain: string | null
  // W-COCKPIT-PARITY UNIT 12: closes UNIT 3 + UNIT 10 cockpit gaps. Both
  // optional with safe falsy defaults — when threaded through (cockpit
  // server page provides them today), AgentsManagementClient renders the
  // owner-header + Crown pill and EditAgentModal renders the opt-out
  // toggle, matching standalone /admin-homes/agents parity.
  tenantDefaultAgentId?: string | null
  canSetOversightOptOut?: boolean
}

type View = 'chart' | 'table'

export default function PeopleTab({ agents, tenants, tenantId, tenantName, tenantBrandName, tenantDomain, tenantDefaultAgentId = null, canSetOversightOptOut = false }: MountProps) {
  const [view, setView] = useState<View>('chart')
  const { agentId, setAgentId } = useCockpit()

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {agents.length} {agents.length === 1 ? 'agent' : 'agents'} in {tenantName}
        </div>
        <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setView('chart')}
            className={
              'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-r border-gray-200 transition-colors ' +
              (view === 'chart'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-600 hover:text-gray-900')
            }
          >
            <Network className="w-4 h-4" />
            Chart
          </button>
          <button
            type="button"
            onClick={() => setView('table')}
            className={
              'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ' +
              (view === 'table'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-600 hover:text-gray-900')
            }
          >
            <Users className="w-4 h-4" />
            Table
          </button>
        </div>
      </div>

      {/* Active view */}
      {view === 'chart' && (
        <AgentOrgChart
          tenantId={tenantId}
          onAgentSelect={(id) => setAgentId(id)}
          selectedAgentId={agentId}
        />
      )}
      {view === 'table' && (
        <AgentsManagementClient
          agents={agents}
          tenants={tenants}
          tenantName={tenantName}
          tenantBrandName={tenantBrandName}
          tenantDomain={tenantDomain}
          tenantId={tenantId}
          tenantDefaultAgentId={tenantDefaultAgentId}
          canSetOversightOptOut={canSetOversightOptOut}
        />
      )}
    </div>
  )
}
