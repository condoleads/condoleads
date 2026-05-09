// lib/admin-homes/territory-matrix.ts
//
// T4c-2 Phase A -- pure type surface + matrix builder.
//
// CONTRACT
//   - No I/O. No DB. No async. No React. No throws.
//   - Caller (the matrix API route) pre-fetches agents, geos, APA rows, and
//     per-agent can() decisions, then calls buildTerritoryMatrix().
//   - The component holds the result + tracks per-cell edits, then calls
//     serializeMatrixToBulkAssignPayload() on Save to produce the exact
//     payload shape that POST /api/admin-homes/territory/bulk-assign accepts.
//
// MULTITENANT (Rule Zero #1)
//   - Every input must already be tenant-scoped by the caller.
//   - The builder does not consult tenant_id directly -- it trusts that
//     `agents`, `geos`, and `apaRows` are pre-filtered to a single tenant.
//   - The route + component layers enforce the boundary; this file does
//     not re-check (would be a false-sense-of-security re-check).
//
// DESIGN DECISIONS LOCKED v17 (W-TERRITORY tracker, T4c-2 design lock)
//   Q1 = 1: one scope per matrix; columns are geos at the chosen scope.
//   Q2 = 2: cells show presence + primary + (access flags via popover only).
//   Q3 = 1: explicit Save button; one POST commits the whole batch atomically.
//   Q4 = 1: matrix lives in a tab inside TerritoryClient alongside Coverage + Audit.
//
// SCOPE EXTENSIONS (post-v17)
//   T4c-3 Phase 1: mobile responsive layout (component-only).
//   T4c-3 Phase 2: a11y basic floor (component-only).
//   T4c-3 Phase 3: inheritance preview (THIS FILE -- adds 'inherited' presence
//     value + inheritance-fetch contract; serializer auto-excludes inherited
//     cells via existing presence === 'explicit' filter).
//   Still deferred: bulk row actions (T4c-3 Phase 4); cross-agent primary
//     conflict pre-check at edit time (currently surfaces server-side via
//     the bulk-assign 400 response on Save).

import type { DbRole } from '@/lib/admin-homes/permissions'
import type { ApaRow } from '@/lib/admin-homes/apa-diff'

// ============================================================================
// Public type surface
// ============================================================================

export type MatrixScope = 'area' | 'municipality' | 'community' | 'neighbourhood'

/**
 * One row in the matrix = one agent the caller is authorised to view.
 * `can_write` is computed at build time from can(actor, 'agent.write', target).
 * The component disables cell edits when can_write === false.
 */
export interface MatrixAgentRow {
  agent_id: string
  agent_name: string
  agent_role: DbRole | null
  parent_id: string | null
  is_self: boolean
  can_write: boolean
}

/**
 * One column in the matrix = one geographic entity at the chosen scope.
 * `parent_id` / `parent_name` enable column grouping (e.g., communities
 * grouped by municipality) for visual hierarchy without changing data shape.
 */
export interface MatrixGeoColumn {
  geo_id: string
  geo_name: string
  parent_id: string | null
  parent_name: string | null
}

/**
 * Cell state for an (agent, geo) pair at the matrix's scope.
 * `presence: 'empty'` is implicit for missing keys -- the cells map stores
 * only explicit assignments and inherited cells.
 *
 * 'explicit' = this agent's own active APA row at (scope, geo).
 * 'inherited' = this agent's parent has an active APA row at (scope, geo)
 *   AND this agent has no explicit row there. Inherited cells are read-through
 *   visibility only; the serializer filters them out via presence === 'explicit'
 *   so a Save never persists them as the agent's own rows. Editing an inherited
 *   cell flips it to 'explicit' (creating an override).
 */
export interface MatrixCell {
  presence: 'explicit' | 'inherited'
  apa_id: string | null
  is_primary: boolean
  condo_access: boolean
  homes_access: boolean
  buildings_access: boolean
  buildings_mode: string
  inherited_from_agent_id?: string | null
  inherited_from_agent_name?: string | null
}

/**
 * The full matrix payload returned by the API route to the component.
 *
 * `cells` is keyed by `${agent_id}|${geo_id}` for O(1) lookup.
 * Missing keys mean an empty cell (no APA row at this scope/geo for this agent).
 *
 * `preservedRowsByAgent` carries the agent's APA rows at OTHER scopes so the
 * component can pass them through verbatim on Save. The bulk-assign route
 * does a full per-agent diff via computeApaDiff -- if the Save payload only
 * contained current-scope rows, the route would mark all other-scope rows
 * as toDelete. Passing them through preserves them.
 */
export interface TerritoryMatrix {
  scope: MatrixScope
  rows: MatrixAgentRow[]
  columns: MatrixGeoColumn[]
  cells: Record<string, MatrixCell>
  preservedRowsByAgent: Record<string, ApaRow[]>
}

