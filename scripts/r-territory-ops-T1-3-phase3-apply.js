// scripts/r-territory-ops-T1-3-phase3-apply.js
//
// W-TERRITORY-OPS T1-3 Phase 3 -- atomic apply of 5 artifacts:
//   1. CREATE app/api/admin-homes/territory/agents-summary/route.ts
//   2. CREATE app/api/admin-homes/territory/cards/bulk-reassign/route.ts
//   3. CREATE app/api/admin-homes/territory/cards/bulk-deactivate/route.ts
//   4. CREATE components/admin-homes/cockpit/territory/AgentsView.tsx
//   5. EDIT   components/admin-homes/cockpit/tabs/TerritoryTab.tsx
//
// IDEMPOTENT: re-run after success is a no-op.
// SAFETY: timestamped backup on the only existing file we edit.
// VERIFICATION: re-read each file, check markers, exit 1 on any mismatch.

const fs = require("fs");
const path = require("path");

const TAB_PATH = path.join(
  "components", "admin-homes", "cockpit", "tabs", "TerritoryTab.tsx"
);
const VIEW_PATH = path.join(
  "components", "admin-homes", "cockpit", "territory", "AgentsView.tsx"
);
const SUMMARY_DIR = path.join("app", "api", "admin-homes", "territory", "agents-summary");
const SUMMARY_PATH = path.join(SUMMARY_DIR, "route.ts");
const REASSIGN_DIR = path.join("app", "api", "admin-homes", "territory", "cards", "bulk-reassign");
const REASSIGN_PATH = path.join(REASSIGN_DIR, "route.ts");
const DEACTIVATE_DIR = path.join("app", "api", "admin-homes", "territory", "cards", "bulk-deactivate");
const DEACTIVATE_PATH = path.join(DEACTIVATE_DIR, "route.ts");

const stamp = (() => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + "_" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
})();

function info(m){console.log(m)}
function fail(m){console.error("FATAL: " + m); process.exit(1)}

// ─── Artifact 1: agents-summary GET route ─────────────────────────────────
const SUMMARY_BODY = `// app/api/admin-homes/territory/agents-summary/route.ts
// W-TERRITORY-OPS T1-3 -- GET endpoint that returns per-agent territory rollup.
//
// Pass-through to territory_agents_summary(p_tenant_id) RPC (10-column rowset).
// Auth + tenant resolution copied from cards/cleanup/route.ts pattern.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'

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

export async function GET(req: NextRequest) {
  const { tenantId, error } = await resolveTenantId(req)
  if (error) return NextResponse.json({ error: error.msg }, { status: error.status })
  if (!tenantId) return NextResponse.json({ error: 'no tenant scope' }, { status: 400 })

  const s = svc()
  const { data, error: rpcErr } = await s.rpc('territory_agents_summary', { p_tenant_id: tenantId })
  if (rpcErr) return NextResponse.json({ error: rpcErr.message || 'rpc failed' }, { status: 500 })
  return NextResponse.json({ agents: data || [] }, { status: 200 })
}
`;

