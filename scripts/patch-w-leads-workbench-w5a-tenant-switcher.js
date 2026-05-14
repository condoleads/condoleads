#!/usr/bin/env node
/**
 * patch-w-leads-workbench-w5a-tenant-switcher.js
 *
 * W-LEADS-WORKBENCH W5a (2026-05-14) -- Tenant switcher in TenantHeader.
 *
 * CREATES (2):
 *   app/api/admin-homes/scope/set-tenant/route.ts
 *   components/admin-homes/TenantSwitcher.tsx
 *
 * REWRITES (1):
 *   components/admin-homes/TenantHeader.tsx
 *     (full file rewrite -- 8 anchor changes would be brittle vs the
 *      ~30 lines of switcher integration)
 *
 * MODIFIES (1):
 *   app/admin-homes/layout.tsx (single-anchor change: prop signature)
 *
 * DOES NOT TOUCH:
 *   lib/admin-homes/auth.ts  (F-RESOLVEUSER-AGENTID fix deferred to W5c)
 *   lib/admin-homes/tenant-context.ts  (already supports the cookie)
 *   app/admin-homes/leads/page.tsx  (consumer migration deferred to W5c)
 *
 * Atomic: validation for all 4 files passes BEFORE any write.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const d = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  d.getFullYear() +
  pad(d.getMonth() + 1) +
  pad(d.getDate()) +
  '_' +
  pad(d.getHours()) +
  pad(d.getMinutes()) +
  pad(d.getSeconds())

const PATH_ROUTE = path.join(
  ROOT,
  'app',
  'api',
  'admin-homes',
  'scope',
  'set-tenant',
  'route.ts',
)
const PATH_SWITCHER = path.join(
  ROOT,
  'components',
  'admin-homes',
  'TenantSwitcher.tsx',
)
const PATH_HEADER = path.join(
  ROOT,
  'components',
  'admin-homes',
  'TenantHeader.tsx',
)
const PATH_LAYOUT = path.join(
  ROOT,
  'app',
  'admin-homes',
  'layout.tsx',
)

// ============================================================================
// PRE-FLIGHT
// ============================================================================

if (fs.existsSync(PATH_ROUTE)) {
  throw new Error('NEW file already exists: ' + PATH_ROUTE)
}
if (fs.existsSync(PATH_SWITCHER)) {
  throw new Error('NEW file already exists: ' + PATH_SWITCHER)
}
if (!fs.existsSync(PATH_HEADER)) {
  throw new Error('EXISTING file missing: ' + PATH_HEADER)
}
if (!fs.existsSync(PATH_LAYOUT)) {
  throw new Error('EXISTING file missing: ' + PATH_LAYOUT)
}

function detectLE(filePath) {
  const buf = fs.readFileSync(filePath)
  let crlf = 0
  let lfOnly = 0
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      if (i > 0 && buf[i - 1] === 0x0d) crlf++
      else lfOnly++
    }
  }
  if (crlf > 0 && lfOnly === 0) return 'crlf'
  if (lfOnly > 0 && crlf === 0) return 'lf'
  throw new Error('mixed or no LE: ' + filePath)
}

const HEADER_LE = detectLE(PATH_HEADER)
const LAYOUT_LE = detectLE(PATH_LAYOUT)
console.log('LE -- TenantHeader.tsx: ' + HEADER_LE + ', layout.tsx: ' + LAYOUT_LE)

// ============================================================================
// NEW FILE 1: app/api/admin-homes/scope/set-tenant/route.ts
// ============================================================================

const ROUTE_CONTENT = [
  "// app/api/admin-homes/scope/set-tenant/route.ts",
  "// W-LEADS-WORKBENCH W5a (2026-05-14)",
  "//",
  "// POST endpoint to set or clear the platform_tenant_override cookie that",
  "// getAdminTenantContext (lib/admin-homes/tenant-context.ts) reads on every",
  "// admin-homes request. Sets the active tenant context for the current user.",
  "//",
  "// PERMISSION CONTRACT",
  "//   platform_admin / platform_assistant (isPlatformAdmin = true)",
  "//     -> may set ANY active tenant_id OR clear (Universal view)",
  "//   tenant_manager (has rows in tenant_manager_assignments)",
  "//     -> may set only tenant_ids in their assignment list; cannot clear",
  "//   all other roles",
  "//     -> 403 (locked to their home tenant; no switching)",
  "//",
  "// REQUEST BODY",
  "//   { tenantId: string | null }",
  "//     - string UUID  -> set platform_tenant_override cookie to that value",
  "//     - null         -> clear the cookie (Universal view, platform admin only)",
  "//",
  "// COOKIE",
  "//   name: platform_tenant_override (constant from tenant-context.ts)",
  "//   maxAge: 30 days",
  "//   httpOnly: true (XSS defense)",
  "//   sameSite: lax (CSRF defense)",
  "//   secure: production-only",
  "",
  "import { NextRequest, NextResponse } from 'next/server'",
  "import { cookies } from 'next/headers'",
  "import { createClient } from '@/lib/supabase/server'",
  "import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'",
  "import { PLATFORM_TENANT_OVERRIDE_COOKIE } from '@/lib/admin-homes/tenant-context'",
  "",
  "const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days",
  "",
  "export async function POST(request: NextRequest) {",
  "  try {",
  "    const user = await resolveAdminHomesUser()",
  "    if (!user) {",
  "      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })",
  "    }",
  "",
  "    let body: any",
  "    try {",
  "      body = await request.json()",
  "    } catch {",
  "      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })",
  "    }",
  "",
  "    const rawTenantId = body?.tenantId",
  "    const tenantId: string | null =",
  "      typeof rawTenantId === 'string' && rawTenantId.length > 0",
  "        ? rawTenantId",
  "        : null",
  "",
  "    const cookieStore = await cookies()",
  "",
  "    // ---- Clear cookie path (Universal view) ----",
  "    if (tenantId === null) {",
  "      if (!user.isPlatformAdmin) {",
  "        return NextResponse.json(",
  "          { error: 'Only platform admins can enter Universal view' },",
  "          { status: 403 },",
  "        )",
  "      }",
  "      cookieStore.delete(PLATFORM_TENANT_OVERRIDE_COOKIE)",
  "      return NextResponse.json({ success: true, tenantId: null })",
  "    }",
  "",
  "    // ---- Validate UUID shape ----",
  "    const uuidRegex =",
  "      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i",
  "    if (!uuidRegex.test(tenantId)) {",
  "      return NextResponse.json({ error: 'Invalid tenant ID format' }, { status: 400 })",
  "    }",
  "",
  "    // ---- Validate target tenant exists and is active ----",
  "    const supabase = await createClient()",
  "    const { data: tenant, error: tenantErr } = await supabase",
  "      .from('tenants')",
  "      .select('id, is_active')",
  "      .eq('id', tenantId)",
  "      .maybeSingle()",
  "",
  "    if (tenantErr || !tenant) {",
  "      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })",
  "    }",
  "    if (tenant.is_active === false) {",
  "      return NextResponse.json({ error: 'Tenant is not active' }, { status: 400 })",
  "    }",
  "",
  "    // ---- Per-role authorization ----",
  "    if (!user.isPlatformAdmin) {",
  "      // Non-platform principals: require an active tenant_manager_assignments",
  "      // row for (this user, this tenant). All other roles already return 403",
  "      // here because they have zero rows in that table.",
  "      const {",
  "        data: { user: authUser },",
  "      } = await supabase.auth.getUser()",
  "      if (!authUser) {",
  "        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })",
  "      }",
  "      const { data: assignment } = await supabase",
  "        .from('tenant_manager_assignments')",
  "        .select('id')",
  "        .eq('user_id', authUser.id)",
  "        .eq('tenant_id', tenantId)",
  "        .is('revoked_at', null)",
  "        .maybeSingle()",
  "      if (!assignment) {",
  "        return NextResponse.json(",
  "          { error: 'Forbidden -- no tenant_manager assignment for this tenant' },",
  "          { status: 403 },",
  "        )",
  "      }",
  "    }",
  "",
  "    // ---- Set the cookie ----",
  "    cookieStore.set(PLATFORM_TENANT_OVERRIDE_COOKIE, tenantId, {",
  "      maxAge: COOKIE_MAX_AGE,",
  "      httpOnly: true,",
  "      sameSite: 'lax',",
  "      secure: process.env.NODE_ENV === 'production',",
  "      path: '/',",
  "    })",
  "",
  "    return NextResponse.json({ success: true, tenantId })",
  "  } catch (error) {",
  "    console.error('[admin-homes/scope/set-tenant POST] error:', error)",
  "    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })",
  "  }",
  "}",
  "",
].join('\n')

// ============================================================================
// NEW FILE 2: components/admin-homes/TenantSwitcher.tsx
// ============================================================================

const SWITCHER_CONTENT = [
  "'use client'",
  "",
  "// components/admin-homes/TenantSwitcher.tsx",
  "// W-LEADS-WORKBENCH W5a (2026-05-14)",
  "//",
  "// Client dropdown that lets switching-capable users (platform_admin,",
  "// platform_assistant, tenant_manager) change their active tenant context.",
  "// Posts to /api/admin-homes/scope/set-tenant which writes/clears the",
  "// platform_tenant_override cookie, then reloads the page so the new",
  "// tenant context applies via getAdminTenantContext.",
  "",
  "import { useState } from 'react'",
  "",
  "export interface TenantOption {",
  "  id: string",
  "  name: string",
  "  brand_name: string | null",
  "  domain: string",
  "}",
  "",
  "interface Props {",
  "  tenants: TenantOption[]",
  "  currentTenantId: string | null",
  "  allowUniversal: boolean",
  "}",
  "",
  "const UNIVERSAL_VALUE = '__universal__'",
  "",
  "export default function TenantSwitcher({",
  "  tenants,",
  "  currentTenantId,",
  "  allowUniversal,",
  "}: Props) {",
  "  const [submitting, setSubmitting] = useState(false)",
  "  const [error, setError] = useState<string | null>(null)",
  "",
  "  async function handleChange(value: string) {",
  "    if (submitting) return",
  "    setSubmitting(true)",
  "    setError(null)",
  "    const nextTenantId = value === UNIVERSAL_VALUE ? null : value",
  "    try {",
  "      const res = await fetch('/api/admin-homes/scope/set-tenant', {",
  "        method: 'POST',",
  "        headers: { 'Content-Type': 'application/json' },",
  "        body: JSON.stringify({ tenantId: nextTenantId }),",
  "      })",
  "      const data = await res.json().catch(() => ({} as any))",
  "      if (!res.ok) {",
  "        setError((data && data.error) || 'Failed to switch tenant')",
  "        setSubmitting(false)",
  "        return",
  "      }",
  "      // Reload so the server re-renders with the new tenant context.",
  "      window.location.reload()",
  "    } catch (e: any) {",
  "      setError((e && e.message) || 'Network error')",
  "      setSubmitting(false)",
  "    }",
  "  }",
  "",
  "  const currentValue = currentTenantId || UNIVERSAL_VALUE",
  "",
  "  return (",
  "    <div className=\"flex flex-col items-end gap-1\">",
  "      <select",
  "        value={currentValue}",
  "        onChange={(e) => handleChange(e.target.value)}",
  "        disabled={submitting}",
  "        className=\"text-xs px-2 py-1 border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500\"",
  "      >",
  "        {allowUniversal && (",
  "          <option value={UNIVERSAL_VALUE}>All tenants (Universal)</option>",
  "        )}",
  "        {tenants.map((t) => (",
  "          <option key={t.id} value={t.id}>",
  "            {(t.brand_name || t.name) + ' (' + t.domain + ')'}",
  "          </option>",
  "        ))}",
  "      </select>",
  "      {submitting && (",
  "        <span className=\"text-xs text-slate-400\">Switching\\u2026</span>",
  "      )}",
  "      {error && <span className=\"text-xs text-red-600\">{error}</span>}",
  "    </div>",
  "  )",
  "}",
  "",
].join('\n')

// ============================================================================
// REWRITE: components/admin-homes/TenantHeader.tsx
// ============================================================================

const HEADER_NL = HEADER_LE === 'crlf' ? '\r\n' : '\n'

const HEADER_NEW_LINES = [
  "// components/admin-homes/TenantHeader.tsx",
  "// W-LEADS-WORKBENCH W5a (2026-05-14)",
  "//",
  "// Sticky tenant workspace header on every /admin-homes/* page above the",
  "// main content. The W5a rewrite replaces the 'Switcher coming in 3.7'",
  "// placeholder with the active TenantSwitcher dropdown.",
  "//",
  "// SWITCHER VISIBILITY",
  "//   platform_admin / platform_assistant (isPlatformAdmin = true)",
  "//     -> dropdown with Universal + all active tenants",
  "//   tenant_manager (rows in tenant_manager_assignments)",
  "//     -> dropdown with their assigned tenants only; no Universal option",
  "//   all other roles",
  "//     -> no switcher rendered",
  "",
  "import Link from 'next/link'",
  "import { createClient } from '@/lib/supabase/server'",
  "import type { AdminHomesUser } from '@/lib/admin-homes/auth'",
  "import TenantSwitcher, { TenantOption } from './TenantSwitcher'",
  "",
  "interface TenantHeaderProps {",
  "  user: AdminHomesUser",
  "}",
  "",
  "interface TenantRow {",
  "  id: string",
  "  name: string",
  "  brand_name: string | null",
  "  domain: string",
  "  logo_url: string | null",
  "  lifecycle_status: 'active' | 'suspended' | 'terminated'",
  "  termination_grace_until: string | null",
  "}",
  "",
  "const STATUS_STYLES: Record<TenantRow['lifecycle_status'], { label: string; className: string }> = {",
  "  active:     { label: 'Active',     className: 'bg-green-100 text-green-800 border-green-200' },",
  "  suspended:  { label: 'Suspended',  className: 'bg-amber-100 text-amber-800 border-amber-200' },",
  "  terminated: { label: 'Terminated', className: 'bg-red-100 text-red-800 border-red-200' },",
  "}",
  "",
  "async function fetchTenant(tenantId: string): Promise<TenantRow | null> {",
  "  const supabase = createClient()",
  "  const { data } = await supabase",
  "    .from('tenants')",
  "    .select('id, name, brand_name, domain, logo_url, lifecycle_status, termination_grace_until')",
  "    .eq('id', tenantId)",
  "    .maybeSingle()",
  "  return (data as TenantRow | null) ?? null",
  "}",
  "",
  "// W5a: Fetch the list of tenants the user is allowed to switch into.",
  "//   platform_admin / platform_assistant -> all active tenants + universal",
  "//   tenant_manager (rows in tenant_manager_assignments) -> assigned tenants",
  "//   everyone else -> empty (no switcher rendered)",
  "async function fetchSwitcherTenants(",
  "  user: AdminHomesUser,",
  "): Promise<{ tenants: TenantOption[]; allowUniversal: boolean }> {",
  "  const supabase = createClient()",
  "",
  "  if (user.isPlatformAdmin) {",
  "    const { data } = await supabase",
  "      .from('tenants')",
  "      .select('id, name, brand_name, domain')",
  "      .eq('is_active', true)",
  "      .order('name')",
  "    return {",
  "      tenants: (data as TenantOption[]) || [],",
  "      allowUniversal: true,",
  "    }",
  "  }",
  "",
  "  // Non-platform: check tenant_manager_assignments for this auth user.",
  "  const {",
  "    data: { user: authUser },",
  "  } = await supabase.auth.getUser()",
  "  if (!authUser) return { tenants: [], allowUniversal: false }",
  "",
  "  const { data: assignments } = await supabase",
  "    .from('tenant_manager_assignments')",
  "    .select('tenants(id, name, brand_name, domain, is_active)')",
  "    .eq('user_id', authUser.id)",
  "    .is('revoked_at', null)",
  "",
  "  const tenants: TenantOption[] = []",
  "  for (const row of (assignments as any[]) || []) {",
  "    const t = row?.tenants",
  "    if (t && t.is_active !== false) {",
  "      tenants.push({",
  "        id: t.id,",
  "        name: t.name,",
  "        brand_name: t.brand_name,",
  "        domain: t.domain,",
  "      })",
  "    }",
  "  }",
  "  return { tenants, allowUniversal: false }",
  "}",
  "",
  "export default async function TenantHeader({ user }: TenantHeaderProps) {",
  "  const tenantId = user.tenantId",
  "  const isPlatformAdmin = user.isPlatformAdmin",
  "",
  "  // Fetch switcher options (empty -> no switcher rendered).",
  "  const { tenants: switcherTenants, allowUniversal } = await fetchSwitcherTenants(user)",
  "  const canSwitch = allowUniversal || switcherTenants.length > 0",
  "",
  "  // Platform Admin landing on /admin-homes with no tenant context (Universal)",
  "  if (!tenantId) {",
  "    if (!isPlatformAdmin) return null // tenant agent without tenant_id is a data error, fail silent",
  "    return (",
  "      <header className=\"sticky top-0 z-30 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between\">",
  "        <div className=\"flex items-center gap-3\">",
  "          <div className=\"w-8 h-8 rounded bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold\">PA</div>",
  "          <div>",
  "            <div className=\"text-sm font-semibold text-gray-900\">No tenant selected</div>",
  "            <div className=\"text-xs text-gray-500\">Platform Admin {'\\u2014'} Universal view (all tenants)</div>",
  "          </div>",
  "        </div>",
  "        <div className=\"flex items-center gap-3\">",
  "          {canSwitch && (",
  "            <TenantSwitcher",
  "              tenants={switcherTenants}",
  "              currentTenantId={null}",
  "              allowUniversal={allowUniversal}",
  "            />",
  "          )}",
  "          <Link",
  "            href=\"/platform\"",
  "            className=\"text-xs px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 transition\"",
  "          >",
  "            Go to /platform {'\\u2192'}",
  "          </Link>",
  "        </div>",
  "      </header>",
  "    )",
  "  }",
  "",
  "  const tenant = await fetchTenant(tenantId)",
  "  if (!tenant) {",
  "    return (",
  "      <header className=\"sticky top-0 z-30 bg-white border-b border-red-200 px-6 py-3\">",
  "        <div className=\"text-sm text-red-700\">Tenant not found ({tenantId})</div>",
  "      </header>",
  "    )",
  "  }",
  "",
  "  const status = STATUS_STYLES[tenant.lifecycle_status]",
  "  const displayName = tenant.brand_name || tenant.name",
  "",
  "  return (",
  "    <header className=\"sticky top-0 z-30 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between\">",
  "      <div className=\"flex items-center gap-3 min-w-0\">",
  "        {tenant.logo_url ? (",
  "          // eslint-disable-next-line @next/next/no-img-element",
  "          <img src={tenant.logo_url} alt={displayName + ' logo'} className=\"w-8 h-8 rounded object-contain bg-gray-50\" />",
  "        ) : (",
  "          <div className=\"w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-bold\">",
  "            {displayName.slice(0, 2).toUpperCase()}",
  "          </div>",
  "        )}",
  "        <div className=\"min-w-0\">",
  "          <div className=\"text-sm font-semibold text-gray-900 truncate\">{displayName}</div>",
  "          <div className=\"text-xs text-gray-500 truncate\">{tenant.domain}</div>",
  "        </div>",
  "        <span className={'ml-3 text-xs font-medium px-2 py-0.5 rounded-full border ' + status.className}>",
  "          {status.label}",
  "        </span>",
  "        {tenant.lifecycle_status === 'terminated' && tenant.termination_grace_until && (",
  "          <span className=\"ml-2 text-xs text-red-700\">",
  "            Grace until {new Date(tenant.termination_grace_until).toLocaleDateString()}",
  "          </span>",
  "        )}",
  "      </div>",
  "",
  "      {/* W5a: active tenant switcher (replaces 3.7 placeholder slot) */}",
  "      <div className=\"flex items-center gap-2\">",
  "        {canSwitch && (",
  "          <TenantSwitcher",
  "            tenants={switcherTenants}",
  "            currentTenantId={tenantId}",
  "            allowUniversal={allowUniversal}",
  "          />",
  "        )}",
  "      </div>",
  "    </header>",
  "  )",
  "}",
  "",
]

