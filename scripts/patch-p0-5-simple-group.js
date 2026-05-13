const fs = require('fs')

const routes = [
  {
    name: 'Route 1: activities/route.ts',
    path: 'C:/Condoleads/project/app/api/admin-homes/activities/route.ts',
    importOld: `import { NextRequest, NextResponse } from 'next/server'
import { requireAdminHomesUser } from '@/lib/admin-homes/api-auth'`,
    importNew: `import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'`,
    blocks: [
      {
        old: `    const auth = await requireAdminHomesUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth`,
        new: `    const user = await resolveAdminHomesUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const supabase = createServiceClient()`
      }
    ],
    expectedAuthCount: 1,
    renameAuthDot: false
  },
  {
    name: 'Route 2: agents/list/route.ts',
    path: 'C:/Condoleads/project/app/api/admin-homes/agents/list/route.ts',
    importOld: `import { NextResponse } from 'next/server'
import { requireAdminHomesUser } from '@/lib/admin-homes/api-auth'`,
    importNew: `import { NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'`,
    blocks: [
      {
        old: `  const auth = await requireAdminHomesUser()
  if ('error' in auth) return auth.error
  const { user, supabase } = auth`,
        new: `  const user = await resolveAdminHomesUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createServiceClient()`
      }
    ],
    expectedAuthCount: 1,
    renameAuthDot: false
  },
  {
    name: 'Route 3: tenants/route.ts',
    path: 'C:/Condoleads/project/app/api/admin-homes/tenants/route.ts',
    importOld: `import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/admin-homes/api-auth'`,
    importNew: `import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'`,
    blocks: [
      {
        // GET — platform.read
        old: `export async function GET(request: NextRequest) {
  const auth = await requirePlatformAdmin()
  if ('error' in auth) return auth.error`,
        new: `export async function GET(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const decision = can(user.permissions, 'platform.read', { kind: 'platform' })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  const supabase = createServiceClient()`
      },
      {
        // PUT — platform.write
        old: `export async function PUT(request: NextRequest) {
  const auth = await requirePlatformAdmin()
  if ('error' in auth) return auth.error`,
        new: `export async function PUT(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const decision = can(user.permissions, 'platform.write', { kind: 'platform' })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  const supabase = createServiceClient()`
      },
      {
        // POST — platform.write
        old: `export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin()
  if ('error' in auth) return auth.error`,
        new: `export async function POST(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const decision = can(user.permissions, 'platform.write', { kind: 'platform' })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  const supabase = createServiceClient()`
      }
    ],
    expectedAuthCount: 1, // each block exact-1
    renameAuthDot: true   // route uses auth.supabase, must rename to supabase
  },
  {
    name: 'Route 4: tenants/[id]/geo/route.ts',
    path: 'C:/Condoleads/project/app/api/admin-homes/tenants/[id]/geo/route.ts',
    importOld: `import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/admin-homes/api-auth'`,
    importNew: `import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'`,
    blocks: [
      {
        // GET — platform.read
        old: `export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePlatformAdmin()
  if ('error' in auth) return auth.error`,
        new: `export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const decision = can(user.permissions, 'platform.read', { kind: 'platform' })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  const supabase = createServiceClient()`
      },
      {
        // POST — platform.write
        old: `export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePlatformAdmin()
  if ('error' in auth) return auth.error`,
        new: `export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const decision = can(user.permissions, 'platform.write', { kind: 'platform' })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })
  const supabase = createServiceClient()`
      }
    ],
    expectedAuthCount: 1,
    renameAuthDot: true
  }
]

let failures = 0
let skips = 0
let successes = 0

for (const r of routes) {
  console.log('\n=== ' + r.name + ' ===')
  const original = fs.readFileSync(r.path, 'utf8')
  const useCRLF = original.includes('\r\n')

  // Idempotency guard
  if (original.includes('resolveAdminHomesUser') && original.includes("from '@/lib/admin-homes/service-client'")) {
    console.log('[SKIP] already migrated')
    skips++
    continue
  }

  let content = original.replace(/\r\n/g, '\n')

  // Patch import
  if (!content.includes(r.importOld)) {
    console.error('[FAIL] OLD import not found in ' + r.path)
    failures++
    continue
  }
  const importCount = content.split(r.importOld).length - 1
  if (importCount > 1) {
    console.error('[FAIL] OLD import not unique (count=' + importCount + ')')
    failures++
    continue
  }
  content = content.replace(r.importOld, r.importNew)
  console.log('  import patched')

  // Patch each auth block
  let blockFailed = false
  for (let i = 0; i < r.blocks.length; i++) {
    const b = r.blocks[i]
    const count = content.split(b.old).length - 1
    if (count !== r.expectedAuthCount) {
      console.error('[FAIL] block ' + (i+1) + ' expected ' + r.expectedAuthCount + ' occurrence(s), got ' + count)
      blockFailed = true
      break
    }
    content = content.replace(b.old, b.new)
    console.log('  block ' + (i+1) + ' patched')
  }
  if (blockFailed) { failures++; continue }

  // Optional: rename auth.supabase -> supabase, auth.user -> user
  if (r.renameAuthDot) {
    const supaBefore = (content.match(/auth\.supabase/g) || []).length
    const userBefore = (content.match(/auth\.user/g) || []).length
    content = content.replace(/auth\.supabase/g, 'supabase').replace(/auth\.user/g, 'user')
    console.log('  renamed auth.supabase x' + supaBefore + ', auth.user x' + userBefore)
  }

  // Verify no straggler auth.* references
  const stragglers = content.match(/\bauth\.\w+/g)
  if (stragglers && stragglers.length > 0) {
    console.error('[FAIL] residual auth.* references: ' + stragglers.join(', '))
    failures++
    continue
  }

  // Verify legacy import gone
  if (content.includes("from '@/lib/admin-homes/api-auth'")) {
    console.error('[FAIL] legacy api-auth import still present')
    failures++
    continue
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