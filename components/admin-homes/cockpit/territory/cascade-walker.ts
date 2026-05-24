// components/admin-homes/cockpit/territory/cascade-walker.ts
// W-COCKPIT P-B-2 Commit 2b: pure cascade-walk math, no React.
//
// Given the data returned by /api/admin-homes/territory/cascade-tree, compute
// for every geo node:
//   - effectiveAgent: who actually routes for this node
//   - sourceLevel:    where in the cascade that decision came from
//   - state:          ASSIGNED / PHANTOM / INHERITED
//   - accessBadges:   per-type (condo/homes/bldg) badge state at this level
//
// A card is "functional" if any of condo_access/homes_access/buildings_access
// is true. A card with all three false is PHANTOM -- it occupies the slot
// but routes nothing; the walker skips it and looks higher.

export type NodeState = 'ASSIGNED' | 'PHANTOM' | 'INHERITED'
export type SourceLevel = 'community' | 'municipality' | 'area' | 'tenant'
export type BadgeState = 'active' | 'inherited' | 'phantom'

export interface GeoCardLite {
  id: string
  agent_id: string
  scope: string
  area_id: string | null
  municipality_id: string | null
  community_id: string | null
  neighbourhood_id: string | null
  is_primary: boolean
  condo_access: boolean
  homes_access: boolean
  buildings_access: boolean
  buildings_mode: string  // C2b: structural match with chart's GeoCard (passthrough; walker does not read this)
}

export interface AgentLite {
  id: string
  full_name: string
  is_selling: boolean
  is_active: boolean
}

export interface TenantLite {
  id: string
  name: string
  default_agent_id: string | null
}

export interface CardLookups {
  areaCardByGeo: Map<string, GeoCardLite>
  muniCardByGeo: Map<string, GeoCardLite>
  commCardByGeo: Map<string, GeoCardLite>
}

export interface WalkResult {
  effectiveAgentId: string | null
  effectiveAgentName: string
  sourceLevel: SourceLevel
  state: NodeState
  cardAtThisLevel: GeoCardLite | null    // the card at the node itself (may be phantom)
  accessBadges: { condo: BadgeState; homes: BadgeState; bldg: BadgeState }
}

export function buildLookups(cards: GeoCardLite[]): CardLookups {
  const areaCardByGeo = new Map<string, GeoCardLite>()
  const muniCardByGeo = new Map<string, GeoCardLite>()
  const commCardByGeo = new Map<string, GeoCardLite>()
  for (const c of cards) {
    if (c.scope === 'area' && c.area_id) areaCardByGeo.set(c.area_id, c)
    if (c.scope === 'municipality' && c.municipality_id) muniCardByGeo.set(c.municipality_id, c)
    if (c.scope === 'community' && c.community_id) commCardByGeo.set(c.community_id, c)
  }
  return { areaCardByGeo, muniCardByGeo, commCardByGeo }
}

export function isFunctional(card: GeoCardLite | null | undefined): boolean {
  if (!card) return false
  return card.condo_access || card.homes_access || card.buildings_access
}

interface WalkContext {
  lookups: CardLookups
  tenant: TenantLite
  agents: AgentLite[]
  // Parent resolution maps (built once by caller).
  muniIdToAreaId: Map<string, string>
  commIdToMuniId: Map<string, string>
}

function tenantFallback(ctx: WalkContext): { agentId: string | null; name: string } {
  const def = ctx.tenant.default_agent_id
    ? ctx.agents.find(a => a.id === ctx.tenant.default_agent_id) || null
    : null
  if (def) return { agentId: def.id, name: def.full_name }
  const selling = ctx.agents.filter(a => a.is_active && a.is_selling)
  if (selling.length === 0) return { agentId: null, name: 'NO SELLING AGENTS' }
  if (selling.length === 1) return { agentId: selling[0].id, name: selling[0].full_name }
  return { agentId: null, name: `equal-distribute over ${selling.length}` }
}

