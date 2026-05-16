#!/usr/bin/env node
/**
 * patch-w-quality-split-2b.js
 *
 * W-QUALITY-SPLIT phase 2b: code patches paired with the 2a schema migration.
 * Schema applied earlier this session (20260516_w_quality_split.sql).
 *
 * Patches 4 System 2 files; System 1 untouched per Rule Zero #1.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const TARGETS = {
  client:    path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx'),
  route:     path.join(ROOT, 'app', 'api', 'admin-homes', 'leads', '[id]', 'route.ts'),
  workbench: path.join(ROOT, 'app', 'admin-homes', 'leads', '[id]', 'LeadWorkbenchClient.tsx'),
  agents:    path.join(ROOT, 'app', 'admin-homes', 'agents', 'page.tsx'),
}
for (const [k, p] of Object.entries(TARGETS)) {
  if (!fs.existsSync(p)) { console.error('FATAL: ' + k + ' missing: ' + p); process.exit(2) }
}

const origRaw = {}
for (const [k, p] of Object.entries(TARGETS)) origRaw[k] = fs.readFileSync(p, 'utf8')

function detectLE(content) {
  const sample = content.slice(0, 8192)
  const crlf = (sample.match(/\r\n/g) || []).length
  const bareLf = (sample.match(/(?<!\r)\n/g) || []).length
  return crlf > 0 && bareLf === 0 ? '\r\n' : '\n'
}
const LE = {}
const orig = {}
for (const k of Object.keys(TARGETS)) {
  LE[k] = detectLE(origRaw[k])
  orig[k] = origRaw[k].replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

if (orig.route.indexOf("actionType: 'temperature_changed'") !== -1) {
  console.log('No-op: phase 2b already applied.')
  process.exit(0)
}

function replaceOnce(haystack, needle, replacement, label) {
  const idx = haystack.indexOf(needle)
  if (idx === -1) {
    let bestLen = 0, bestIdx = -1
    for (let L = needle.length; L >= 20; L -= Math.max(1, Math.floor(L / 10))) {
      const pIdx = haystack.indexOf(needle.slice(0, L))
      if (pIdx !== -1) { bestLen = L; bestIdx = pIdx; break }
    }
    let extra = ''
    if (bestIdx !== -1) {
      const ctxStart = Math.max(0, bestIdx - 5)
      const ctxEnd = Math.min(haystack.length, bestIdx + needle.length + 50)
      extra =
        '\n  Longest matching prefix: ' + bestLen + ' / ' + needle.length + ' chars (file offset ' + bestIdx + ')' +
        '\n  ACTUAL: ' + JSON.stringify(haystack.slice(ctxStart, ctxEnd)) +
        '\n  EXPECT: ' + JSON.stringify(needle)
    } else {
      extra = '\n  No prefix found. Anchor: ' + JSON.stringify(needle)
    }
    throw new Error('Anchor NOT FOUND: ' + label + extra)
  }
  const dup = haystack.indexOf(needle, idx + needle.length)
  if (dup !== -1) throw new Error('Anchor matched TWICE: ' + label)
  return haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length)
}

// ============================================================
// CLIENT
// ============================================================
let next_client = orig.client

next_client = replaceOnce(next_client,
  '  quality: string\n  agent_id: string | null',
  '  quality: string\n  temperature: string | null\n  agent_id: string | null',
  'L1: Lead.temperature')

next_client = replaceOnce(next_client,
  [
    "const QUALITY_VALUES = ['unqualified', 'qualified_hot', 'qualified_cold', 'disqualified'] as const",
    'type QualityValue = typeof QUALITY_VALUES[number]',
    'const QUALITY_LABELS: Record<QualityValue, string> = {',
    "  unqualified: 'Unqualified',",
    "  qualified_hot: 'Hot',",
    "  qualified_cold: 'Cold',",
    "  disqualified: 'Disqualified',",
    '}',
  ].join('\n'),
  [
    "const QUALITY_VALUES = ['unqualified', 'qualified', 'disqualified'] as const",
    'type QualityValue = typeof QUALITY_VALUES[number]',
    'const QUALITY_LABELS: Record<QualityValue, string> = {',
    "  unqualified: 'Unqualified',",
    "  qualified: 'Qualified',",
    "  disqualified: 'Disqualified',",
    '}',
    '',
    "const TEMPERATURE_VALUES = ['hot', 'warm', 'cold'] as const",
    'type TemperatureValue = typeof TEMPERATURE_VALUES[number]',
    'const TEMPERATURE_LABELS: Record<TemperatureValue, string> = {',
    "  hot: 'Hot',",
    "  warm: 'Warm',",
    "  cold: 'Cold',",
    '}',
  ].join('\n'),
  'L2: QUALITY+TEMPERATURE enums')

next_client = replaceOnce(next_client,
  "  const [filterQuality, setFilterQuality] = useState('all')",
  "  const [filterQuality, setFilterQuality] = useState('all')\n  const [filterTemperature, setFilterTemperature] = useState('all')",
  'L3: filterTemperature state')

next_client = replaceOnce(next_client,
  "const updateLeadStatus = async (leadId: string, field: 'status' | 'quality', value: string) => {",
  "const updateLeadStatus = async (leadId: string, field: 'status' | 'quality' | 'temperature', value: string | null) => {",
  'L4: updateLeadStatus signature')

next_client = replaceOnce(next_client,
  "    if (filterQuality !== 'all') f = f.filter(l => l.quality === filterQuality)\n    if (filterIntent !== 'all') f = f.filter(l => l.intent === filterIntent)",
  [
    "    if (filterQuality !== 'all') f = f.filter(l => l.quality === filterQuality)",
    "    if (filterTemperature !== 'all') {",
    "      if (filterTemperature === 'none') f = f.filter(l => !l.temperature)",
    '      else f = f.filter(l => l.temperature === filterTemperature)',
    '    }',
    "    if (filterIntent !== 'all') f = f.filter(l => l.intent === filterIntent)",
  ].join('\n'),
  'L5: filter temperature logic')

next_client = replaceOnce(next_client,
  '}, [leads, searchTerm, filterAgent, filterStatus, filterQuality, filterIntent, filterSource, sortBy, sortOrder])',
  '}, [leads, searchTerm, filterAgent, filterStatus, filterQuality, filterTemperature, filterIntent, filterSource, sortBy, sortOrder])',
  'L6: useMemo deps')

next_client = replaceOnce(next_client,
  "    qualified_hot: leads.filter(l => l.quality === 'qualified_hot').length,",
  "    hot: leads.filter(l => l.temperature === 'hot').length,",
  'L7: stats.hot')

next_client = replaceOnce(next_client,
  "{ label: 'Hot Leads', value: stats.qualified_hot, color: 'text-red-600' }",
  "{ label: 'Hot Leads', value: stats.hot, color: 'text-red-600' }",
  'L8: stats card')

next_client = replaceOnce(next_client,
  "const headers = ['Date', 'Name', 'Email', 'Phone', 'Source', 'Intent', 'Area', 'Budget', 'Agent', 'Manager', 'Area Manager', 'Tenant Admin', 'Status', 'Quality']",
  "const headers = ['Date', 'Name', 'Email', 'Phone', 'Source', 'Intent', 'Area', 'Budget', 'Agent', 'Manager', 'Area Manager', 'Tenant Admin', 'Status', 'Quality', 'Temperature']",
  'L9: CSV headers')

next_client = replaceOnce(next_client,
  "      l.status || '',\n      l.quality || '',\n    ])",
  "      l.status || '',\n      l.quality || '',\n      l.temperature || '',\n    ])",
  'L10: CSV row temperature')

next_client = replaceOnce(next_client,
  [
    '  const qualityColor = (q: string) => ({',
    "    qualified_hot: 'bg-red-100 text-red-800',",
    "    qualified_cold: 'bg-blue-100 text-blue-800',",
    "    unqualified: 'bg-gray-100 text-gray-700',",
    "    disqualified: 'bg-zinc-100 text-zinc-500',",
    "  }[q] || 'bg-gray-100 text-gray-800')",
  ].join('\n'),
  [
    '  const qualityColor = (q: string) => ({',
    "    qualified: 'bg-green-100 text-green-800',",
    "    unqualified: 'bg-gray-100 text-gray-700',",
    "    disqualified: 'bg-zinc-100 text-zinc-500',",
    "  }[q] || 'bg-gray-100 text-gray-800')",
    '',
    '  const temperatureColor = (t: string | null) => {',
    "    if (!t) return 'bg-gray-50 text-gray-500'",
    '    return ({',
    "      hot: 'bg-red-100 text-red-800',",
    "      warm: 'bg-orange-100 text-orange-800',",
    "      cold: 'bg-blue-100 text-blue-800',",
    "    } as Record<string, string>)[t] || 'bg-gray-100 text-gray-800'",
    '  }',
  ].join('\n'),
  'L11: qualityColor + temperatureColor')

next_client = replaceOnce(next_client,
  '<div className="grid grid-cols-1 md:grid-cols-7 gap-4">',
  '<div className="grid grid-cols-1 md:grid-cols-8 gap-4">',
  'L12: grid cols-8')

next_client = replaceOnce(next_client,
  [
    '          <div>',
    '            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Quality</label>',
    '            <select value={filterQuality} onChange={e => setFilterQuality(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">',
    '              <option value="all">All</option>',
    '              <option value="unqualified">Unqualified</option>',
    '              <option value="qualified_hot">Hot</option>',
    '              <option value="qualified_cold">Cold</option>',
    '              <option value="disqualified">Disqualified</option>',
    '            </select>',
    '          </div>',
  ].join('\n'),
  [
    '          <div>',
    '            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Quality</label>',
    '            <select value={filterQuality} onChange={e => setFilterQuality(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">',
    '              <option value="all">All</option>',
    '              {QUALITY_VALUES.map(v => <option key={v} value={v}>{QUALITY_LABELS[v]}</option>)}',
    '            </select>',
    '          </div>',
    '          <div>',
    '            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Temperature</label>',
    '            <select value={filterTemperature} onChange={e => setFilterTemperature(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">',
    '              <option value="all">All</option>',
    '              {TEMPERATURE_VALUES.map(v => <option key={v} value={v}>{TEMPERATURE_LABELS[v]}</option>)}',
    '              <option value="none">(none)</option>',
    '            </select>',
    '          </div>',
  ].join('\n'),
  'L13: filter UI (Quality + Temperature)')

next_client = replaceOnce(next_client,
  "['Date', 'Contact', 'Source', 'Intent', 'Area', 'Agent', 'Hierarchy', 'Status', 'Actions']",
  "['Date', 'Contact', 'Source', 'Intent', 'Area', 'Agent', 'Hierarchy', 'Status', 'Quality', 'Temperature', 'Actions']",
  'L14: table headers')

next_client = replaceOnce(next_client,
  '<tr><td colSpan={10} className="px-6 py-12 text-center text-gray-400">No leads found</td></tr>',
  '<tr><td colSpan={12} className="px-6 py-12 text-center text-gray-400">No leads found</td></tr>',
  'L15: colSpan no-leads')

next_client = replaceOnce(next_client,
  '<td colSpan={10} className="px-6 py-2 bg-slate-50 border-b">',
  '<td colSpan={12} className="px-6 py-2 bg-slate-50 border-b">',
  'L16: colSpan activity')

next_client = replaceOnce(next_client,
  '<td colSpan={11} className="px-6 py-4 bg-gray-50 border-b">',
  '<td colSpan={12} className="px-6 py-4 bg-gray-50 border-b">',
  'L17: colSpan plan')

next_client = replaceOnce(next_client,
  [
    '                      </select>',
    '                    </td>',
    '                    <td className="px-4 py-3 whitespace-nowrap">',
  ].join('\n'),
  [
    '                      </select>',
    '                    </td>',
    '                    {/* Inline quality update (W-QUALITY-SPLIT) */}',
    '                    <td className="px-4 py-3">',
    '                      <select',
    "                        value={lead.quality || 'unqualified'}",
    "                        onChange={e => updateLeadStatus(lead.id, 'quality', e.target.value)}",
    '                        disabled={updatingStatus === lead.id}',
    '                        className={`text-xs px-2 py-1 rounded-full font-semibold border-0 cursor-pointer ${qualityColor(lead.quality)}`}',
    '                      >',
    '                        {QUALITY_VALUES.map(v => (',
    '                          <option key={v} value={v}>{QUALITY_LABELS[v]}</option>',
    '                        ))}',
    '                      </select>',
    '                    </td>',
    '                    {/* Inline temperature update (W-QUALITY-SPLIT) */}',
    '                    <td className="px-4 py-3">',
    '                      <select',
    "                        value={lead.temperature || ''}",
    "                        onChange={e => updateLeadStatus(lead.id, 'temperature', e.target.value || null)}",
    '                        disabled={updatingStatus === lead.id}',
    '                        className={`text-xs px-2 py-1 rounded-full font-semibold border-0 cursor-pointer ${temperatureColor(lead.temperature)}`}',
    '                      >',
    '                        <option value="">\u2014</option>',
    '                        {TEMPERATURE_VALUES.map(v => (',
    '                          <option key={v} value={v}>{TEMPERATURE_LABELS[v]}</option>',
    '                        ))}',
    '                      </select>',
    '                    </td>',
    '                    <td className="px-4 py-3 whitespace-nowrap">',
  ].join('\n'),
  'L18: Quality + Temperature inline <td>s')

