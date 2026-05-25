// scripts/r-territory-ops-T1-2-apply.js
//
// W-TERRITORY-OPS T1-2 -- atomic patch: Health route + HealthView + TerritoryTab edit.
//
// Three artifacts written/edited by this script:
//   1. CREATE app/api/admin-homes/territory/health/route.ts          (new)
//   2. CREATE components/admin-homes/cockpit/territory/HealthView.tsx (new)
//   3. EDIT   components/admin-homes/cockpit/tabs/TerritoryTab.tsx    (replace banner with Health/Detail toggle)
//
// IDEMPOTENCY: re-run after a successful apply is a no-op.
// SAFETY: timestamped backup on the only existing file we edit.
// VERIFICATION: re-read each file, check markers, fail on any mismatch.
//
// USAGE: node scripts/r-territory-ops-T1-2-apply.js

const fs = require("fs");
const path = require("path");

// ─── Locations ──────────────────────────────────────────────────────────────
const ROUTE_DIR = path.join("app", "api", "admin-homes", "territory", "health");
const ROUTE_PATH = path.join(ROUTE_DIR, "route.ts");
const VIEW_PATH = path.join(
  "components",
  "admin-homes",
  "cockpit",
  "territory",
  "HealthView.tsx"
);
const TAB_PATH = path.join(
  "components",
  "admin-homes",
  "cockpit",
  "tabs",
  "TerritoryTab.tsx"
);

function info(msg) {
  console.log(msg);
}
function fail(msg) {
  console.error("FATAL: " + msg);
  process.exit(1);
}

// ─── Timestamp for backup ──────────────────────────────────────────────────
const stamp = (() => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "_" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
})();

// ─── 1. Health route ───────────────────────────────────────────────────────
const ROUTE_BODY = `// app/api/admin-homes/territory/health/route.ts
// W-TERRITORY-OPS T1-2 -- GET endpoint that returns resolver_health_check payload.
//
// Returns the 10-key jsonb shape locked in T0-1:
//   tenant_id, selling_agent_count, active_agent_count, tenant_default,
//   total_active_cards, phantom_cards, stale_agent_cards, orphan_buildings,
//   disaster_state, health_grade
//
// Multi-tenant safe: tenant_id derived from authed user OR ?tenant_id= override
// gated on isPlatformAdmin OR tenant_manager_assignments membership.
//
// Auth pattern copied verbatim from cards/cleanup/route.ts (shipped 2026-05-24).
// No new permission keys invented; same scope-via-tenant-membership model.

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
  const { data, error: rpcErr } = await s.rpc('resolver_health_check', { p_tenant_id: tenantId })
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message || 'rpc failed' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'rpc returned no data' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 200 })
}
`;

