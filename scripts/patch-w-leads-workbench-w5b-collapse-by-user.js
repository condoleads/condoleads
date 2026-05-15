#!/usr/bin/env node
/**
 * patch-w-leads-workbench-w5b-collapse-by-user.js
 *
 * feat(W-LEADS-WORKBENCH W5b): collapse leads list by user_id with
 * "+N earlier" indicator + inline expand + global toggle.
 *
 * Edits 2 files (both LF):
 *
 *   1. app/admin-homes/leads/page.tsx (2 anchors):
 *      A1: Page function signature -- add searchParams param
 *      A2: Both <AdminHomesLeadsClient .../> renders -- pass initialExpanded
 *
 *   2. components/admin-homes/AdminHomesLeadsClient.tsx (8 anchors):
 *      B1: Import Fragment from react
 *      B2: Props interface -- add initialExpanded: boolean
 *      B3: Function signature destructure -- add initialExpanded
 *      B4: State block -- add expanded/expandedUserIds + toggle helpers
 *      B5: filteredLeads useMemo tail -- add flatRows useMemo + FlatRow type
 *      B6: Sort bar -- add "All events" / "By user" toggle button
 *      B7: Table body -- swap filteredLeads.map -> flatRows.map (Fragment-keyed),
 *          inject isEarlier visual + earlier-badge, wrap conditional rows in !isEarlier,
 *          rewrite close from `</>))})` to `</Fragment>)})`
 *      B8: Contact column -- add "+N earlier" / "Hide earlier" badge inside the
 *          flex-items-center div, after the engagement span
 *
 * Default state: collapsed (initialExpanded = false). URL param `?expanded=1`
 * persists user preference via router.replace (no full reload).
 *
 * Multi-tenant safety: pure client render change. Data is already tenant-scoped
 * in page.tsx (unchanged). Grouping operates on the already-filtered,
 * already-tenant-scoped leads array. No new DB queries. No new API surface.
 *
 * Known findings logged in tracker (W5b status entry):
 *   F-W5B-LOW-CURRENT-FAN-OUT
 *     Per pre-patch DB recon: only 1 WALLiam user has multi-lead state
 *     (af5222e4-...); 120 identified users have 1 lead each; 42 anon.
 *     Collapse impact on current dataset: -1 visual row. Architectural prep
 *     for repeat-engagement growth; smoke depends on that one user being
 *     in the visible/filtered set.
 *   F-W5B-COLLAPSED-CHECKBOX-PRIMARY-ONLY
 *     In collapsed mode, the primary row's checkbox selects only the
 *     primary (most-recent) lead. To select earlier leads in the group,
 *     expand the group inline via the "+N earlier" badge first.
 *
 * Idempotency: skips if 'const flatRows = useMemo' is already present in
 * AdminHomesLeadsClient.tsx.
 *
 * Backups created with stamp suffix before any write.
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

const FILES = {
  page: path.join(ROOT, 'app', 'admin-homes', 'leads', 'page.tsx'),
  client: path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx'),
}

for (const k of Object.keys(FILES)) {
  if (!fs.existsSync(FILES[k])) {
    throw new Error('file missing: ' + FILES[k])
  }
}

function detectLE(filepath) {
  const b = fs.readFileSync(filepath)
  let crlf = 0
  let lf = 0
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 0x0a) {
      if (i > 0 && b[i - 1] === 0x0d) crlf++
      else lf++
    }
  }
  if (crlf > 0 && lf > 0) {
    throw new Error('mixed LE in ' + filepath + ': crlf=' + crlf + ', lf=' + lf)
  }
  return { LE: crlf > 0 ? 'crlf' : 'lf', text: b.toString('utf8') }
}

function withLE(s, LE) {
  if (LE === 'crlf') {
    // Anchor strings are authored with \n; normalize to \r\n for matching against CRLF files.
    // First collapse any pre-existing \r\n in the anchor (defensive), then convert all \n -> \r\n.
    return s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
  }
  return s
}

const pageInfo = detectLE(FILES.page)
const clientInfo = detectLE(FILES.client)
console.log('LE: page=' + pageInfo.LE + ', client=' + clientInfo.LE)

// ----- Idempotency check on client file -----
const W5B_MARKER = 'const flatRows = useMemo'
if (clientInfo.text.indexOf(W5B_MARKER) !== -1) {
  console.log('SKIP: W5b marker (const flatRows = useMemo) already present in client file. No-op.')
  process.exit(0)
}

// ===================== PAGE.TSX PATCHES =====================
let pageText = pageInfo.text

// --- A1: function signature ---
const A1_OLD = 'export default async function AdminHomesLeadsPage() {'
const A1_NEW =
  'export default async function AdminHomesLeadsPage({ searchParams }: { searchParams: { expanded?: string } }) {\n  const initialExpanded = searchParams?.expanded === \'1\''

// --- A2a: first <AdminHomesLeadsClient ... /> (no-tenant branch, 10-space indent) ---
const A2A_OLD =
  '        <AdminHomesLeadsClient\n' +
  '          initialLeads={[]}\n' +
  '          initialActivities={{}}\n' +
  '          agents={[]}\n' +
  '          currentRole={adminUser?.role || \'admin\'}\n' +
  '          currentAgentId={adminUser?.agentId || null}\n' +
  '        />'
const A2A_NEW =
  '        <AdminHomesLeadsClient\n' +
  '          initialLeads={[]}\n' +
  '          initialActivities={{}}\n' +
  '          agents={[]}\n' +
  '          currentRole={adminUser?.role || \'admin\'}\n' +
  '          currentAgentId={adminUser?.agentId || null}\n' +
  '          initialExpanded={initialExpanded}\n' +
  '        />'

// --- A2b: final <AdminHomesLeadsClient ... /> (main return, 6-space indent) ---
const A2B_OLD =
  '    <AdminHomesLeadsClient\n' +
  '      initialLeads={leads || []}\n' +
  '      initialActivities={activitiesByLeadId}\n' +
  '      agents={agents || []}\n' +
  '      currentRole={adminUser?.role || \'admin\'}\n' +
  '      currentAgentId={adminUser?.agentId || null}\n' +
  '    />'
const A2B_NEW =
  '    <AdminHomesLeadsClient\n' +
  '      initialLeads={leads || []}\n' +
  '      initialActivities={activitiesByLeadId}\n' +
  '      agents={agents || []}\n' +
  '      currentRole={adminUser?.role || \'admin\'}\n' +
  '      currentAgentId={adminUser?.agentId || null}\n' +
  '      initialExpanded={initialExpanded}\n' +
  '    />'

const pagePatches = [
  { name: 'A1 page signature', old: A1_OLD, new: A1_NEW },
  { name: 'A2a client render (no-tenant)', old: A2A_OLD, new: A2A_NEW },
  { name: 'A2b client render (main)', old: A2B_OLD, new: A2B_NEW },
].map(p => ({ name: p.name, old: withLE(p.old, pageInfo.LE), new: withLE(p.new, pageInfo.LE) }))

// ===================== CLIENT.TSX PATCHES =====================
let clientText = clientInfo.text

// --- B1: Fragment import ---
const B1_OLD = "import { useState, useMemo, useEffect } from 'react'"
const B1_NEW = "import { useState, useMemo, useEffect, Fragment } from 'react'"

// --- B2: Props interface ---
const B2_OLD =
  '  currentRole: \'admin\' | \'manager\' | \'agent\'\n' +
  '  currentAgentId: string | null\n' +
  '}'
const B2_NEW =
  '  currentRole: \'admin\' | \'manager\' | \'agent\'\n' +
  '  currentAgentId: string | null\n' +
  '  initialExpanded: boolean\n' +
  '}'

// --- B3: Function signature destructure ---
const B3_OLD =
  'export default function AdminHomesLeadsClient({ initialLeads, initialActivities, agents, currentRole, currentAgentId }: Props) {'
const B3_NEW =
  'export default function AdminHomesLeadsClient({ initialLeads, initialActivities, agents, currentRole, currentAgentId, initialExpanded }: Props) {'

// --- B4: State block + toggle helpers ---
const B4_OLD =
  '  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)\n' +
  '  const router = useRouter()'
const B4_NEW =
  '  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)\n' +
  '  const [expanded, setExpanded] = useState<boolean>(initialExpanded)\n' +
  '  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set())\n' +
  '  const router = useRouter()\n' +
  '\n' +
  '  const toggleExpanded = () => {\n' +
  '    const next = !expanded\n' +
  '    setExpanded(next)\n' +
  '    if (typeof window !== \'undefined\') {\n' +
  '      const params = new URLSearchParams(window.location.search)\n' +
  '      if (next) params.set(\'expanded\', \'1\')\n' +
  '      else params.delete(\'expanded\')\n' +
  '      const query = params.toString()\n' +
  '      router.replace(`/admin-homes/leads${query ? \'?\' + query : \'\'}`, { scroll: false })\n' +
  '    }\n' +
  '  }\n' +
  '\n' +
  '  const toggleUserIdExpand = (userId: string) => {\n' +
  '    setExpandedUserIds(prev => {\n' +
  '      const next = new Set(prev)\n' +
  '      if (next.has(userId)) next.delete(userId)\n' +
  '      else next.add(userId)\n' +
  '      return next\n' +
  '    })\n' +
  '  }'

// --- B5: flatRows useMemo + FlatRow type ---
const B5_OLD =
  '  }, [leads, searchTerm, filterAgent, filterStatus, filterQuality, filterIntent, filterSource, sortBy, sortOrder])\n' +
  '\n' +
  '  const stats = useMemo(() => ({'
const B5_NEW =
  '  }, [leads, searchTerm, filterAgent, filterStatus, filterQuality, filterIntent, filterSource, sortBy, sortOrder])\n' +
  '\n' +
  '  type FlatRow =\n' +
  '    | { kind: \'primary\'; lead: Lead; earlierCount: number; groupUserId: string | null }\n' +
  '    | { kind: \'earlier\'; lead: Lead; groupUserId: string }\n' +
  '\n' +
  '  // W5b: collapse leads by user_id when !expanded. Anonymous (user_id IS NULL) stays per-row.\n' +
  '  // Identified users with N>1 leads collapse to the most-recent representative + "+N earlier" badge.\n' +
  '  // Clicking the badge adds the user_id to expandedUserIds, inline-rendering earlier leads.\n' +
  '  // expanded=true returns every filteredLead as its own primary row (preserves original behavior).\n' +
  '  const flatRows = useMemo<FlatRow[]>(() => {\n' +
  '    if (expanded) {\n' +
  '      return filteredLeads.map(l => ({ kind: \'primary\' as const, lead: l, earlierCount: 0, groupUserId: l.user_id }))\n' +
  '    }\n' +
  '    const groups = new Map<string, Lead[]>()\n' +
  '    const orderedPrimaries: Array<{ groupUserId: string | null; firstSeenLead: Lead }> = []\n' +
  '    const seen = new Set<string>()\n' +
  '    for (const l of filteredLeads) {\n' +
  '      if (!l.user_id) {\n' +
  '        // Anonymous: each is its own group of 1, in filteredLeads order.\n' +
  '        orderedPrimaries.push({ groupUserId: null, firstSeenLead: l })\n' +
  '        continue\n' +
  '      }\n' +
  '      const key = l.user_id\n' +
  '      if (!groups.has(key)) groups.set(key, [])\n' +
  '      groups.get(key)!.push(l)\n' +
  '      if (!seen.has(key)) {\n' +
  '        seen.add(key)\n' +
  '        orderedPrimaries.push({ groupUserId: key, firstSeenLead: l })\n' +
  '      }\n' +
  '    }\n' +
  '    const out: FlatRow[] = []\n' +
  '    for (const p of orderedPrimaries) {\n' +
  '      if (p.groupUserId === null) {\n' +
  '        out.push({ kind: \'primary\', lead: p.firstSeenLead, earlierCount: 0, groupUserId: null })\n' +
  '        continue\n' +
  '      }\n' +
  '      const groupLeads = groups.get(p.groupUserId) || [p.firstSeenLead]\n' +
  '      if (groupLeads.length <= 1) {\n' +
  '        out.push({ kind: \'primary\', lead: p.firstSeenLead, earlierCount: 0, groupUserId: p.groupUserId })\n' +
  '        continue\n' +
  '      }\n' +
  '      // Sort within group by created_at DESC so the most recent is the primary representative.\n' +
  '      const sorted = [...groupLeads].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())\n' +
  '      const primary = sorted[0]\n' +
  '      const earlier = sorted.slice(1)\n' +
  '      out.push({ kind: \'primary\', lead: primary, earlierCount: earlier.length, groupUserId: p.groupUserId })\n' +
  '      if (expandedUserIds.has(p.groupUserId)) {\n' +
  '        for (const e of earlier) {\n' +
  '          out.push({ kind: \'earlier\', lead: e, groupUserId: p.groupUserId })\n' +
  '        }\n' +
  '      }\n' +
  '    }\n' +
  '    return out\n' +
  '  }, [filteredLeads, expanded, expandedUserIds])\n' +
  '\n' +
  '  const stats = useMemo(() => ({'

// --- B6: Toggle button after sortOrder button (uses \u2191 ↑ \u2193 ↓) ---
const B6_OLD =
  '            <button onClick={() => setSortOrder(o => o === \'asc\' ? \'desc\' : \'asc\')} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">\n' +
  '              {sortOrder === \'asc\' ? \'\u2191 Asc\' : \'\u2193 Desc\'}\n' +
  '            </button>'
const B6_NEW =
  '            <button onClick={() => setSortOrder(o => o === \'asc\' ? \'desc\' : \'asc\')} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">\n' +
  '              {sortOrder === \'asc\' ? \'\u2191 Asc\' : \'\u2193 Desc\'}\n' +
  '            </button>\n' +
  '            <button onClick={toggleExpanded} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50" title={expanded ? \'Collapse list by user\' : \'Show every event as its own row\'}>\n' +
  '              {expanded ? \'Collapse by user\' : \'Show all events\'}\n' +
  '            </button>'

// --- B7: Table body open -- filteredLeads.map -> flatRows.map (Fragment-keyed) ---
//  Anchor covers: empty-state guard + map() opener + <tr> opener for primary row.
//  Replacement: rewires to flatRows, adds row-level destructure (lead/isEarlier/...),
//  switches outer fragment to <Fragment key={lead.id}>, adds isEarlier visual styling
//  on the primary <tr>.
const B7_OPEN_OLD =
  '              {filteredLeads.length === 0 ? (\n' +
  '                <tr><td colSpan={10} className="px-6 py-12 text-center text-gray-400">No leads found</td></tr>\n' +
  '              ) : filteredLeads.map(lead => (\n' +
  '                <>\n' +
  '                  <tr key={lead.id} onClick={(e) => { const t = e.target as HTMLElement; if (t.closest(\'button, input, select, a, label\')) return; router.push(\'/admin-homes/leads/\' + lead.id) }} className={`hover:bg-gray-50 cursor-pointer ${updatingStatus === lead.id ? \'opacity-60\' : \'\'}`}>'
const B7_OPEN_NEW =
  '              {flatRows.length === 0 ? (\n' +
  '                <tr><td colSpan={10} className="px-6 py-12 text-center text-gray-400">No leads found</td></tr>\n' +
  '              ) : flatRows.map(row => {\n' +
  '                const lead = row.lead\n' +
  '                const isEarlier = row.kind === \'earlier\'\n' +
  '                const earlierCount = row.kind === \'primary\' ? row.earlierCount : 0\n' +
  '                const groupUserId = row.groupUserId\n' +
  '                const rowKey = isEarlier ? lead.id + \'-earlier\' : lead.id\n' +
  '                return (\n' +
  '                <Fragment key={rowKey}>\n' +
  '                  <tr onClick={(e) => { const t = e.target as HTMLElement; if (t.closest(\'button, input, select, a, label\')) return; router.push(\'/admin-homes/leads/\' + lead.id) }} className={`hover:bg-gray-50 cursor-pointer ${updatingStatus === lead.id ? \'opacity-60\' : \'\'} ${isEarlier ? \'bg-slate-50/70 border-l-4 border-slate-300\' : \'\'}`}>'

// --- B8: Contact column -- inject "+N earlier" badge after engagement span, before </div> ---
//  Anchor: end of engagement IIFE (`)})()}`) + closing </div> + start of email <a>.
//  Uses Â· (U+00B7) middle-dot already in file.
const B8_OLD =
  '                      <div className="flex items-center gap-2">\n' +
  '                        <span className="font-medium text-gray-900">{lead.contact_name}</span>\n' +
  '                        {(() => {\n' +
  '                          const eng = calcEngagement(activities[lead.id] || []);\n' +
  '                          return (\n' +
  '                            <span className={`text-xs font-semibold ${eng.color}`} title={`Engagement: ${eng.label} (${eng.score})`}>\n' +
  '                              {eng.label} \u00b7 {eng.score}\n' +
  '                            </span>\n' +
  '                          );\n' +
  '                        })()}\n' +
  '                      </div>'
const B8_NEW =
  '                      <div className="flex items-center gap-2">\n' +
  '                        <span className="font-medium text-gray-900">{lead.contact_name}</span>\n' +
  '                        {(() => {\n' +
  '                          const eng = calcEngagement(activities[lead.id] || []);\n' +
  '                          return (\n' +
  '                            <span className={`text-xs font-semibold ${eng.color}`} title={`Engagement: ${eng.label} (${eng.score})`}>\n' +
  '                              {eng.label} \u00b7 {eng.score}\n' +
  '                            </span>\n' +
  '                          );\n' +
  '                        })()}\n' +
  '                        {!isEarlier && earlierCount > 0 && groupUserId && (\n' +
  '                          <button\n' +
  '                            onClick={(e) => { e.stopPropagation(); toggleUserIdExpand(groupUserId); }}\n' +
  '                            className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100"\n' +
  '                            title="Toggle earlier events for this user"\n' +
  '                          >\n' +
  '                            {expandedUserIds.has(groupUserId) ? \'Hide earlier\' : `+${earlierCount} earlier`}\n' +
  '                          </button>\n' +
  '                        )}\n' +
  '                      </div>'

// --- B9: Activity preview row -- wrap conditional in !isEarlier ---
const B9_OLD =
  '                  {/* L4: Inline activity preview (last 2) -- full timeline moves to L7 drawer */}\n' +
  '                  {(activities[lead.id] || []).length > 0 && ('
