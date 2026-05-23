// components/admin-homes/cockpit/CockpitContext.tsx
// W-COCKPIT P-A-2 — selection-state context for the cockpit spine.
//
// Holds:
//   activeTab        — which lens is selected (people | territory | inventory | live | simulator | settings)
//   agentId          — null (= all agents in tenant) or a specific agent_id
//   geoScopeType     — null | 'area' | 'municipality' | 'community' | 'neighbourhood'
//   geoScopeId       — null (= all geos in tenant) or a specific geo id at that scope
//
// The tenantId itself is NOT in this context — it lives in the URL (`/admin-homes/tenants/[id]`)
// and is read once at the cockpit shell boundary. Changing tenants is a URL navigation,
// not a context update, which prevents accidental cross-tenant state bleed.

'use client'

import { createContext, useContext, useState, useMemo, type ReactNode } from 'react'

export type CockpitTab = 'people' | 'territory' | 'inventory' | 'live' | 'simulator' | 'settings'
export type GeoScopeType = 'area' | 'municipality' | 'community' | 'neighbourhood'

export interface CockpitSelection {
  activeTab: CockpitTab
  agentId: string | null
  geoScopeType: GeoScopeType | null
  geoScopeId: string | null
}

interface CockpitContextValue extends CockpitSelection {
  setActiveTab: (t: CockpitTab) => void
  setAgentId: (id: string | null) => void
  setGeo: (type: GeoScopeType | null, id: string | null) => void
}

const CockpitContext = createContext<CockpitContextValue | null>(null)

export function CockpitProvider({ children, initialTab = 'people' }: { children: ReactNode; initialTab?: CockpitTab }) {
  const [activeTab, setActiveTab] = useState<CockpitTab>(initialTab)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [geoScopeType, setGeoScopeType] = useState<GeoScopeType | null>(null)
  const [geoScopeId, setGeoScopeId] = useState<string | null>(null)

  const setGeo = (type: GeoScopeType | null, id: string | null) => {
    setGeoScopeType(type)
    setGeoScopeId(id)
  }

  const value = useMemo<CockpitContextValue>(() => ({
    activeTab,
    agentId,
    geoScopeType,
    geoScopeId,
    setActiveTab,
    setAgentId,
    setGeo,
  }), [activeTab, agentId, geoScopeType, geoScopeId])

  return <CockpitContext.Provider value={value}>{children}</CockpitContext.Provider>
}

export function useCockpit(): CockpitContextValue {
  const ctx = useContext(CockpitContext)
  if (!ctx) throw new Error('useCockpit must be used inside <CockpitProvider>')
  return ctx
}