// ─── 2. Health view (full component, no truncation) ────────────────────────
const VIEW_BODY = `'use client'
// components/admin-homes/cockpit/territory/HealthView.tsx
// W-TERRITORY-OPS T1-2 -- View 4: Health.
//
// Fetches GET /api/admin-homes/territory/health and renders the resolver
// health check in a single screen optimized for "find problems fast".
//
// Layout (top to bottom):
//   1. Disaster banner (red, only when disaster_state OR default not healthy)
//   2. Health-grade summary card (color by grade)
//   3. Stats grid (4 tiles: selling agents, total cards, tenant default, active agents)
//   4. Problems sections: phantoms / stale-agents / orphan-buildings
//
// Real data only. No mocks. Loading + error states are explicit.

import { useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Users,
} from 'lucide-react'

interface TenantDefault {
  agent_id: string
  agent_name: string | null
  is_selling: boolean
  is_active: boolean
  is_healthy: boolean
}

interface HealthPayload {
  tenant_id: string
  selling_agent_count: number
  active_agent_count: number
  tenant_default: TenantDefault | null
  total_active_cards: number
  phantom_cards: number
  stale_agent_cards: number
  orphan_buildings: number
  disaster_state: boolean
  health_grade: 'critical' | 'warning' | 'caution' | 'healthy'
}

interface Props {
  tenantId: string
  tenantName: string
}

export default function HealthView({ tenantId, tenantName }: Props) {
  const [data, setData] = useState<HealthPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    fetch(\`/api/admin-homes/territory/health?tenant_id=\${encodeURIComponent(tenantId)}\`, {
      credentials: 'include',
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body.error || \`HTTP \${r.status}\`)
        }
        return r.json() as Promise<HealthPayload>
      })
      .then((payload) => {
        if (!cancelled) setData(payload)
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message || 'failed to load health')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId])

  if (loading) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Loading territory health for {tenantName}…
      </div>
    )
  }

  if (err) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Could not load health data</p>
            <p className="mt-1">{err}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-500">
        No health data returned.
      </div>
    )
  }

  const gradeStyles: Record<HealthPayload['health_grade'], { bg: string; border: string; text: string; icon: JSX.Element; label: string }> = {
    critical: {
      bg: 'bg-red-50',
      border: 'border-red-300',
      text: 'text-red-900',
      icon: <AlertTriangle className="w-5 h-5 text-red-600" />,
      label: 'Critical',
    },
    warning: {
      bg: 'bg-orange-50',
      border: 'border-orange-300',
      text: 'text-orange-900',
      icon: <AlertCircle className="w-5 h-5 text-orange-600" />,
      label: 'Warning',
    },
    caution: {
      bg: 'bg-amber-50',
      border: 'border-amber-300',
      text: 'text-amber-900',
      icon: <AlertCircle className="w-5 h-5 text-amber-600" />,
      label: 'Caution',
    },
    healthy: {
      bg: 'bg-green-50',
      border: 'border-green-300',
      text: 'text-green-900',
      icon: <CheckCircle2 className="w-5 h-5 text-green-600" />,
      label: 'Healthy',
    },
  }

  const g = gradeStyles[data.health_grade]
  const td = data.tenant_default
  const defaultUnhealthy = td !== null && !td.is_healthy

  return (
    <div className="space-y-4">
      {(data.disaster_state || defaultUnhealthy) && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-red-900">
                Routing in disaster state &mdash; immediate action required
              </p>
              <p className="mt-1 text-red-800">
                {data.disaster_state && data.selling_agent_count === 0
                  ? 'No selling agents are active for this tenant. All routing will return NULL until at least one agent is_selling=true AND is_active=true.'
                  : defaultUnhealthy
                  ? \`Tenant default agent (\${td?.agent_name ?? 'unnamed'}) is not selling or not active. Listing routing falls through to hash-RR; brand pages will surprise the operator.\`
                  : 'Disaster state flagged but cause not identified by client. Inspect resolver_health_check directly.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className={\`rounded-md border \${g.border} \${g.bg} p-4\`}>
        <div className="flex items-start gap-3">
          {g.icon}
          <div className="flex-1">
            <p className={\`text-sm font-semibold \${g.text}\`}>
              {tenantName} territory health: <span className="uppercase tracking-wide">{g.label}</span>
            </p>
            <p className={\`mt-1 text-xs \${g.text} opacity-80\`}>
              Grade derived from selling-agent count, tenant default status, phantom cards, stale-agent cards, and orphan buildings.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={<Users className="w-4 h-4 text-gray-500" />}
          label="Selling agents"
          value={data.selling_agent_count}
          sub={\`\${data.active_agent_count} active total\`}
        />
        <StatTile
          icon={<Activity className="w-4 h-4 text-gray-500" />}
          label="Active cards"
          value={data.total_active_cards}
          sub="across all scopes"
        />
        <StatTile
          icon={
            td?.is_healthy ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600" />
            )
          }
          label="Tenant default"
          value={td ? (td.agent_name ?? '—') : 'unset'}
          sub={
            td
              ? td.is_healthy
                ? 'selling + active'
                : \`\${td.is_selling ? 'selling' : 'not selling'} / \${td.is_active ? 'active' : 'inactive'}\`
              : 'falls back to hash-RR'
          }
          smallValue
        />
        <StatTile
          icon={<Activity className="w-4 h-4 text-gray-500" />}
          label="Disaster state"
          value={data.disaster_state ? 'YES' : 'no'}
          sub={data.disaster_state ? 'routing returning NULL' : 'routing operational'}
          tone={data.disaster_state ? 'red' : undefined}
        />
      </div>

      <div className="space-y-2">
        <ProblemRow
          icon={<AlertCircle className="w-4 h-4 text-amber-600" />}
          tone={data.phantom_cards > 0 ? 'amber' : 'gray'}
          count={data.phantom_cards}
          title="Phantom cards"
          description="Active cards with all three access flags (condo_access / homes_access / buildings_access) set to false. They occupy a routing slot without granting any property-type access."
          ok="No phantom cards detected."
        />
        <ProblemRow
          icon={<AlertTriangle className="w-4 h-4 text-orange-600" />}
          tone={data.stale_agent_cards > 0 ? 'orange' : 'gray'}
          count={data.stale_agent_cards}
          title="Stale-agent cards"
          description="Active cards held by agents who are no longer selling or active. Resolver falls through; cards should be reassigned or deactivated."
          ok="No cards held by non-selling or inactive agents."
        />
        <ProblemRow
          icon={<Building2 className="w-4 h-4 text-blue-600" />}
          tone={data.orphan_buildings > 0 ? 'blue' : 'gray'}
          count={data.orphan_buildings}
          title="Orphan buildings"
          description="Building cards whose surrounding municipality has no apa coverage. The building routes via its pin, but everything else in the municipality cascades to the tenant default."
          ok="No orphan buildings detected."
        />
      </div>
    </div>
  )
}

function StatTile({
  icon,
  label,
  value,
  sub,
  smallValue,
  tone,
}: {
  icon: JSX.Element
  label: string
  value: number | string
  sub: string
  smallValue?: boolean
  tone?: 'red'
}) {
  const valueClass = smallValue
    ? 'text-base font-semibold text-gray-900 truncate'
    : 'text-2xl font-semibold text-gray-900'
  const wrapper =
    tone === 'red'
      ? 'rounded-md border border-red-200 bg-red-50 p-3'
      : 'rounded-md border border-gray-200 bg-white p-3'
  return (
    <div className={wrapper}>
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {icon}
        <span className="uppercase tracking-wide">{label}</span>
      </div>
      <div className={\`mt-1 \${valueClass}\`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{sub}</div>
    </div>
  )
}

function ProblemRow({
  icon,
  tone,
  count,
  title,
  description,
  ok,
}: {
  icon: JSX.Element
  tone: 'amber' | 'orange' | 'blue' | 'gray'
  count: number
  title: string
  description: string
  ok: string
}) {
  const toneClass: Record<typeof tone, string> = {
    amber: 'border-amber-200 bg-amber-50',
    orange: 'border-orange-200 bg-orange-50',
    blue: 'border-blue-200 bg-blue-50',
    gray: 'border-gray-200 bg-white',
  }
  const isClean = count === 0
  return (
    <div className={\`rounded-md border p-3 \${toneClass[tone]}\`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          {isClean ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : icon}
        </div>
        <div className="flex-1 text-sm">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900">{title}</p>
            <span className="text-sm font-semibold text-gray-900 tabular-nums">
              {isClean ? '0' : count}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-700">
            {isClean ? ok : description}
          </p>
        </div>
      </div>
    </div>
  )
}
`;

