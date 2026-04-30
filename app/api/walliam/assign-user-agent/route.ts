// app/api/walliam/assign-user-agent/route.ts
//
// Per-tenant agent assignment for a user.
//
// Architectural role (W-TENANT-AUTH File 8):
//   - Reads x-tenant-id from headers (REQUIRED — no fallback).
//   - Checks tenant_users(user_id, tenant_id) for an existing per-tenant agent assignment;
//     falls back to user_profiles.assigned_agent_id during back-compat window.
//   - On miss, resolves an agent via resolve_agent_for_context(tenant_id, ...) RPC.
//   - Dual-writes the resolved agent_id to tenant_users (per-tenant, primary) AND
//     user_profiles (legacy global, for back-compat — flagged for removal in
//     post-W-TENANT-AUTH cleanup ticket W-PROFILE-CLEANUP).
//
// System 2 only — never touches System 1 tables.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = req.headers.get('x-tenant-id')

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'x-tenant-id header required' },
        { status: 400 }
      )
    }

    const {
      user_id,
      listing_id,
      building_id,
      community_id,
      municipality_id,
      area_id,
    } = await req.json()

    if (!user_id) {
      return NextResponse.json({ success: false, error: 'user_id required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 1. Check tenant_users first (per-tenant assignment, primary source of truth)
    const { data: tenantUser } = await supabase
      .from('tenant_users')
      .select('assigned_agent_id')
      .eq('user_id', user_id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (tenantUser?.assigned_agent_id) {
      return NextResponse.json({
        success: true,
        agent_id: tenantUser.assigned_agent_id,
        source: 'existing_tenant_relationship',
        message: 'User already has assigned agent for this tenant',
      })
    }

    // 2. Back-compat fallback — check user_profiles.assigned_agent_id ONLY IF the
    // tenant_users row exists but assigned_agent_id is null (new tenant_users row created
    // by joinTenant before agent was assigned). We DO NOT use user_profiles for users with
    // no tenant_users row — that would re-introduce the cross-tenant agent leak.
    const tenantUserExists = tenantUser !== null
    if (tenantUserExists) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('assigned_agent_id, agent_assigned_at, agent_assignment_source')
        .eq('id', user_id)
        .maybeSingle()

      // Only honor legacy assignment if the tenant matches the user's primary tenant.
      // Determined by: does the legacy assigned_agent.tenant_id match the current tenantId?
      if (profile?.assigned_agent_id) {
        const { data: agentRow } = await supabase
          .from('agents')
          .select('tenant_id')
          .eq('id', profile.assigned_agent_id)
          .maybeSingle()

        if (agentRow?.tenant_id === tenantId) {
          // Legacy assignment is for THIS tenant — promote it to tenant_users
          await supabase
            .from('tenant_users')
            .update({
              assigned_agent_id: profile.assigned_agent_id,
              agent_assigned_at: profile.agent_assigned_at || new Date().toISOString(),
              agent_assignment_source: profile.agent_assignment_source || 'back_compat_promotion',
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', user_id)
            .eq('tenant_id', tenantId)

          return NextResponse.json({
            success: true,
            agent_id: profile.assigned_agent_id,
            source: 'legacy_promoted',
            message: 'Promoted legacy user_profiles assignment to tenant_users',
          })
        }
        // Legacy assignment is for a DIFFERENT tenant — do not honor it.
      }
    }

    // 3. Resolve agent via priority chain (tenant-scoped RPC)
    const { data: agentId, error: rpcError } = await supabase.rpc('resolve_agent_for_context', {
      p_listing_id: listing_id || null,
      p_building_id: building_id || null,
      p_community_id: community_id || null,
      p_municipality_id: municipality_id || null,
      p_area_id: area_id || null,
      p_user_id: null, // user has no prior relationship in this tenant; resolve fresh
      p_tenant_id: tenantId,
    })

    if (rpcError) {
      console.error('[assign-user-agent] RPC error:', rpcError)
      return NextResponse.json({ success: false, error: rpcError.message }, { status: 500 })
    }

    const resolvedAgentId = agentId as string | null

    if (!resolvedAgentId) {
      // No agent found — leave unassigned (leads will route to admin)
      return NextResponse.json({
        success: true,
        agent_id: null,
        source: 'no_match',
        message: 'No agent resolved for this context; leads will route to tenant admin',
      })
    }

    // 4. Determine assignment source label
    let source = 'geo_assignment'
    if (listing_id) {
      const { data: la } = await supabase
        .from('agent_listing_assignments')
        .select('id').eq('listing_id', listing_id).maybeSingle()
      if (la) source = 'manual_property'
    } else if (building_id) {
      const { data: ba } = await supabase
        .from('agent_geo_buildings')
        .select('id').eq('building_id', building_id).maybeSingle()
      if (ba) source = 'manual_building'
    }

    const now = new Date().toISOString()

    // 5a. Primary write: tenant_users (UPSERT — defensive in case row doesn't exist yet)
    const { error: tuError } = await supabase
      .from('tenant_users')
      .upsert({
        user_id,
        tenant_id: tenantId,
        assigned_agent_id: resolvedAgentId,
        agent_assigned_at: now,
        agent_assignment_source: source,
        updated_at: now,
      }, {
        onConflict: 'user_id,tenant_id'
      })

    if (tuError) {
      console.error('[assign-user-agent] tenant_users upsert error:', tuError)
      return NextResponse.json({ success: false, error: tuError.message }, { status: 500 })
    }

    // 5b. Back-compat write: user_profiles (legacy global field)
    // Only write if no value exists yet (preserves "never overwrite" semantics for legacy callers).
    // Flagged for removal once W-PROFILE-CLEANUP ships.
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('assigned_agent_id')
      .eq('id', user_id)
      .maybeSingle()

    if (!existingProfile?.assigned_agent_id) {
      await supabase
        .from('user_profiles')
        .update({
          assigned_agent_id: resolvedAgentId,
          agent_assigned_at: now,
          agent_assignment_source: source,
        })
        .eq('id', user_id)
    }

    console.log('[assign-user-agent] assigned:', { user_id, tenant_id: tenantId, agent_id: resolvedAgentId, source })

    return NextResponse.json({
      success: true,
      agent_id: resolvedAgentId,
      source,
    })

  } catch (err: any) {
    console.error('[assign-user-agent] error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}