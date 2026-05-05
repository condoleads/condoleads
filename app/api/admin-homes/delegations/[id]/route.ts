// app/api/admin-homes/delegations/[id]/route.ts
// W-ROLES-DELEGATION/R5 — Delegation revoke endpoint.
// System 2 only — WALLiam admin-homes.
//
// DELETE /api/admin-homes/delegations/[id]
//   Optional body: { reason?: string }
//
// revokeDelegation() wrapper in role-transitions.ts owns:
//   - can('delegation.revoke', { kind: 'delegation', delegatorId, delegateId, tenantId })
//   - rpc_revoke_delegation(p_actor_id, p_delegation_id, p_reason)
//   - 404 if not found, 400 if already revoked.
//
// Next.js 14.2.5 — params is sync; no await needed.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { revokeDelegation } from '@/lib/admin-homes/role-transitions'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await resolveAdminHomesUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = params
  if (!id) {
    return NextResponse.json(
      { error: 'Delegation id is required' },
      { status: 400 },
    )
  }

  // DELETE may have empty body; reason is optional.
  let reason: string | undefined
  try {
    const body = await request.json()
    if (body && typeof body.reason === 'string') {
      reason = body.reason
    }
  } catch {
    // Empty body is valid — proceed without reason.
  }

  const result = await revokeDelegation(user, id, reason)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, code: result.invariant ?? null },
      { status: result.status },
    )
  }
  return NextResponse.json({ delegation: result.payload }, { status: 200 })
}