function badgeStateFor(
  flagKey: 'condo_access' | 'homes_access' | 'buildings_access',
  cardAtLevel: GeoCardLite | null,
  parentEffective: WalkResult | null
): BadgeState {
  if (cardAtLevel) {
    if (cardAtLevel[flagKey]) return 'active'
    // Card at this level but flag false: phantom for this type
    return 'phantom'
  }
  // No card here -- inherited
  return 'inherited'
}

export function walkArea(areaId: string, ctx: WalkContext): WalkResult {
  const card = ctx.lookups.areaCardByGeo.get(areaId) || null
  if (card && isFunctional(card)) {
    const ag = ctx.agents.find(a => a.id === card.agent_id)
    return {
      effectiveAgentId: card.agent_id,
      effectiveAgentName: ag?.full_name || '(unknown)',
      sourceLevel: 'area',
      state: 'ASSIGNED',
      cardAtThisLevel: card,
      accessBadges: {
        condo: card.condo_access ? 'active' : 'phantom',
        homes: card.homes_access ? 'active' : 'phantom',
        bldg:  card.buildings_access ? 'active' : 'phantom',
      },
    }
  }
  // Phantom or no card: fall to tenant
  const tf = tenantFallback(ctx)
  return {
    effectiveAgentId: tf.agentId,
    effectiveAgentName: tf.name,
    sourceLevel: 'tenant',
    state: card ? 'PHANTOM' : 'INHERITED',
    cardAtThisLevel: card,
    accessBadges: {
      condo: card ? (card.condo_access ? 'active' : 'phantom') : 'inherited',
      homes: card ? (card.homes_access ? 'active' : 'phantom') : 'inherited',
      bldg:  card ? (card.buildings_access ? 'active' : 'phantom') : 'inherited',
    },
  }
}

export function walkMuni(muniId: string, ctx: WalkContext): WalkResult {
  const card = ctx.lookups.muniCardByGeo.get(muniId) || null
  if (card && isFunctional(card)) {
    const ag = ctx.agents.find(a => a.id === card.agent_id)
    return {
      effectiveAgentId: card.agent_id,
      effectiveAgentName: ag?.full_name || '(unknown)',
      sourceLevel: 'municipality',
      state: 'ASSIGNED',
      cardAtThisLevel: card,
      accessBadges: {
        condo: card.condo_access ? 'active' : 'phantom',
        homes: card.homes_access ? 'active' : 'phantom',
        bldg:  card.buildings_access ? 'active' : 'phantom',
      },
    }
  }
  const parentAreaId = ctx.muniIdToAreaId.get(muniId) || null
  const parent = parentAreaId ? walkArea(parentAreaId, ctx) : { ...walkAreaFallback(ctx) }
  return {
    effectiveAgentId: parent.effectiveAgentId,
    effectiveAgentName: parent.effectiveAgentName,
    sourceLevel: parent.sourceLevel,
    state: card ? 'PHANTOM' : 'INHERITED',
    cardAtThisLevel: card,
    accessBadges: {
      condo: card ? (card.condo_access ? 'active' : 'phantom') : 'inherited',
      homes: card ? (card.homes_access ? 'active' : 'phantom') : 'inherited',
      bldg:  card ? (card.buildings_access ? 'active' : 'phantom') : 'inherited',
    },
  }
}