// ─── 3. New TerritoryTab.tsx body (Health/Detail toggle) ──────────────────
const TAB_BODY = `'use client'
// components/admin-homes/cockpit/tabs/TerritoryTab.tsx
// W-TERRITORY-OPS T1-2 -- Health/Detail toggle.
// Health (default): the new View 4 operations dashboard driven by resolver_health_check.
// Detail: legacy TerritoryClient (Coverage/Matrix/Audit) -- preserved per Rule Zero
// (no operator regression). Subsequent T1-3..T1-5 will add Agents / Cards / Geography
// toggles next to these two.
import { useState } from 'react'
import TerritoryClient from '@/components/admin-homes/TerritoryClient'
import HealthView from '@/components/admin-homes/cockpit/territory/HealthView'
import { Activity, Table } from 'lucide-react'

interface Props { tenantId: string; tenantName: string }

export default function TerritoryTab({ tenantId, tenantName }: Props) {
  const [view, setView] = useState<'health' | 'detail'>('health')
  return (
    <div>
      <div className="flex justify-end mb-3">
        <div className="inline-flex rounded-md shadow-sm border border-gray-200 bg-white" role="group">
          <button
            type="button"
            onClick={() => setView('health')}
            className={
              'px-3 py-1.5 text-xs font-medium rounded-l-md flex items-center gap-1.5 ' +
              (view === 'health' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50')
            }
          >
            <Activity className="w-3.5 h-3.5" /> Health
          </button>
          <button
            type="button"
            onClick={() => setView('detail')}
            className={
              'px-3 py-1.5 text-xs font-medium rounded-r-md flex items-center gap-1.5 border-l border-gray-200 ' +
              (view === 'detail' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50')
            }
          >
            <Table className="w-3.5 h-3.5" /> Detail
          </button>
        </div>
      </div>
      {view === 'health'
        ? <HealthView tenantId={tenantId} tenantName={tenantName} />
        : <TerritoryClient tenantId={tenantId} tenantName={tenantName} seeAll={false} />}
    </div>
  )
}
`;

