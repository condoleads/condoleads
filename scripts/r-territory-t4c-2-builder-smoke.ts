// scripts/r-territory-t4c-2-builder-smoke.ts
//
// T4c-2 Phase A smoke -- pure-function tests for territory-matrix builder + serializer.
// No DB. No async. No I/O. Purely synthetic fixtures through the public API.
//
// Run: npx tsx scripts/r-territory-t4c-2-builder-smoke.ts
//
// Coverage:
//   T1 -- empty inputs -> empty matrix
//   T2 -- builder splits chosen-scope rows -> cells, other-scope rows -> preserved
//   T3 -- writeDecisions propagate; missing key defaults to false
//   T4 -- serializer applies pending edit (override beats initial)
//   T5 -- cell cleared via edit (set to null) -> omitted from payload
//   T6 -- preserved (other-scope) APA rows pass through serializer verbatim
//   T7 -- untouched agents are excluded from the payload (editedAgentIds gates inclusion)
//   T8 -- round-trip: build -> serialize unchanged -> payload contains all original rows
//         (regression sentinel: catches accidental other-scope-row deletion)

import {
  buildTerritoryMatrix,
  serializeMatrixToBulkAssignPayload,
  cellKey,
  defaultCellState,
  type MatrixBuildInputs,
  type MatrixCell,
} from '../lib/admin-homes/territory-matrix'
import type { ApaRow } from '../lib/admin-homes/apa-diff'

interface TestResult { name: string; pass: boolean; detail: string }
const results: TestResult[] = []

// Synthetic fixture IDs (string-only; no DB constraints involved)
const TENANT = 'tenant-test'
const A1 = 'agent-1'
const A2 = 'agent-2'
const C1 = 'comm-1'
const C2 = 'comm-2'
const M1 = 'muni-1'
const AREA1 = 'area-1'

// Helper -- ApaRow with sensible defaults; spread to override any field.
function apa(o: Partial<ApaRow>): ApaRow {
  return {
    agent_id: A1,
    tenant_id: TENANT,
    scope: 'community',
    area_id: null,
    municipality_id: null,
    community_id: null,
    neighbourhood_id: null,
    is_primary: false,
    is_active: true,
    condo_access: true,
    homes_access: true,
    buildings_access: true,
    buildings_mode: 'all',
    ...o,
  }
}

// Helper -- MatrixBuildInputs with empty defaults; spread to override.
function inputs(o: Partial<MatrixBuildInputs> = {}): MatrixBuildInputs {
  return {
    scope: 'community',
    authorizedAgentIds: [],
    callerAgentId: null,
    agents: [],
    geos: [],
    apaRowsByAgent: {},
    writeDecisions: {},
    ...o,
  }
}

// ============================================================================
// T1: empty inputs -> empty matrix
// ============================================================================
{
  const m = buildTerritoryMatrix(inputs())
  results.push({
    name: 'T1: empty inputs -> empty matrix',
    pass:
      m.rows.length === 0 &&
      m.columns.length === 0 &&
      Object.keys(m.cells).length === 0 &&
      Object.keys(m.preservedRowsByAgent).length === 0,
    detail: `rows=${m.rows.length} cols=${m.columns.length} cells=${Object.keys(m.cells).length} preserved=${Object.keys(m.preservedRowsByAgent).length}`,
  })
}

// ============================================================================
// T2: builder splits chosen-scope vs other-scope APA rows
// ============================================================================
{
  const m = buildTerritoryMatrix(inputs({
    scope: 'community',
    authorizedAgentIds: [A1],
    agents: [{ id: A1, name: 'Alice', role: 'agent', parent_id: null }],
    geos: [{ id: C1, name: 'Comm 1', parent_id: M1, parent_name: 'Muni 1' }],
    apaRowsByAgent: {
      [A1]: [
        apa({ id: 'r1', scope: 'community', community_id: C1, is_primary: true }),
        apa({ id: 'r2', scope: 'municipality', municipality_id: M1 }),
        apa({ id: 'r3', scope: 'area', area_id: AREA1 }),
      ],
    },
    writeDecisions: { [A1]: true },
  }))
  const cell = m.cells[cellKey(A1, C1)]
  const preserved = m.preservedRowsByAgent[A1] || []
  results.push({
    name: 'T2: builder splits chosen-scope -> cells, other-scopes -> preserved',
    pass:
      cell?.presence === 'explicit' &&
      cell?.is_primary === true &&
      cell?.apa_id === 'r1' &&
      preserved.length === 2 &&
      preserved.every(r => r.scope !== 'community'),
    detail: `cell.is_primary=${cell?.is_primary} cell.apa_id=${cell?.apa_id}, preserved=${preserved.length} (scopes=${preserved.map(r => r.scope).join(',')})`,
  })
}

