// lib/admin-homes/log-lead-admin-action.ts
// W-LEADS-WORKBENCH W4e.3 (2026-05-14) - audit-log writer for lead_admin_actions.
//
// First writer to the lead_admin_actions table (created by W2.a migration
// 20260513_w2_a_lead_admin_actions.sql). One row per admin-initiated action
// on a lead. First action_type shipped: 'email_sent' (W4e Send composer).
// Future writers: status/quality PATCHes, role reassignments, notes (W4g), etc.
//
// SCHEMA (verified 2026-05-14 against public.lead_admin_actions):
//   id              uuid         NOT NULL   default gen_random_uuid()
//   tenant_id       uuid         NOT NULL
//   lead_id         uuid         NOT NULL
//   actor_user_id   uuid         nullable
//   actor_agent_id  uuid         nullable
//   actor_role      text         NOT NULL
//   action_type     text         NOT NULL
//   target_field    text         nullable
//   before_value    jsonb        nullable
//   after_value     jsonb        nullable
//   notes           text         nullable
//   created_at      timestamptz  default now()
//
// FAILURE HANDLING
//   Insert errors log to console but do NOT throw. Audit failures must never
//   block the action they describe (mirrors the never-throw pattern in
//   logEmailRecipients).
//
// MULTITENANT CONTRACT
//   Every row carries tenant_id. Callers must pass the lead's tenant_id, not
//   the actor's, so cross-tenant writes (Manager Platform / Admin Platform)
//   land under the correct tenant scope.
//
// CALL-SITE PATTERN
//   await logLeadAdminAction({
//     supabase, tenantId: lead.tenant_id, leadId: lead.id,
//     actorAgentId: user.agentId, actorRole: actorRoleLabel(user),
//     actionType: 'email_sent',
//     afterValue: { to, subject, message_id, recipients_total },
//     notes: subject,
//   })

import type { SupabaseClient } from '@supabase/supabase-js'

export interface LogLeadAdminActionParams {
  supabase: SupabaseClient
  /** Lead's tenant_id (NOT actor's). Required to land the row under the
   *  correct tenant scope when the actor is a cross-tenant platform admin. */
  tenantId: string
  leadId: string
  /** auth.users.id if available. admin-homes typically populates actorAgentId
   *  instead; this column is for future SSO/non-agent contexts. */
  actorUserId?: string | null
  /** agents.id of the actor. Null for pure platform admins with no agents row. */
  actorAgentId: string | null
  /** Free-form label. Conventions:
   *    'agent' | 'manager' | 'area_manager' | 'tenant_admin' |
   *    'admin' (legacy tenant-admin DB value, see lib/admin-homes/permissions.ts) |
   *    'platform_admin' | 'platform_manager'.
   *  NOT NULL in DB. */
  actorRole: string
  /** Free-form action label. First known value: 'email_sent' (W4e). */
  actionType: string
  /** Optional column-name pointer when action_type narrows to a single field
   *  (e.g. 'status' when action_type is 'status_changed'). */
  targetField?: string | null
  /** Pre-state. Pass undefined to record NULL. */
  beforeValue?: unknown
  /** Post-state. Pass undefined to record NULL. */
  afterValue?: unknown
  notes?: string | null
}

interface AuditRow {
  tenant_id: string
  lead_id: string
  actor_user_id: string | null
  actor_agent_id: string | null
  actor_role: string
  action_type: string
  target_field: string | null
  before_value: unknown
  after_value: unknown
  notes: string | null
}

export async function logLeadAdminAction(params: LogLeadAdminActionParams): Promise<void> {
  const row: AuditRow = {
    tenant_id: params.tenantId,
    lead_id: params.leadId,
    actor_user_id: params.actorUserId ?? null,
    actor_agent_id: params.actorAgentId,
    actor_role: params.actorRole,
    action_type: params.actionType,
    target_field: params.targetField ?? null,
    before_value: params.beforeValue !== undefined ? params.beforeValue : null,
    after_value: params.afterValue !== undefined ? params.afterValue : null,
    notes: params.notes ?? null,
  }

  const { error } = await params.supabase.from('lead_admin_actions').insert(row)
  if (error) {
    console.error('[W4e.3 logLeadAdminAction] insert failed:', {
      tenantId: params.tenantId,
      leadId: params.leadId,
      actionType: params.actionType,
      error: error.message ?? error,
    })
  }
}