// components/admin-homes/AgentDetailDrawer.tsx
// Phase 3.3b — side drawer that opens on node click in the org chart.

'use client'

import Link from 'next/link'
import { X } from 'lucide-react'
import type { AgentNodeData } from './AgentNodeCard'

const ROLE_LABELS: Record<string, string> = {
  tenant_admin: 'Tenant Admin',
  assistant:    'Assistant',
  support:      'Support',
  area_manager: 'Area Manager',
  manager:      'Manager',
  managed:      'Managed',
  agent:        'Agent',
}

export default function AgentDetailDrawer({
  agentId,
  data,
  onClose,
}: {
  agentId: string | null
  data: AgentNodeData | null
  onClose: () => void
}) {
  if (!agentId || !data) return null

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl border-l border-gray-200 z-40 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Agent Detail</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="flex items-center gap-3">
          {data.profile_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.profile_photo_url} alt={data.name} className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 font-semibold text-lg">
              {data.name.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-base font-semibold text-gray-900">{data.name}</div>
            <div className="text-sm text-gray-500">{ROLE_LABELS[data.role] || data.role}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Capability" value={data.is_admin ? 'Admin' : 'Non-admin'} />
          <Stat label="Visibility" value={data.is_selling ? 'Selling (public)' : 'Internal'} />
          <Stat label="Leads (30d)" value={String(data.lead_count_30d)} />
        </div>

        <Link
          href={`/admin-homes/agents/${agentId}`}
          className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md"
        >
          Open full agent page →
        </Link>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{label}</div>
      <div className="text-sm font-semibold text-gray-900 mt-0.5">{value}</div>
    </div>
  )
}