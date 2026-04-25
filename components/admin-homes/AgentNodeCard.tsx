// components/admin-homes/AgentNodeCard.tsx
// Phase 3.3b — custom node renderer for the org chart.
// Used by React Flow as a `nodeTypes` entry.

'use client'

import { Handle, Position } from 'reactflow'

export interface AgentNodeData {
  name: string
  role: string
  is_admin: boolean
  is_selling: boolean
  profile_photo_url: string | null
  lead_count_30d: number
  dimmed?: boolean
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  tenant_admin: { label: 'Tenant Admin', color: 'bg-purple-600' },
  assistant:    { label: 'Assistant',    color: 'bg-purple-500' },
  support:      { label: 'Support',      color: 'bg-slate-500' },
  area_manager: { label: 'Area Manager', color: 'bg-indigo-600' },
  manager:      { label: 'Manager',      color: 'bg-blue-600' },
  managed:      { label: 'Managed',      color: 'bg-green-700' },
  agent:        { label: 'Agent',        color: 'bg-green-600' },
}

export default function AgentNodeCard({ data }: { data: AgentNodeData }) {
  const role = ROLE_LABELS[data.role] || ROLE_LABELS.agent
  const initials = data.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase()

  return (
    <div
      className={`bg-white rounded-lg shadow-md border border-gray-200 px-3 py-2 min-w-[200px] transition ${
        data.dimmed ? 'opacity-30' : 'opacity-100'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      <div className="flex items-center gap-2">
        {data.profile_photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.profile_photo_url}
            alt={data.name}
            className="w-10 h-10 rounded-full object-cover bg-gray-100"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 font-semibold text-sm">
            {initials || '?'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900 truncate">{data.name}</div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`text-[10px] font-medium text-white px-1.5 py-0.5 rounded-full ${role.color}`}>
              {role.label}
            </span>
            <span
              className={`w-2 h-2 rounded-full ${data.is_selling ? 'bg-green-500' : 'bg-gray-300'}`}
              title={data.is_selling ? 'Selling' : 'Non-selling'}
            />
          </div>
        </div>
        <div className="text-[10px] text-gray-500 text-right">
          <div className="font-semibold text-gray-900">{data.lead_count_30d}</div>
          <div>leads/30d</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  )
}