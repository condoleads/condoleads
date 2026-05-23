// components/admin-homes/cockpit/tabs/TerritoryTab.tsx
// W-COCKPIT P-A-2 — Lens 2 placeholder. Phase B mounts the existing
// TerritoryClient (Coverage + Matrix + Audit) scoped by tenantId,
// alongside the new geo map view.

'use client'

import { MapPin } from 'lucide-react'

interface Props { tenantId: string; tenantName: string }

export default function TerritoryTab({ tenantName }: Props) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
      <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <h3 className="text-lg font-semibold text-gray-800 mb-1">Territory — {tenantName}</h3>
      <p className="text-sm text-gray-500 max-w-md mx-auto">
        Geographic claim map + existing Coverage table + Matrix view + Audit log.
        Phase B mounts the existing TerritoryClient scoped to this tenant, plus the new polygon map visualization.
      </p>
    </div>
  )
}
