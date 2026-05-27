'use client'
// components/admin-homes/cockpit/territory/ActAsAgentPicker.tsx
// W-TERRITORY-MASTER P5.2c-followup-2.
// Shared component: lets a Platform Admin (who has no agent identity) pick
// a tenant agent to act as for pin/assign workflows.
// Renders only when actingAgentId is null. Lists selling agents in the
// current tenant via the existing /agents-for-pinning endpoint.

import { useEffect, useState } from 'react'
import { UserCheck } from 'lucide-react'

interface AgentOption {
  id: string
  full_name: string
  is_active: boolean
  is_selling: boolean
}

interface Props {
  tenantId: string
  value: string
  onChange: (id: string) => void
}

export default function ActAsAgentPicker({ tenantId, value, onChange }: Props) {
  const [agents, setAgents] = useState<AgentOption[]>([])

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin-homes/territory/pins/agents-for-pinning?tenant_id=${encodeURIComponent(tenantId)}`)
        if (!res.ok) return
        const body = await res.json()
        setAgents(body.data || [])
      } catch { /* non-fatal */ }
    })()
  }, [tenantId])

  const selling = agents.filter(a => a.is_active && a.is_selling)

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="flex items-start gap-2">
        <UserCheck className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <div className="text-xs font-semibold text-amber-900 mb-1">Platform Admin: act as agent</div>
          <div className="text-[11px] text-amber-800 mb-2">
            You have no agent identity in this tenant. Pick an agent to act on their behalf. Audit rows credit the picked agent.
          </div>
          <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-amber-300 rounded bg-white"
          >
            <option value="">- pick an agent to act as -</option>
            {selling.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}