// ============================================================================
// T3: writeDecisions propagate; missing key -> false
// ============================================================================
{
  const m = buildTerritoryMatrix(inputs({
    authorizedAgentIds: [A1, A2],
    agents: [
      { id: A1, name: 'Alice', role: 'manager', parent_id: null },
      { id: A2, name: 'Bob', role: 'agent', parent_id: A1 },
    ],
    writeDecisions: { [A1]: true /* A2 deliberately missing -> defaults to false */ },
  }))
  const a1 = m.rows.find(r => r.agent_id === A1)
  const a2 = m.rows.find(r => r.agent_id === A2)
  results.push({
    name: 'T3: writeDecisions -- present=true, missing key defaults to false',
    pass: a1?.can_write === true && a2?.can_write === false,
    detail: `A1.can_write=${a1?.can_write}, A2.can_write=${a2?.can_write}`,
  })
}

// ============================================================================
// T4: serializer -- pending edit overrides initial cell state
// ============================================================================
{
  const m = buildTerritoryMatrix(inputs({
    scope: 'community',
    authorizedAgentIds: [A1],
    agents: [{ id: A1, name: 'Alice', role: 'agent', parent_id: null }],
    geos: [{ id: C1, name: 'Comm 1', parent_id: null, parent_name: null }],
    apaRowsByAgent: { [A1]: [apa({ id: 'r1', community_id: C1, is_primary: false })] },
    writeDecisions: { [A1]: true },
  }))
  const editedCells: Record<string, MatrixCell | null> = {
    [cellKey(A1, C1)]: { ...defaultCellState(), apa_id: 'r1', is_primary: true },
  }
  const payload = serializeMatrixToBulkAssignPayload(m, editedCells, [A1])
  const r = payload.assignments[A1]?.find(x => x.community_id === C1)
  results.push({
    name: 'T4: serializer applies pending edit (is_primary toggled false -> true)',
    pass: r?.is_primary === true && payload.assignments[A1]?.length === 1,
    detail: `serialized is_primary=${r?.is_primary}, total rows for A1=${payload.assignments[A1]?.length}`,
  })
}

// ============================================================================
// T5: serializer -- cell cleared via edit (set to null) -> omitted from payload
// ============================================================================
{
  const m = buildTerritoryMatrix(inputs({
    authorizedAgentIds: [A1],
    agents: [{ id: A1, name: 'Alice', role: 'agent', parent_id: null }],
    geos: [
      { id: C1, name: 'Comm 1', parent_id: null, parent_name: null },
      { id: C2, name: 'Comm 2', parent_id: null, parent_name: null },
    ],
    apaRowsByAgent: {
      [A1]: [
        apa({ id: 'r1', community_id: C1 }),
        apa({ id: 'r2', community_id: C2 }),
      ],
    },
    writeDecisions: { [A1]: true },
  }))
  const editedCells: Record<string, MatrixCell | null> = {
    [cellKey(A1, C1)]: null, // user cleared C1
  }
  const payload = serializeMatrixToBulkAssignPayload(m, editedCells, [A1])
  const rows = payload.assignments[A1] || []
  const hasC1 = rows.some(r => r.community_id === C1)
  const hasC2 = rows.some(r => r.community_id === C2)
  results.push({
    name: 'T5: cell cleared via edit -> omitted (route diff toDeletes it)',
    pass: !hasC1 && hasC2 && rows.length === 1,
    detail: `payload rows=${rows.length}, hasC1=${hasC1}, hasC2=${hasC2}`,
  })
}

// ============================================================================
// T6: serializer -- other-scope APA rows pass through verbatim
// ============================================================================
{
  const m = buildTerritoryMatrix(inputs({
    scope: 'community',
    authorizedAgentIds: [A1],
    agents: [{ id: A1, name: 'Alice', role: 'agent', parent_id: null }],
    geos: [{ id: C1, name: 'Comm 1', parent_id: null, parent_name: null }],
    apaRowsByAgent: {
      [A1]: [
        apa({ id: 'r1', scope: 'community', community_id: C1 }),
        apa({
          id: 'r2',
          scope: 'municipality',
          municipality_id: M1,
          is_primary: true,
          condo_access: false,
          homes_access: true,
          buildings_access: false,
          buildings_mode: 'whitelist',
        }),
      ],
    },
    writeDecisions: { [A1]: true },
  }))
  const payload = serializeMatrixToBulkAssignPayload(m, {}, [A1])
  const rows = payload.assignments[A1] || []
  const muni = rows.find(r => r.scope === 'municipality')
  results.push({
    name: 'T6: other-scope APA rows pass through serializer verbatim',
    pass:
      rows.length === 2 &&
      muni?.municipality_id === M1 &&
      muni?.is_primary === true &&
      muni?.condo_access === false &&
      muni?.homes_access === true &&
      muni?.buildings_access === false &&
      muni?.buildings_mode === 'whitelist',
    detail: `rows=${rows.length}, muni.is_primary=${muni?.is_primary}, condo=${muni?.condo_access}, homes=${muni?.homes_access}, bldg=${muni?.buildings_access}, mode=${muni?.buildings_mode}`,
  })
}