const B9_NEW =
  '                  {/* L4: Inline activity preview (last 2) -- full timeline moves to L7 drawer */}\n' +
  '                  {!isEarlier && (activities[lead.id] || []).length > 0 && ('

// --- B10: Plan data row -- wrap conditional in !isEarlier ---
const B10_OLD =
  '                  {/* Plan data panel */}\n' +
  '                  {expandedLead === lead.id && lead.plan_data && ('
const B10_NEW =
  '                  {/* Plan data panel */}\n' +
  '                  {!isEarlier && expandedLead === lead.id && lead.plan_data && ('

// --- B11: Closing of map callback -- </> + ))} -> </Fragment> + ); })} ---
const B11_OLD =
  '                </>\n' +
  '              ))}\n' +
  '            </tbody>'
const B11_NEW =
  '                </Fragment>\n' +
  '                )\n' +
  '              })}\n' +
  '            </tbody>'

const clientPatches = [
  { name: 'B1 Fragment import', old: B1_OLD, new: B1_NEW },
  { name: 'B2 Props interface', old: B2_OLD, new: B2_NEW },
  { name: 'B3 fn signature destructure', old: B3_OLD, new: B3_NEW },
  { name: 'B4 state + toggle helpers', old: B4_OLD, new: B4_NEW },
  { name: 'B5 flatRows useMemo', old: B5_OLD, new: B5_NEW },
  { name: 'B6 toggle button in sort bar', old: B6_OLD, new: B6_NEW },
  { name: 'B7 tbody open: flatRows.map + Fragment + isEarlier', old: B7_OPEN_OLD, new: B7_OPEN_NEW },
  { name: 'B8 contact column +N earlier badge', old: B8_OLD, new: B8_NEW },
  { name: 'B9 activity preview !isEarlier guard', old: B9_OLD, new: B9_NEW },
  { name: 'B10 plan data !isEarlier guard', old: B10_OLD, new: B10_NEW },
  { name: 'B11 map/tbody close: </Fragment>', old: B11_OLD, new: B11_NEW },
].map(p => ({ name: p.name, old: withLE(p.old, clientInfo.LE), new: withLE(p.new, clientInfo.LE) }))

