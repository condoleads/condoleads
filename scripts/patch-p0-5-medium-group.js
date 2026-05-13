const fs = require('fs')

const routes = [
  // ─────────── R5: tenants/[id]/route.ts ───────────
  {
    name: 'R5: tenants/[id]/route.ts',
    path: 'C:/Condoleads/project/app/api/admin-homes/tenants/[id]/route.ts',
    idempotencyMarker: "from '@/lib/admin-homes/service-client'",
    importOld: `import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAccess } from '@/lib/admin-homes/api-auth'`,
    importNew: `import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'`,
    blocks: [
      {
        // GET → tenant.read
        old: `export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireTenantAccess(params.id)
  if ('error' in auth) return auth.error`,
        new: `export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const decision = can(user.permissions, 'tenant.read', { kind: 'tenant', tenantId: params.id })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  const supabase = createServiceClient()`,
        expected: 1
      },
      {
        // PATCH → tenant.write (AI config / API keys / hard cap surface)
        old: `export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireTenantAccess(params.id)
  if ('error' in auth) return auth.error`,
        new: `export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const decision = can(user.permissions, 'tenant.write', { kind: 'tenant', tenantId: params.id })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  const supabase = createServiceClient()`,
        expected: 1
      }
    ],
    renameAuthDot: true
  },

  // ─────────── R6: tenants/[id]/verify-resend/route.ts ───────────
  {
    name: 'R6: tenants/[id]/verify-resend/route.ts',
    path: 'C:/Condoleads/project/app/api/admin-homes/tenants/[id]/verify-resend/route.ts',
    idempotencyMarker: "from '@/lib/admin-homes/service-client'",
    importOld: `import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAccess } from '@/lib/admin-homes/api-auth'`,
    importNew: `import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'`,
    blocks: [
      {
        // POST → tenant.write (touches API key validation)
        old: `  const auth = await requireTenantAccess(tenantId, { allowedRoles: ['admin'] })
  if ('error' in auth) return auth.error

  const { supabase } = auth`,
        new: `  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const decision = can(user.permissions, 'tenant.write', { kind: 'tenant', tenantId })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  const supabase = createServiceClient()`,
        expected: 1
      }
    ],
    renameAuthDot: false
  },

  // ─────────── R7: users/override/route.ts ───────────
  // Trust-based: any tenant-resident can adjust user credits; hard cap is the safety net.
  // No can() because no fitting PermAction; raw resolveAdminHomesUser + cross-tenant guard.
  {
    name: 'R7: users/override/route.ts',
    path: 'C:/Condoleads/project/app/api/admin-homes/users/override/route.ts',
    idempotencyMarker: "from '@/lib/admin-homes/service-client'",
    importOld: `import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAccess } from '@/lib/admin-homes/api-auth'`,
    importNew: `import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'`,
    blocks: [
      {
        // POST + DELETE — same OLD/NEW pattern, replaceAll x2
        old: `    const auth = await requireTenantAccess(tenantId, { allowedRoles: ['admin', 'manager'] })
    if ('error' in auth) return auth.error
    const { supabase } = auth`,
        new: `    const user = await resolveAdminHomesUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Trust-based policy 2026-05-05: any tenant-resident can adjust user credits.
    // Hard cap (clamped below) is the safety net; tenant config gates the cap.
    if (!user.isPlatformAdmin && user.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Forbidden — cross-tenant access blocked' }, { status: 403 })
    }
    const supabase = createServiceClient()`,
        expected: 2
      }
    ],
    renameAuthDot: false
  },

  // ─────────── R8: tenants/verify-anthropic-key/route.ts ───────────
  {
    name: 'R8: tenants/verify-anthropic-key/route.ts',
    path: 'C:/Condoleads/project/app/api/admin-homes/tenants/verify-anthropic-key/route.ts',
    idempotencyMarker: "from '@/lib/admin-homes/permissions'",
    importOld: `import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requirePlatformAdmin, requireTenantAccess } from '@/lib/admin-homes/api-auth'`,
    importNew: `import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { can } from '@/lib/admin-homes/permissions'`,
    blocks: [
      {
        // Branched auth: tenantId → tenant.write, no tenantId → platform.write
        old: `  if (tenantId) {
    const auth = await requireTenantAccess(tenantId, { allowedRoles: ['admin'] })
    if ('error' in auth) return auth.error
  } else {
    const auth = await requirePlatformAdmin()
    if ('error' in auth) return auth.error
  }`,
        new: `  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (tenantId) {
    const decision = can(user.permissions, 'tenant.write', { kind: 'tenant', tenantId })
    if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  } else {
    const decision = can(user.permissions, 'platform.write', { kind: 'platform' })
    if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  }`,
        expected: 1
      }
    ],
    renameAuthDot: false
  },

  // ─────────── R9: agents/tree-data/route.ts ───────────
  // Already on resolveAdminHomesUser; replace inline allow-list with can('agent.read').
  // 'agent.read' permits any tenant-resident — matches trust-based policy.
  {
    name: 'R9: agents/tree-data/route.ts',
    path: 'C:/Condoleads/project/app/api/admin-homes/agents/tree-data/route.ts',
    idempotencyMarker: "from '@/lib/admin-homes/permissions'",
    importOld: `import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'`,
    importNew: `import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { can } from '@/lib/admin-homes/permissions'`,
    blocks: [
      {
        // Inline allow-list + tenant guard → tenant guard + can('agent.read')
        old: `  const allowed =
    user.isPlatformAdmin === true ||
    user.position === 'tenant_admin' ||
    user.position === 'assistant' ||
    user.position === 'area_manager' ||
    user.position === 'manager'
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!user.tenantId) {
    return NextResponse.json({ nodes: [], edges: [] })
  }`,
        new: `  if (!user.tenantId) {
    return NextResponse.json({ nodes: [], edges: [] })
  }

  const decision = can(user.permissions, 'agent.read', {
    kind: 'agent',
    agentId: '00000000-0000-0000-0000-000000000000',
    tenantId: user.tenantId,
    parentId: null,
    roleDb: 'agent',
  })
  if (!decision.ok) {
    return NextResponse.json({ error: decision.reason }, { status: decision.status })
  }`,
        expected: 1
      }
    ],
    renameAuthDot: false
  }
]

