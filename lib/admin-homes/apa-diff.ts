// lib/admin-homes/apa-diff.ts
// T4a-3: pure diff computation for agent_property_access reconciliation.
// Replaces the DELETE-all + INSERT-all churn pattern with a precise diff:
//   identical -> no SQL operations
//   added     -> INSERT only the new rows
//   removed   -> DELETE only the removed rows by id
//   mutated   -> UPDATE only the changed rows by id
//
// Identity key per row: (scope, area_id, municipality_id, community_id, neighbourhood_id).
// Two rows with the same identity key are the same logical assignment.

export interface ApaRow {
  id?: string
  agent_id: string
  tenant_id: string
  scope: string
  area_id: string | null
  municipality_id: string | null
  community_id: string | null
  neighbourhood_id: string | null
  is_primary: boolean
  is_active: boolean
  condo_access: boolean
  homes_access: boolean
  buildings_access: boolean
  buildings_mode: string
}

export interface ApaDiff {
  toDelete: ApaRow[]
  toInsert: ApaRow[]
  toUpdate: { existing: ApaRow; incoming: ApaRow }[]
  unchanged: number
  primaryClaims: ApaRow[]  // rows transitioning to primary (need auto-reassign)
}

function identityKey(r: ApaRow): string {
  return r.scope + '|' + (r.area_id ?? '') + '|' + (r.municipality_id ?? '') + '|' + (r.community_id ?? '') + '|' + (r.neighbourhood_id ?? '')
}

export function computeApaDiff(existing: ApaRow[], incoming: ApaRow[]): ApaDiff {
  const existingByKey = new Map<string, ApaRow>()
  for (const r of existing) existingByKey.set(identityKey(r), r)
  const incomingByKey = new Map<string, ApaRow>()
  for (const r of incoming) incomingByKey.set(identityKey(r), r)

  const toDelete: ApaRow[] = []
  const toInsert: ApaRow[] = []
  const toUpdate: { existing: ApaRow; incoming: ApaRow }[] = []
  let unchanged = 0
  const primaryClaims: ApaRow[] = []

  for (const [key, ex] of existingByKey) {
    if (!incomingByKey.has(key)) toDelete.push(ex)
  }
  for (const [key, inc] of incomingByKey) {
    const ex = existingByKey.get(key)
    if (!ex) {
      toInsert.push(inc)
      if (inc.is_primary) primaryClaims.push(inc)
    } else {
      const changed =
        ex.is_primary !== inc.is_primary ||
        ex.condo_access !== inc.condo_access ||
        ex.homes_access !== inc.homes_access ||
        ex.buildings_access !== inc.buildings_access ||
        ex.buildings_mode !== inc.buildings_mode
      if (changed) {
        toUpdate.push({ existing: ex, incoming: inc })
        if (inc.is_primary && !ex.is_primary) primaryClaims.push(inc)
      } else {
        unchanged++
      }
    }
  }

  return { toDelete, toInsert, toUpdate, unchanged, primaryClaims }
}
