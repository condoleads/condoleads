// components/admin-homes/cockpit/tabs/PeopleTab.tsx
// W-COCKPIT P-A-2 — Lens 1 placeholder. Phase B wires the visual org chart
// (replacing this placeholder with a tenant-scoped org tree + clickable nodes
// that update the spine's agentId).

'use client'

import { Users } from 'lucide-react'

interface Props { tenantId: string; tenantName: string }

export default function PeopleTab({ tenantName }: Props) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
      <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <h3 className="text-lg font-semibold text-gray-800 mb-1">People — {tenantName}</h3>
      <p className="text-sm text-gray-500 max-w-md mx-auto">
        Tenant-scoped org chart with managers and managed agents.
        Phase B will mount the visual hierarchy here. Selecting a node will scope all other lenses to that agent.
      </p>
    </div>
  )
}
