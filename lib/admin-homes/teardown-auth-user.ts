// lib/admin-homes/teardown-auth-user.ts
//
// W-AGENT-LIFECYCLE-INTEGRITY (2026-06-24): shared teardown for an auth user
// + all of its dependent rows in tables with NO ON DELETE CASCADE.
//
// Used by:
//   - app/api/admin-homes/agents/route.ts        (POST rollback on insert failure)
//   - app/api/admin-homes/agents/[id]/route.ts   (DELETE handler)
//
// Both call sites previously did only `user_profiles` + `auth.admin.deleteUser`,
// silently swallowing errors. That left orphan auth.users rows (and downstream
// rows like public.leads) when deleteUser failed against a non-cascade FK. The
// W-OVAIS cleanup surfaced the gap (orphan ce97a0bb persisted for weeks; a
// downstream public lead even attached to it before we cleaned up).
//
// ORDER (non-cascade FKs first, then auth.admin.deleteUser):
//   1. public.leads          — DELETE rows with user_id = authUserId
//   2. public.user_profiles  — DELETE row (on_auth_user_created trigger row)
//   3. defensive probes      — surface non-zero in {platform_admins,
//                              home_adjustments, saved_searches,
//                              tenant_floor_pool, user_favorites, agents}.
//                              Refuses to silently auto-delete business tables
//                              we don't expect to touch — name them in the
//                              error so the rollback model can be widened
//                              if necessary.
//   4. auth.admin.deleteUser — CASCADE clears identities/sessions/chat_sessions
//                              /tenant_users/mfa_factors/oauth_*/webauthn_*.
//
// Every step captures errors. On any failure, returns { ok:false, error, step,
// table } with a NAMED message so the caller can return a 500 with context.
// NEVER silently swallow.
//
// IMPORTANT for the DELETE-handler call site: the agents row MUST be deleted
// BEFORE calling this helper. Otherwise the defensive probe at step 3 will
// find that row (agents.user_id = authUserId) and abort. The helper enforces
// non-silence; it's the caller's responsibility to order correctly.

export interface TeardownResult {
  ok: boolean
  error?: string
  step?: number
  table?: string
  surprises?: string[]
}

interface MinimalSupabase {
  from(table: string): any
  auth: { admin: { deleteUser(id: string): Promise<{ data?: any; error: any }> } }
}

export async function teardownAuthUser(
  supabase: MinimalSupabase,
  authUserId: string
): Promise<TeardownResult> {
  // Step 1: leads (no cascade)
  {
    const { error } = await supabase.from('leads').delete().eq('user_id', authUserId)
    if (error) {
      return {
        ok: false, step: 1, table: 'leads',
        error: `rollback step 1 (leads) failed: ${error.message} — auth user ${authUserId} may be orphaned, manual cleanup needed`,
      }
    }
  }

  // Step 2: user_profiles (no cascade; on_auth_user_created trigger inserts this)
  {
    const { error } = await supabase.from('user_profiles').delete().eq('id', authUserId)
    if (error) {
      return {
        ok: false, step: 2, table: 'user_profiles',
        error: `rollback step 2 (user_profiles) failed: ${error.message} — auth user ${authUserId} may be orphaned, manual cleanup needed`,
      }
    }
  }

  // Step 3: defensive probes — NON-DESTRUCTIVE.
  // A fresh failed createUser (or a properly-ordered DELETE) should populate
  // none of these. If any do, surface as named error rather than silently
  // auto-deleting business tables we don't expect to touch.
  const defensiveTables: Array<{ table: string; col: string }> = [
    { table: 'platform_admins',   col: 'user_id' },
    { table: 'home_adjustments',  col: 'updated_by' },
    { table: 'saved_searches',    col: 'user_id' },
    { table: 'tenant_floor_pool', col: 'created_by' },
    { table: 'user_favorites',    col: 'user_id' },
    { table: 'agents',            col: 'user_id' },
  ]
  const surprises: string[] = []
  for (const { table, col } of defensiveTables) {
    const { count, error } = await supabase
      .from(table)
      .select(col, { count: 'exact', head: true })
      .eq(col, authUserId)
    if (error) {
      return {
        ok: false, step: 3, table,
        error: `rollback step 3 (probe ${table}.${col}) failed: ${error.message} — auth user ${authUserId} may be orphaned, manual cleanup needed`,
      }
    }
    if ((count ?? 0) > 0) surprises.push(`${table}.${col}=${count}`)
  }
  if (surprises.length > 0) {
    return {
      ok: false, step: 3, table: 'defensive-probe', surprises,
      error: `rollback step 3 (defensive probe) found unexpected rows for ${authUserId}: ${surprises.join(', ')} — refusing to silently auto-delete business tables; manual cleanup needed`,
    }
  }

  // Step 4: auth.admin.deleteUser (CASCADE handles auth.identities,
  // auth.sessions, public.chat_sessions, public.tenant_users, and all the
  // ON-DELETE-CASCADE FKs documented in W-OVAIS-FIX recon).
  {
    const { error } = await supabase.auth.admin.deleteUser(authUserId)
    if (error) {
      return {
        ok: false, step: 4, table: 'auth.users',
        error: `rollback step 4 (auth.admin.deleteUser) failed: ${error.message} — auth user ${authUserId} may be orphaned, manual cleanup needed`,
      }
    }
  }

  return { ok: true }
}