// ─── Detect TerritoryTab line endings from current disk content ───────────
if (!fs.existsSync(TAB_PATH)) fail(`missing target: ${TAB_PATH}`);
const tabOriginalBuf = fs.readFileSync(TAB_PATH);
const tabOriginalText = tabOriginalBuf.toString("utf8");

let crlfCount = 0, lfCount = 0;
for (let i = 0; i < tabOriginalBuf.length; i++) {
  if (tabOriginalBuf[i] === 0x0a) {
    if (i > 0 && tabOriginalBuf[i - 1] === 0x0d) crlfCount++;
    else lfCount++;
  }
}
const TAB_NL = crlfCount > lfCount ? "\r\n" : "\n";
info(`TerritoryTab line endings: ${TAB_NL === "\r\n" ? "CRLF" : "LF"} (CRLF=${crlfCount}, LF=${lfCount})`);

// ─── Idempotency: detect already-applied state ────────────────────────────
const alreadyApplied =
  tabOriginalText.includes("HealthView") &&
  tabOriginalText.includes("'health' | 'detail'") &&
  fs.existsSync(ROUTE_PATH) &&
  fs.existsSync(VIEW_PATH);

if (alreadyApplied) {
  info("Already applied (TerritoryTab references HealthView; route + view present). Exiting 0.");
  process.exit(0);
}

// ─── Pre-flight: target TerritoryTab must be post-T1-1 state ──────────────
const t11Markers = [
  "rebuild in progress",
  "<TerritoryClient tenantId={tenantId} tenantName={tenantName} seeAll={false} />",
];
for (const m of t11Markers) {
  if (!tabOriginalText.includes(m)) {
    fail(`pre-flight: TerritoryTab does not look like post-T1-1 state (missing ${JSON.stringify(m.slice(0, 60))})`);
  }
}
info("Pre-flight: TerritoryTab confirmed post-T1-1.");

// ─── 1. Write route.ts ────────────────────────────────────────────────────
fs.mkdirSync(ROUTE_DIR, { recursive: true });
fs.writeFileSync(ROUTE_PATH, ROUTE_BODY, "utf8");
info(`CREATED ${ROUTE_PATH} (${Buffer.byteLength(ROUTE_BODY, "utf8")} bytes)`);

// ─── 2. Write HealthView.tsx ──────────────────────────────────────────────
fs.writeFileSync(VIEW_PATH, VIEW_BODY, "utf8");
info(`CREATED ${VIEW_PATH} (${Buffer.byteLength(VIEW_BODY, "utf8")} bytes)`);

