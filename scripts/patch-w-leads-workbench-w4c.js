// scripts/patch-w-leads-workbench-w4c.js
// W-LEADS-WORKBENCH W4c: Credits & Usage tab.
// 1. Creates components/admin-homes/lead-workbench/UserCreditPanel.tsx
// 2. Patches app/admin-homes/leads/[id]/page.tsx (user credit fetch + new props)
// 3. Patches app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx (import + Props + destructure + tab ternary + CreditsTab function)

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const ts = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)

const PANEL_REL = 'components/admin-homes/lead-workbench/UserCreditPanel.tsx'
const PAGE_REL = 'app/admin-homes/leads/[id]/page.tsx'
const CLIENT_REL = 'app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx'

function backup(rel) {
  const abs = path.join(ROOT, rel)
  const dest = abs + '.backup_' + ts
  fs.copyFileSync(abs, dest)
  console.log('  BACKUP ' + rel + ' -> ' + path.basename(dest))
}

function exactReplace(text, oldStr, newStr, label) {
  const idx = text.indexOf(oldStr)
  if (idx === -1) throw new Error('anchor not found: ' + label)
  if (text.indexOf(oldStr, idx + oldStr.length) !== -1) throw new Error('anchor not unique: ' + label)
  return text.replace(oldStr, newStr)
}

// =============================================================================
// UserCreditPanel.tsx content
// =============================================================================