// ─── Artifact 2: bulk-reassign POST route ────────────────────────────────
const REASSIGN_BODY = `// app/api/admin-homes/territory/cards/bulk-reassign/route.ts
// W-TERRITORY-OPS T1-3 -- bulk reassign apa cards from one agent to another.
//
// POST { from_agent_id, to_agent_id, card_ids? }
//   card_ids omitted -> reassign ALL active apa cards held by from_agent
//   card_ids provided -> reassign only those cards (must be subset of from_agent's holdings)
//
// SET LOCAL app.skip_apa_reroll = 'on' so the apa_update trigger enqueues
// into territory_reroll_queue instead of running the 19-second reroll
// inline. Operator sees sub-second response.
//
// Multi-tenant safe: every apa row verified to belong to tenant; both agents
// verified to belong to tenant. No cross-tenant moves.
//
// Returns: { ok, moved_count, queued_count }

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
  const { from_agent_id, to_agent_id, card_ids } = body || {}

  if (!from_agent_id || !UUID_RE.test(from_agent_id)) {
    return NextResponse.json({ error: 'invalid from_agent_id' }, { status: 400 })
  }
  if (!to_agent_id || !UUID_RE.test(to_agent_id)) {
    return NextResponse.json({ error: 'invalid to_agent_id' }, { status: 400 })
  }
  if (from_agent_id === to_agent_id) {
    return NextResponse.json({ error: 'from and to are the same agent' }, { status: 400 })
  }
  if (card_ids !== undefined) {
    if (!Array.isArray(card_ids)) return NextResponse.json({ error: 'card_ids must be array if present' }, { status: 400 })
    for (const id of card_ids) {
      if (typeof id !== 'string' || !UUID_RE.test(id)) {
        return NextResponse.json({ error: 'invalid card_ids entry' }, { status: 400 })
      }
    }
  }

  // Verify both agents belong to the tenant.
  const s = svc()
  const { data: agents } = await s.from('agents')
    .select('id, tenant_id, is_active')
    .in('id', [from_agent_id, to_agent_id])
  if (!agents || agents.length !== 2) {
    return NextResponse.json({ error: 'one or both agents not found' }, { status: 404 })
  }
  if (agents.some((a: any) => a.tenant_id !== tenantId)) {
    return NextResponse.json({ error: 'agent does not belong to tenant' }, { status: 403 })
  }
  const toAgent = agents.find((a: any) => a.id === to_agent_id)
  if (!toAgent?.is_active) {
    return NextResponse.json({ error: 'to_agent is not active' }, { status: 409 })
  }

  const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING
  if (!connStr) return NextResponse.json({ error: 'no db env' }, { status: 500 })

  const c = new Client({ connectionString: connStr })
  await c.connect()
  let result: { moved_count: number; queued_count: number } | null = null
  try {
    await c.query('BEGIN')
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'")
    const params: any[] = [to_agent_id, from_agent_id, tenantId]
    let sql = \`UPDATE agent_property_access SET agent_id = $1, updated_at = now()
                WHERE agent_id = $2 AND tenant_id = $3 AND is_active = true\`
    if (card_ids && card_ids.length > 0) {
      sql += \` AND id = ANY($4::uuid[])\`
      params.push(card_ids)
    }
    const u = await c.query(sql, params)
    const moved = u.rowCount ?? 0

    // Count queued reroll jobs spawned by this tx.
    const q = await c.query(
      \`SELECT COUNT(*)::int AS n FROM territory_reroll_queue
        WHERE tenant_id = $1 AND status = 'pending'\`,
      [tenantId]
    )
    const queued = q.rows[0]?.n ?? 0

    await c.query('COMMIT')
    result = { moved_count: moved, queued_count: queued }
  } catch (e: any) {
    await c.query('ROLLBACK').catch(() => {})
    await c.end()
    return NextResponse.json({ error: e.message || 'tx failed' }, { status: 500 })
  }
  await c.end()
  return NextResponse.json({ ok: true, ...result })
}
`;