const HEADER_NEW = HEADER_NEW_LINES.join(HEADER_NL)

// ============================================================================
// PATCH: app/admin-homes/layout.tsx
// ============================================================================

const LAYOUT_NL = LAYOUT_LE === 'crlf' ? '\r\n' : '\n'

let layoutText = fs.readFileSync(PATH_LAYOUT, 'utf8')

const LAYOUT_A1_OLD = [
  "        <TenantHeader",
  "          tenantId={adminUser.tenantId}",
  "          isPlatformAdmin={adminUser.isPlatformAdmin}",
  "        />",
].join(LAYOUT_NL)

const LAYOUT_A1_NEW = "        <TenantHeader user={adminUser} />"

const layoutAnchors = [
  { name: 'LAYOUT_A1 TenantHeader props', old: LAYOUT_A1_OLD, new: LAYOUT_A1_NEW },
]

for (const a of layoutAnchors) {
  const count = layoutText.split(a.old).length - 1
  if (count !== 1) {
    throw new Error(
      'layout.tsx anchor "' + a.name + '" found ' + count + ' times (expected 1)',
    )
  }
}
for (const a of layoutAnchors) {
  layoutText = layoutText.replace(a.old, a.new)
}

// ============================================================================
// POST-PATCH VALIDATION (before any write)
// ============================================================================