const PANEL_CONTENT = `'use client'

// components/admin-homes/lead-workbench/UserCreditPanel.tsx
// W-LEADS-WORKBENCH W4c (2026-05-14).
//
// User credit panel extracted from app/admin-homes/users/UsersClient.tsx
// surface (3-pool model: chat / plans / estimator). Embedded in the
// workbench Credits tab keyed on anchorLead.user_id. Empty state when
// user_id IS NULL is handled by the LeadWorkbenchClient parent.
//
// F-USERS-NO-SELLER-PLAN-INPUT remains OPEN: override API + DB support
// seller_plan_limit but neither this panel nor the Users page UI surface
// it (matches existing Users page behavior). Future phase can split when
// tenant.plan_mode = 'independent'.
//
// F-W4C-USERCREDITPANEL-LOCATION: lives in lead-workbench/ for now;
// known move-candidate when Users page migrates to consume this component.

import { useState } from 'react'

export interface UserCreditData {
  userProfile: {
    id: string
    full_name?: string | null
    phone?: string | null
    created_at?: string | null
    last_active_at?: string | null
    assigned_agent_id?: string | null
    looking_to?: string | null
  } | null
  usage: { chat: number; plans: number; estimator: number }
  override: {
    user_id: string
    ai_chat_limit: number | null
    buyer_plan_limit: number | null
    seller_plan_limit: number | null
    estimator_limit: number | null
    note?: string | null
    granted_at?: string | null
    granted_by_tier?: string | null
    granted_by_agent_id?: string | null
  } | null
  tenant: any | null
  assignedAgent: { id: string; full_name?: string | null } | null
}

interface Props {
  userId: string
  tenantId: string
  userCredit: UserCreditData
  adminUser: {
    agentId: string | null
    role: string | null
    isPlatformAdmin: boolean
    tenantId: string | null
  }
}

interface Usage { chat: number; plans: number; estimator: number }

function getTenantDefaults(tenant: any): Usage {
  return {
    chat:      tenant?.ai_free_messages    ?? 1,
    plans:     tenant?.plan_free_attempts  ?? 1,
    estimator: tenant?.estimator_free_attempts ?? 1,
  }
}

function getResolvedLimits(tenant: any, override: any): Usage {
  const d = getTenantDefaults(tenant)
  return {
    chat:      override?.ai_chat_limit    != null ? Math.min(override.ai_chat_limit,    tenant?.ai_hard_cap ?? 10)        : d.chat,
    plans:     override?.buyer_plan_limit != null ? Math.min(override.buyer_plan_limit, tenant?.plan_hard_cap ?? 10)      : d.plans,
    estimator: override?.estimator_limit  != null ? Math.min(override.estimator_limit,  tenant?.estimator_hard_cap ?? 10) : d.estimator,
  }
}

const POOLS: { key: keyof Usage; label: string; overrideKey: string; icon: string }[] = [
  { key: 'chat',      label: 'AI Chat',   overrideKey: 'ai_chat_limit',    icon: '\ud83d\udcac' },
  { key: 'plans',     label: 'AI Plans',  overrideKey: 'buyer_plan_limit', icon: '\ud83d\udccb' },
  { key: 'estimator', label: 'Estimator', overrideKey: 'estimator_limit',  icon: '\ud83d\udcca' },
]

export default function UserCreditPanel({ userId, tenantId, userCredit, adminUser }: Props) {
  const { userProfile, usage, tenant, assignedAgent } = userCredit
  const [override, setOverride] = useState<any>(userCredit.override)

  const [modalOpen, setModalOpen]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const [chatLimit, setChatLimit]   = useState('')
  const [plansLimit, setPlansLimit] = useState('')
  const [estimatorLimit, setEstimatorLimit] = useState('')
  const [note, setNote] = useState('')

  const hardCaps = {
    chat:      tenant?.ai_hard_cap        ?? 10,
    plans:     tenant?.plan_hard_cap      ?? 10,
    estimator: tenant?.estimator_hard_cap ?? 10,
  }

  const limits = getResolvedLimits(tenant, override)
  const hasOverride = !!override
  const planMode: string = tenant?.plan_mode || 'shared'

  function openModal() {
    setChatLimit(override?.ai_chat_limit       != null ? String(override.ai_chat_limit)       : '')
    setPlansLimit(override?.buyer_plan_limit   != null ? String(override.buyer_plan_limit)    : '')
    setEstimatorLimit(override?.estimator_limit != null ? String(override.estimator_limit)    : '')
    setNote(override?.note || '')
    setSaveError(null)
    setModalOpen(true)
  }
  function closeModal() { setModalOpen(false); setSaveError(null) }

  async function handleSave() {
    setSaving(true); setSaveError(null)
    try {
      const res = await fetch('/api/admin-homes/users/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          tenantId,
          agentId:        adminUser.agentId,
          agentTier:      adminUser.role === 'admin' ? 'admin' : adminUser.role === 'manager' ? 'manager' : 'managed',
          note:           note.trim() || null,
          aiChatLimit:    chatLimit      !== '' ? parseInt(chatLimit)      : null,
          buyerPlanLimit: plansLimit     !== '' ? parseInt(plansLimit)     : null,
          estimatorLimit: estimatorLimit !== '' ? parseInt(estimatorLimit) : null,
        }),
      })
      if (!res.ok) {
        const e = await res.json()
        setSaveError(e.error || 'Failed')
        return
      }
      const { override: newOverride } = await res.json()
      setOverride(newOverride)
      closeModal()
    } catch {
      setSaveError('Network error -- try again')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (!confirm('Clear all credit overrides for this user? They will fall back to tenant defaults.')) return
    try {
      await fetch('/api/admin-homes/users/override', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tenantId }),
      })
      setOverride(null)
    } catch (e) {
      console.error('Clear failed', e)
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">User</h3>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Name" value={userProfile?.full_name} />
          <Field label="Phone" value={userProfile?.phone} />
          <Field label="Registered" value={userProfile?.created_at ? new Date(userProfile.created_at).toLocaleDateString('en-CA') : null} />
          <Field label="Last active" value={userProfile?.last_active_at ? new Date(userProfile.last_active_at).toLocaleDateString('en-CA') : null} />
          <Field label="Assigned agent" value={assignedAgent?.full_name} />
          <Field label="Looking to" value={userProfile?.looking_to} />
        </dl>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Credit pools
            {planMode === 'shared' && (
              <span className="ml-2 text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                shared plan mode
              </span>
            )}
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openModal}
              className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
            >
              Set limits
            </button>
            {hasOverride && (
              <button
                type="button"
                onClick={handleClear}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 transition-colors"
              >
                Clear override
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {POOLS.map(({ key, label, overrideKey, icon }) => {
            const used = usage[key]
            const limit = limits[key]
            const remaining = Math.max(0, limit - used)
            const isOverridden = override?.[overrideKey] != null
            const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
            const isEmpty = remaining === 0
            const isLow = remaining === 1
            const barColor = isEmpty ? '#ef4444' : isLow ? '#f59e0b' : isOverridden ? '#3b82f6' : '#10b981'
            const textColor = isEmpty ? 'text-red-600' : isLow ? 'text-amber-500' : isOverridden ? 'text-blue-600' : 'text-gray-900'
            return (
              <div key={key} className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-slate-700">{icon} {label}</div>
                  {isOverridden && (
                    <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">custom</span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <div className={'text-3xl font-extrabold ' + textColor}>{remaining}</div>
                  <div className="text-xs text-slate-500">remaining of {limit}</div>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                  <div
                    style={{ width: pct + '%', background: barColor }}
                    className="h-full rounded-full transition-all"
                  />
                </div>
                <div className="text-xs text-slate-500">{used} used</div>
              </div>
            )
          })}
        </div>

        {override?.note && (
          <div className="mt-3 text-xs text-slate-500">
            <span className="font-medium">Override note:</span> {override.note}
            {override.granted_at && (
              <span className="ml-2 text-slate-400">({new Date(override.granted_at).toLocaleDateString('en-CA')})</span>
            )}
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Set credit limits</h2>
            <p className="text-sm text-gray-500 mb-5">
              {userProfile?.full_name || 'User'} \u2014 leave blank to use tenant default
            </p>
            {saveError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{saveError}</div>
            )}
            <div className="space-y-4">
              {[
                { label: 'AI Chat',   value: chatLimit,      set: setChatLimit,      cap: hardCaps.chat },
                { label: 'AI Plans',  value: plansLimit,     set: setPlansLimit,     cap: hardCaps.plans },
                { label: 'Estimator', value: estimatorLimit, set: setEstimatorLimit, cap: hardCaps.estimator },
              ].map(({ label, value, set, cap }) => (
                <div key={label} className="flex items-center gap-4">
                  <label className="text-sm font-medium text-gray-700 w-28">{label}</label>
                  <input
                    type="number"
                    min={0}
                    max={cap}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    placeholder="Tenant default"
                    className="border rounded px-3 py-1.5 text-sm flex-1"
                  />
                  <span className="text-xs text-gray-400 whitespace-nowrap">max {cap}</span>
                </div>
              ))}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Note (internal)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Serious buyer, approved extended access"
                  className="border rounded px-3 py-1.5 text-sm w-full"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save limits'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-gray-800">{value || '\u2014'}</dd>
    </div>
  )
}
`