// ============================================================
// ROUTE
// ============================================================
let next_route = orig.route

next_route = replaceOnce(next_route,
  ".select('id, tenant_id, agent_id, status, quality')",
  ".select('id, tenant_id, agent_id, status, quality, temperature')",
  'R1: PATCH SELECT widen')

next_route = replaceOnce(next_route,
  'const { status, quality } = await request.json()',
  'const { status, quality, temperature } = await request.json()',
  'R2: body destructure')

next_route = replaceOnce(next_route,
  '    if (status) update.status = status\n    if (quality) update.quality = quality\n',
  '    if (status) update.status = status\n    if (quality) update.quality = quality\n    if (temperature !== undefined) update.temperature = temperature\n',
  'R3: update.temperature')

next_route = replaceOnce(next_route,
  '    if (auditWrites.length > 0) {',
  [
    '    if (temperature !== undefined && temperature !== target.temperature) {',
    '      auditWrites.push(',
    '        logLeadAdminAction({',
    '          supabase,',
    '          tenantId: target.tenant_id,',
    '          leadId: target.id,',
    '          actorAgentId: user.agentId || null,',
    '          actorRole,',
    "          actionType: 'temperature_changed',",
    "          targetField: 'temperature',",
    '          beforeValue: { temperature: target.temperature },',
    '          afterValue: { temperature },',
    "          notes: (target.temperature == null ? '(null)' : String(target.temperature)) + ' -> ' + (temperature == null ? '(null)' : String(temperature)),",
    '        }),',
    '      )',
    '    }',
    '    if (auditWrites.length > 0) {',
  ].join('\n'),
  'R4: temperature_changed audit')

