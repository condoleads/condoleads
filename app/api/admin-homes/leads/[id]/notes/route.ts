// app/api/admin-homes/leads/[id]/notes/route.ts
// W-LEADS-WORKBENCH W4g (2026-05-14)
//
// POST endpoint for adding a note to a lead. Mirrors the existing System 1
// addLeadNote INSERT shape (from lib/actions/lead-management.ts L59-67) so
// rows written by either system are mutually readable. System 1 file is
// UNTOUCHED -- this endpoint does its own INSERT directly against lead_notes.
//
// MULTITENANT CONTRACT (Rule Zero #1)
//   - lead_notes has no tenant_id column (F-LEAD-NOTES-NO-TENANT-ID-COLUMN).
//   - Tenant safety derives from lead.tenant_id verified before INSERT.
//   - lead_id FK to leads.id provides implicit tenant binding for reads.
//
// AUTHOR RESOLUTION (b) -- fallback chain
//   1. user.agentId (if the actor has an agents row in this tenant)
//   2. lead.agent_id (the lead's owning agent)
// Both options write a valid agent_id to lead_notes (NOT NULL satisfied).
// The precise actor (e.g. platform_admin Syed Shah) is captured in
// lead_admin_actions.actor_agent_id + actor_role. NotesTab UI attributes
// to lead_notes.agent_id; ActivityTab shows the precise actor.
//
// PERMISSION CONTRACT
//   can(user.permissions, 'lead.write', { kind: 'lead', ... }) -- same gate
//   as PATCH and W4e send-email. Adding a note is a write-class action.
//
// REQUEST BODY
//   { note: string }  // 1..10000 chars after trim
//
// AUDIT
//   logLeadAdminAction writes one row with action_type='note_added' and
//   after_value containing { note_id, note_length, note_preview (first 80
//   chars), agent_id (resolved), via_fallback (true if used lead.agent_id) }.
//   Audit is best-effort (never-throw).

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'
import { logLeadAdminAction } from '@/lib/admin-homes/log-lead-admin-action'

const MAX_NOTE_LEN = 10_000

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await resolveAdminHomesUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServiceClient()

    const { data: lead } = await supabase
      .from('leads')
      .select('id, tenant_id, agent_id')
      .eq('id', params.id)
      .maybeSingle()

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const decision = can(user.permissions, 'lead.write', {
      kind: 'lead',
      leadId: lead.id,
      tenantId: lead.tenant_id,
      agentId: lead.agent_id,
    })
    if (!decision.ok) {
      return NextResponse.json({ error: decision.reason }, { status: decision.status })
    }

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const rawNote = typeof body?.note === 'string' ? body.note : ''
    const note = rawNote.trim()
    if (!note) {
      return NextResponse.json({ error: 'Note is required' }, { status: 400 })
    }
    if (note.length > MAX_NOTE_LEN) {
      return NextResponse.json(
        { error: 'Note exceeds ' + MAX_NOTE_LEN + ' chars', length: note.length },
        { status: 400 },
      )
    }

    // Author resolution: prefer the user's own agent_id; fall back to the
    // lead's owning agent when the user has no agents row in this tenant
    // (typical for platform admins viewing a tenant lead).
    const resolvedAgentId: string | null = user.agentId || lead.agent_id || null
    const viaFallback = !user.agentId && Boolean(lead.agent_id)

    if (!resolvedAgentId) {
      // No agent context available at all: neither the user nor the lead
      // has an agent. lead_notes.agent_id is NOT NULL -- cannot proceed.
      return NextResponse.json(
        {
          error:
            'Cannot resolve note author: neither the current user nor the lead has an associated agent',
        },
        { status: 409 },
      )
    }

    const { data: inserted, error: insertError } = await supabase
      .from('lead_notes')
      .insert({
        lead_id: lead.id,
        agent_id: resolvedAgentId,
        note,
        created_at: new Date().toISOString(),
      })
      .select('id, lead_id, agent_id, note, created_at, updated_at, agents(id, full_name)')
      .single()

    if (insertError || !inserted) {
      console.error('[admin-homes/leads/[id]/notes POST] insert failed:', insertError)
      return NextResponse.json(
        { error: 'Failed to insert note', detail: insertError?.message ?? null },
        { status: 500 },
      )
    }

    // Audit (best-effort).
    const actorRole =
      user.role || (user.isPlatformAdmin ? 'platform_admin' : 'admin')
    const preview = note.length > 80 ? note.slice(0, 80) + '\u2026' : note
    await logLeadAdminAction({
      supabase,
      tenantId: lead.tenant_id,
      leadId: lead.id,
      actorAgentId: user.agentId || null,
      actorRole,
      actionType: 'note_added',
      targetField: null,
      afterValue: {
        note_id: (inserted as any).id,
        note_length: note.length,
        note_preview: preview,
        agent_id: resolvedAgentId,
        via_fallback: viaFallback,
      },
      notes: preview,
    })

    return NextResponse.json({
      success: true,
      note: inserted,
      viaFallback,
    })
  } catch (error) {
    console.error('[admin-homes/leads/[id]/notes POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
