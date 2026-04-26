// app/api/admin-homes/leads/[id]/route.ts
// Phase 3.4+: auth + tenant-check on every mutation via shared api-auth helper.

import { NextRequest, NextResponse } from 'next/server'
import { requireLeadAccess } from '@/lib/admin-homes/api-auth'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireLeadAccess(params.id)
    if ('error' in auth) return auth.error

    const { status, quality } = await request.json()
    const update: any = { updated_at: new Date().toISOString() }
    if (status) update.status = status
    if (quality) update.quality = quality

    const { error } = await auth.supabase.from('leads').update(update).eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[admin-homes/leads PATCH] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireLeadAccess(params.id)
    if ('error' in auth) return auth.error

    // DELETE additionally restricted to admin / manager (no agent / managed destructive deletes)
    if (!auth.user.isPlatformAdmin && auth.user.role !== 'admin' && auth.user.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await auth.supabase.from('leads').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[admin-homes/leads DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}