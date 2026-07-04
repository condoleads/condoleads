// components/PlaceSchema.tsx
//
// W-MARKETING A-UNIT-2 PHASE 2 (2026-07-04): Place-family JSON-LD emitter
// for geo pages (area / municipality / community / neighbourhood).
//
// @type per level (VERIFIED table + column mapping this session):
//   treb_areas      → AdministrativeArea
//   municipalities  → City
//   communities     → Place  (generic — schema.org's `Neighborhood` is
//                             US-centric)
//   neighbourhoods  → Place
//
// EMITS: @type, name, url, containedInPlace (recursive chain up).
// OMITS: geo, address, description — none of the four geo tables have
// lat/lng, street address, or a description column (VERIFIED
// information_schema this session — treb_areas 13 cols, municipalities
// 14, communities 13, neighbourhoods 8). Never fabricate.
//
// SEO-scope gate: isSeoEnabledTenant() (shipped e3d229f). Returns null
// for tenants with seo_enabled=false and for non-tenant hosts. Multi-
// tenant safe by construction.

import { isSeoEnabledTenant } from '@/lib/utils/seo-scope'

export type PlaceType =
  | 'AdministrativeArea'
  | 'City'
  | 'Place'

// Recursive Place representation. `containedInPlace` chains up to the
// parent geo; a top-level area has no parent → containedInPlace omitted.
export interface PlaceNode {
  type: PlaceType
  name: string
  url: string
  containedInPlace?: PlaceNode | null
}

interface Props {
  place: PlaceNode
}

function serialize(node: PlaceNode): Record<string, unknown> {
  const out: Record<string, unknown> = {
    '@type': node.type,
    name: node.name,
    url: node.url,
  }
  if (node.containedInPlace) {
    out.containedInPlace = serialize(node.containedInPlace)
  }
  return out
}

export default async function PlaceSchema({ place }: Props) {
  if (!(await isSeoEnabledTenant())) return null
  if (!place || !place.name || !place.url) return null

  const schema = {
    '@context': 'https://schema.org',
    ...serialize(place),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
