// lib/admin-homes/hierarchy.ts
// Phase 3.4 — shared hierarchy walk utilities.
// Used by lead-creation paths to capture manager_id + area_manager_id at write time.
//
// Walk semantics (master plan 2.4):
//   Given an agent, walk parent_id upward.
//   The first ancestor with role = 'manager'      → manager_id
//   The first ancestor with role = 'area_manager' → area_manager_id
//   Stop at tenant_admin or parent_id IS NULL.
//   Cap at 6 hops to defend against cycles.

import type { SupabaseClient } from '@supabase/supabase-js'

const MAX_HOPS = 6

export interface HierarchyChain {
  manager_id: string | null
  area_manager_id: string | null
  tenant_admin_id: string | null
  /** The agents visited during the walk, in order from self upward (excluding self). */
  ancestors: { id: string; role: string }[]
}

interface AgentHopRow {
  id: string
  role: string | null
  parent_id: string | null
}

/**
 * Walk upward from `agentId` and classify ancestors.
 * If the agent itself is a manager / area_manager, that does NOT count — we only
 * stamp ancestors. (A manager submitting their own lead has manager_id = null
 * unless they have a parent who is also a manager. Adjust if business rules change.)
 */
export async function walkHierarchy(
  agentId: string,
  supabase: SupabaseClient
): Promise<HierarchyChain> {
  const chain: HierarchyChain = {
    manager_id: null,
    area_manager_id: null,
    tenant_admin_id: null,
    ancestors: [],
  }

  // First read the agent itself so we know its parent_id.
  const { data: self } = await supabase
    .from('agents')
    .select('id, role, parent_id')
    .eq('id', agentId)
    .maybeSingle()

  if (!self) return chain
  let cursor: string | null = (self as AgentHopRow).parent_id ?? null
  const seen = new Set<string>([agentId])

  for (let hop = 0; hop < MAX_HOPS && cursor; hop++) {
    if (seen.has(cursor)) break // cycle
    seen.add(cursor)

    const { data: row } = await supabase
      .from('agents')
      .select('id, role, parent_id')
      .eq('id', cursor)
      .maybeSingle()

    if (!row) break
    const r = row as AgentHopRow
    const role = r.role || 'agent'

    chain.ancestors.push({ id: r.id, role })

    if (chain.manager_id === null && role === 'manager') {
      chain.manager_id = r.id
    }
    if (chain.area_manager_id === null && role === 'area_manager') {
      chain.area_manager_id = r.id
    }
    if (role === 'tenant_admin') {
      chain.tenant_admin_id = r.id
      break
    }

    cursor = r.parent_id
  }

  return chain
}

/**
 * Returns the IDs of every descendant of `agentId` (subtree, exclusive of self).
 * Used by Phase 5/6 visibility filtering. Tenant-scoped via the supabase client
 * already being scoped, plus optional explicit `tenantId` filter.
 */
export async function getDescendantIds(
  agentId: string,
  supabase: SupabaseClient,
  tenantId?: string | null
): Promise<string[]> {
  const collected = new Set<string>()
  const queue: string[] = [agentId]

  while (queue.length > 0) {
    const batch = queue.splice(0, queue.length)
    let q = supabase
      .from('agents')
      .select('id')
      .in('parent_id', batch)
    if (tenantId) q = q.eq('tenant_id', tenantId)

    const { data } = await q
    const rows = (data || []) as { id: string }[]
    for (const r of rows) {
      if (!collected.has(r.id) && r.id !== agentId) {
        collected.add(r.id)
        queue.push(r.id)
      }
    }
    // Safety: stop if we've collected an absurd number (defends against pathological data)
    if (collected.size > 1000) break
  }

  return Array.from(collected)
}