// ===================== ANCHOR UNIQUENESS CHECK =====================
function checkUnique(label, text, anchors) {
  for (const a of anchors) {
    const count = text.split(a.old).length - 1
    if (count !== 1) {
      throw new Error(
        label + ' :: ' + a.name + ' anchor count ' + count + ' != 1 (expected exactly one match)'
      )
    }
  }
}

checkUnique('page.tsx', pageText, pagePatches)
checkUnique('client.tsx', clientText, clientPatches)
console.log('all anchor uniqueness checks passed')

// ===================== APPLY =====================
for (const p of pagePatches) {
  pageText = pageText.replace(p.old, p.new)
}
for (const p of clientPatches) {
  clientText = clientText.replace(p.old, p.new)
}

// ===================== POST-PATCH ASSERTIONS =====================
// page.tsx
if (pageText.indexOf('searchParams?.expanded === \'1\'') === -1) {
  throw new Error('post-patch page: searchParams expanded read missing')
}
if ((pageText.match(/initialExpanded=\{initialExpanded\}/g) || []).length !== 2) {
  throw new Error('post-patch page: expected 2x initialExpanded prop passes, got ' +
    (pageText.match(/initialExpanded=\{initialExpanded\}/g) || []).length)
}

// client.tsx
if (clientText.indexOf("import { useState, useMemo, useEffect, Fragment } from 'react'") === -1) {
  throw new Error('post-patch client: Fragment import missing')
}
if (clientText.indexOf('initialExpanded: boolean') === -1) {
  throw new Error('post-patch client: initialExpanded prop type missing')
}
if (clientText.indexOf('const flatRows = useMemo') === -1) {
  throw new Error('post-patch client: flatRows useMemo missing')
}
if (clientText.indexOf('const toggleExpanded = () =>') === -1) {
  throw new Error('post-patch client: toggleExpanded helper missing')
}
if (clientText.indexOf('const toggleUserIdExpand = (userId: string) =>') === -1) {
  throw new Error('post-patch client: toggleUserIdExpand helper missing')
}
if (clientText.indexOf('flatRows.length === 0') === -1) {
  throw new Error('post-patch client: flatRows.length empty-state guard missing')
}
if (clientText.indexOf('flatRows.map(row => {') === -1) {
  throw new Error('post-patch client: flatRows.map call missing')
}
if (clientText.indexOf('<Fragment key={rowKey}>') === -1) {
  throw new Error('post-patch client: Fragment wrap missing')
}
if (clientText.indexOf('Show all events') === -1) {
  throw new Error('post-patch client: toggle button label missing')
}
if (clientText.indexOf('Collapse by user') === -1) {
  throw new Error('post-patch client: toggle button alt label missing')
}
// Sanity: table-render usage of filteredLeads.map was replaced by flatRows.map.
// Other filteredLeads.map usages (exportToCSV, header-checkbox onChange) are intentionally
// preserved -- selection + export operate on the full filtered set regardless of collapse state.
// We log the remaining count for the tracker but do not assert a specific number.
const remainingFilteredLeadsMap = (clientText.match(/filteredLeads\.map\(/g) || []).length
console.log('post-patch: remaining filteredLeads.map() refs = ' + remainingFilteredLeadsMap + ' (expected non-render usages: exportToCSV + select-all onChange)')

// LE preservation
if (pageInfo.LE === 'lf' && pageText.indexOf('\r\n') !== -1) {
  throw new Error('CRLF introduced into LF page.tsx')
}
if (clientInfo.LE === 'lf' && clientText.indexOf('\r\n') !== -1) {
  throw new Error('CRLF introduced into LF client.tsx')
}

console.log('all post-patch assertions passed')

// ===================== BACKUP + WRITE =====================
fs.copyFileSync(FILES.page, FILES.page + '.backup_' + stamp)
fs.copyFileSync(FILES.client, FILES.client + '.backup_' + stamp)
fs.writeFileSync(FILES.page, pageText, 'utf8')
fs.writeFileSync(FILES.client, clientText, 'utf8')

// ===================== RE-VERIFY LE ON DISK =====================
function reverifyLE(filepath, expectedLE) {
  const b = fs.readFileSync(filepath)
  let crlf = 0
  let lf = 0
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 0x0a) {
      if (i > 0 && b[i - 1] === 0x0d) crlf++
      else lf++
    }
  }
  if (expectedLE === 'lf' && crlf > 0) {
    throw new Error('LE drift on ' + filepath + ': now has ' + crlf + ' CRLF lines')
  }
  if (expectedLE === 'crlf' && lf > 0) {
    throw new Error('LE drift on ' + filepath + ': now has ' + lf + ' LF-only lines')
  }
}
reverifyLE(FILES.page, pageInfo.LE)
reverifyLE(FILES.client, clientInfo.LE)