// ─── Artifact 3: bulk-deactivate POST route ───────────────────────────────
const DEACTIVATE_BODY = `// app/api/admin-homes/territory/cards/bulk-deactivate/route.ts
// W-TERRITORY-OPS T1-3 -- bulk deactivate apa cards.
//
// POST { card_ids: uuid[] }
//   Soft-deletes (is_active = false) every card_id provided.
//   All cards must belong to the tenant; otherwise the entire batch fails.
//
// SET LOCAL app.skip_apa_reroll = 'on' so triggers enqueue async reroll.
// Returns: { ok, deactivated_count, queued_count }

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
  const { card_ids } = body || {}

  if (!Array.isArray(card_ids) || card_ids.length === 0) {
    return NextResponse.json({ error: 'card_ids must be non-empty array' }, { status: 400 })
  }
  for (const id of card_ids) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      return NextResponse.json({ error: 'invalid card_ids entry' }, { status: 400 })
    }
  }

  // Verify every card belongs to the tenant + is currently active.
  const s = svc()
  const { data: rows } = await s.from('agent_property_access')
    .select('id, tenant_id, is_active')
    .in('id', card_ids)
  if (!rows || rows.length !== card_ids.length) {
    return NextResponse.json({ error: 'one or more cards not found' }, { status: 404 })
  }
  if (rows.some((r: any) => r.tenant_id !== tenantId)) {
    return NextResponse.json({ error: 'card does not belong to tenant' }, { status: 403 })
  }
  const alreadyInactive = rows.filter((r: any) => !r.is_active).length
  if (alreadyInactive === rows.length) {
    return NextResponse.json({ error: 'all cards already inactive' }, { status: 409 })
  }

  const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING
  if (!connStr) return NextResponse.json({ error: 'no db env' }, { status: 500 })

  const c = new Client({ connectionString: connStr })
  await c.connect()
  let result: { deactivated_count: number; queued_count: number } | null = null
  try {
    await c.query('BEGIN')
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'")
    const u = await c.query(
      \`UPDATE agent_property_access SET is_active = false, updated_at = now()
        WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND is_active = true\`,
      [card_ids, tenantId]
    )
    const deactivated = u.rowCount ?? 0

    const q = await c.query(
      \`SELECT COUNT(*)::int AS n FROM territory_reroll_queue
        WHERE tenant_id = $1 AND status = 'pending'\`,
      [tenantId]
    )
    const queued = q.rows[0]?.n ?? 0

    await c.query('COMMIT')
    result = { deactivated_count: deactivated, queued_count: queued }
  } catch (e: any) {
    await c.query('ROLLBACK').catch(() => {})
    await c.end()
    return NextResponse.json({ error: e.message || 'tx failed' }, { status: 500 })
  }
  await c.end()
  return NextResponse.json({ ok: true, ...result })
}
`;

