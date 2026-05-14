// scripts/patch-w-leads-workbench-w4d.js
// W-LEADS-WORKBENCH W4d: Activity tab (cumulative visitor + admin timeline).

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const ts = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)

const TAB_REL = 'components/admin-homes/lead-workbench/ActivityTab.tsx'
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

const TAB_CONTENT = `'use client'

// components/admin-homes/lead-workbench/ActivityTab.tsx
// W-LEADS-WORKBENCH W4d (2026-05-14).
//
// Cumulative activity timeline across leadFamily. Merges:
//   - user_activities (visitor actions, keyed by contact_email within tenant)
//   - lead_admin_actions (admin actions, keyed by lead_id within tenant)
// Both arrays pre-fetched server-side in page.tsx; this component handles
// filtering, date bucketing, and rendering.
//
// 13 activity types mapped to icon+label dictionary (B3 verified 2026-05-14).
// admin actions array is empty until W6a writes start landing.

import { useState } from 'react'

export interface ActivityFeedItem {
  id: string
  kind: 'visitor' | 'admin'
  created_at: string
  // visitor fields
  contact_email?: string | null
  agent_id?: string | null
  activity_type?: string | null
  activity_data?: any
  page_url?: string | null
  // admin fields
  lead_id?: string | null
  actor_user_id?: string | null
  actor_agent_id?: string | null
  actor_role?: string | null
  action_type?: string | null
  target_field?: string | null
  before_value?: any
  after_value?: any
  notes?: string | null
}

const ACTIVITY_META: Record<string, { icon: string; label: string }> = {
  viewed_transaction_history: { icon: '\ud83d\udc41', label: 'Viewed transaction history' },
  contact_form:               { icon: '\u2709',       label: 'Submitted contact form' },
  registration:               { icon: '\u2728',       label: 'Registered account' },
  sale_offer_inquiry:         { icon: '\ud83d\udcb0', label: 'Sale offer inquiry' },
  estimator_used:             { icon: '\ud83d\udcca', label: 'Used estimator' },
  property_inquiry:           { icon: '\ud83c\udfe0', label: 'Property inquiry' },
  lease_offer_inquiry:        { icon: '\ud83d\udd11', label: 'Lease offer inquiry' },
  sale_evaluation_request:    { icon: '\ud83d\udc8e', label: 'Sale evaluation request' },
  estimator_contact_submitted:{ icon: '\ud83d\udcca', label: 'Estimator contact submitted' },
  building_visit_request:     { icon: '\ud83c\udfe2', label: 'Building visit request' },
  estimator:                  { icon: '\ud83d\udcca', label: 'Used estimator' },
  unit_history_inquiry:       { icon: '\ud83d\udcdc', label: 'Unit history inquiry' },
  plan_generated:             { icon: '\ud83d\udccb', label: 'Generated plan' },
}

interface Props {
  activityFeed: ActivityFeedItem[]
  leadFamily: any[]
  anchorLeadId: string
}

type FilterMode = 'all' | 'visitor' | 'admin'

export default function ActivityTab({ activityFeed, leadFamily, anchorLeadId }: Props) {
  const [filter, setFilter] = useState<FilterMode>('all')
  const [showAll, setShowAll] = useState(false)

  if (activityFeed.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-sm font-medium">No activity recorded for this lead family yet</div>
        <div className="text-xs mt-1">Visitor page views and admin actions will appear here once captured.</div>
      </div>
    )
  }

  const counts = {
    all: activityFeed.length,
    visitor: activityFeed.filter(a => a.kind === 'visitor').length,
    admin: activityFeed.filter(a => a.kind === 'admin').length,
  }

  const filtered = activityFeed.filter(a => filter === 'all' || a.kind === filter)
  const displayed = showAll ? filtered : filtered.slice(0, 50)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const buckets: Record<string, ActivityFeedItem[]> = {}
  const bucketOrder: string[] = []
  for (const item of displayed) {
    const d = new Date(item.created_at)
    let bucket: string
    if (d >= today) bucket = 'Today'
    else if (d >= yesterday) bucket = 'Yesterday'
    else if (d >= weekAgo) bucket = 'This week'
    else bucket = d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
    if (!buckets[bucket]) {
      buckets[bucket] = []
      bucketOrder.push(bucket)
    }
    buckets[bucket].push(item)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-gray-200">
        <div className="flex gap-1">
          {(['all', 'visitor', 'admin'] as FilterMode[]).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={'px-3 py-1.5 text-xs rounded-full border transition-colors ' + (filter === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </button>
          ))}
        </div>
        {filtered.length > 50 && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-xs text-indigo-600 hover:underline bg-transparent border-0 cursor-pointer"
          >
            Show all {filtered.length} events
          </button>
        )}
      </div>

      {bucketOrder.map(bucketLabel => (
        <section key={bucketLabel}>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{bucketLabel}</h3>
          <ul className="space-y-2 list-none p-0 m-0">
            {buckets[bucketLabel].map(item => (
              <li key={item.id}>
                {item.kind === 'visitor' ? (
                  <VisitorRow item={item} />
                ) : (
                  <AdminRow item={item} leadFamily={leadFamily} anchorLeadId={anchorLeadId} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function VisitorRow({ item }: { item: ActivityFeedItem }) {
  const meta = ACTIVITY_META[item.activity_type || ''] || { icon: '\u2022', label: item.activity_type || 'Activity' }
  const time = new Date(item.created_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
  const dateStr = new Date(item.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })

  const data = item.activity_data || {}
  const details: string[] = []
  if (data.buildingName) details.push(String(data.buildingName))
  if (data.unitNumber) details.push('Unit ' + data.unitNumber)
  if (data.buildingAddress) details.push(String(data.buildingAddress))
  if (data.totalSales) details.push(String(data.totalSales) + ' sales')
  if (data.geoName) details.push(String(data.geoName))

  function openUrl() {
    if (item.page_url) window.open(item.page_url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-base">
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm font-medium text-slate-900">{meta.label}</div>
          <div className="text-xs text-slate-400 whitespace-nowrap">{dateStr} {time}</div>
        </div>
        {details.length > 0 && (
          <div className="text-xs text-slate-500 mt-1">{details.join(' \u00b7 ')}</div>
        )}
        {item.contact_email && (
          <div className="text-xs text-slate-400 mt-1">{item.contact_email}</div>
        )}
        {item.page_url && (
          <button
            type="button"
            onClick={openUrl}
            className="text-xs text-blue-600 hover:underline mt-1 inline-block break-all text-left bg-transparent border-0 p-0 cursor-pointer"
          >
            {item.page_url.length > 80 ? item.page_url.slice(0, 80) + '\u2026' : item.page_url}
          </button>
        )}
      </div>
    </div>
  )
}

function AdminRow({ item, leadFamily, anchorLeadId }: { item: ActivityFeedItem; leadFamily: any[]; anchorLeadId: string }) {
  const time = new Date(item.created_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
  const dateStr = new Date(item.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
  const targetLead = leadFamily.find((l: any) => l.id === item.lead_id)

  return (
    <div className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-50 border border-purple-200 flex items-center justify-center text-base">
        \ud83d\udee0
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm font-medium text-slate-900">
            <span className="text-purple-700">{item.actor_role || 'admin'}</span>: {item.action_type || 'action'}
            {item.target_field && <span className="text-slate-500 font-normal"> \u00b7 {item.target_field}</span>}
          </div>
          <div className="text-xs text-slate-400 whitespace-nowrap">{dateStr} {time}</div>
        </div>
        {item.lead_id && item.lead_id !== anchorLeadId && leadFamily.length > 1 && targetLead && (
          <div className="text-xs text-slate-400 mt-1">
            On lead: {targetLead.source || 'unknown'} ({new Date(targetLead.created_at).toLocaleDateString('en-CA')})
          </div>
        )}
        {item.notes && (
          <div className="text-xs text-slate-600 mt-1">{item.notes}</div>
        )}
        {(item.before_value || item.after_value) && (
          <div className="text-xs text-slate-500 mt-1 font-mono break-all">
            {item.before_value && <span>{JSON.stringify(item.before_value)} \u2192 </span>}
            {item.after_value && <span>{JSON.stringify(item.after_value)}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
`

