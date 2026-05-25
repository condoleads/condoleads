'use client'
// components/admin-homes/cockpit/tabs/TerritoryTab.tsx
// W-TERRITORY-OPS T1-2 -- Health/Detail toggle.
// Health (default): the new View 4 operations dashboard driven by resolver_health_check.
// Detail: legacy TerritoryClient (Coverage/Matrix/Audit) -- preserved per Rule Zero
// (no operator regression). Subsequent T1-3..T1-5 will add Agents / Cards / Geography
// toggles next to these two.
import { useState } from 'react'
import TerritoryClient from '@/components/admin-homes/TerritoryClient'
import HealthView from '@/components/admin-homes/cockpit/territory/HealthView'
import { Activity, Table } from 'lucide-react'

interface Props { tenantId: string; tenantName: string }

export default function TerritoryTab({ tenantId, tenantName }: Props) {
  const [view, setView] = useState<'health' | 'detail'>('health')
  return (
    <div>
      <div className="flex justify-end mb-3">
        <div className="inline-flex rounded-md shadow-sm border border-gray-200 bg-white" role="group">
          <button
            type="button"
            onClick={() => setView('health')}
            className={
              'px-3 py-1.5 text-xs font-medium rounded-l-md flex items-center gap-1.5 ' +
              (view === 'health' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50')
            }
          >
            <Activity className="w-3.5 h-3.5" /> Health
          </button>
          <button
            type="button"
            onClick={() => setView('detail')}
            className={
              'px-3 py-1.5 text-xs font-medium rounded-r-md flex items-center gap-1.5 border-l border-gray-200 ' +
              (view === 'detail' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50')
            }
          >
            <Table className="w-3.5 h-3.5" /> Detail
          </button>
        </div>
      </div>
      {view === 'health'
        ? <HealthView tenantId={tenantId} tenantName={tenantName} />
        : <TerritoryClient tenantId={tenantId} tenantName={tenantName} seeAll={false} />}
    </div>
  )
}