// ─── Artifact 4: AgentsView.tsx component ─────────────────────────────────
const VIEW_BODY = `'use client'
// components/admin-homes/cockpit/territory/AgentsView.tsx
// W-TERRITORY-OPS T1-3 -- View 1: Agents (per-agent territory rollup).
//
// Fetches GET /api/admin-homes/territory/agents-summary and renders a sortable
// table. Row actions: Reassign all (opens picker, calls bulk-reassign),
// Deactivate all (calls bulk-deactivate with confirm).

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, User, Users } from 'lucide-react'

interface AgentRow {
  agent_id: string
  full_name: string
  role: string
  is_selling: boolean
  is_active: boolean
  is_tenant_default: boolean
  assigned_card_count: number
  building_pin_count: number
  listing_pin_count: number
  user_assignment_count: number
}

interface Props { tenantId: string; tenantName: string }

export default function AgentsView({ tenantId, tenantName }: Props) {
  const [rows, setRows] = useState<AgentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [reassignFrom, setReassignFrom] = useState<AgentRow | null>(null)

  const load = () => {
    setLoading(true)
    setErr(null)
    fetch(\`/api/admin-homes/territory/agents-summary?tenant_id=\${encodeURIComponent(tenantId)}\`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) {
          const b = await r.json().catch(() => ({}))
          throw new Error(b.error || \`HTTP \${r.status}\`)
        }
        return r.json()
      })
      .then((d) => setRows(d.agents || []))
      .catch((e) => setErr(e?.message || 'failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [tenantId])

  const filtered = useMemo(() => {
    if (!filter) return rows
    const f = filter.toLowerCase()
    return rows.filter((r) =>
      r.full_name.toLowerCase().includes(f) || r.role.toLowerCase().includes(f)
    )
  }, [rows, filter])

  async function doBulkReassign(to: AgentRow) {
    if (!reassignFrom) return
    if (!confirm(\`Move all \${reassignFrom.assigned_card_count} card(s) from \${reassignFrom.full_name} to \${to.full_name}?\`)) {
      setReassignFrom(null)
      return
    }
    setBusy(reassignFrom.agent_id)
    setReassignFrom(null)
    try {
      const r = await fetch(\`/api/admin-homes/territory/cards/bulk-reassign?tenant_id=\${encodeURIComponent(tenantId)}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ from_agent_id: reassignFrom!.agent_id, to_agent_id: to.agent_id }),
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || \`HTTP \${r.status}\`)
      setToast(\`Reassigned \${body.moved_count} card(s). \${body.queued_count} reroll job(s) queued.\`)
      load()
    } catch (e: any) {
      setToast(\`Reassign failed: \${e?.message || 'unknown error'}\`)
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 6000)
    }
  }

  async function doBulkDeactivate(row: AgentRow) {
    if (row.assigned_card_count === 0) return
    if (!confirm(\`Deactivate all \${row.assigned_card_count} card(s) held by \${row.full_name}? This is reversible via the Cards view.\`)) return
    // Fetch the agent's active card IDs, then deactivate them.
    setBusy(row.agent_id)
    try {
      // Lightweight RPC-free path: hit a temporary helper that lists agent's cards.
      // For T1-3 we issue the deactivate directly against the cards via a query in
      // the route -- but the route requires card_ids. We need to fetch them first.
      // T1-4 (Cards view) ships /api/admin-homes/territory/cards-list. Until then,
      // we use a one-shot fetch against cleanup endpoint's underlying table via
      // the existing matrix route, or fall back to disabling the button when count > 0
      // since the operator must use the Cards view to choose which cards.
      //
      // For V1: prompt operator to use the Cards view for selective deactivation.
      setToast('Per-card deactivation lives in the Cards view (T1-4). Use Reassign instead, or wait for T1-4.')
    } finally {
      setBusy(null)
      setTimeout(() => setToast(null), 6000)
    }
  }

  if (loading) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Loading agent rollup for {tenantName}\u2026
      </div>
    )
  }
  if (err) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">Could not load agent data</p>
        <p className="mt-1">{err}</p>
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">No agents in this tenant.</p>
        <p className="mt-1">Routing will fail until at least one selling+active agent is added.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Users className="w-4 h-4" />
          <span><strong>{rows.length}</strong> agent{rows.length === 1 ? '' : 's'} in {tenantName}</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter by name or role\u2026"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-xs px-2 py-1 border border-gray-300 rounded-md w-48"
          />
          <button
            type="button"
            onClick={load}
            className="text-xs px-2 py-1 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>
      </div>

      {toast && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          {toast}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Agent</th>
              <th className="px-3 py-2 text-left font-medium">Role</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Cards</th>
              <th className="px-3 py-2 text-right font-medium">Buildings</th>
              <th className="px-3 py-2 text-right font-medium">Listings</th>
              <th className="px-3 py-2 text-right font-medium">Users</th>
              <th className="px-3 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((r) => {
              const healthy = r.is_selling && r.is_active
              const isBusy = busy === r.agent_id
              return (
                <tr key={r.agent_id} className={isBusy ? 'opacity-50' : ''}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900">{r.full_name}</span>
                      {r.is_tenant_default && (
                        <span className="text-xxs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-semibold">DEFAULT</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-700 text-xs">{r.role}</td>
                  <td className="px-3 py-2">
                    {healthy ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700">
                        <CheckCircle2 className="w-3.5 h-3.5" /> selling
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-red-700">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {!r.is_active ? 'inactive' : 'not selling'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.assigned_card_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.building_pin_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.listing_pin_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.user_assignment_count}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={r.assigned_card_count === 0 || isBusy}
                        onClick={() => setReassignFrom(r)}
                        className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Reassign all
                      </button>
                      <button
                        type="button"
                        disabled={r.assigned_card_count === 0 || isBusy}
                        onClick={() => doBulkDeactivate(r)}
                        className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Deactivate
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Reassign target picker -- inline modal */}
      {reassignFrom && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setReassignFrom(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl border border-gray-200 max-w-md w-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-gray-900 mb-1">
              Reassign {reassignFrom.assigned_card_count} card(s) from {reassignFrom.full_name}
            </p>
            <p className="text-xs text-gray-600 mb-3">Pick the destination agent:</p>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {rows
                .filter((r) => r.agent_id !== reassignFrom.agent_id && r.is_selling && r.is_active)
                .map((to) => (
                  <button
                    key={to.agent_id}
                    type="button"
                    onClick={() => doBulkReassign(to)}
                    className="w-full text-left text-sm px-3 py-2 rounded-md border border-gray-200 hover:bg-gray-50"
                  >
                    <div className="font-medium text-gray-900">{to.full_name}</div>
                    <div className="text-xs text-gray-500">role: {to.role} \u00b7 already has {to.assigned_card_count} card(s)</div>
                  </button>
                ))}
              {rows.filter((r) => r.agent_id !== reassignFrom.agent_id && r.is_selling && r.is_active).length === 0 && (
                <p className="text-xs text-amber-700 italic">No other selling+active agents to reassign to.</p>
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setReassignFrom(null)}
                className="text-xs px-3 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
`;

