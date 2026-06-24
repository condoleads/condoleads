// lib/utils/tenant-resolver.ts
//
// W-CROSSTENANT-LEAK Phase B (2026-05-22) — renamed from lib/utils/is-walliam.ts.
//
// The previous filename + export names ("getWalliamTenantId", "isWalliamTenant",
// "resolveWalliamAgent") were lies. The functions never specifically returned
// WALLiam-related data — they always returned data for whichever tenant matched
// the current request host. Callers misused the result by writing
//   const isWalliam = !!getWalliamTenantId()
// which evaluated TRUE for any tenant whose domain matched the request host,
// not just WALLiam. That misuse caused cross-tenant brand leak (Aily visitors
// saw WALLiam-branded WalliamCTA / WalliamAgentCard / WalliamContactForm).
//
// This file replaces the lies with honest names and adds isHeroTenant() — the
// correct gate for WALLiam-branded UI (any tenant whose tenants.wordmark_style
// is set to 'hero').
//
// Migration: callers move from is-walliam.ts to tenant-resolver.ts:
//   getWalliamTenantId  → getCurrentTenantId    (semantic unchanged; just honest)
//   isWalliamTenant     → DELETED                (was a !! wrapper; use isHeroTenant() or !!getCurrentTenantId() per intent)
//   resolveWalliamAgent → resolveAgentForContext (semantic unchanged; just honest)
//   NEW:                 isHeroTenant()          (correct gate for WALLiam-branded UI)

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

/**
 * Resolve the current request's tenant id by matching the request host against
 * the tenants table (or via DEV_TENANT_DOMAIN in dev/preview environments).
 *
 * Returns null if no tenant matches (e.g., legacy condoleads.ca standalone
 * agent traffic, or an unrecognized host).
 *
 * THIS DOES NOT RETURN WALLIAM SPECIFICALLY. It returns whoever's tenant
 * matches the request host. Callers who want to know "is this the WALLiam
 * tenant" must use isHeroTenant() instead (or check wordmark_style directly).
 */
export async function getCurrentTenantId(): Promise<string | null> {
  try {
    const headersList = headers()
    const host = headersList.get('host') || ''

    // Dev / preview fallback — use DEV_TENANT_DOMAIN
    if (host.includes('localhost') || host.includes('vercel.app')) {
      const devTenantDomain = process.env.DEV_TENANT_DOMAIN || null
      if (!devTenantDomain) return null

      const supabase = createClient()
      const { data } = await supabase
        .from('tenants')
        .select('id')
        .eq('domain', devTenantDomain)
        .eq('is_active', true)
        .single()

      return data?.id || null
    }

    // Production — match host against tenants table
    const cleanHost = host.replace(/^www\./, '')
    const supabase = createClient()
    const { data } = await supabase
      .from('tenants')
      .select('id')
      .eq('domain', cleanHost)
      .eq('is_active', true)
      .single()

    return data?.id || null
  } catch {
    return null
  }
}

/**
 * Resolve the current request's tenant wordmark_style by matching the request
 * host against the tenants table (or via DEV_TENANT_DOMAIN in dev/preview
 * environments). Mirrors getCurrentTenantId's resolution EXACTLY (same two
 * branches, same .eq predicates, same service-role client) — diverging the
 * resolution would risk one helper returning a value while the other returns
 * null for the same request.
 *
 * Explicit column allow-list (id, wordmark_style). NEVER SELECT * — tenants
 * holds anthropic_api_key + resend_api_key.
 *
 * Returns the wordmark_style string (e.g. 'hero', 'aiglow', 'standard') or
 * null if no tenant matches. Used by RootLayout to expose
 * data-tenant-wordmark-style on body so client components can read it via
 * useTenantWordmarkStyle without a new fetch.
 */
export async function getCurrentTenantWordmarkStyle(): Promise<string | null> {
  try {
    const headersList = headers()
    const host = headersList.get('host') || ''

    // Dev / preview fallback — use DEV_TENANT_DOMAIN
    if (host.includes('localhost') || host.includes('vercel.app')) {
      const devTenantDomain = process.env.DEV_TENANT_DOMAIN || null
      if (!devTenantDomain) return null

      const supabase = createClient()
      const { data } = await supabase
        .from('tenants')
        .select('id, wordmark_style')
        .eq('domain', devTenantDomain)
        .eq('is_active', true)
        .single()

      return data?.wordmark_style || null
    }

    // Production — match host against tenants table
    const cleanHost = host.replace(/^www\./, '')
    const supabase = createClient()
    const { data } = await supabase
      .from('tenants')
      .select('id, wordmark_style')
      .eq('domain', cleanHost)
      .eq('is_active', true)
      .single()

    return data?.wordmark_style || null
  } catch {
    return null
  }
}

