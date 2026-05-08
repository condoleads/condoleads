// app/api/admin-homes/territory/bulk-assign/route.ts
// T4c-1: Bulk territory assignment for managers carving across managed agents.
// Multi-tenant comprehensive contract:
//   - All can() permission checks BEFORE any DB write. First denial -> 4xx, zero writes.
//   - Cross-tenant target -> can() rejects via FORBIDDEN_CROSS_TENANT.
//   - Out-of-subtree target -> can() rejects via FORBIDDEN_SCOPE.
//   - Cross-agent primary conflict (two agents claiming primary on same
//     (scope, scope_id)) -> 400 BEFORE BEGIN, zero writes.
//   - Single pg.Client transaction wraps all writes. ROLLBACK on any failure
//     leaves the DB in pre-payload state.
//   - Auto-reassign for primary claims deduplicated across the entire payload.
//   - Diff via computeApaDiff (lib/admin-homes/apa-diff.ts) -- single source of truth.
//
// Payload:  { assignments: { [agentId: string]: ApaRowInput[] } }
// Response: { success: true, perAgent: { [agentId]: { deleted, inserted, updated, unchanged } } }

import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { can, type DbRole } from '@/lib/admin-homes/permissions'
import { computeApaDiff, type ApaRow } from '@/lib/admin-homes/apa-diff'

interface AgentTarget {
  id: string
  tenant_id: string
  parent_id: string | null
  site_type: string
  role: string | null
}

// Whitelist scope -> column. Used to safely interpolate column name in
// auto-reassign UPDATE (column names cannot be parameterized in pg).
const SCOPE_COL: Record<string, string> = {
  area: 'area_id',
  municipality: 'municipality_id',
  community: 'community_id',
  neighbourhood: 'neighbourhood_id',
}

function getScopeVal(r: ApaRow): string | null {
  if (r.scope === 'area') return r.area_id
  if (r.scope === 'municipality') return r.municipality_id
  if (r.scope === 'community') return r.community_id
  if (r.scope === 'neighbourhood') return r.neighbourhood_id
  return null
}