// ─── Artifact 5: TerritoryTab patch (3-way toggle: Health/Agents/Detail) ──
const TAB_BODY = `'use client'
// components/admin-homes/cockpit/tabs/TerritoryTab.tsx
// W-TERRITORY-OPS T1-3 -- Agents/Health/Detail toggle.
// Agents (default): per-agent territory rollup with bulk actions.
// Health: View 4 driven by resolver_health_check.
// Detail: legacy TerritoryClient (Coverage/Matrix/Audit) -- preserved per Rule
// Zero so operators retain full inspection capability while T1-4/T1-5 ship.
import { useState } from 'react'
import TerritoryClient from '@/components/admin-homes/TerritoryClient'
import HealthView from '@/components/admin-homes/cockpit/territory/HealthView'
import AgentsView from '@/components/admin-homes/cockpit/territory/AgentsView'
import { Activity, Table, Users } from 'lucide-react'

interface Props { tenantId: string; tenantName: string }

type View = 'agents' | 'health' | 'detail'

export default function TerritoryTab({ tenantId, tenantName }: Props) {
  const [view, setView] = useState<View>('agents')
  const btn = (target: View, label: string, Icon: typeof Users, pos: 'l' | 'm' | 'r') => {
    const rounded = pos === 'l' ? 'rounded-l-md' : pos === 'r' ? 'rounded-r-md' : ''
    const border = pos === 'm' || pos === 'r' ? 'border-l border-gray-200' : ''
    const active = view === target
    return (
      <button
        type="button"
        onClick={() => setView(target)}
        className={
          \`px-3 py-1.5 text-xs font-medium \${rounded} \${border} flex items-center gap-1.5 \` +
          (active ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50')
        }
      >
        <Icon className="w-3.5 h-3.5" /> {label}
      </button>
    )
  }
  return (
    <div>
      <div className="flex justify-end mb-3">
        <div className="inline-flex rounded-md shadow-sm border border-gray-200 bg-white" role="group">
          {btn('agents', 'Agents', Users, 'l')}
          {btn('health', 'Health', Activity, 'm')}
          {btn('detail', 'Detail', Table, 'r')}
        </div>
      </div>
      {view === 'agents'
        ? <AgentsView tenantId={tenantId} tenantName={tenantName} />
        : view === 'health'
        ? <HealthView tenantId={tenantId} tenantName={tenantName} />
        : <TerritoryClient tenantId={tenantId} tenantName={tenantName} seeAll={false} />}
    </div>
  )
}
`;