/**
 * Inputs to the pure builder. All fields must be pre-fetched and tenant-scoped
 * by the caller.
 *
 *   - `authorizedAgentIds`: rows the matrix should include. Caller computes
 *     from user.permissions.managedAgentIds + (optionally) user.permissions.agentId.
 *   - `agents`: minimal agent records limited to authorizedAgentIds.
 *   - `geos`: all geo entities at the chosen scope (no row filter -- the matrix
 *     shows the full tenant footprint, edits are gated by can_write per row).
 *   - `apaRowsByAgent`: agent_id -> ApaRow[] across ALL scopes (not just the
 *     chosen one). The builder splits these into chosen-scope (-> cells) and
 *     other-scope (-> preservedRowsByAgent).
 *   - `writeDecisions`: agent_id -> boolean; missing keys treated as false.
 */
export interface MatrixBuildInputs {
  scope: MatrixScope
  authorizedAgentIds: string[]
  callerAgentId: string | null
  agents: ReadonlyArray<{
    id: string
    name: string
    role: DbRole | null
    parent_id: string | null
  }>
  geos: ReadonlyArray<{
    id: string
    name: string
    parent_id: string | null
    parent_name: string | null
  }>
  apaRowsByAgent: Record<string, ApaRow[]>
  writeDecisions: Record<string, boolean>
  inheritedRowsByAgent?: Record<string, ApaRow[]>
  inheritedFromNamesByAgent?: Record<string, string>
}

/**
 * Save-payload shape -- matches POST /api/admin-homes/territory/bulk-assign.
 * `agent_id` and `tenant_id` are added by the route from the target lookup;
 * the client doesn't send them.
 */
export interface ApaRowInput {
  scope: MatrixScope
  area_id: string | null
  municipality_id: string | null
  community_id: string | null
  neighbourhood_id: string | null
  is_primary: boolean
  condo_access: boolean
  homes_access: boolean
  buildings_access: boolean
  buildings_mode: string
}

