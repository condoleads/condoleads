// components/admin-homes/cockpit/tabs/InventoryTab.tsx
// W-COCKPIT P-A-2 — Lens 3 placeholder. Phase B mounts a tenant-wide
// dual-tab view (Buildings | Listings) showing every manual pin across all
// agents in the tenant, with attribution and override-of-geo badges.

'use client'

import { Building2 } from 'lucide-react'

interface Props { tenantId: string }

export default function InventoryTab({}: Props) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
      <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <h3 className="text-lg font-semibold text-gray-800 mb-1">Inventory</h3>
      <p className="text-sm text-gray-500 max-w-md mx-auto">
        All manually-pinned buildings and listings for this tenant, with attribution per agent.
        Phase B builds the tenant-wide aggregation view.
      </p>
    </div>
  )
}