export async function POST(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const assignments: Record<string, any[]> = (body && body.assignments) || {}
  const agentIds = Object.keys(assignments)

  if (agentIds.length === 0) {
    return NextResponse.json({ success: true, perAgent: {} })
  }

  const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!cs) return NextResponse.json({ error: 'DB connection string not configured' }, { status: 500 })

  const client = new Client({ connectionString: cs })
  await client.connect()

  try {
    // ===== Phase 1: Permission gate (no DB writes) =====
    const targetsRes = await client.query<AgentTarget>(
      `SELECT id, tenant_id, parent_id, site_type, role FROM agents WHERE id = ANY($1::uuid[])`,
      [agentIds]
    )
    const targets = new Map<string, AgentTarget>()
    for (const r of targetsRes.rows) targets.set(r.id, r)

    for (const agentId of agentIds) {
      const target = targets.get(agentId)
      if (!target) {
        return NextResponse.json({ error: 'Agent not found', deniedAgentId: agentId }, { status: 404 })
      }
      if (target.site_type !== 'comprehensive') {
        return NextResponse.json({ error: 'Agent is not comprehensive', deniedAgentId: agentId }, { status: 404 })
      }
      const decision = can(user.permissions, 'agent.write', {
        kind: 'agent',
        agentId: target.id,
        tenantId: target.tenant_id,
        parentId: target.parent_id,
        roleDb: (target.role || 'agent') as DbRole,
      })
      if (!decision.ok) {
        return NextResponse.json(
          { error: decision.reason, deniedAgentId: agentId },
          { status: decision.status }
        )
      }
    }

    // ===== Phase 2: Build incoming + cross-agent conflict guard (no DB writes) =====
    const incomingByAgent = new Map<string, ApaRow[]>()
    const primaryClaimsByKey = new Map<string, string[]>()

    for (const agentId of agentIds) {
      const target = targets.get(agentId)!
      const built: ApaRow[] = (assignments[agentId] || []).map((a: any) => ({
        agent_id: agentId,
        tenant_id: target.tenant_id,
        scope: a.scope,
        area_id: a.area_id || null,
        municipality_id: a.municipality_id || null,
        community_id: a.community_id || null,
        neighbourhood_id: a.neighbourhood_id || null,
        is_primary: a.is_primary === true,
        is_active: true,
        condo_access: a.condo_access ?? true,
        homes_access: a.homes_access ?? true,
        buildings_access: a.buildings_access ?? true,
        buildings_mode: a.buildings_mode || 'all',
      }))
      incomingByAgent.set(agentId, built)

      for (const r of built) {
        if (!r.is_primary) continue
        const sv = getScopeVal(r)
        if (!sv) continue
        const key = r.scope + '|' + sv
        const lst = primaryClaimsByKey.get(key) || []
        if (!lst.includes(agentId)) lst.push(agentId)
        primaryClaimsByKey.set(key, lst)
      }
    }

    const conflicts: { key: string; agents: string[] }[] = []
    for (const e of primaryClaimsByKey) {
      if (e[1].length > 1) conflicts.push({ key: e[0], agents: e[1] })
    }
    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: 'Conflict: multiple agents claim primary on same geo', conflicts },
        { status: 400 }
      )
    }

    // ===== Phase 3: Fetch existing + compute diff per agent (no DB writes) =====
    const existingRes = await client.query<ApaRow>(
      `SELECT id, agent_id, tenant_id, scope, area_id, municipality_id, community_id, neighbourhood_id,
              is_primary, is_active, condo_access, homes_access, buildings_access, buildings_mode
       FROM agent_property_access WHERE agent_id = ANY($1::uuid[]) AND is_active = true`,
      [agentIds]
    )
    const existingByAgent = new Map<string, ApaRow[]>()
    for (const row of existingRes.rows) {
      const arr = existingByAgent.get(row.agent_id) || []
      arr.push(row)
      existingByAgent.set(row.agent_id, arr)
    }

    const diffs = new Map<string, ReturnType<typeof computeApaDiff>>()
    for (const agentId of agentIds) {
      diffs.set(agentId, computeApaDiff(existingByAgent.get(agentId) || [], incomingByAgent.get(agentId) || []))
    }

    // ===== Phase 4: Transaction (BEGIN -> apply -> COMMIT or ROLLBACK) =====
    await client.query('BEGIN')
    try {
      // 4a. Auto-reassign for primary claims (dedup across agents)
      const reassignedKeys = new Set<string>()
      for (const e of diffs) {
        for (const claim of e[1].primaryClaims) {
          const scopeCol = SCOPE_COL[claim.scope]
          const scopeVal = getScopeVal(claim)
          if (!scopeCol || !scopeVal) continue
          const key = claim.scope + '|' + scopeVal
          if (reassignedKeys.has(key)) continue
          reassignedKeys.add(key)
          const claimantIds = primaryClaimsByKey.get(key) || []
          // scopeCol from fixed whitelist; safe to interpolate.
          await client.query(
            `UPDATE agent_property_access SET is_primary = false
             WHERE scope = $1 AND ${scopeCol} = $2 AND is_active = true AND is_primary = true
             AND tenant_id = $3 AND NOT (agent_id = ANY($4::uuid[]))`,
            [claim.scope, scopeVal, claim.tenant_id, claimantIds]
          )
        }
      }

      // 4b. Per-agent: DELETE -> UPDATE -> INSERT
      for (const e of diffs) {
        const diff = e[1]
        if (diff.toDelete.length > 0) {
          const ids = diff.toDelete.map(r => r.id!).filter(Boolean) as string[]
          if (ids.length > 0) {
            await client.query(`DELETE FROM agent_property_access WHERE id = ANY($1::uuid[])`, [ids])
          }
        }
        for (const pair of diff.toUpdate) {
          const ex = pair.existing
          const inc = pair.incoming
          await client.query(
            `UPDATE agent_property_access
             SET is_primary=$2, condo_access=$3, homes_access=$4, buildings_access=$5, buildings_mode=$6
             WHERE id = $1`,
            [ex.id, inc.is_primary, inc.condo_access, inc.homes_access, inc.buildings_access, inc.buildings_mode]
          )
        }
        for (const inc of diff.toInsert) {
          await client.query(
            `INSERT INTO agent_property_access
             (agent_id, tenant_id, scope, area_id, municipality_id, community_id, neighbourhood_id,
              is_primary, is_active, condo_access, homes_access, buildings_access, buildings_mode)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [inc.agent_id, inc.tenant_id, inc.scope, inc.area_id, inc.municipality_id, inc.community_id, inc.neighbourhood_id,
             inc.is_primary, inc.is_active, inc.condo_access, inc.homes_access, inc.buildings_access, inc.buildings_mode]
          )
        }
      }

      await client.query('COMMIT')

      const perAgent: Record<string, { deleted: number; inserted: number; updated: number; unchanged: number }> = {}
      for (const e of diffs) {
        perAgent[e[0]] = {
          deleted: e[1].toDelete.length,
          inserted: e[1].toInsert.length,
          updated: e[1].toUpdate.length,
          unchanged: e[1].unchanged,
        }
      }

      return NextResponse.json({ success: true, perAgent })
    } catch (txError: any) {
      await client.query('ROLLBACK').catch(() => undefined)
      return NextResponse.json(
        { error: 'Transaction failed -- all changes rolled back', detail: txError?.message || String(txError) },
        { status: 500 }
      )
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  } finally {
    await client.end().catch(() => undefined)
  }
}
