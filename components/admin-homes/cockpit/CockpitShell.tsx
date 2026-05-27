// components/admin-homes/cockpit/CockpitShell.tsx
// W-COCKPIT P-A-3 -- cockpit shell, threads server-fetched data to tabs.
//
// Responsibilities:
//   1. Provide CockpitContext (selection state)
//   2. Render CockpitSubHeader (selectors + tab strip; receives agents list for dropdown)
//   3. Render the active tab's content, passing its tenant-scoped data bundle

'use client'

import { CockpitProvider, useCockpit } from './CockpitContext'
import CockpitSubHeader from './CockpitSubHeader'
import PeopleTab, { type PeopleTabProps } from './tabs/PeopleTab'
import TerritoryTab from './tabs/TerritoryTab'
import InventoryTab from './tabs/InventoryTab'
import LiveTab, { type LiveTabProps } from './tabs/LiveTab'
import SimulatorTab from './tabs/SimulatorTab'
import SettingsTab, { type SettingsTabProps } from './tabs/SettingsTab'

export interface CockpitShellProps {
  tenantId: string
  tenantName: string
  tenantBrandName: string | null
  tenantDomain: string | null
  currentRole: 'admin' | 'manager' | 'agent' | 'area_manager' | 'tenant_admin'
  currentAgentId: string | null
  people: PeopleTabProps
  live: Omit<LiveTabProps, 'tenantBrandName' | 'tenantDomain' | 'currentRole' | 'currentAgentId'>
  settings: SettingsTabProps
}

function CockpitInner({
  tenantId,
  tenantName,
  tenantBrandName,
  tenantDomain,
  currentRole,
  currentAgentId,
  people,
  live,
  settings,
}: CockpitShellProps) {
  const { activeTab } = useCockpit()

  // Lean shape for the sub-header's Agent dropdown (id + name only).
  const agentsForDropdown = people.agents.map(a => ({ id: a.id, full_name: a.full_name }))

  return (
    <>
      <CockpitSubHeader agents={agentsForDropdown} />
      <div className="p-6">
        {activeTab === 'people'    && <PeopleTab    {...people} tenantName={tenantName} tenantBrandName={tenantBrandName} tenantDomain={tenantDomain} tenantId={tenantId} />}
        {activeTab === 'territory' && <TerritoryTab tenantId={tenantId} tenantName={tenantName} actingAgentId={currentAgentId} />}
        {activeTab === 'inventory' && <InventoryTab tenantId={tenantId} />}
        {activeTab === 'live'      && <LiveTab      {...live} tenantBrandName={tenantBrandName} tenantDomain={tenantDomain} currentRole={normalizeRole(currentRole)} currentAgentId={currentAgentId} />}
        {activeTab === 'simulator' && <SimulatorTab tenantId={tenantId} />}
        {activeTab === 'settings'  && <SettingsTab  {...settings} />}
      </div>
    </>
  )
}

// AdminHomesLeadsClient currently types currentRole as 'admin' | 'manager' | 'agent'.
// Map area_manager/tenant_admin down to 'admin' for that prop until W6+ broadens the type.
function normalizeRole(r: CockpitShellProps['currentRole']): 'admin' | 'manager' | 'agent' {
  if (r === 'manager' || r === 'agent') return r
  return 'admin'
}

export default function CockpitShell(props: CockpitShellProps) {
  return (
    <CockpitProvider initialTab="people">
      <CockpitInner {...props} />
    </CockpitProvider>
  )
}
