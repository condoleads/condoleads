// scripts/r5-delegations-deploy.js
// W-ROLES-DELEGATION/R5 — deploys delegation API route files.
// Usage: node scripts/r5-delegations-deploy.js
// New files only — no backups required (Rule Zero exemption for new files).
// Idempotent: refuses to overwrite existing files. Use git restore to redeploy.

const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = process.cwd()

// ─────────────────────────────────────────────────────────────────────────────
// File 1: app/api/admin-homes/delegations/route.ts  (GET + POST)
// ─────────────────────────────────────────────────────────────────────────────
const FILE1_REL = "app/api/admin-homes/delegations/route.ts"
const FILE1_LINES = [
  "// app/api/admin-homes/delegations/route.ts",
  "// W-ROLES-DELEGATION/R5 — Delegation CRUD API (collection endpoints).",
  "// System 2 only — WALLiam admin-homes.",
  "//",
  "// GET   /api/admin-homes/delegations?agent_id=<uuid>[&include_revoked=true]",
  "//        — list delegations where the agent is delegator OR delegate, scoped",
  "//          to the agent's tenant. Authenticated tenant residents only.",
  "// POST  /api/admin-homes/delegations",
  "//        body: { delegator_id, delegate_id, notes? }",
  "//        — calls grantDelegation() wrapper; permission gate + RPC live there.",
  "//",
  "// Pattern matches app/api/admin-homes/agents/route.ts post-P0-5",
  "// (W-ADMIN-AUTH-LOCKDOWN). Wrappers in role-transitions.ts own all",
  "// can('delegation.{grant,revoke}', ...) checks and SECURITY DEFINER RPCs.",
  "",
  "import { NextRequest, NextResponse } from 'next/server'",
  "import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'",
  "import { createServiceClient } from '@/lib/admin-homes/service-client'",
  "import { grantDelegation } from '@/lib/admin-homes/role-transitions'",
  "",
  "// ── GET ──────────────────────────────────────────────────────────────────────",
  "export async function GET(request: NextRequest) {",
  "  const user = await resolveAdminHomesUser()",
  "  if (!user) {",
  "    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })",
  "  }",
  "",
  "  const url = new URL(request.url)",
  "  const agentId = url.searchParams.get('agent_id')",
  "  const includeRevoked = url.searchParams.get('include_revoked') === 'true'",
  "",
  "  if (!agentId) {",
  "    return NextResponse.json(",
  "      { error: 'agent_id query param is required' },",
  "      { status: 400 },",
  "    )",
  "  }",
  "",
  "  const supabase = createServiceClient()",
  "",
  "  // Look up the agent's tenant for scope check.",
  "  const { data: agentRow, error: agentErr } = await supabase",
  "    .from('agents')",
  "    .select('id, tenant_id')",
  "    .eq('id', agentId)",
  "    .maybeSingle()",
  "",
  "  if (agentErr) {",
  "    return NextResponse.json({ error: agentErr.message }, { status: 500 })",
  "  }",
  "  if (!agentRow) {",
  "    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })",
  "  }",
  "",
  "  // Tenant scoping: agent must be in the user's tenant unless platform admin",
  "  // is operating without a selected tenant (legacy 'see all' behavior, matches",
  "  // app/api/admin-homes/agents/route.ts pattern).",
  "  const isPlatformAdminAcrossTenants =",
  "    user.isPlatformAdmin && !user.tenantId",
  "  if (!isPlatformAdminAcrossTenants) {",
  "    if (!user.tenantId || agentRow.tenant_id !== user.tenantId) {",
  "      return NextResponse.json(",
  "        { error: 'Forbidden — cross-tenant read' },",
  "        { status: 403 },",
  "      )",
  "    }",
  "  }",
  "",
  "  let query = supabase",
  "    .from('agent_delegations')",
  "    .select(",
  "      'id, delegator_id, delegate_id, tenant_id, granted_at, granted_by, revoked_at, revoked_by, notes',",
  "    )",
  "    .eq('tenant_id', agentRow.tenant_id)",
  "    .or(`delegator_id.eq.${agentId},delegate_id.eq.${agentId}`)",
  "    .order('granted_at', { ascending: false })",
  "",
  "  if (!includeRevoked) {",
  "    query = query.is('revoked_at', null)",
  "  }",
  "",
  "  const { data, error } = await query",
  "  if (error) {",
  "    return NextResponse.json({ error: error.message }, { status: 500 })",
  "  }",
  "",
  "  return NextResponse.json({ delegations: data ?? [] })",
  "}",
  "",
  "// ── POST ─────────────────────────────────────────────────────────────────────",
  "export async function POST(request: NextRequest) {",
  "  const user = await resolveAdminHomesUser()",
  "  if (!user) {",
  "    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })",
  "  }",
  "",
  "  let body: { delegator_id?: string; delegate_id?: string; notes?: string }",
  "  try {",
  "    body = await request.json()",
  "  } catch {",
  "    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })",
  "  }",
  "",
  "  const { delegator_id, delegate_id, notes } = body",
  "  if (!delegator_id || !delegate_id) {",
  "    return NextResponse.json(",
  "      { error: 'delegator_id and delegate_id are required' },",
  "      { status: 400 },",
  "    )",
  "  }",
  "",
  "  const result = await grantDelegation(user, delegator_id, delegate_id, notes)",
  "  if (!result.ok) {",
  "    return NextResponse.json(",
  "      { error: result.reason, code: result.code ?? null },",
  "      { status: result.status },",
  "    )",
  "  }",
  "  return NextResponse.json({ delegation: result.payload }, { status: 201 })",
  "}",
  "",
]