/**
 * Returns true if the current request's tenant has wordmark_style = 'hero'.
 *
 * This is the correct gate for rendering WALLiam-branded UI components
 * (WalliamCTA, WalliamAgentCard, WalliamContactForm, WALLiam-specific
 * hero wordmark, suppressing the System 1 ChatWidget, etc.).
 *
 * Returns false for any other tenant value (including 'standard'), for null
 * (no tenant resolved), and on any error (fail-closed — never accidentally
 * show WALLiam UI to non-hero tenants).
 *
 * Schema: tenants.wordmark_style is text NOT NULL DEFAULT 'standard'
 * (added in supabase/migrations/20260522_mtb_def_1_wordmark_style.sql).
 */
export async function isHeroTenant(): Promise<boolean> {
  try {
    const headersList = headers()
    const host = headersList.get('host') || ''

    let lookupDomain: string | null = null
    if (host.includes('localhost') || host.includes('vercel.app')) {
      lookupDomain = process.env.DEV_TENANT_DOMAIN || null
    } else {
      lookupDomain = host.replace(/^www\./, '')
    }
    if (!lookupDomain) return false

    const supabase = createClient()
    const { data } = await supabase
      .from('tenants')
      .select('wordmark_style')
      .eq('domain', lookupDomain)
      .eq('is_active', true)
      .single()

    return data?.wordmark_style === 'hero'
  } catch {
    return false
  }
}

/**
 * Resolve the correct agent for a given page context (listing/building/geo/user)
 * within a tenant. Wraps the resolve_agent_for_context RPC.
 *
 * If the RPC returns null (no specific assignment found), falls back to
 * tenants.default_agent_id.
 *
 * Returns null on error or if no agent can be resolved.
 *
 * NOTE: tenant_id is required. Callers should obtain it via getCurrentTenantId()
 * first. This function works for ANY tenant; it is not WALLiam-specific despite
 * its previous name (resolveWalliamAgent).
 */
export async function resolveAgentForContext(params: {
  listing_id?: string | null
  building_id?: string | null
  neighbourhood_id?: string | null
  community_id?: string | null
  municipality_id?: string | null
  area_id?: string | null
  user_id?: string | null
  tenant_id: string
}): Promise<string | null> {
  try {
    const supabase = createClient()
    // Phase 2 cache-first: when listing_id is provided, read the materialized
    // mls_listings.assigned_agent_id before falling through to the resolver RPC.
    // v16 model: the cache holds the v16-correct agent (populated by Phase 1,
    // maintained by P-LIFECYCLE going forward). On NULL cache (new listing without
    // resolve-at-insert -- see F-RESOLVE-AT-INSERT-PRIORITY), fall through to the
    // RPC for a live geo-chain resolution.
    if (params.listing_id) {
      const { data: cached } = await supabase
        .from('mls_listings')
        .select('assigned_agent_id, agents!mls_listings_assigned_agent_id_fkey!inner(tenant_id, is_active, is_selling)')
        .eq('id', params.listing_id)
        .eq('agents.tenant_id', params.tenant_id)
        .eq('agents.is_active', true)
        .eq('agents.is_selling', true)
        .maybeSingle()
      if (cached?.assigned_agent_id) return cached.assigned_agent_id
    }
    const { data } = await supabase.rpc('resolve_agent_for_context', {
      p_listing_id: params.listing_id || null,
      p_building_id: params.building_id || null,
      p_neighbourhood_id: params.neighbourhood_id || null,
      p_community_id: params.community_id || null,
      p_municipality_id: params.municipality_id || null,
      p_area_id: params.area_id || null,
      p_user_id: params.user_id || null,
      p_tenant_id: params.tenant_id,
    })
    if (data) return data
    // Fall back to tenant default_agent_id
    const { data: tenant } = await supabase
      .from('tenants')
      .select('default_agent_id')
      .eq('id', params.tenant_id)
      .single()
    return tenant?.default_agent_id || null
  } catch {
    return null
  }
}