if (layoutText.indexOf('<TenantHeader user={adminUser} />') === -1) {
  throw new Error('layout.tsx missing TenantHeader user prop after patch')
}
if (HEADER_NEW.indexOf('TenantSwitcher') === -1) {
  throw new Error('TenantHeader rewrite missing TenantSwitcher reference')
}
if (HEADER_NEW.indexOf('fetchSwitcherTenants') === -1) {
  throw new Error('TenantHeader rewrite missing fetchSwitcherTenants helper')
}
if (HEADER_NEW.indexOf('user: AdminHomesUser') === -1) {
  throw new Error('TenantHeader rewrite missing AdminHomesUser prop type')
}

// LE preservation pre-write
if (LAYOUT_LE === 'lf' && layoutText.indexOf('\r\n') !== -1) {
  throw new Error('CRLF in LF layout.tsx after patch')
}
if (HEADER_LE === 'lf' && HEADER_NEW.indexOf('\r\n') !== -1) {
  throw new Error('CRLF in LF TenantHeader rewrite')
}

// ============================================================================
// WRITES
// ============================================================================

fs.copyFileSync(PATH_HEADER, PATH_HEADER + '.backup_' + stamp)
fs.copyFileSync(PATH_LAYOUT, PATH_LAYOUT + '.backup_' + stamp)

