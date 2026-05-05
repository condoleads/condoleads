// app/api/admin-homes/leads/[id]/route.ts
// Phase 3.4+: auth + tenant-check on every mutation via shared api-auth helper.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await resolveAdminHomesUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = createServiceClient()
    const { data: target } = await supabase
      .from('leads')
      .select('id, tenant_id, agent_id')
      .eq('id', params.id)
      .maybeSingle()
    if (!target) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }
    const decision = can(user.permissions, 'lead.write', {
      kind: 'lead',
      leadId: target.id,
      tenantId: target.tenant_id,
      agentId: target.agent_id,
    })
    if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })

    const { status, quality } = await request.json()
    const update: any = { updated_at: new Date().toISOString() }
    if (status) update.status = status
    if (quality) update.quality = quality

    const { error } = await supabase.from('leads').update(update).eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[admin-homes/leads PATCH] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await resolveAdminHomesUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = createServiceClient()
    const { data: target } = await supabase
      .from('leads')
      .select('id, tenant_id, agent_id')
      .eq('id', params.id)
      .maybeSingle()
    if (!target) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }
    const decision = can(user.permissions, 'lead.write', {
      kind: 'lead',
      leadId: target.id,
      tenantId: target.tenant_id,
      agentId: target.agent_id,
    })
    if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })

    // DELETE additionally restricted: no agent destructive deletes (legacy compliance policy preserved).
    if (!user.isPlatformAdmin && user.permissions.roleDb === 'agent') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await supabase.from('leads').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[admin-homes/leads DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}