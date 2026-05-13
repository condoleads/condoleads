const fs = require('fs')

const routes = [
  {
    name: 'R14: leads/[id]/route.ts',
    path: 'C:/Condoleads/project/app/api/admin-homes/leads/[id]/route.ts',
    importOld: `import { NextRequest, NextResponse } from 'next/server'\nimport { requireLeadAccess } from '@/lib/admin-homes/api-auth'`,
    importNew: `import { NextRequest, NextResponse } from 'next/server'\nimport { resolveAdminHomesUser } from '@/lib/admin-homes/auth'\nimport { createServiceClient } from '@/lib/admin-homes/service-client'\nimport { can } from '@/lib/admin-homes/permissions'`,
    blocks: [
      {
        // PATCH -> lead.write
        old: `export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {\n  try {\n    const auth = await requireLeadAccess(params.id)\n    if ('error' in auth) return auth.error`,
        new: `export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {\n  try {\n    const user = await resolveAdminHomesUser()\n    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })\n    const supabase = createServiceClient()\n    const { data: target } = await supabase\n      .from('leads')\n      .select('id, tenant_id, agent_id')\n      .eq('id', params.id)\n      .maybeSingle()\n    if (!target) {\n      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })\n    }\n    const decision = can(user.permissions, 'lead.write', {\n      kind: 'lead',\n      leadId: target.id,\n      tenantId: target.tenant_id,\n      agentId: target.agent_id,\n    })\n    if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })`,
        expected: 1
      },
      {
        // DELETE -> lead.write + preserved agent-role exclusion
        old: `export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {\n  try {\n    const auth = await requireLeadAccess(params.id)\n    if ('error' in auth) return auth.error\n\n    // DELETE additionally restricted to admin / manager (no agent / managed destructive deletes)\n    if (!auth.user.isPlatformAdmin && auth.user.role !== 'admin' && auth.user.role !== 'manager') {\n      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })\n    }`,
        new: `export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {\n  try {\n    const user = await resolveAdminHomesUser()\n    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })\n    const supabase = createServiceClient()\n    const { data: target } = await supabase\n      .from('leads')\n      .select('id, tenant_id, agent_id')\n      .eq('id', params.id)\n      .maybeSingle()\n    if (!target) {\n      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })\n    }\n    const decision = can(user.permissions, 'lead.write', {\n      kind: 'lead',\n      leadId: target.id,\n      tenantId: target.tenant_id,\n      agentId: target.agent_id,\n    })\n    if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })\n\n    // DELETE additionally restricted: no agent destructive deletes (legacy compliance policy preserved).\n    if (!user.isPlatformAdmin && user.permissions.roleDb === 'agent') {\n      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })\n    }`,
        expected: 1
      }
    ],
    needsAuthRename: true
  },
  {
    name: 'R15: tenants/[id]/lifecycle/route.ts',
    path: 'C:/Condoleads/project/app/api/admin-homes/tenants/[id]/lifecycle/route.ts',
    importOld: `import { NextRequest, NextResponse } from 'next/server'\nimport { createServerClient } from '@/lib/supabase/server'\nimport { resolveAdminHomesUser } from '@/lib/admin-homes/auth'`,
    importNew: `import { NextRequest, NextResponse } from 'next/server'\nimport { createServerClient } from '@/lib/supabase/server'\nimport { resolveAdminHomesUser } from '@/lib/admin-homes/auth'\nimport { can } from '@/lib/admin-homes/permissions'`,
    blocks: [
      {
        // Replace inline platform-admin/tenant-admin check with can('tenant.write')
        old: `  // Authorization: platform admin OR tenant_admin of this tenant\n  const isPlatformAdmin = user.isPlatformAdmin === true\n  const isOwnTenantAdmin = user.position === 'tenant_admin' && user.tenantId === tenantId\n  if (!isPlatformAdmin && !isOwnTenantAdmin) {\n    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })\n  }`,
        new: `  // Authorization via can() - tenant.write requires tier 4 (tenant_admin) or platform tier.\n  const decision = can(user.permissions, 'tenant.write', { kind: 'tenant', tenantId })\n  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })`,
        expected: 1
      }
    ],
    needsAuthRename: false
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
  if (r.needsAuthRename) {
    const supaB = (content.match(/auth\.supabase/g) || []).length
    const targetB = (content.match(/auth\.target/g) || []).length
    const userB = (content.match(/auth\.user/g) || []).length
    content = content.replace(/auth\.supabase/g, 'supabase').replace(/auth\.target/g, 'target').replace(/auth\.user/g, 'user')
    console.log('  renamed: auth.supabase x' + supaB + ', auth.target x' + targetB + ', auth.user x' + userB)
  }
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