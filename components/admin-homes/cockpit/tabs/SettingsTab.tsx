// components/admin-homes/cockpit/tabs/SettingsTab.tsx
// W-COCKPIT P-A-2 — Lens 6 (Settings). Mounts the existing tenant-wide
// configuration surfaces unchanged: VIP Access Config summary card +
// TenantGeoAssignmentSection (tenant restrictions).
//
// This is the only tab that ships with functional content in P-A-2. Other
// tabs render placeholders (filled in Phase B/C). Settings preserves all
// existing tenant-admin functionality with zero behaviour change.

'use client'

import Link from 'next/link'
import TenantGeoAssignmentSection from '@/components/admin-homes/TenantGeoAssignmentSection'

interface GeoItem { id: string; name: string; slug: string }
interface MuniItem extends GeoItem { area_id: string }
interface CommItem extends GeoItem { municipality_id: string }
interface NeighItem extends GeoItem { area_id: string }

interface Restriction {
  id?: string
  scope: string
  area_id?: string | null
  municipality_id?: string | null
  community_id?: string | null
  neighbourhood_id?: string | null
  condo_access?: boolean
  homes_access?: boolean
  buildings_access?: boolean
  is_active?: boolean
}

interface TenantSummary {
  id: string
  name: string
  brand_name: string | null
  ai_free_messages: number | null
  ai_auto_approve_limit: number | null
  ai_manual_approve_limit: number | null
  ai_hard_cap: number | null
  vip_auto_approve: boolean | null
}

export interface SettingsTabProps {
  tenant: TenantSummary
  areas: GeoItem[]
  municipalities: MuniItem[]
  communities: CommItem[]
  neighbourhoods: NeighItem[]
  currentRestrictions: Restriction[]
}

export default function SettingsTab({
  tenant, areas, municipalities, communities, neighbourhoods, currentRestrictions,
}: SettingsTabProps) {
  return (
    <div className="space-y-6">
      {/* VIP Access Config summary card (verbatim port from previous page) */}
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="font-semibold text-gray-900 mb-3">{'\u2728'} VIP Access Config</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-700">{tenant.ai_free_messages ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">Free Plans</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-700">{tenant.ai_auto_approve_limit ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">Auto-Approve</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-purple-700">{tenant.ai_manual_approve_limit ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">Manual Approve</div>
          </div>
          <div className="bg-orange-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-orange-700">{tenant.ai_hard_cap ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">Hard Cap</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-gray-700">{tenant.vip_auto_approve ? '\u2713' : '\u2717'}</div>
            <div className="text-xs text-gray-500 mt-1">Auto-Approve On</div>
          </div>
        </div>
        <div className="mt-3">
          <Link href="/admin-homes/tenants" className="text-xs text-green-600 hover:underline">
            Edit VIP config {'\u2192'} Edit Tenant
          </Link>
        </div>
      </div>

      {/* Territory restrictions — existing component mounted verbatim */}
      <TenantGeoAssignmentSection
        tenantId={tenant.id}
        areas={areas}
        municipalities={municipalities}
        communities={communities}
        neighbourhoods={neighbourhoods}
        currentRestrictions={currentRestrictions as any}
      />
    </div>
  )
}
