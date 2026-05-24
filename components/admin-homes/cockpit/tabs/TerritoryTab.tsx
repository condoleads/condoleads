'use client'
// components/admin-homes/cockpit/tabs/TerritoryTab.tsx
// W-COCKPIT P-B-2 Commit 2 -- Chart/Detail toggle.
// Chart (default): 2D React Flow cascade with drag-to-reassign.
// Detail: existing TerritoryClient (Coverage/Matrix/Audit) untouched.

import { useState } from 'react'
import TerritoryClient from '@/components/admin-homes/TerritoryClient'
import TerritoryCascadeChart from '@/components/admin-homes/cockpit/territory/TerritoryCascadeChart'
import { Network, Table } from 'lucide-react'

interface Props { tenantId: string; tenantName: string }

export default function TerritoryTab({ tenantId, tenantName }: Props) {
  const [view, setView] = useState<'chart' | 'detail'>('chart')
  return (
    <div>
      <div className="flex justify-end mb-3">
        <div className="inline-flex rounded-md shadow-sm border border-gray-200 bg-white" role="group">
          <button
            type="button"
            onClick={() => setView('chart')}
            className={
              'px-3 py-1.5 text-xs font-medium rounded-l-md flex items-center gap-1.5 ' +
              (view === 'chart' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50')
            }
          >
            <Network className="w-3.5 h-3.5" /> Chart
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
      {view === 'chart'
        ? <TerritoryCascadeChart tenantId={tenantId} tenantName={tenantName} />
        : <TerritoryClient tenantId={tenantId} tenantName={tenantName} seeAll={false} />}
    </div>
  )
}