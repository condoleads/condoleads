// app/api/admin-homes/tenants/[id]/geo/route.ts
// Tenant territory restriction management.
// Empty = full access. Rows = restricted to these territories only.
// Platform-admin only -- tenant boundaries are a platform operation.
// T4a-3: server-side diff (replaces DELETE-all + INSERT-all churn).
// tpa has no triggers/audit, but same primitive class of bug.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'

interface TpaRow {
  id?: string
  tenant_id: string
  scope: string
  area_id: string | null
  municipality_id: string | null
  community_id: string | null
  neighbourhood_id: string | null
  is_active: boolean
  condo_access: boolean
  homes_access: boolean
  buildings_access: boolean
}

function tpaIdentityKey(r: TpaRow): string {
  return r.scope + '|' + (r.area_id ?? '') + '|' + (r.municipality_id ?? '') + '|' + (r.community_id ?? '') + '|' + (r.neighbourhood_id ?? '')
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const decision = can(user.permissions, 'platform.read', { kind: 'platform' })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('tenant_property_access')
    .select('*')
    .eq('tenant_id', params.id)
    .eq('is_active', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ restrictions: data || [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const decision = can(user.permissions, 'platform.write', { kind: 'platform' })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  const supabase = createServiceClient()

  const body = await req.json()
  const restrictions = (body && body.restrictions) || []

  const incoming: TpaRow[] = restrictions.map((r: any) => ({
    tenant_id: params.id,
    scope: r.scope,
    area_id: r.area_id || null,
    municipality_id: r.municipality_id || null,
    community_id: r.community_id || null,
    neighbourhood_id: r.neighbourhood_id || null,
    is_active: true,
    condo_access: r.condo_access ?? true,
    homes_access: r.homes_access ?? true,
    buildings_access: r.buildings_access ?? true,
  }))

  const { data: existingRaw, error: fetchError } = await supabase
    .from('tenant_property_access')
    .select('id, tenant_id, scope, area_id, municipality_id, community_id, neighbourhood_id, is_active, condo_access, homes_access, buildings_access')
    .eq('tenant_id', params.id)
    .eq('is_active', true)
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

  const existing: TpaRow[] = (existingRaw || []) as TpaRow[]
  const existingByKey = new Map<string, TpaRow>()
  for (const r of existing) existingByKey.set(tpaIdentityKey(r), r)
  const incomingByKey = new Map<string, TpaRow>()
  for (const r of incoming) incomingByKey.set(tpaIdentityKey(r), r)

  const toDelete: TpaRow[] = []
  const toInsert: TpaRow[] = []
  const toUpdate: { existing: TpaRow; incoming: TpaRow }[] = []
  let unchanged = 0

  for (const [key, ex] of existingByKey) {
    if (!incomingByKey.has(key)) toDelete.push(ex)
  }
  for (const [key, inc] of incomingByKey) {
    const ex = existingByKey.get(key)
    if (!ex) {
      toInsert.push(inc)
    } else {
      const changed =
        ex.condo_access !== inc.condo_access ||
        ex.homes_access !== inc.homes_access ||
        ex.buildings_access !== inc.buildings_access
      if (changed) toUpdate.push({ existing: ex, incoming: inc })
      else unchanged++
    }
  }

  if (toDelete.length > 0) {
    const ids = toDelete.map(r => r.id!).filter(Boolean) as string[]
    if (ids.length > 0) {
      const { error } = await supabase.from('tenant_property_access').delete().in('id', ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  for (const pair of toUpdate) {
    const ex = pair.existing
    const inc = pair.incoming
    const { error } = await supabase
      .from('tenant_property_access')
      .update({
        condo_access: inc.condo_access,
        homes_access: inc.homes_access,
        buildings_access: inc.buildings_access,
      })
      .eq('id', ex.id!)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (toInsert.length > 0) {
    const insertPayload = toInsert.map(r => {
      const { id: _id, ...rest } = r as any
      return rest
    })
    const { error } = await supabase.from('tenant_property_access').insert(insertPayload)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    count: incoming.length,
    diff: {
      deleted: toDelete.length,
      inserted: toInsert.length,
      updated: toUpdate.length,
      unchanged,
    },
  })
}
