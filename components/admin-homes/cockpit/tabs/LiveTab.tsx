// components/admin-homes/cockpit/tabs/LiveTab.tsx
// W-COCKPIT P-A-3 -- Lens 4 mounts AdminHomesLeadsClient with tenant-scoped
// leads (full select w/ relations), activities map, agents filter list, and
// tenant brand identity for display strings + CSV filename.
//
// Phase B will add the "Why?" routing-chain reveal per lead row.

'use client'

import AdminHomesLeadsClient from '@/components/admin-homes/AdminHomesLeadsClient'

export interface LiveTabProps {
  leads: any[]
  activities: Record<string, any[]>
  agents: { id: string; full_name: string; email: string }[]
  initialExpanded: boolean
  initialShowTerminal: boolean
  tenantBrandName: string | null
  tenantDomain: string | null
  currentRole: 'admin' | 'manager' | 'agent'
  currentAgentId: string | null
}

export default function LiveTab({
  leads,
  activities,
  agents,
  initialExpanded,
  initialShowTerminal,
  tenantBrandName,
  tenantDomain,
  currentRole,
  currentAgentId,
}: LiveTabProps) {
  return (
    <AdminHomesLeadsClient
      initialLeads={leads}
      initialActivities={activities}
      agents={agents}
      currentRole={currentRole}
      currentAgentId={currentAgentId}
      initialExpanded={initialExpanded}
      initialShowTerminal={initialShowTerminal}
      tenantBrandName={tenantBrandName}
      tenantDomain={tenantDomain}
    />
  )
}