next_route = replaceOnce(next_route,
  "'id, tenant_id, agent_id, contact_name, contact_email, contact_phone, status, quality, source, source_url, intent, geo_name, created_at'",
  "'id, tenant_id, agent_id, contact_name, contact_email, contact_phone, status, quality, temperature, source, source_url, intent, geo_name, created_at'",
  'R5: DELETE SELECT widen')

next_route = replaceOnce(next_route,
  '        quality: target.quality,\n        agent_id: target.agent_id,',
  '        quality: target.quality,\n        temperature: target.temperature,\n        agent_id: target.agent_id,',
  'R6: DELETE snapshot temperature')

// ============================================================
// WORKBENCH
// ============================================================
let next_workbench = orig.workbench

next_workbench = replaceOnce(next_workbench,
  '<Field label="Quality" value={anchorLead.quality} />',
  '<Field label="Quality" value={anchorLead.quality} />\n                <Field label="Temperature" value={anchorLead.temperature || \'\\u2014\'} />',
  'W1: Field Temperature')

next_workbench = replaceOnce(next_workbench,
  '{l.quality && <span>Quality: {l.quality}</span>}',
  '{l.quality && <span>Quality: {l.quality}</span>}\n              {l.temperature && <span>Temperature: {l.temperature}</span>}',
  'W2: span Temperature')

