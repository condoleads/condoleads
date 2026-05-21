// lib/admin-homes/agent-subdomain.ts
// D28 (W-MULTITENANT-BENCH P3.F5): server-side subdomain derivation for
// new agents. agents.subdomain is globally UNIQUE in the DB; humans
// entering it via UI led to typos and collisions. Same defect class as
// D17 source_key on tenants -- system-controlled identifiers should be
// derived invisibly server-side.
//
// Usage in POST /api/admin-homes/agents:
//   const subdomain = await deriveUniqueAgentSubdomain(supabase, full_name)
//
// Algorithm:
//   1. Sanitize: lowercase, strip non-alphanumeric, max 30 chars
//   2. If empty after sanitize, fall back to 'agent'
//   3. Check uniqueness against agents.subdomain
//   4. On collision, append '-2', '-3', ... until unique (max 100 tries)

import type { SupabaseClient } from '@supabase/supabase-js'

export function sanitizeAgentSubdomain(name: string): string {
  const cleaned = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 30)
  return cleaned || 'agent'
}

export async function deriveUniqueAgentSubdomain(
  supabase: SupabaseClient,
  fullName: string,
  excludeAgentId: string | null = null
): Promise<string> {
  const base = sanitizeAgentSubdomain(fullName)
  for (let i = 1; i <= 100; i++) {
    const candidate = i === 1 ? base : base.substring(0, 27) + '-' + i
    let query = supabase.from('agents').select('id').eq('subdomain', candidate)
    if (excludeAgentId) query = query.neq('id', excludeAgentId)
    const { data } = await query.maybeSingle()
    if (!data) return candidate
  }
  throw new Error('Could not derive unique subdomain after 100 attempts')
}