console.log('')
console.log('W5b collapse-by-user patch applied successfully.')
console.log('')
console.log('  ~ ' + FILES.page)
console.log('    backup: page.tsx.backup_' + stamp)
console.log('  ~ ' + FILES.client)
console.log('    backup: AdminHomesLeadsClient.tsx.backup_' + stamp)
console.log('')
console.log('  Page patches (3): A1 signature + A2a/A2b initialExpanded prop')
console.log('  Client patches (11): Fragment import, Props, fn sig, state+helpers,')
console.log('                       flatRows useMemo, toggle button, tbody open,')
console.log('                       contact-cell badge, !isEarlier guards (x2), tbody close')
console.log('')
console.log('Next steps:')
console.log('  1. npx tsc --noEmit   (verify types)')
console.log('  2. npm run dev')
console.log('  3. Smoke locally at http://localhost:3000/admin-homes/leads')
console.log('     (WALLiam tenant -- pick via switcher if Universal view)')
console.log('     - Default view: collapsed, ~163 rows, "+1 earlier" badge near user af5222e4-')
console.log('     - Click "+1 earlier" badge: expands inline')
console.log('     - Click "Show all events": URL becomes ?expanded=1, all 164 rows, no badges')
console.log('     - Click "Collapse by user": URL clears, back to collapsed')
console.log('  4. Commit + push, then run W5b tracker patch.')