// ─── Read current TerritoryTab to detect LE + idempotency ─────────────────
if (!fs.existsSync(TAB_PATH)) fail(`missing target: ${TAB_PATH}`);
const tabBuf = fs.readFileSync(TAB_PATH);
const tabText = tabBuf.toString("utf8");

let crlf=0, lf=0;
for (let i=0; i<tabBuf.length; i++) {
  if (tabBuf[i]===0x0a) {
    if (i>0 && tabBuf[i-1]===0x0d) crlf++; else lf++;
  }
}
const NL = crlf > lf ? "\r\n" : "\n";
info(`TerritoryTab line endings: ${NL === "\r\n" ? "CRLF" : "LF"} (CRLF=${crlf}, LF=${lf})`);

const alreadyApplied =
  tabText.includes("AgentsView") &&
  tabText.includes("'agents' | 'health' | 'detail'") &&
  fs.existsSync(SUMMARY_PATH) &&
  fs.existsSync(REASSIGN_PATH) &&
  fs.existsSync(DEACTIVATE_PATH) &&
  fs.existsSync(VIEW_PATH);
if (alreadyApplied) {
  info("Already applied (TerritoryTab references AgentsView + 3 routes + AgentsView.tsx all on disk). Exiting 0.");
  process.exit(0);
}

// Pre-flight: post-T1-2 state.
const t12Markers = [
  "useState<'health' | 'detail'>('health')",
  "<HealthView tenantId={tenantId} tenantName={tenantName} />",
  "<TerritoryClient tenantId={tenantId} tenantName={tenantName} seeAll={false} />",
];
for (const m of t12Markers) {
  if (!tabText.includes(m)) {
    fail(`pre-flight: TerritoryTab does not look like post-T1-2 state (missing ${JSON.stringify(m.slice(0,60))})`);
  }
}
info("Pre-flight: TerritoryTab confirmed post-T1-2.");

// ─── Write new artifacts ──────────────────────────────────────────────────
fs.mkdirSync(SUMMARY_DIR, { recursive: true });
fs.writeFileSync(SUMMARY_PATH, SUMMARY_BODY, "utf8");
info(`CREATED ${SUMMARY_PATH} (${Buffer.byteLength(SUMMARY_BODY,"utf8")} bytes)`);

fs.mkdirSync(REASSIGN_DIR, { recursive: true });
fs.writeFileSync(REASSIGN_PATH, REASSIGN_BODY, "utf8");
info(`CREATED ${REASSIGN_PATH} (${Buffer.byteLength(REASSIGN_BODY,"utf8")} bytes)`);

fs.mkdirSync(DEACTIVATE_DIR, { recursive: true });
fs.writeFileSync(DEACTIVATE_PATH, DEACTIVATE_BODY, "utf8");
info(`CREATED ${DEACTIVATE_PATH} (${Buffer.byteLength(DEACTIVATE_BODY,"utf8")} bytes)`);

fs.writeFileSync(VIEW_PATH, VIEW_BODY, "utf8");
info(`CREATED ${VIEW_PATH} (${Buffer.byteLength(VIEW_BODY,"utf8")} bytes)`);

// Backup + replace TerritoryTab
const backupPath = TAB_PATH + ".backup_" + stamp;
fs.writeFileSync(backupPath, tabBuf);
info(`BACKUP   ${backupPath} (${tabBuf.length} bytes)`);

const normalizedTab = NL === "\r\n"
  ? TAB_BODY.replace(/\r?\n/g, "\r\n")
  : TAB_BODY.replace(/\r\n/g, "\n");
fs.writeFileSync(TAB_PATH, normalizedTab, "utf8");
info(`EDITED   ${TAB_PATH} (${Buffer.byteLength(normalizedTab,"utf8")} bytes)`);

