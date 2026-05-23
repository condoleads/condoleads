// components/admin-homes/cockpit/CockpitShell.tsx
// W-COCKPIT P-A-2 — cockpit shell, wraps everything in the per-tenant cockpit.
//
// Responsibilities:
//   1. Provide CockpitContext (selection state)
//   2. Render CockpitSubHeader (selectors + tab strip)
//   3. Render the active tab's content
//
// All tenant-scoped data fetched server-side is passed in as props from the
// page server component (`app/admin-homes/tenants/[id]/page.tsx`).
// Tabs that need additional data fetch it client-side scoped by tenantId.

'use client'

import { CockpitProvider, useCockpit } from './CockpitContext'
import CockpitSubHeader from './CockpitSubHeader'
import PeopleTab from './tabs/PeopleTab'
import TerritoryTab from './tabs/TerritoryTab'
import InventoryTab from './tabs/InventoryTab'
import LiveTab from './tabs/LiveTab'
import SimulatorTab from './tabs/SimulatorTab'
import SettingsTab, { type SettingsTabProps } from './tabs/SettingsTab'

export interface CockpitShellProps {
  tenantId: string
  tenantName: string
  settings: SettingsTabProps
}

function CockpitInner({ tenantId, tenantName, settings }: CockpitShellProps) {
  const { activeTab } = useCockpit()

  return (
    <>
      <CockpitSubHeader />
      <div className="p-6">
        {activeTab === 'people'    && <PeopleTab    tenantId={tenantId} tenantName={tenantName} />}
        {activeTab === 'territory' && <TerritoryTab tenantId={tenantId} tenantName={tenantName} />}
        {activeTab === 'inventory' && <InventoryTab tenantId={tenantId} />}
        {activeTab === 'live'      && <LiveTab      tenantId={tenantId} />}
        {activeTab === 'simulator' && <SimulatorTab tenantId={tenantId} />}
        {activeTab === 'settings'  && <SettingsTab  {...settings} />}
      </div>
    </>
  )
}

export default function CockpitShell(props: CockpitShellProps) {
  return (
    <CockpitProvider initialTab="people">
      <CockpitInner {...props} />
    </CockpitProvider>
  )
}
