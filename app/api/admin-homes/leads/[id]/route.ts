// app/api/admin-homes/leads/[id]/route.ts
// Phase 3.4+: auth + tenant-check on every mutation via shared api-auth helper.
// W-LEADS-WORKBENCH W6a-2 + W6a-3 (2026-05-16) -- audit writes for PATCH
// (status/quality) and DELETE handlers.
//
// MULTITENANT CONTRACT (Rule Zero #1)
//   Every audit row is written under the LEAD's tenant_id (target.tenant_id),
//   never the user's claimed tenant. Identical to W4e/W4f/W4g pattern.
//
// PERMISSION CONTRACT
//   can(user.permissions, 'lead.write', { kind, leadId, tenantId, agentId })
//   preserved verbatim. The agent-deletes-blocked check in DELETE is
//   preserved verbatim. Audit writes happen ONLY after the mutation
//   succeeds -- on failure (404, 403, 500) no audit row is written.
//
// AUDIT
//   PATCH writes one audit row per field changed (status_changed and/or
//   quality_changed), each with target_field set, before_value capturing
//   the pre-mutation value, after_value capturing the new value. No row
//   written when the sent value equals the current value.
//
//   DELETE captures a snapshot of the lead before deleting and writes a
//   single lead_deleted audit row with the snapshot in before_value. The
//   snapshot survives the lead's destruction because the FK on
//   lead_admin_actions.lead_id was dropped in W6a-1.
//
//   All audit writes use logLeadAdminAction which is never-throw -- a
//   failed audit logs to console but does NOT break the mutation response.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'
import { logLeadAdminAction } from '@/lib/admin-homes/log-lead-admin-action'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await resolveAdminHomesUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = createServiceClient()
    // W6a-2: SELECT widened to include status, quality for audit before_value.
    const { data: target } = await supabase
      .from('leads')
      .select('id, tenant_id, agent_id, status, quality')
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
    if (error) {
      console.error('[admin-homes/leads PATCH] lead-update failed:', { leadId: target.id, tenantId: target.tenant_id, error })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // W6a-2 audit: one row per field changed. Best-effort (never-throw).
    const actorRole = user.role || (user.isPlatformAdmin ? 'platform_admin' : 'admin')
    const auditWrites: Promise<void>[] = []
    if (status && status !== target.status) {
      auditWrites.push(
        logLeadAdminAction({
          supabase,
          tenantId: target.tenant_id,
          leadId: target.id,
          actorAgentId: user.agentId || null,
          actorRole,
          actionType: 'status_changed',
          targetField: 'status',
          beforeValue: { status: target.status },
          afterValue: { status },
          notes: (target.status == null ? '(null)' : String(target.status)) + ' -> ' + String(status),
        }),
      )
    }
    if (quality && quality !== target.quality) {
      auditWrites.push(
        logLeadAdminAction({
          supabase,
          tenantId: target.tenant_id,
          leadId: target.id,
          actorAgentId: user.agentId || null,
          actorRole,
          actionType: 'quality_changed',
          targetField: 'quality',
          beforeValue: { quality: target.quality },
          afterValue: { quality },
          notes: (target.quality == null ? '(null)' : String(target.quality)) + ' -> ' + String(quality),
        }),
      )
    }
    if (auditWrites.length > 0) {
      await Promise.all(auditWrites)
    }

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
    // W6a-3: SELECT widened to capture full snapshot for audit before_value.
    // Snapshot survives lead destruction because the FK on
    // lead_admin_actions.lead_id was dropped in W6a-1.
    const { data: target } = await supabase
      .from('leads')
      .select('id, tenant_id, agent_id, contact_name, contact_email, contact_phone, status, quality, source, source_url, intent, geo_name, created_at')
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
    if (error) {
      console.error('[admin-homes/leads DELETE] lead-delete failed:', { leadId: target.id, tenantId: target.tenant_id, error })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // W6a-3 audit: snapshot the deleted lead. Best-effort (never-throw).
    const actorRole = user.role || (user.isPlatformAdmin ? 'platform_admin' : 'admin')
    await logLeadAdminAction({
      supabase,
      tenantId: target.tenant_id,
      leadId: target.id,
      actorAgentId: user.agentId || null,
      actorRole,
      actionType: 'lead_deleted',
      targetField: null,
      beforeValue: {
        contact_name: target.contact_name,
        contact_email: target.contact_email,
        contact_phone: target.contact_phone,
        status: target.status,
        quality: target.quality,
        agent_id: target.agent_id,
        source: target.source,
        source_url: target.source_url,
        intent: target.intent,
        geo_name: target.geo_name,
        created_at: target.created_at,
      },
      afterValue: null,
      notes: target.contact_email || target.contact_name || target.id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[admin-homes/leads DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
