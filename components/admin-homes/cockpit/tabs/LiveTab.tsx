// components/admin-homes/cockpit/tabs/LiveTab.tsx
// W-COCKPIT P-A-2 — Lens 4 placeholder. Phase B mounts the existing
// AdminHomesLeadsClient scoped by tenantId and adds the "Why?" routing-chain
// reveal on every lead row.

'use client'

import { Activity } from 'lucide-react'

interface Props { tenantId: string }

export default function LiveTab({}: Props) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
      <Activity className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <h3 className="text-lg font-semibold text-gray-800 mb-1">Live leads</h3>
      <p className="text-sm text-gray-500 max-w-md mx-auto">
        Real-time lead stream + "Why?" routing-chain reveal per lead.
        Phase B mounts the existing lead workbench scoped to this tenant.
      </p>
    </div>
  )
}