export interface BulkAssignPayload {
  assignments: Record<string, ApaRowInput[]>
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Returns the geo-column ID an APA row belongs to at the given scope, or null
 * if the row's scope doesn't match (caller filters defensively).
 */
function scopeColumnId(r: ApaRow, scope: MatrixScope): string | null {
  if (r.scope !== scope) return null
  if (scope === 'area') return r.area_id
  if (scope === 'municipality') return r.municipality_id
  if (scope === 'community') return r.community_id
  if (scope === 'neighbourhood') return r.neighbourhood_id
  return null
}

/**
 * Build an ApaRowInput from a (scope, geo_id, cell-state) triple.
 * Sets only the relevant geo FK; other geo FKs are null per the apa schema.
 */
function rowInputForCell(
  scope: MatrixScope,
  geoId: string,
  cell: Pick<MatrixCell, 'is_primary' | 'condo_access' | 'homes_access' | 'buildings_access' | 'buildings_mode'>
): ApaRowInput {
  return {
    scope,
    area_id: scope === 'area' ? geoId : null,
    municipality_id: scope === 'municipality' ? geoId : null,
    community_id: scope === 'community' ? geoId : null,
    neighbourhood_id: scope === 'neighbourhood' ? geoId : null,
    is_primary: cell.is_primary,
    condo_access: cell.condo_access,
    homes_access: cell.homes_access,
    buildings_access: cell.buildings_access,
    buildings_mode: cell.buildings_mode,
  }
}

/**
 * Pass through an existing APA row as an ApaRowInput verbatim, preserving
 * scope and geo FKs. Used for OTHER-scope rows the matrix doesn't edit.
 */
function rowInputFromApaRow(r: ApaRow): ApaRowInput {
  return {
    scope: r.scope as MatrixScope,
    area_id: r.area_id,
    municipality_id: r.municipality_id,
    community_id: r.community_id,
    neighbourhood_id: r.neighbourhood_id,
    is_primary: r.is_primary,
    condo_access: r.condo_access,
    homes_access: r.homes_access,
    buildings_access: r.buildings_access,
    buildings_mode: r.buildings_mode,
  }
}

// ============================================================================
// Public builder
// ============================================================================

/**
 * Pure synchronous matrix builder.
 *
 * Steps:
 *   1. Build rows from authorized agents with can_write decisions baked in.
 *   2. Build columns from the geos provided (caller's responsibility to
 *      pre-filter / pre-sort).
 *   3. Walk APA rows per agent: rows at the chosen scope -> cells map;
 *      rows at OTHER scopes -> preservedRowsByAgent for pass-through on Save.
 *
 * O(A + G + R) where A=agents, G=geos, R=total APA rows.
 */
export function buildTerritoryMatrix(input: MatrixBuildInputs): TerritoryMatrix {
  const rows: MatrixAgentRow[] = input.agents.map(a => ({
    agent_id: a.id,
    agent_name: a.name,
    agent_role: a.role,
    parent_id: a.parent_id,
    is_self: input.callerAgentId !== null && a.id === input.callerAgentId,
    can_write: input.writeDecisions[a.id] === true,
  }))

  const columns: MatrixGeoColumn[] = input.geos.map(g => ({
    geo_id: g.id,
    geo_name: g.name,
    parent_id: g.parent_id,
    parent_name: g.parent_name,
  }))

  const cells: Record<string, MatrixCell> = {}
  const preservedRowsByAgent: Record<string, ApaRow[]> = {}

  for (const agentId of input.authorizedAgentIds) {
    const apa = input.apaRowsByAgent[agentId] || []
    const preserved: ApaRow[] = []

    for (const r of apa) {
      if (r.scope === input.scope) {
        const geoId = scopeColumnId(r, input.scope)
        if (!geoId) continue
        const key = agentId + '|' + geoId
        cells[key] = {
          presence: 'explicit',
          apa_id: r.id ?? null,
          is_primary: r.is_primary,
          condo_access: r.condo_access,
          homes_access: r.homes_access,
          buildings_access: r.buildings_access,
          buildings_mode: r.buildings_mode,
        }
      } else {
        preserved.push(r)
      }
    }

    preservedRowsByAgent[agentId] = preserved
  }

  // Process inherited cells (depth-1 parent walk per F-INHERITANCE-DEPTH-1):
  // for each authorized agent with parent APA rows at the chosen scope, fill
  // in cells where the agent has no explicit row. Explicit always wins.
  const inheritedByAgent = input.inheritedRowsByAgent || {}
  const inheritedNamesByAgent = input.inheritedFromNamesByAgent || {}

  for (const agent of input.agents) {
    if (!agent.parent_id) continue
    const inheritedApa = inheritedByAgent[agent.id] || []
    const parentName = inheritedNamesByAgent[agent.id] ?? null

    for (const r of inheritedApa) {
      if (r.scope !== input.scope) continue
      const geoId = scopeColumnId(r, input.scope)
      if (!geoId) continue
      const key = agent.id + '|' + geoId
      if (cells[key]) continue // explicit always wins

      cells[key] = {
        presence: 'inherited',
        apa_id: r.id ?? null,
        is_primary: r.is_primary,
        condo_access: r.condo_access,
        homes_access: r.homes_access,
        buildings_access: r.buildings_access,
        buildings_mode: r.buildings_mode,
        inherited_from_agent_id: agent.parent_id,
        inherited_from_agent_name: parentName,
      }
    }
  }

  return {
    scope: input.scope,
    rows,
    columns,
    cells,
    preservedRowsByAgent,
  }
}

// ============================================================================
// Public serializer (matrix -> bulk-assign payload)
// ============================================================================

/**
 * Reconstruct a bulk-assign payload from the matrix's current state plus
 * the component's pending edits.
 *
 * `editedCells` is a sparse override map -- only cells the user actually
 * changed. Missing keys fall through to the matrix's initial cell state.
 *
 * `editedAgentIds` limits the payload to agents whose cells were touched.
 * Untouched agents don't appear in the payload at all -- the bulk-assign
 * route only diffs the agents in the payload, leaving everyone else alone.
 *
 * For each edited agent the payload includes:
 *   1. ALL preserved (other-scope) APA rows verbatim (so the route's diff
 *      doesn't mark them as toDelete).
 *   2. ALL chosen-scope cells that resolve to presence === 'explicit' after
 *      applying edits. Cells that were 'explicit' but became 'empty' via
 *      edit are simply omitted -- the route's diff will mark them as
 *      toDelete on its own.
 *
 * Returns the exact shape POST /api/admin-homes/territory/bulk-assign expects.
 */
export function serializeMatrixToBulkAssignPayload(
  matrix: TerritoryMatrix,
  editedCells: Record<string, MatrixCell | null>,
  editedAgentIds: ReadonlyArray<string>
): BulkAssignPayload {
  const assignments: Record<string, ApaRowInput[]> = {}

  for (const agentId of editedAgentIds) {
    const rows: ApaRowInput[] = []

    // 1. Preserved rows (other scopes) -- pass through verbatim.
    const preserved = matrix.preservedRowsByAgent[agentId] || []
    for (const r of preserved) rows.push(rowInputFromApaRow(r))

    // 2. Chosen-scope cells, applying edits as overrides.
    for (const col of matrix.columns) {
      const key = agentId + '|' + col.geo_id
      // edited[key] === null means "user explicitly cleared this cell".
      // Missing key means "no edit -- use initial".
      const edited = key in editedCells ? editedCells[key] : undefined
      const initial = matrix.cells[key]
      const effective: MatrixCell | null =
        edited !== undefined ? edited : initial ?? null

      if (effective && effective.presence === 'explicit') {
        rows.push(rowInputForCell(matrix.scope, col.geo_id, effective))
      }
    }

    assignments[agentId] = rows
  }

  return { assignments }
}

// ============================================================================
// Public utility (cell-key composition)
// ============================================================================

/**
 * Composite key for the cells / editedCells maps. Exported so the API route
 * AND the component build keys the same way without inlining the format.
 */
export function cellKey(agentId: string, geoId: string): string {
  return agentId + '|' + geoId
}

/**
 * Default cell state for a freshly-toggled-on cell. Used by the component
 * when the user clicks an empty cell to assign it.
 */
export function defaultCellState(): MatrixCell {
  return {
    presence: 'explicit',
    apa_id: null,
    is_primary: false,
    condo_access: true,
    homes_access: true,
    buildings_access: true,
    buildings_mode: 'all',
  }
}