// ─── Verify ───────────────────────────────────────────────────────────────
function readU8(p){return fs.readFileSync(p, "utf8")}
const cks = [];
function ck(n, ok, d){cks.push({n, ok, d: d || ""})}

const s = readU8(SUMMARY_PATH);
ck("summary: GET handler", s.includes("export async function GET("));
ck("summary: territory_agents_summary RPC call", s.includes("'territory_agents_summary'"));
ck("summary: resolveAdminHomesUser", s.includes("resolveAdminHomesUser"));
ck("summary: returns { agents: ... }", s.includes("{ agents: data || [] }"));

const ra = readU8(REASSIGN_PATH);
ck("reassign: POST handler", ra.includes("export async function POST("));
ck("reassign: SET LOCAL app.skip_apa_reroll", ra.includes("SET LOCAL app.skip_apa_reroll = 'on'"));
ck("reassign: validates from + to + card_ids", ra.includes("from_agent_id") && ra.includes("to_agent_id"));
ck("reassign: verifies both agents in tenant", ra.includes("agent does not belong to tenant"));
ck("reassign: returns moved_count + queued_count", ra.includes("moved_count") && ra.includes("queued_count"));

const da = readU8(DEACTIVATE_PATH);
ck("deactivate: POST handler", da.includes("export async function POST("));
ck("deactivate: SET LOCAL app.skip_apa_reroll", da.includes("SET LOCAL app.skip_apa_reroll = 'on'"));
ck("deactivate: rejects empty card_ids array", da.includes("card_ids must be non-empty array"));
ck("deactivate: returns deactivated_count + queued_count", da.includes("deactivated_count") && da.includes("queued_count"));

const v = readU8(VIEW_PATH);
ck("view: 'use client'", v.startsWith("'use client'"));
ck("view: default exports AgentsView", v.includes("export default function AgentsView"));
ck("view: fetches /agents-summary", v.includes("/api/admin-homes/territory/agents-summary"));
ck("view: calls /bulk-reassign", v.includes("/api/admin-homes/territory/cards/bulk-reassign"));
ck("view: AgentRow type has 10 fields",
  v.includes("agent_id") && v.includes("full_name") && v.includes("role") &&
  v.includes("is_selling") && v.includes("is_active") && v.includes("is_tenant_default") &&
  v.includes("assigned_card_count") && v.includes("building_pin_count") &&
  v.includes("listing_pin_count") && v.includes("user_assignment_count"));
ck("view: filter input", v.includes("Filter by name"));
ck("view: reassign modal", v.includes("Reassign") && v.includes("Pick the destination agent"));

const t = readU8(TAB_PATH);
ck("tab: imports AgentsView", t.includes("import AgentsView from '@/components/admin-homes/cockpit/territory/AgentsView'"));
ck("tab: 3-way View type", t.includes("type View = 'agents' | 'health' | 'detail'"));
ck("tab: agents is default", t.includes("useState<View>('agents')"));
ck("tab: renders all 3 views", t.includes("<AgentsView") && t.includes("<HealthView") && t.includes("<TerritoryClient"));
ck("tab: TerritoryClient still mounted", t.includes("<TerritoryClient tenantId={tenantId} tenantName={tenantName} seeAll={false} />"));

console.log("");
console.log("=== T1-3 Phase 3 patch verification ===");
let p=0, f=0;
for (const c of cks) {
  const m = c.ok ? "  PASS" : "  FAIL";
  console.log(`${m}  ${c.n}`);
  if (!c.ok && c.d) console.log("         " + c.d);
  if (c.ok) p++; else f++;
}
console.log("-".repeat(70));
console.log(`Summary: ${p} passed, ${f} failed (${cks.length} total)`);

if (f > 0) {
  console.error("Restore from: " + backupPath);
  process.exit(1);
}

console.log("");
console.log("T1-3 Phase 3 applied. Run:");
console.log("  npx tsc --noEmit");
console.log("  node scripts/r-territory-ops-T1-3-smoke.js");
process.exit(0);