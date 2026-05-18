// lib/auth/get-or-create-by-email.ts
//
// G2 helper: resolve an auth.users row by email, creating one if absent.
// Supabase Admin has no getUserByEmail, so we use a create-then-list
// fallback: try createUser first (cheap, common path), fall back to
// paginating listUsers on conflict (rare path).
//
// Used by W-LEAD-FLOW G2: every System 2 lead-write route must produce a
// lead with non-NULL user_id so the workbench Credits & Usage tab is
// functional. The public contact form has no session context; it calls
// this helper to resolve user_id from the submitted email.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface GetOrCreateAuthUserResult {
  userId: string
  created: boolean
}

/**
 * Resolve an auth.users row by email; create one if it doesn't exist.
 *
 * @param supabase  service-role Supabase client (auth.admin requires it)
 * @param email     email to resolve (will be lowercased + trimmed)
 * @param metadata  optional user_metadata stamped on creation only
 * @throws on non-conflict create error, or conflict-without-find data
 *         integrity violation
 */
export async function getOrCreateAuthUserByEmail(
  supabase: SupabaseClient,
  email: string,
  metadata?: Record<string, any>
): Promise<GetOrCreateAuthUserResult> {
  const normalizedEmail = (email || '').trim().toLowerCase()
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error(
      'getOrCreateAuthUserByEmail: invalid email ' + JSON.stringify(email)
    )
  }

  // Step 1: try create. Common path -- most contacts are new emails.
  const createResp = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
    user_metadata: metadata || {},
  })

  if (createResp.data?.user?.id && !createResp.error) {
    return { userId: createResp.data.user.id, created: true }
  }

  // Step 2: classify the error. Conflict -> fall through. Else -> throw.
  const errMsg = (createResp.error?.message || '').toLowerCase()
  const errStatus = (createResp.error as any)?.status
  const isConflict =
    errMsg.includes('already') ||
    errMsg.includes('registered') ||
    errMsg.includes('exists') ||
    errStatus === 422

  if (!isConflict) {
    throw new Error(
      'getOrCreateAuthUserByEmail: createUser failed for ' +
        normalizedEmail +
        ': ' +
        (createResp.error?.message || 'unknown error') +
        ' (status=' +
        (errStatus !== undefined ? errStatus : 'n/a') +
        ')'
    )
  }

  // Step 3: paginate listUsers to find the existing row.
  const perPage = 200
  const maxPages = 50

  for (let page = 1; page <= maxPages; page++) {
    const listResp = await supabase.auth.admin.listUsers({ page, perPage })
    if (listResp.error) {
      throw new Error(
        'getOrCreateAuthUserByEmail: listUsers failed while resolving ' +
          normalizedEmail +
          ': ' +
          listResp.error.message
      )
    }
    const users = listResp.data?.users || []
    const found = users.find(
      (u: { email?: string | null }) =>
        (u.email || '').toLowerCase() === normalizedEmail
    )
    if (found && found.id) {
      return { userId: found.id, created: false }
    }
    if (users.length < perPage) {
      break // last page
    }
  }

  throw new Error(
    'getOrCreateAuthUserByEmail: ' +
      normalizedEmail +
      ' reported as already registered but not found in listUsers (scanned ' +
      maxPages +
      ' pages of ' +
      perPage +
      ')'
  )
}