export function walkComm(commId: string, ctx: WalkContext): WalkResult {
  const card = ctx.lookups.commCardByGeo.get(commId) || null
  if (card && isFunctional(card)) {
    const ag = ctx.agents.find(a => a.id === card.agent_id)
    return {
      effectiveAgentId: card.agent_id,
      effectiveAgentName: ag?.full_name || '(unknown)',
      sourceLevel: 'community',
      state: 'ASSIGNED',
      cardAtThisLevel: card,
      accessBadges: {
        condo: card.condo_access ? 'active' : 'phantom',
        homes: card.homes_access ? 'active' : 'phantom',
        bldg:  card.buildings_access ? 'active' : 'phantom',
      },
    }
  }
  const parentMuniId = ctx.commIdToMuniId.get(commId) || null
  const parent = parentMuniId ? walkMuni(parentMuniId, ctx) : { ...walkAreaFallback(ctx) }
  return {
    effectiveAgentId: parent.effectiveAgentId,
    effectiveAgentName: parent.effectiveAgentName,
    sourceLevel: parent.sourceLevel,
    state: card ? 'PHANTOM' : 'INHERITED',
    cardAtThisLevel: card,
    accessBadges: {
      condo: card ? (card.condo_access ? 'active' : 'phantom') : 'inherited',
      homes: card ? (card.homes_access ? 'active' : 'phantom') : 'inherited',
      bldg:  card ? (card.buildings_access ? 'active' : 'phantom') : 'inherited',
    },
  }
}

function walkAreaFallback(ctx: WalkContext): WalkResult {
  const tf = tenantFallback(ctx)
  return {
    effectiveAgentId: tf.agentId,
    effectiveAgentName: tf.name,
    sourceLevel: 'tenant',
    state: 'INHERITED',
    cardAtThisLevel: null,
    accessBadges: { condo: 'inherited', homes: 'inherited', bldg: 'inherited' },
  }
}

export function buildContext(
  cards: GeoCardLite[],
  tenant: TenantLite,
  agents: AgentLite[],
  geo: {
    municipalities: Array<{ id: string; area_id: string }>
    communities: Array<{ id: string; municipality_id: string }>
  }
): WalkContext {
  return {
    lookups: buildLookups(cards),
    tenant,
    agents,
    muniIdToAreaId: new Map(geo.municipalities.map(m => [m.id, m.area_id])),
    commIdToMuniId: new Map(geo.communities.map(c => [c.id, c.municipality_id])),
  }
}

// ─── Summary computation for the CoverageSummary panel ──────────────────

export interface SummaryCounts {
  areas:          { assigned: number; phantom: number; inheritedShown: number }
  munis:          { assigned: number; phantom: number; inheritedShown: number }
  communities:    { assigned: number; phantom: number; inheritedShown: number }
  neighbourhoods: { cards: number }
  buildings:      { total: number }
  listings:       { pinned: number }
  health:         { phantomCount: number; orphanBuildings: number }
}

export function computeSummary(
  cards: GeoCardLite[],
  buildings: Array<{ municipality_id: string | null }>,
  listings: Array<unknown>,
  ctx: WalkContext,
  shownAreaIds: Set<string>,
  shownMuniIds: Set<string>,
  shownCommIds: Set<string>
): SummaryCounts {
  let areaA = 0, areaP = 0
  let muniA = 0, muniP = 0
  let commA = 0, commP = 0
  let nbhdCards = 0

  for (const c of cards) {
    if (c.scope === 'area') {
      isFunctional(c) ? areaA++ : areaP++
    } else if (c.scope === 'municipality') {
      isFunctional(c) ? muniA++ : muniP++
    } else if (c.scope === 'community') {
      isFunctional(c) ? commA++ : commP++
    } else if (c.scope === 'neighbourhood') {
      nbhdCards++
    }
  }

  const phantomCount = areaP + muniP + commP
  // Orphan building = building's muni has no apa coverage in the tree.
  const orphanBuildings = buildings.filter(b => b.municipality_id && !shownMuniIds.has(b.municipality_id)).length

  return {
    areas:          { assigned: areaA, phantom: areaP, inheritedShown: Math.max(0, shownAreaIds.size - areaA - areaP) },
    munis:          { assigned: muniA, phantom: muniP, inheritedShown: Math.max(0, shownMuniIds.size - muniA - muniP) },
    communities:    { assigned: commA, phantom: commP, inheritedShown: Math.max(0, shownCommIds.size - commA - commP) },
    neighbourhoods: { cards: nbhdCards },
    buildings:      { total: buildings.length },
    listings:       { pinned: listings.length },
    health:         { phantomCount, orphanBuildings },
  }
}