// ─── 3. Backup + replace TerritoryTab.tsx ─────────────────────────────────
const backupPath = TAB_PATH + ".backup_" + stamp;
fs.writeFileSync(backupPath, tabOriginalBuf);
info(`BACKUP   ${backupPath} (${tabOriginalBuf.length} bytes)`);

// Normalize TAB_BODY line endings to match disk convention
const normalizedTab = TAB_NL === "\r\n"
  ? TAB_BODY.replace(/\r?\n/g, "\r\n")
  : TAB_BODY.replace(/\r\n/g, "\n");
fs.writeFileSync(TAB_PATH, normalizedTab, "utf8");
info(`EDITED   ${TAB_PATH} (${Buffer.byteLength(normalizedTab, "utf8")} bytes)`);

// ─── Verify ───────────────────────────────────────────────────────────────
function readUtf8(p) {
  return fs.readFileSync(p, "utf8");
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail: detail || "" });
}

const r = readUtf8(ROUTE_PATH);
check("route: GET handler present", r.includes("export async function GET("));
check("route: calls resolver_health_check", r.includes("'resolver_health_check'"));
check("route: uses resolveAdminHomesUser", r.includes("resolveAdminHomesUser"));
check("route: UUID_RE present", r.includes("UUID_RE"));
check("route: tenant_manager_assignments membership check", r.includes("tenant_manager_assignments"));

const v = readUtf8(VIEW_PATH);
check("view: 'use client' directive first line", v.startsWith("'use client'"));
check("view: default export HealthView", v.includes("export default function HealthView"));
check("view: fetches /api/admin-homes/territory/health", v.includes("/api/admin-homes/territory/health"));
check("view: passes tenant_id query param", v.includes("encodeURIComponent(tenantId)"));
check("view: HealthPayload interface declares all 10 keys",
  v.includes("selling_agent_count") &&
  v.includes("active_agent_count") &&
  v.includes("tenant_default") &&
  v.includes("total_active_cards") &&
  v.includes("phantom_cards") &&
  v.includes("stale_agent_cards") &&
  v.includes("orphan_buildings") &&
  v.includes("disaster_state") &&
  v.includes("health_grade"));
check("view: handles all 4 health_grade values",
  v.includes("'critical'") && v.includes("'warning'") && v.includes("'caution'") && v.includes("'healthy'"));

const t = readUtf8(TAB_PATH);
check("tab: imports HealthView", t.includes("import HealthView from '@/components/admin-homes/cockpit/territory/HealthView'"));
check("tab: useState toggle 'health' | 'detail'", t.includes("useState<'health' | 'detail'>('health')"));
check("tab: renders HealthView in health branch", t.includes("<HealthView tenantId={tenantId} tenantName={tenantName} />"));
check("tab: TerritoryClient still mounted in detail branch", t.includes("<TerritoryClient tenantId={tenantId} tenantName={tenantName} seeAll={false} />"));
check("tab: NO leftover Construction icon / banner from T1-1",
  !t.includes("Construction") && !t.includes("rebuild in progress"));

console.log("");
console.log("=== T1-2 patch verification ===");
console.log("-".repeat(70));
let pass = 0, fl = 0;
for (const ck of checks) {
  const mark = ck.ok ? "  PASS" : "  FAIL";
  console.log(`${mark}  ${ck.name}`);
  if (!ck.ok && ck.detail) console.log("        " + ck.detail);
  if (ck.ok) pass++; else fl++;
}
console.log("-".repeat(70));
console.log(`Summary: ${pass} passed, ${fl} failed (${checks.length} total)`);

if (fl > 0) {
  console.error("");
  console.error("Verification failed. Restore from:");
  console.error("  " + backupPath);
  process.exit(1);
}

console.log("");
console.log("T1-2 patch applied. Run:");
console.log("  npx tsc --noEmit");
console.log("  node scripts/r-territory-ops-T1-2-smoke.js");
process.exit(0);