// =============================================================================
// Run patches
// =============================================================================

console.log('=== W4c Patch ===')
console.log('Timestamp: ' + ts)
console.log()

backup(PAGE_REL)
backup(CLIENT_REL)

// 1. Create UserCreditPanel.tsx
const panelAbs = path.join(ROOT, PANEL_REL)
if (fs.existsSync(panelAbs)) throw new Error('PanelAlreadyExists: ' + PANEL_REL)
fs.writeFileSync(panelAbs, PANEL_CONTENT, 'utf8')
console.log('  CREATE ' + PANEL_REL + ' (' + PANEL_CONTENT.length + ' bytes)')

// 2. Patch page.tsx
{
  const abs = path.join(ROOT, PAGE_REL)
  let txt = fs.readFileSync(abs, 'utf8')

  const oldTail =
    "  }\n" +
    "\n" +
    "  return (\n" +
    "    <LeadWorkbenchClient\n" +
    "      anchorLead={anchorLead}\n" +
    "      leadFamily={leadFamily}\n" +
    "      currentRole={user.role || 'admin'}\n" +
    "      currentAgentId={user.agentId || null}\n" +
    "    />\n" +
    "  )\n" +
    "}\n"

  const newTail =
    "  }\n" +
    "\n" +
    "  // W4c: User credit bundle (5-source) when user_id is present.\n" +
    "  // Null when anchorLead.user_id is null (anonymous lead) -- workbench\n" +
    "  // Credits tab renders an empty state in that case.\n" +
    "  let userCredit: any = null\n" +
    "  if ((anchorLead as any).user_id) {\n" +
    "    const u = (anchorLead as any).user_id\n" +
    "    const t = (anchorLead as any).tenant_id\n" +
    "\n" +
    "    const [\n" +
    "      { data: userProfile },\n" +
    "      { data: sessions },\n" +
    "      { data: override },\n" +
    "      { data: tenant },\n" +
    "    ] = await Promise.all([\n" +
    "      supabase\n" +
    "        .from('user_profiles')\n" +
    "        .select('id, full_name, phone, created_at, last_active_at, assigned_agent_id, looking_to')\n" +
    "        .eq('id', u)\n" +
    "        .maybeSingle(),\n" +
    "      supabase\n" +
    "        .from('chat_sessions')\n" +
    "        .select('user_id, message_count, buyer_plans_used, seller_plans_used, estimator_count, updated_at')\n" +
    "        .eq('user_id', u)\n" +
    "        .eq('tenant_id', t)\n" +
    "        .order('updated_at', { ascending: false })\n" +
    "        .limit(1),\n" +
    "      supabase\n" +
    "        .from('user_credit_overrides')\n" +
    "        .select('user_id, ai_chat_limit, buyer_plan_limit, seller_plan_limit, estimator_limit, note, granted_at, granted_by_tier, granted_by_agent_id')\n" +
    "        .eq('user_id', u)\n" +
    "        .eq('tenant_id', t)\n" +
    "        .maybeSingle(),\n" +
    "      supabase\n" +
    "        .from('tenants')\n" +
    "        .select('ai_free_messages, ai_auto_approve_limit, ai_manual_approve_limit, ai_hard_cap, plan_free_attempts, plan_auto_approve_limit, plan_manual_approve_limit, plan_hard_cap, seller_plan_free_attempts, seller_plan_auto_approve_limit, seller_plan_manual_approve_limit, seller_plan_hard_cap, estimator_free_attempts, estimator_auto_approve_attempts, estimator_manual_approve_attempts, estimator_hard_cap, plan_mode')\n" +
    "        .eq('id', t)\n" +
    "        .maybeSingle(),\n" +
    "    ])\n" +
    "\n" +
    "    const session = (sessions as any[] | null)?.[0] || null\n" +
    "\n" +
    "    let assignedAgent: any = null\n" +
    "    if ((userProfile as any)?.assigned_agent_id) {\n" +
    "      const { data: agentRow } = await supabase\n" +
    "        .from('agents')\n" +
    "        .select('id, full_name')\n" +
    "        .eq('id', (userProfile as any).assigned_agent_id)\n" +
    "        .maybeSingle()\n" +
    "      assignedAgent = agentRow\n" +
    "    }\n" +
    "\n" +
    "    userCredit = {\n" +
    "      userProfile,\n" +
    "      usage: {\n" +
    "        chat:      session?.message_count    || 0,\n" +
    "        plans:     (session?.buyer_plans_used || 0) + (session?.seller_plans_used || 0),\n" +
    "        estimator: session?.estimator_count   || 0,\n" +
    "      },\n" +
    "      override,\n" +
    "      tenant,\n" +
    "      assignedAgent,\n" +
    "    }\n" +
    "  }\n" +
    "\n" +
    "  return (\n" +
    "    <LeadWorkbenchClient\n" +
    "      anchorLead={anchorLead}\n" +
    "      leadFamily={leadFamily}\n" +
    "      currentRole={user.role || 'admin'}\n" +
    "      currentAgentId={user.agentId || null}\n" +
    "      userCredit={userCredit}\n" +
    "      adminUser={{\n" +
    "        agentId: user.agentId || null,\n" +
    "        role: user.role || null,\n" +
    "        isPlatformAdmin: user.isPlatformAdmin === true,\n" +
    "        tenantId: user.tenantId || null,\n" +
    "      }}\n" +
    "    />\n" +
    "  )\n" +
    "}\n"

  txt = exactReplace(txt, oldTail, newTail, 'page.tsx tail')
  fs.writeFileSync(abs, txt, 'utf8')
  console.log('  PATCH  ' + PAGE_REL + ' (user credit fetch + new props)')
}