console.log('=== W4d Patch ===')
console.log('Timestamp: ' + ts)
console.log()

backup(PAGE_REL)
backup(CLIENT_REL)

// 1. Create ActivityTab.tsx
const tabAbs = path.join(ROOT, TAB_REL)
if (fs.existsSync(tabAbs)) throw new Error('TabAlreadyExists: ' + TAB_REL)
fs.writeFileSync(tabAbs, TAB_CONTENT, 'utf8')
console.log('  CREATE ' + TAB_REL + ' (' + TAB_CONTENT.length + ' bytes)')

// 2. Patch page.tsx -- insert activity fetch + add new prop
{
  const abs = path.join(ROOT, PAGE_REL)
  let txt = fs.readFileSync(abs, 'utf8')

  const oldTail =
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

  const newTail =
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
    "  // W4d: Activity feed (cumulative visitor + admin timeline across leadFamily)\n" +
    "  // Visitor activities keyed by contact_email; admin actions keyed by lead_id.\n" +
    "  // Both tenant_id-scoped to anchorLead.tenant_id (trusted source from cross-tenant gate).\n" +
    "  let activityFeed: any[] = []\n" +
    "  const familyEmails = Array.from(new Set(leadFamily.map((l: any) => l.contact_email).filter(Boolean))) as string[]\n" +
    "  const familyIds = leadFamily.map((l: any) => l.id) as string[]\n" +
    "  const tenantIdForActivity = (anchorLead as any).tenant_id\n" +
    "  if (tenantIdForActivity && (familyEmails.length > 0 || familyIds.length > 0)) {\n" +
    "    const [activitiesResult, actionsResult] = await Promise.all([\n" +
    "      familyEmails.length > 0\n" +
    "        ? supabase\n" +
    "            .from('user_activities')\n" +
    "            .select('id, contact_email, agent_id, activity_type, activity_data, page_url, created_at')\n" +
    "            .in('contact_email', familyEmails)\n" +
    "            .eq('tenant_id', tenantIdForActivity)\n" +
    "            .order('created_at', { ascending: false })\n" +
    "            .limit(500)\n" +
    "        : Promise.resolve({ data: [] as any[] }),\n" +
    "      familyIds.length > 0\n" +
    "        ? supabase\n" +
    "            .from('lead_admin_actions')\n" +
    "            .select('id, lead_id, actor_user_id, actor_agent_id, actor_role, action_type, target_field, before_value, after_value, notes, created_at')\n" +
    "            .in('lead_id', familyIds)\n" +
    "            .eq('tenant_id', tenantIdForActivity)\n" +
    "            .order('created_at', { ascending: false })\n" +
    "            .limit(500)\n" +
    "        : Promise.resolve({ data: [] as any[] }),\n" +
    "    ])\n" +
    "    const visitorRows = ((activitiesResult.data as any[]) || []).map((r: any) => ({ ...r, kind: 'visitor' }))\n" +
    "    const adminRows = ((actionsResult.data as any[]) || []).map((r: any) => ({ ...r, kind: 'admin' }))\n" +
    "    activityFeed = [...visitorRows, ...adminRows].sort((a: any, b: any) =>\n" +
    "      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()\n" +
    "    )\n" +
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
    "      activityFeed={activityFeed}\n" +
    "    />\n" +
    "  )\n" +
    "}\n"

  txt = exactReplace(txt, oldTail, newTail, 'page.tsx tail')
  fs.writeFileSync(abs, txt, 'utf8')
  console.log('  PATCH  ' + PAGE_REL + ' (activity fetch + activityFeed prop)')
}