// ─────────────────────────────────────────────────────────────────────────────
// File 2: app/api/admin-homes/delegations/[id]/route.ts  (DELETE)
// ─────────────────────────────────────────────────────────────────────────────
const FILE2_REL = "app/api/admin-homes/delegations/[id]/route.ts"
const FILE2_LINES = [
  "// app/api/admin-homes/delegations/[id]/route.ts",
  "// W-ROLES-DELEGATION/R5 — Delegation revoke endpoint.",
  "// System 2 only — WALLiam admin-homes.",
  "//",
  "// DELETE /api/admin-homes/delegations/[id]",
  "//   Optional body: { reason?: string }",
  "//",
  "// revokeDelegation() wrapper in role-transitions.ts owns:",
  "//   - can('delegation.revoke', { kind: 'delegation', delegatorId, delegateId, tenantId })",
  "//   - rpc_revoke_delegation(p_actor_id, p_delegation_id, p_reason)",
  "//   - 404 if not found, 400 if already revoked.",
  "//",
  "// Next.js 14.2.5 — params is sync; no await needed.",
  "",
  "import { NextRequest, NextResponse } from 'next/server'",
  "import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'",
  "import { revokeDelegation } from '@/lib/admin-homes/role-transitions'",
  "",
  "export async function DELETE(",
  "  request: NextRequest,",
  "  { params }: { params: { id: string } },",
  ") {",
  "  const user = await resolveAdminHomesUser()",
  "  if (!user) {",
  "    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })",
  "  }",
  "",
  "  const { id } = params",
  "  if (!id) {",
  "    return NextResponse.json(",
  "      { error: 'Delegation id is required' },",
  "      { status: 400 },",
  "    )",
  "  }",
  "",
  "  // DELETE may have empty body; reason is optional.",
  "  let reason: string | undefined",
  "  try {",
  "    const body = await request.json()",
  "    if (body && typeof body.reason === 'string') {",
  "      reason = body.reason",
  "    }",
  "  } catch {",
  "    // Empty body is valid — proceed without reason.",
  "  }",
  "",
  "  const result = await revokeDelegation(user, id, reason)",
  "  if (!result.ok) {",
  "    return NextResponse.json(",
  "      { error: result.reason, code: result.code ?? null },",
  "      { status: result.status },",
  "    )",
  "  }",
  "  return NextResponse.json({ delegation: result.payload }, { status: 200 })",
  "}",
  "",
]

const FILES = [
  { rel: FILE1_REL, lines: FILE1_LINES },
  { rel: FILE2_REL, lines: FILE2_LINES },
]

// ─────────────────────────────────────────────────────────────────────────────
// Pre-flight: refuse to overwrite existing files.
// ─────────────────────────────────────────────────────────────────────────────
console.log('[R5-DEPLOY] W-ROLES-DELEGATION/R5 — delegation CRUD API')
console.log('[R5-DEPLOY] PROJECT_ROOT: ' + PROJECT_ROOT)
console.log('')

let abort = false
for (const f of FILES) {
  const abs = path.join(PROJECT_ROOT, f.rel)
  if (fs.existsSync(abs)) {
    console.error('[R5-DEPLOY] REFUSE: ' + f.rel + ' already exists.')
    abort = true
  }
}
if (abort) {
  console.error('')
  console.error('[R5-DEPLOY] Aborted — no files written.')
  console.error('[R5-DEPLOY] Run `git restore` or delete the files first if you want to redeploy.')
  process.exit(1)
}

// ─────────────────────────────────────────────────────────────────────────────
// Write files (UTF-8, LF line endings).
// ─────────────────────────────────────────────────────────────────────────────
for (const f of FILES) {
  const abs = path.join(PROJECT_ROOT, f.rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const content = f.lines.join('\n')
  fs.writeFileSync(abs, content, { encoding: 'utf8' })
  const size = fs.statSync(abs).size
  console.log('[R5-DEPLOY] WROTE  ' + f.rel + '  (' + size + ' bytes)')
}

console.log('')
console.log('[R5-DEPLOY] Done. Next steps:')
console.log('  1. npx tsc --noEmit')
console.log('  2. git add app/api/admin-homes/delegations')
console.log('  3. git commit -m "W-ROLES-DELEGATION/R5 — delegation CRUD API routes"')
console.log('  4. git push')
console.log('')