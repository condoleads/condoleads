// components/admin-homes/cockpit/tabs/PeopleTab.tsx
// W-COCKPIT P-A-3 -- Lens 1 mounts AgentsManagementClient with tenant-scoped
// agents (enriched with leads/territory/building counts) + a one-element tenants[]
// array. Phase B replaces this with a visual org chart but keeps the flat list
// available as an alternate view.

'use client'

import AgentsManagementClient from '@/components/admin-homes/AgentsManagementClient'

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
}

export default function PeopleTab({ agents, tenants, tenantId, tenantName, tenantBrandName, tenantDomain }: MountProps) {
  return (
    <AgentsManagementClient
      agents={agents}
      tenants={tenants}
      tenantName={tenantName}
      tenantBrandName={tenantBrandName}
      tenantDomain={tenantDomain}
      tenantId={tenantId}
    />
  )
}
