const fs = require('fs')

const STD = `(\n  _request: NextRequest,\n  { params }: { params: { id: string } }\n) {`
const STD_REQ = `(\n  request: NextRequest,\n  { params }: { params: { id: string } }\n) {`
const R10_DELETE_DECL = `(_req: NextRequest, { params }: { params: { id: string } }) {`

function block(funcDecl, action, authArgs) {
  return {
    old: `${funcDecl}\n  const auth = await requireAgentAccess(${authArgs})\n  if ('error' in auth) return auth.error`,
    new: `${funcDecl}\n  const user = await resolveAdminHomesUser()\n  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })\n  const supabase = createServiceClient()\n  const { data: target } = await supabase\n    .from('agents')\n    .select('id, tenant_id, parent_id, site_type, role')\n    .eq('id', params.id)\n    .maybeSingle()\n  if (!target || target.site_type !== 'comprehensive') {\n    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })\n  }\n  const decision = can(user.permissions, '${action}', {\n    kind: 'agent',\n    agentId: target.id,\n    tenantId: target.tenant_id,\n    parentId: target.parent_id,\n    roleDb: (target.role || 'agent') as DbRole,\n  })\n  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })`,
    expected: 1
  }
}

const IMPORT_OLD = `import { NextRequest, NextResponse } from 'next/server'\nimport { requireAgentAccess } from '@/lib/admin-homes/api-auth'`
const IMPORT_NEW = `import { NextRequest, NextResponse } from 'next/server'\nimport { resolveAdminHomesUser } from '@/lib/admin-homes/auth'\nimport { createServiceClient } from '@/lib/admin-homes/service-client'\nimport { can, type DbRole } from '@/lib/admin-homes/permissions'`

const routes = [
  {
    name: 'R10: agents/[id]/route.ts',
    path: 'C:/Condoleads/project/app/api/admin-homes/agents/[id]/route.ts',
    importOld: IMPORT_OLD, importNew: IMPORT_NEW,
    blocks: [
      block('export async function GET' + STD, 'agent.read', 'params.id'),
      block('export async function PUT' + STD_REQ, 'agent.write', 'params.id, { requireWrite: true }'),
      block('export async function DELETE' + R10_DELETE_DECL, 'agent.adminMutate', 'params.id, { requireWrite: true, requireAdmin: true }')
    ]
  },
  {
    name: 'R11: agents/[id]/buildings/route.ts',
    path: 'C:/Condoleads/project/app/api/admin-homes/agents/[id]/buildings/route.ts',
    importOld: IMPORT_OLD, importNew: IMPORT_NEW,
    blocks: [
      block('export async function GET' + STD, 'agent.read', 'params.id'),
      block('export async function POST' + STD_REQ, 'agent.write', 'params.id, { requireWrite: true }')
    ]
  },
  {
    name: 'R12: agents/[id]/geo/route.ts',
    path: 'C:/Condoleads/project/app/api/admin-homes/agents/[id]/geo/route.ts',
    importOld: IMPORT_OLD, importNew: IMPORT_NEW,
    blocks: [
      block('export async function GET' + STD, 'agent.read', 'params.id'),
      block('export async function POST' + STD_REQ, 'agent.write', 'params.id, { requireWrite: true }')
    ]
  },
  {
    name: 'R13: agents/[id]/listings/route.ts',
    path: 'C:/Condoleads/project/app/api/admin-homes/agents/[id]/listings/route.ts',
    importOld: IMPORT_OLD, importNew: IMPORT_NEW,
    blocks: [
      block('export async function GET' + STD, 'agent.read', 'params.id'),
      block('export async function POST' + STD_REQ, 'agent.write', 'params.id, { requireWrite: true }'),
      block('export async function DELETE' + STD_REQ, 'agent.write', 'params.id, { requireWrite: true }')
    ]
  }
]

const IDEMPOTENCY_MARKER = "from '@/lib/admin-homes/permissions'"
const LEGACY_PATTERNS = ['auth.supabase', 'auth.target', 'auth.user', 'auth.error']

let failures = 0, skips = 0, successes = 0
for (const r of routes) {
  console.log('\n=== ' + r.name + ' ===')
  const original = fs.readFileSync(r.path, 'utf8')
  const useCRLF = original.includes('\r\n')
  if (original.includes(IDEMPOTENCY_MARKER)) {
    console.log('[SKIP] already migrated')
    skips++; continue
  }
  let content = original.replace(/\r\n/g, '\n')
  if (!content.includes(r.importOld)) { console.error('[FAIL] OLD import not found'); failures++; continue }
  if (content.split(r.importOld).length - 1 > 1) { console.error('[FAIL] OLD import not unique'); failures++; continue }
  content = content.replace(r.importOld, r.importNew)
  console.log('  import patched')
  let blockFailed = false
  for (let i = 0; i < r.blocks.length; i++) {
    const b = r.blocks[i]
    const count = content.split(b.old).length - 1
    if (count !== b.expected) {
      console.error('[FAIL] block ' + (i+1) + ' expected ' + b.expected + ', got ' + count)
      blockFailed = true; break
    }
    content = content.split(b.old).join(b.new)
    console.log('  block ' + (i+1) + ' patched')
  }
  if (blockFailed) { failures++; continue }
  const supaB = (content.match(/auth\.supabase/g) || []).length
  const targetB = (content.match(/auth\.target/g) || []).length
  const userB = (content.match(/auth\.user/g) || []).length
  content = content.replace(/auth\.supabase/g, 'supabase').replace(/auth\.target/g, 'target').replace(/auth\.user/g, 'user')
  console.log('  renamed: auth.supabase x' + supaB + ', auth.target x' + targetB + ', auth.user x' + userB)
  // FIXED: specific legacy-pattern check (avoids false positive on supabase.auth.admin)
  const stragglers = LEGACY_PATTERNS.filter(p => content.includes(p))
  if (stragglers.length > 0) {
    console.error('[FAIL] residual legacy auth references: ' + stragglers.join(', '))
    failures++; continue
  }
  if (content.match(/const\s+auth\s*=\s*await\s+require/)) {
    console.error('[FAIL] residual legacy auth declaration')
    failures++; continue
  }
  if (content.includes("from '@/lib/admin-homes/api-auth'")) {
    console.error('[FAIL] legacy api-auth import still present')
    failures++; continue
  }
  const final = useCRLF ? content.replace(/\n/g, '\r\n') : content
  fs.writeFileSync(r.path, final, 'utf8')
  console.log('  written: ' + original.length + ' -> ' + final.length + ' bytes (delta ' + (final.length - original.length) + ')')
  successes++
}
console.log('\n=== Summary ===')
console.log('Successes: ' + successes + ' / Skips: ' + skips + ' / Failures: ' + failures)
process.exit(failures > 0 ? 1 : 0)