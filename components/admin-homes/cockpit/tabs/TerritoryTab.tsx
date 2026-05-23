// components/admin-homes/cockpit/tabs/TerritoryTab.tsx
// W-COCKPIT P-A-3 -- Lens 2 mounts TerritoryClient scoped to the URL tenant.
//
// seeAll=false: cockpit is always tenant-scoped (URL has tenant id).
// Platform admin who wants cross-tenant view uses /admin-homes/territory
// (the universal route, unchanged).

'use client'

import TerritoryClient from '@/components/admin-homes/TerritoryClient'

interface Props { tenantId: string; tenantName: string }

export default function TerritoryTab({ tenantId, tenantName }: Props) {
  return (
    <TerritoryClient
      tenantId={tenantId}
      tenantName={tenantName}
      seeAll={false}
    />
  )
}