let failures = 0, skips = 0, successes = 0

for (const r of routes) {
  console.log('\n=== ' + r.name + ' ===')
  const original = fs.readFileSync(r.path, 'utf8')
  const useCRLF = original.includes('\r\n')

  if (original.includes(r.idempotencyMarker)) {
    console.log('[SKIP] already migrated (marker found: ' + r.idempotencyMarker + ')')
    skips++
    continue
  }

  let content = original.replace(/\r\n/g, '\n')

  // Imports
  if (!content.includes(r.importOld)) {
    console.error('[FAIL] OLD import not found')
    failures++; continue
  }
  if (content.split(r.importOld).length - 1 > 1) {
    console.error('[FAIL] OLD import not unique')
    failures++; continue
  }
  content = content.replace(r.importOld, r.importNew)
  console.log('  import patched')

  // Blocks
  let blockFailed = false
  for (let i = 0; i < r.blocks.length; i++) {
    const b = r.blocks[i]
    const count = content.split(b.old).length - 1
    if (count !== b.expected) {
      console.error('[FAIL] block ' + (i+1) + ' expected ' + b.expected + ', got ' + count)
      blockFailed = true; break
    }
    content = content.split(b.old).join(b.new)
    console.log('  block ' + (i+1) + ' patched (' + count + ' occurrence(s))')
  }
  if (blockFailed) { failures++; continue }

  // Optional rename
  if (r.renameAuthDot) {
    const supaBefore = (content.match(/auth\.supabase/g) || []).length
    const userBefore = (content.match(/auth\.user/g) || []).length
    content = content.replace(/auth\.supabase/g, 'supabase').replace(/auth\.user/g, 'user')
    console.log('  renamed auth.supabase x' + supaBefore + ', auth.user x' + userBefore)
  }

  // Stragglers
  const stragglers = content.match(/\bauth\.\w+/g)
  if (stragglers && stragglers.length > 0) {
    console.error('[FAIL] residual auth.* references: ' + stragglers.join(', '))
    failures++; continue
  }

  // Legacy import check
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
console.log('Successes: ' + successes)
console.log('Skips: ' + skips)
console.log('Failures: ' + failures)
process.exit(failures > 0 ? 1 : 0)