// 3. Patch LeadWorkbenchClient.tsx
{
  const abs = path.join(ROOT, CLIENT_REL)
  let txt = fs.readFileSync(abs, 'utf8')

  // 3a. Add UserCreditPanel import after PlanTab import
  const oldImport = "import PlanTab from '@/components/admin-homes/lead-workbench/PlanRenderer'"
  const newImport = "import PlanTab from '@/components/admin-homes/lead-workbench/PlanRenderer'\nimport UserCreditPanel, { UserCreditData } from '@/components/admin-homes/lead-workbench/UserCreditPanel'"
  txt = exactReplace(txt, oldImport, newImport, 'UserCreditPanel import')

  // 3b. Extend Props interface
  const oldProps =
    "interface Props {\n" +
    "  anchorLead: any\n" +
    "  leadFamily: any[]\n" +
    "  currentRole: string\n" +
    "  currentAgentId: string | null\n" +
    "}"
  const newProps =
    "interface AdminUserShape {\n" +
    "  agentId: string | null\n" +
    "  role: string | null\n" +
    "  isPlatformAdmin: boolean\n" +
    "  tenantId: string | null\n" +
    "}\n" +
    "\n" +
    "interface Props {\n" +
    "  anchorLead: any\n" +
    "  leadFamily: any[]\n" +
    "  currentRole: string\n" +
    "  currentAgentId: string | null\n" +
    "  userCredit: UserCreditData | null\n" +
    "  adminUser: AdminUserShape\n" +
    "}"
  txt = exactReplace(txt, oldProps, newProps, 'Props interface')

  // 3c. Update function destructure
  const oldDestructure = "export default function LeadWorkbenchClient({ anchorLead, leadFamily, currentRole, currentAgentId }: Props) {"
  const newDestructure = "export default function LeadWorkbenchClient({ anchorLead, leadFamily, currentRole, currentAgentId, userCredit, adminUser }: Props) {"
  txt = exactReplace(txt, oldDestructure, newDestructure, 'function destructure')

  // 3d. Extend tab ternary with credits branch
  const oldTernary =
    "        {tab === 'overview' ? (\n" +
    "          <OverviewTab anchorLead={anchorLead} leadFamily={leadFamily} />\n" +
    "        ) : tab === 'plan' ? (\n" +
    "          <PlanTab anchorLead={anchorLead} leadFamily={leadFamily} />\n" +
    "        ) : (\n" +
    "          <PlaceholderTab name={activeTabMeta.label} phase={activeTabMeta.phase} />\n" +
    "        )}"
  const newTernary =
    "        {tab === 'overview' ? (\n" +
    "          <OverviewTab anchorLead={anchorLead} leadFamily={leadFamily} />\n" +
    "        ) : tab === 'plan' ? (\n" +
    "          <PlanTab anchorLead={anchorLead} leadFamily={leadFamily} />\n" +
    "        ) : tab === 'credits' ? (\n" +
    "          <CreditsTab anchorLead={anchorLead} userCredit={userCredit} adminUser={adminUser} />\n" +
    "        ) : (\n" +
    "          <PlaceholderTab name={activeTabMeta.label} phase={activeTabMeta.phase} />\n" +
    "        )}"
  txt = exactReplace(txt, oldTernary, newTernary, 'tab ternary')

  // 3e. Insert CreditsTab function before Field function
  const oldFieldHeader = "function Field({ label, value }: { label: string; value: any }) {"
  const creditsTab =
    "function CreditsTab({ anchorLead, userCredit, adminUser }: { anchorLead: any; userCredit: UserCreditData | null; adminUser: AdminUserShape }) {\n" +
    "  if (!anchorLead.user_id) {\n" +
    "    return (\n" +
    "      <div className=\"text-center py-16 text-gray-400\">\n" +
    "        <div className=\"text-sm font-medium\">No user account linked to this lead</div>\n" +
    "        <div className=\"text-xs mt-1\">Credit limits are user-scoped, not lead-scoped. Anonymous leads have no credit data.</div>\n" +
    "      </div>\n" +
    "    )\n" +
    "  }\n" +
    "  if (!userCredit) {\n" +
    "    return (\n" +
    "      <div className=\"text-center py-16 text-gray-400\">\n" +
    "        <div className=\"text-sm font-medium\">Credit data not available</div>\n" +
    "        <div className=\"text-xs mt-1\">Failed to load user credit bundle.</div>\n" +
    "      </div>\n" +
    "    )\n" +
    "  }\n" +
    "  return (\n" +
    "    <UserCreditPanel\n" +
    "      userId={anchorLead.user_id}\n" +
    "      tenantId={anchorLead.tenant_id}\n" +
    "      userCredit={userCredit}\n" +
    "      adminUser={adminUser}\n" +
    "    />\n" +
    "  )\n" +
    "}\n" +
    "\n"
  const newFieldHeader = creditsTab + oldFieldHeader
  txt = exactReplace(txt, oldFieldHeader, newFieldHeader, 'CreditsTab insertion')

  fs.writeFileSync(abs, txt, 'utf8')
  console.log('  PATCH  ' + CLIENT_REL + ' (5 transforms)')
}

console.log()
console.log('=== Patch complete ===')