// ============================================================
// AGENTS
// ============================================================
let next_agents = orig.agents

next_agents = replaceOnce(next_agents,
  "hot_leads: leads?.filter(l => l.quality === 'hot').length || 0",
  "hot_leads: leads?.filter(l => l.temperature === 'hot').length || 0",
  'A1: agents hot filter')

// ============================================================
// Assertions
// ============================================================
const assertions = [
  ['client L1 Lead.temperature', next_client.indexOf('  temperature: string | null') !== -1],
  ['client L2 QUALITY clean enum', next_client.indexOf("const QUALITY_VALUES = ['unqualified', 'qualified', 'disqualified']") !== -1],
  ['client L2 TEMPERATURE_VALUES defined', next_client.indexOf("const TEMPERATURE_VALUES = ['hot', 'warm', 'cold']") !== -1],
  ['client L2 qualified_hot literal gone', next_client.indexOf("'qualified_hot'") === -1],
  ['client L2 qualified_cold literal gone', next_client.indexOf("'qualified_cold'") === -1],
  ['client L3 filterTemperature state', next_client.indexOf("const [filterTemperature, setFilterTemperature] = useState('all')") !== -1],
  ['client L4 updateLeadStatus has temperature', next_client.indexOf("'status' | 'quality' | 'temperature'") !== -1],
  ['client L5 filter none branch', next_client.indexOf("filterTemperature === 'none'") !== -1],
  ['client L6 useMemo dep updated', next_client.indexOf('filterQuality, filterTemperature, filterIntent') !== -1],
  ['client L7 stats.hot', next_client.indexOf("hot: leads.filter(l => l.temperature === 'hot').length") !== -1],
  ['client L8 stats card uses stats.hot', next_client.indexOf('value: stats.hot') !== -1],
  ['client L9 CSV Temperature header', next_client.indexOf("'Quality', 'Temperature'") !== -1],
  ['client L10 CSV row temperature', next_client.indexOf("l.temperature || ''") !== -1],
  ['client L11 temperatureColor defined', next_client.indexOf('const temperatureColor = (t: string | null)') !== -1],
  ['client L12 grid cols-8', next_client.indexOf('md:grid-cols-8') !== -1],
  ['client L12 grid cols-7 gone', next_client.indexOf('md:grid-cols-7') === -1],
  ['client L13 Temperature filter label', next_client.indexOf('uppercase tracking-wider">Temperature</label>') !== -1],
  ['client L14 table header has Quality+Temperature', next_client.indexOf("'Status', 'Quality', 'Temperature', 'Actions'") !== -1],
  ['client L15-17 colSpan 12', next_client.indexOf('colSpan={12}') !== -1],
  ['client L15-17 colSpan 10 gone', next_client.indexOf('colSpan={10}') === -1],
  ['client L15-17 colSpan 11 gone', next_client.indexOf('colSpan={11}') === -1],
  ['client L18 inline temperature handler', next_client.indexOf("updateLeadStatus(lead.id, 'temperature'") !== -1],

  ['route R1 PATCH SELECT has temperature', next_route.indexOf(".select('id, tenant_id, agent_id, status, quality, temperature')") !== -1],
  ['route R2 destructure has temperature', next_route.indexOf('const { status, quality, temperature } = await request.json()') !== -1],
  ['route R3 update.temperature', next_route.indexOf('if (temperature !== undefined) update.temperature = temperature') !== -1],
  ['route R4 temperature_changed audit', next_route.indexOf("actionType: 'temperature_changed'") !== -1],
  ['route R5 DELETE SELECT has temperature', next_route.indexOf('status, quality, temperature, source') !== -1],
  ['route R6 DELETE snapshot temperature', next_route.indexOf('temperature: target.temperature') !== -1],

  ['workbench W1 Field Temperature', next_workbench.indexOf('<Field label="Temperature"') !== -1],
  ['workbench W2 span Temperature', next_workbench.indexOf('<span>Temperature:') !== -1],

  ['agents A1 hot_leads uses temperature', next_agents.indexOf("hot_leads: leads?.filter(l => l.temperature === 'hot').length || 0") !== -1],
  ['agents A1 old quality===hot gone', next_agents.indexOf("leads?.filter(l => l.quality === 'hot')") === -1],
]