// ============================================================================
// T7: serializer -- only edited agents appear in payload
// ============================================================================
{
  const m = buildTerritoryMatrix(inputs({
    authorizedAgentIds: [A1, A2],
    agents: [
      { id: A1, name: 'Alice', role: 'agent', parent_id: null },
      { id: A2, name: 'Bob', role: 'agent', parent_id: null },
    ],
    geos: [{ id: C1, name: 'Comm 1', parent_id: null, parent_name: null }],
    apaRowsByAgent: {
      [A1]: [apa({ id: 'r1', community_id: C1 })],
      [A2]: [apa({ id: 'r2', community_id: C1, agent_id: A2 })],
    },
    writeDecisions: { [A1]: true, [A2]: true },
  }))
  const payload = serializeMatrixToBulkAssignPayload(m, {}, [A1])
  results.push({
    name: 'T7: untouched agents excluded from payload (only A1, not A2)',
    pass: A1 in payload.assignments && !(A2 in payload.assignments),
    detail: `A1 present=${A1 in payload.assignments}, A2 present=${A2 in payload.assignments}, agentKeys=[${Object.keys(payload.assignments).join(',')}]`,
  })
}

// ============================================================================
// T8: round-trip preservation -- the critical regression sentinel
// ============================================================================
// Build a matrix from agent's full APA state (multiple scopes), serialize
// without any edits, the payload must contain every original row. If this
// ever fails, somebody has broken the "preserved rows pass through" invariant
// and the next user save would silently delete agents' other-scope assignments.
{
  const apaRows: ApaRow[] = [
    apa({ id: 'r1', scope: 'community', community_id: C1, is_primary: true }),
    apa({ id: 'r2', scope: 'community', community_id: C2, is_primary: false, condo_access: false }),
    apa({ id: 'r3', scope: 'municipality', municipality_id: M1, is_primary: true }),
    apa({ id: 'r4', scope: 'area', area_id: AREA1, buildings_mode: 'whitelist' }),
  ]
  const m = buildTerritoryMatrix(inputs({
    scope: 'community',
    authorizedAgentIds: [A1],
    agents: [{ id: A1, name: 'Alice', role: 'agent', parent_id: null }],
    geos: [
      { id: C1, name: 'Comm 1', parent_id: null, parent_name: null },
      { id: C2, name: 'Comm 2', parent_id: null, parent_name: null },
    ],
    apaRowsByAgent: { [A1]: apaRows },
    writeDecisions: { [A1]: true },
  }))
  const payload = serializeMatrixToBulkAssignPayload(m, {}, [A1])
  const rows = payload.assignments[A1] || []
  const c1 = rows.find(r => r.community_id === C1)
  const c2 = rows.find(r => r.community_id === C2)
  const muni = rows.find(r => r.scope === 'municipality')
  const area = rows.find(r => r.scope === 'area')
  results.push({
    name: 'T8: round-trip (build -> serialize unchanged) preserves all original rows + flags',
    pass:
      rows.length === 4 &&
      c1?.is_primary === true &&
      c2?.is_primary === false && c2?.condo_access === false &&
      muni?.municipality_id === M1 && muni?.is_primary === true &&
      area?.area_id === AREA1 && area?.buildings_mode === 'whitelist',
    detail: `rows=${rows.length}, c1.primary=${c1?.is_primary}, c2.primary=${c2?.is_primary} c2.condo=${c2?.condo_access}, muni.id=${muni?.municipality_id} muni.primary=${muni?.is_primary}, area.id=${area?.area_id} area.mode=${area?.buildings_mode}`,
  })
}

// ============================================================================
// Runner
// ============================================================================

console.log('=== T4c-2 Phase A builder smoke results ===\n')
let pass = 0
let fail = 0
for (const r of results) {
  const tag = r.pass ? 'PASS' : 'FAIL'
  console.log(`  ${tag}: ${r.name}`)
  console.log(`        ${r.detail}`)
  if (r.pass) pass++
  else fail++
}
console.log(`\nTotal: pass=${pass} fail=${fail} total=${results.length}`)
console.log('(Pure-function smoke -- no DB writes, no side effects.)')

if (fail > 0) process.exit(1)