fs.mkdirSync(path.dirname(PATH_ROUTE), { recursive: true })
fs.mkdirSync(path.dirname(PATH_SWITCHER), { recursive: true })

fs.writeFileSync(PATH_ROUTE, ROUTE_CONTENT, 'utf8')
fs.writeFileSync(PATH_SWITCHER, SWITCHER_CONTENT, 'utf8')
fs.writeFileSync(PATH_HEADER, HEADER_NEW, 'utf8')
fs.writeFileSync(PATH_LAYOUT, layoutText, 'utf8')

// Post-write LE verify
const postHeaderLE = detectLE(PATH_HEADER)
const postLayoutLE = detectLE(PATH_LAYOUT)
if (postHeaderLE !== HEADER_LE) {
  throw new Error('LE drift on TenantHeader.tsx: was ' + HEADER_LE + ', now ' + postHeaderLE)
}
if (postLayoutLE !== LAYOUT_LE) {
  throw new Error('LE drift on layout.tsx: was ' + LAYOUT_LE + ', now ' + postLayoutLE)
}

console.log('')
console.log('W5a patch applied successfully.')
console.log('')
console.log('  CREATED:')
console.log('    + ' + PATH_ROUTE)
console.log('    + ' + PATH_SWITCHER)
console.log('  REWRITTEN:')
console.log('    ~ ' + PATH_HEADER + '  (backup: TenantHeader.tsx.backup_' + stamp + ')')
console.log('  MODIFIED:')
console.log('    ~ ' + PATH_LAYOUT + '  (backup: layout.tsx.backup_' + stamp + ')')
console.log('')
console.log('Next:')
console.log('  1. npx tsc --noEmit')
console.log('  2. npm run dev')
console.log('  3. Open http://localhost:3000/admin-homes (you should see Syed in Universal view)')
console.log('  4. Top bar: dropdown should show "All tenants (Universal)" + "WALLiam (walliam.ca)"')
console.log('  5. Pick WALLiam -> page reloads -> tenant card shows WALLiam')
console.log('  6. Pick All tenants (Universal) -> reload -> back to "No tenant selected" state')
console.log('  7. Verify cookie state in DevTools > Application > Cookies')
console.log('  8. Commit + push; tracker patch separate.')