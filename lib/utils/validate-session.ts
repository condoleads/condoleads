/**
 * Tenant-aware session validation gate.
 *
 * Replaces the hardcoded `.eq('source', 'walliam')` pattern across the
 * auth-gate sites in W-LEADS-EMAIL T6a target routes:
 *   - app/api/charlie/lead/route.ts
 *   - app/api/charlie/plan-email/route.ts
 *   - app/api/charlie/appointment/route.ts
 *
 * For routes where the session is already loaded (estimator/vip-request) or
 * where source is used for non-gate operations (estimator/session), this
 * helper is NOT used; those routes inline `tenant.source_key` access via
 * their existing tenant SELECT.
 *
 * Implementation:
 *   1. Verify sessionId, userId, tenantId all non-empty -> 401 if any missing
 *   2. Load `tenants.source_key` for tenantId
 *   3. Load `chat_sessions` WHERE id=sessionId AND user_id=userId AND
 *      tenant_id=tenantId AND source=source_key
 *   4. Any failure -> 401 'Invalid session'
 *   5. Success -> return the loaded session row
 *
 * Multitenant safety: the chat_sessions query enforces both tenant_id and
 * source filters. A forged x-tenant-id header that doesn't match the
 * session's actual tenant_id will not match (returns no row -> 401).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ValidateSessionParams {
  supabase: SupabaseClient
  sessionId: string | null | undefined
  userId: string | null | undefined
  tenantId: string | null | undefined
  selectColumns?: string // default 'id'
}

export type ValidateSessionResult =
  | { ok: true; session: Record<string, any> }
  | { ok: false; status: number; error: string }

export async function validateSession(params: ValidateSessionParams): Promise<ValidateSessionResult> {
  const { supabase } = params
  const sessionId = params.sessionId
  const userId = params.userId
  const tenantId = params.tenantId
  const selectColumns = params.selectColumns ?? 'id'

  if (!sessionId || !userId || !tenantId) {
    return { ok: false, status: 401, error: 'Invalid session' }
  }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('source_key')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantError || !tenant?.source_key) {
    return { ok: false, status: 401, error: 'Invalid session' }
  }

  const { data: session, error: sessionError } = await supabase
    .from('chat_sessions')
    .select(selectColumns)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('source', tenant.source_key)
    .maybeSingle()

  if (sessionError || !session) {
    return { ok: false, status: 401, error: 'Invalid session' }
  }

  return { ok: true, session: session as Record<string, any> }
}
