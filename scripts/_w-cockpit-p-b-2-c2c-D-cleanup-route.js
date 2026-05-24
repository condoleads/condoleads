// scripts/_w-cockpit-p-b-2-c2c-D-cleanup-route.js
// W-COCKPIT P-B-2 Commit 2c -- Artifact D: phantom cleanup API endpoint.
//
// Creates app/api/admin-homes/territory/cards/cleanup/route.ts.
//
// POST { apa_id, action } where action is 'deactivate' or 'fix_flags'.
// Uses same auth + tenant resolution + SET LOCAL app.skip_apa_reroll='on'
// pattern as the existing /cards POST so reroll runs async via the queue
// the C2a triggers + drainer already handle.
//
// Run: node scripts/_w-cockpit-p-b-2-c2c-D-cleanup-route.js
// Then: npx tsc --noEmit

const fs = require("fs");
const path = require("path");

const FILE = "app/api/admin-homes/territory/cards/cleanup/route.ts";

if (fs.existsSync(FILE)) {
  console.error("MISS: " + FILE + " already exists");
  process.exit(1);
}

const CONTENT = `// app/api/admin-homes/territory/cards/cleanup/route.ts
// W-COCKPIT P-B-2 Commit 2c -- phantom card cleanup endpoint.
//
// POST { apa_id, action } where:
//   action = 'deactivate' -> sets is_active = false (effectively removes the card)
//   action = 'fix_flags'  -> sets all three access flags to true (makes the
//                            phantom into a functional card; operator's
//                            responsibility to confirm this doesn't create
//                            an unwanted routing conflict)
//
// Reroll runs async via territory_reroll_queue (SET LOCAL app.skip_apa_reroll
// = 'on' inside the tx; the apa_update trigger enqueues instead of running
// the 19-second reroll inline).
//
// Multi-tenant safe: tenant_id derived from auth or ?tenant_id= override.
// Returns same shape as /cards POST: { ok, action, card_id, queued }.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { Client } from 'pg'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function resolveTenantId(req: NextRequest): Promise<{ tenantId: string | null; error?: { status: number; msg: string } }> {
  const user = await resolveAdminHomesUser()
  if (!user) return { tenantId: null, error: { status: 401, msg: 'unauthorized' } }
  const override = req.nextUrl.searchParams.get('tenant_id')
  if (override) {
    if (!UUID_RE.test(override)) return { tenantId: null, error: { status: 400, msg: 'bad tenant_id' } }
    if (user.isPlatformAdmin) return { tenantId: override }
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return { tenantId: null, error: { status: 401, msg: 'unauthorized' } }
    const { data: a } = await supabase.from('tenant_manager_assignments')
      .select('tenant_id').eq('user_id', authUser.id).eq('tenant_id', override)
      .is('revoked_at', null).maybeSingle()
    if (!a) return { tenantId: null, error: { status: 403, msg: 'forbidden' } }
    return { tenantId: override }
  }
  return { tenantId: user.tenantId }
}

export async function POST(req: NextRequest) {
  const { tenantId, error } = await resolveTenantId(req)
  if (error) return NextResponse.json({ error: error.msg }, { status: error.status })
  if (!tenantId) return NextResponse.json({ error: 'no tenant scope' }, { status: 400 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

  const { apa_id, action } = body || {}

  if (!apa_id || !UUID_RE.test(apa_id)) {
    return NextResponse.json({ error: 'invalid apa_id' }, { status: 400 })
  }
  if (action !== 'deactivate' && action !== 'fix_flags') {
    return NextResponse.json({ error: 'invalid action (must be deactivate or fix_flags)' }, { status: 400 })
  }

  // Verify apa row belongs to this tenant and is currently active.
  const s = svc()
  const { data: row } = await s.from('agent_property_access')
    .select('id, tenant_id, scope, is_active, condo_access, homes_access, buildings_access')
    .eq('id', apa_id).maybeSingle()
  if (!row || row.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'apa row not found in tenant' }, { status: 404 })
  }
  if (!row.is_active) {
    return NextResponse.json({ error: 'apa row already inactive' }, { status: 409 })
  }
  if (action === 'fix_flags' && (row.condo_access && row.homes_access && row.buildings_access)) {
    return NextResponse.json({ error: 'apa row already has all access flags set' }, { status: 409 })
  }

  // Direct pg connection to SET LOCAL the skip-reroll GUC + perform UPDATE in one tx.
  const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING
  if (!connStr) return NextResponse.json({ error: 'no db env' }, { status: 500 })

  const c = new Client({ connectionString: connStr })
  await c.connect()
  let result: { action: string; card_id: string; queued: boolean } | null = null
  try {
    await c.query('BEGIN')
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'")
    if (action === 'deactivate') {
      await c.query(
        'UPDATE agent_property_access SET is_active = false, updated_at = now() WHERE id = $1',
        [apa_id]
      )
    } else {
      await c.query(
        'UPDATE agent_property_access SET condo_access = true, homes_access = true, buildings_access = true, updated_at = now() WHERE id = $1',
        [apa_id]
      )
    }
    // Verify the trigger enqueued a reroll job (only if scope is reroll-eligible).
    const scope = row.scope
    let queued = false
    if (scope === 'area' || scope === 'municipality' || scope === 'community') {
      const q = await c.query(
        \`SELECT id FROM territory_reroll_queue WHERE tenant_id = $1 AND scope = $2 AND status = 'pending' ORDER BY requested_at DESC LIMIT 1\`,
        [tenantId, scope]
      )
      queued = (q.rowCount ?? 0) > 0
    }
    await c.query('COMMIT')
    result = { action, card_id: apa_id, queued }
  } catch (e: any) {
    await c.query('ROLLBACK').catch(() => {})
    await c.end()
    return NextResponse.json({ error: e.message || 'tx failed' }, { status: 500 })
  }
  await c.end()
  return NextResponse.json({ ok: true, ...result })
}
`;

fs.mkdirSync(path.dirname(FILE), { recursive: true });
fs.writeFileSync(FILE, CONTENT, "utf8");
console.log("  created: " + FILE);
console.log("  bytes: " + CONTENT.length);
console.log("");
console.log("Artifact D complete. Next: npx tsc --noEmit");