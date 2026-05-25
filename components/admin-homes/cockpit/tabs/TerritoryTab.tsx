'use client'
// components/admin-homes/cockpit/tabs/TerritoryTab.tsx
// W-TERRITORY-OPS T1-1 -- chart dropped; rebuild-in-progress banner mounted.
// TerritoryClient (legacy Coverage/Matrix/Audit) remains fully functional below
// the banner so operators retain capability while T1-2..T1-6 ship the new
// Health / Agents / Cards / Geography views.
import TerritoryClient from '@/components/admin-homes/TerritoryClient'
import { Construction } from 'lucide-react'

interface Props { tenantId: string; tenantName: string }

export default function TerritoryTab({ tenantId, tenantName }: Props) {
  return (
    <div>
      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <Construction className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-amber-900">
              Territory operations dashboard &mdash; rebuild in progress
            </p>
            <p className="mt-1 text-amber-800">
              The new Health, Agents, Cards, and Geography views are being
              built. Until then, the Coverage / Matrix / Audit views below
              remain fully functional.
            </p>
          </div>
        </div>
      </div>
      <TerritoryClient tenantId={tenantId} tenantName={tenantName} seeAll={false} />
    </div>
  )
}