// 3. Patch LeadWorkbenchClient.tsx
{
  const abs = path.join(ROOT, CLIENT_REL)
  let txt = fs.readFileSync(abs, 'utf8')

  // 3a. Add ActivityTab import after UserCreditPanel import
  const oldImport = "import UserCreditPanel, { UserCreditData } from '@/components/admin-homes/lead-workbench/UserCreditPanel'"
  const newImport = oldImport + "\nimport ActivityTab, { ActivityFeedItem } from '@/components/admin-homes/lead-workbench/ActivityTab'"
  txt = exactReplace(txt, oldImport, newImport, 'ActivityTab import')

  // 3b. Extend Props interface
  const oldProps =
    "interface Props {\n" +
    "  anchorLead: any\n" +
    "  leadFamily: any[]\n" +
    "  currentRole: string\n" +
    "  currentAgentId: string | null\n" +
    "  userCredit: UserCreditData | null\n" +
    "  adminUser: AdminUserShape\n" +
    "}"
  const newProps =
    "interface Props {\n" +
    "  anchorLead: any\n" +
    "  leadFamily: any[]\n" +
    "  currentRole: string\n" +
    "  currentAgentId: string | null\n" +
    "  userCredit: UserCreditData | null\n" +
    "  adminUser: AdminUserShape\n" +
    "  activityFeed: ActivityFeedItem[]\n" +
    "}"
  txt = exactReplace(txt, oldProps, newProps, 'Props interface')

  // 3c. Update function destructure
  const oldDestructure = "export default function LeadWorkbenchClient({ anchorLead, leadFamily, currentRole, currentAgentId, userCredit, adminUser }: Props) {"
  const newDestructure = "export default function LeadWorkbenchClient({ anchorLead, leadFamily, currentRole, currentAgentId, userCredit, adminUser, activityFeed }: Props) {"
  txt = exactReplace(txt, oldDestructure, newDestructure, 'function destructure')

  // 3d. Extend tab ternary with activity branch (between credits and final fallback)
  const oldTernary =
    "        {tab === 'overview' ? (\n" +
    "          <OverviewTab anchorLead={anchorLead} leadFamily={leadFamily} />\n" +
    "        ) : tab === 'plan' ? (\n" +
    "          <PlanTab anchorLead={anchorLead} leadFamily={leadFamily} />\n" +
    "        ) : tab === 'credits' ? (\n" +
    "          <CreditsTab anchorLead={anchorLead} userCredit={userCredit} adminUser={adminUser} />\n" +
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
    "        ) : tab === 'activity' ? (\n" +
    "          <ActivityTab activityFeed={activityFeed} leadFamily={leadFamily} anchorLeadId={anchorLead.id} />\n" +
    "        ) : (\n" +
    "          <PlaceholderTab name={activeTabMeta.label} phase={activeTabMeta.phase} />\n" +
    "        )}"
  txt = exactReplace(txt, oldTernary, newTernary, 'tab ternary')

  fs.writeFileSync(abs, txt, 'utf8')
  console.log('  PATCH  ' + CLIENT_REL + ' (4 transforms)')
}

console.log()
console.log('=== Patch complete ===')