console.log('')
console.log('Post-build assertions:')
console.log('-'.repeat(60))
let allPass = true
for (const [name, ok] of assertions) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name)
  if (!ok) allPass = false
}
console.log('-'.repeat(60))

if (!allPass) {
  console.error('\nFATAL: assertions failed. NO FILES WRITTEN.')
  process.exit(1)
}

function withOriginalLE(content, le) { return le === '\r\n' ? content.replace(/\n/g, '\r\n') : content }

const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const ts = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds())

function backupAndWrite(target, content, le, label) {
  const backup = target + '.backup_' + ts
  fs.copyFileSync(target, backup)
  fs.writeFileSync(target, withOriginalLE(content, le), 'utf8')
  console.log('  ' + label + ': backed up to ' + path.basename(backup))
}

const writes = [
  ['client',    TARGETS.client,    next_client,    LE.client,    'AdminHomesLeadsClient.tsx'],
  ['route',     TARGETS.route,     next_route,     LE.route,     'route.ts'],
  ['workbench', TARGETS.workbench, next_workbench, LE.workbench, 'LeadWorkbenchClient.tsx'],
  ['agents',    TARGETS.agents,    next_agents,    LE.agents,    'agents/page.tsx'],
]

console.log('')
console.log('Writing:')
for (const [k, p, c, le, label] of writes) backupAndWrite(p, c, le, label)

console.log('')
console.log('Byte deltas:')
for (const [k, p, c, le, label] of writes) {
  const finalLen = withOriginalLE(c, le).length
  const d = finalLen - origRaw[k].length
  console.log('  ' + label + ': ' + origRaw[k].length + ' -> ' + finalLen + ' (' + (d >= 0 ? '+' : '') + d + ')')
}

process.exit(0)