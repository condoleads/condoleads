#!/usr/bin/env node
/**
 * patch-w-leads-workbench-w6a-fu-b-1.js (v3 -- S1/S2 indent corrected to 2-space outer)
 *
 * v1: failed -- LE assumption.
 * v2: failed -- believed S1/S2 target lines had 4-space outer indent (misread).
 * v3: byte-level diagnostic confirmed W6a-2-3 script uses 2-space outer indent
 *     uniformly across its newLines array. Anchors now match the file as it is.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const TARGET_CLIENT = path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx')
const TARGET_SCRIPT = path.join(ROOT, 'scripts', 'patch-w-leads-workbench-w6a-2-3.js')

for (const p of [TARGET_CLIENT, TARGET_SCRIPT]) {
  if (!fs.existsSync(p)) { console.error('FATAL: target missing: ' + p); process.exit(2) }
}

const origClientRaw = fs.readFileSync(TARGET_CLIENT, 'utf8')
const origScriptRaw = fs.readFileSync(TARGET_SCRIPT, 'utf8')

function detectLE(content) {
  const sample = content.slice(0, 8192)
  const crlf = (sample.match(/\r\n/g) || []).length
  const bareLf = (sample.match(/(?<!\r)\n/g) || []).length
  return crlf > 0 && bareLf === 0 ? '\r\n' : '\n'
}
const clientLE = detectLE(origClientRaw)
const scriptLE = detectLE(origScriptRaw)

function toLF(s) { return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n') }
const origClient = toLF(origClientRaw)
const origScript = toLF(origScriptRaw)

const FUB_MARKER_CLIENT = 'W6a followup-B: Inline quality update'
const FUB_MARKER_SCRIPT = "console.error('[admin-homes/leads PATCH] lead-update failed:'"

const clientDone = origClient.indexOf(FUB_MARKER_CLIENT) !== -1
const scriptDone = origScript.indexOf(FUB_MARKER_SCRIPT) !== -1

if (clientDone && scriptDone) {
  console.log('No-op: both targets already at FU-B-1 (markers present).')
  process.exit(0)
}

console.log('Targets:')
console.log('  client: ' + (clientDone ? 'ALREADY AT FU-B-1' : 'will patch'))
console.log('  script: ' + (scriptDone ? 'ALREADY AT FU-B-1' : 'will patch'))

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
      extra = '\n  No prefix of length 20+ found. Anchor: ' + JSON.stringify(needle)
    }
    throw new Error('Anchor NOT FOUND: ' + label + extra)
  }
  const dup = haystack.indexOf(needle, idx + needle.length)
  if (dup !== -1) throw new Error('Anchor matched TWICE: ' + label + ' (positions ' + idx + ', ' + dup + ')')
  return haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length)
}

// ============================================================
// CLIENT patches (unchanged from v2 -- all confirmed to match)
// ============================================================
let newClient = origClient

if (!clientDone) {
  newClient = replaceOnce(newClient,
    "['Date', 'Contact', 'Source', 'Intent', 'Area', 'Agent', 'Hierarchy', 'Status', 'Actions']",
    "['Date', 'Contact', 'Source', 'Intent', 'Area', 'Agent', 'Hierarchy', 'Status', 'Quality', 'Actions']",
    'C1: headers list')

  newClient = replaceOnce(newClient,
    '<tr><td colSpan={10} className="px-6 py-12 text-center text-gray-400">No leads found</td></tr>',
    '<tr><td colSpan={11} className="px-6 py-12 text-center text-gray-400">No leads found</td></tr>',
    'C2: no-results colSpan')

  const c3Anchor = [
    '                      </select>',
    '                    </td>',
    '                    <td className="px-4 py-3 whitespace-nowrap">',
  ].join('\n')
  const c3Replacement = [
    '                      </select>',
    '                    </td>',
    '                    {/* W6a followup-B: Inline quality update -- enables quality_changed audit row */}',
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
    '                    <td className="px-4 py-3 whitespace-nowrap">',
  ].join('\n')
  newClient = replaceOnce(newClient, c3Anchor, c3Replacement, 'C3: insert Quality <td>')

  const c4Anchor = [
    '                        {/* W5c-3: per-row delete hidden for agents (matches server policy). */}',
    "                        {currentRole !== 'agent' && (",
    '                          <button',
    '                            onClick={() => deleteLead(lead.id)}',
    '                            className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"',
    '                          >',
    '                            Delete',
    '                          </button>',
    '                        )}',
  ].join('\n')
  const c4Replacement = [
    '                        {/* W6a followup-B: per-row Delete removed. Delete UI consolidated to bulk-only',
    '                            via the red "Delete (N)" button above the table. Server policy (agent-block)',
    '                            still enforced on every DELETE call regardless of UI surface. */}',
  ].join('\n')
  newClient = replaceOnce(newClient, c4Anchor, c4Replacement, 'C4: remove per-row Delete')

  const c5Anchor = [
    '  const deleteLead = async (leadId: string) => {',
    "    if (!confirm('Delete this lead?')) return",
    '    try {',
    "      const res = await fetch(`/api/admin-homes/leads/${leadId}`, { method: 'DELETE' })",
    '      if (res.ok) setLeads(leads.filter(l => l.id !== leadId))',
    "      else alert('Failed to delete lead')",
    "    } catch { alert('Error deleting lead') }",
    '  }',
    '',
  ].join('\n')
  const c5Replacement = [
    '  // W6a followup-B: deleteLead() removed -- per-row Delete UI consolidated to bulk-only.',
    '',
  ].join('\n')
  newClient = replaceOnce(newClient, c5Anchor, c5Replacement, 'C5: remove deleteLead()')

  const c6Anchor = [
    '  const handleDeleteSelected = async () => {',
    '    if (!confirm(`Delete ${selectedLeads.size} leads?`)) return',
    '    setDeleting(true)',
    '    try {',
    '      await Promise.all(Array.from(selectedLeads).map(id =>',
    "        fetch(`/api/admin-homes/leads/${id}`, { method: 'DELETE' })",
    '      ))',
    '      setLeads(leads.filter(l => !selectedLeads.has(l.id)))',
    '      setSelectedLeads(new Set())',
    "    } catch { alert('Error deleting leads') }",
    '    finally { setDeleting(false) }',
    '  }',
  ].join('\n')
  const c6Replacement = [
    '  const handleDeleteSelected = async () => {',
    '    if (!confirm(`Delete ${selectedLeads.size} leads?`)) return',
    '    setDeleting(true)',
    '    try {',
    '      // W6a followup-B: per-fetch res.ok check. Failures must NOT silently vanish.',
    '      // Only successfully-deleted ids leave local state and selection; failed ids',
    '      // remain visible so the operator can retry. Failures are surfaced via alert',
    '      // summarising up to the first 5 by id + server message.',
    '      const ids = Array.from(selectedLeads)',
    '      const results = await Promise.all(',
    '        ids.map(async id => {',
    '          try {',
    "            const res = await fetch(`/api/admin-homes/leads/${id}`, { method: 'DELETE' })",
    '            if (!res.ok) {',
    '              const body = await res.json().catch(() => ({} as any))',
    '              return { id, ok: false as const, status: res.status, message: (body && body.error) || `HTTP ${res.status}` }',
    '            }',
    '            return { id, ok: true as const }',
    '          } catch (err: any) {',
    "            return { id, ok: false as const, status: 0, message: (err && err.message) || 'Network error' }",
    '          }',
    '        }),',
    '      )',
    '      const okIds = results.filter(r => r.ok).map(r => r.id)',
    '      const failed = results.filter(r => !r.ok)',
    '      if (okIds.length > 0) {',
    '        const okSet = new Set(okIds)',
    '        setLeads(prev => prev.filter(l => !okSet.has(l.id)))',
    '        setSelectedLeads(prev => {',
    '          const next = new Set(prev)',
    '          for (const id of okIds) next.delete(id)',
    '          return next',
    '        })',
    '      }',
    '      if (failed.length > 0) {',
    "        const summary = failed.slice(0, 5).map(f => `  - ${f.id}: ${f.message}`).join('\\n')",
    "        const more = failed.length > 5 ? `\\n  ... and ${failed.length - 5} more` : ''",
    '        alert(`${failed.length} of ${ids.length} deletes failed:\\n${summary}${more}`)',
    '      }',
    '    } finally { setDeleting(false) }',
    '  }',
  ].join('\n')
  newClient = replaceOnce(newClient, c6Anchor, c6Replacement, 'C6: honest handleDeleteSelected')

  newClient = replaceOnce(newClient,
    '<td colSpan={10} className="px-6 py-2 bg-slate-50 border-b">',
    '<td colSpan={11} className="px-6 py-2 bg-slate-50 border-b">',
    'C7: activity colSpan')
}

// ============================================================
// SCRIPT patches -- 2-SPACE OUTER INDENT (fix from v2)
// ============================================================
let newScript = origScript

if (!scriptDone) {
  // S1
  const s1Anchor = [
    "  \"    const { error } = await supabase.from('leads').update(update).eq('id', params.id)\",",
    "  '    if (error) return NextResponse.json({ error: error.message }, { status: 500 })',",
  ].join('\n')
  const s1Replacement = [
    "  \"    const { error } = await supabase.from('leads').update(update).eq('id', params.id)\",",
    "  '    if (error) {',",
    "  \"      console.error('[admin-homes/leads PATCH] lead-update failed:', { leadId: target.id, tenantId: target.tenant_id, error })\",",
    "  '      return NextResponse.json({ error: error.message }, { status: 500 })',",
    "  '    }',",
  ].join('\n')
  newScript = replaceOnce(newScript, s1Anchor, s1Replacement, 'S1: PATCH diagnostic')

  // S2
  const s2Anchor = [
    "  \"    const { error } = await supabase.from('leads').delete().eq('id', params.id)\",",
    "  '    if (error) return NextResponse.json({ error: error.message }, { status: 500 })',",
  ].join('\n')
  const s2Replacement = [
    "  \"    const { error } = await supabase.from('leads').delete().eq('id', params.id)\",",
    "  '    if (error) {',",
    "  \"      console.error('[admin-homes/leads DELETE] lead-delete failed:', { leadId: target.id, tenantId: target.tenant_id, error })\",",
    "  '      return NextResponse.json({ error: error.message }, { status: 500 })',",
    "  '    }',",
  ].join('\n')
  newScript = replaceOnce(newScript, s2Anchor, s2Replacement, 'S2: DELETE diagnostic')

  // S3
  const s3Anchor = [
    "  ['no stray CRLF in LF file', LE === '\\r\\n' || newContent.indexOf('\\r\\n') === -1],",
    ']',
  ].join('\n')
  const s3Replacement = [
    "  ['no stray CRLF in LF file', LE === '\\r\\n' || newContent.indexOf('\\r\\n') === -1],",
    '  // W6a FU-B-1: diagnostic must be re-emitted on every re-run.',
    "  ['PATCH error diagnostic in newContent', newContent.indexOf(\"console.error('[admin-homes/leads PATCH] lead-update failed:'\") !== -1],",
    "  ['DELETE error diagnostic in newContent', newContent.indexOf(\"console.error('[admin-homes/leads DELETE] lead-delete failed:'\") !== -1],",
    ']',
  ].join('\n')
  newScript = replaceOnce(newScript, s3Anchor, s3Replacement, 'S3: add diagnostic assertions')
}

const clientAssertions = clientDone ? [] : [
  ['C1 headers list has Quality before Actions', newClient.indexOf("'Status', 'Quality', 'Actions'") !== -1],
  ['C2 no-results colSpan is 11', newClient.indexOf('<td colSpan={11} className="px-6 py-12 text-center text-gray-400">No leads found</td>') !== -1],
  ['C3 Quality <td> with QUALITY_VALUES map', newClient.indexOf('{QUALITY_VALUES.map(v => (') !== -1],
  ['C3 updateLeadStatus called with quality', newClient.indexOf("updateLeadStatus(lead.id, 'quality', e.target.value)") !== -1],
  ['C4 per-row Delete onClick is gone', newClient.indexOf('onClick={() => deleteLead(lead.id)}') === -1],
  ['C5 deleteLead function is gone', newClient.indexOf('const deleteLead = async (leadId: string) => {') === -1],
  ['C6 per-fetch res.ok check', newClient.indexOf('if (!res.ok) {') !== -1 && newClient.indexOf('return { id, ok: false as const') !== -1],
  ['C6 failures surfaced via alert', newClient.indexOf('deletes failed:') !== -1],
  ['C6 old silent Promise.all is gone', newClient.indexOf('await Promise.all(Array.from(selectedLeads).map(id =>') === -1],
  ['C7 activity colSpan is 11', newClient.indexOf('<td colSpan={11} className="px-6 py-2 bg-slate-50 border-b">') !== -1],
  ['sanity: QUALITY_VALUES constant intact', newClient.indexOf("const QUALITY_VALUES = ['unqualified', 'qualified_hot', 'qualified_cold', 'disqualified']") !== -1],
  ['sanity: handleDeleteSelected still defined', newClient.indexOf('const handleDeleteSelected = async () => {') !== -1],
]
const scriptAssertions = scriptDone ? [] : [
  ['S1 PATCH diagnostic in newLines', newScript.indexOf("\"      console.error('[admin-homes/leads PATCH] lead-update failed:', { leadId: target.id, tenantId: target.tenant_id, error })\"") !== -1],
  ['S2 DELETE diagnostic in newLines', newScript.indexOf("\"      console.error('[admin-homes/leads DELETE] lead-delete failed:', { leadId: target.id, tenantId: target.tenant_id, error })\"") !== -1],
  ['S3 PATCH assertion added', newScript.indexOf("'PATCH error diagnostic in newContent'") !== -1],
  ['S3 DELETE assertion added', newScript.indexOf("'DELETE error diagnostic in newContent'") !== -1],
  ['old single-line PATCH/DELETE returns are gone', (newScript.match(/'    if \(error\) return NextResponse\.json\(\{ error: error\.message \}, \{ status: 500 \}\)',/g) || []).length === 0],
]
const assertions = clientAssertions.concat(scriptAssertions)
console.log('')
console.log('Post-build assertions:')
console.log('-'.repeat(60))
let allPass = true
for (const [name, ok] of assertions) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name)
  if (!ok) allPass = false
}
console.log('-'.repeat(60))
if (!allPass) { console.error('\nFATAL: assertions failed. NO FILES WRITTEN.'); process.exit(1) }

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

console.log('')
console.log('Writing:')
if (!clientDone) backupAndWrite(TARGET_CLIENT, newClient, clientLE, 'AdminHomesLeadsClient.tsx')
if (!scriptDone) backupAndWrite(TARGET_SCRIPT, newScript, scriptLE, 'patch-w-leads-workbench-w6a-2-3.js')

console.log('')
console.log('Byte deltas:')
if (!clientDone) {
  const finalLen = withOriginalLE(newClient, clientLE).length
  const d = finalLen - origClientRaw.length
  console.log('  AdminHomesLeadsClient.tsx: ' + origClientRaw.length + ' -> ' + finalLen + ' (' + (d >= 0 ? '+' : '') + d + ')')
}
if (!scriptDone) {
  const finalLen = withOriginalLE(newScript, scriptLE).length
  const d = finalLen - origScriptRaw.length
  console.log('  patch-w-leads-workbench-w6a-2-3.js: ' + origScriptRaw.length + ' -> ' + finalLen + ' (' + (d >= 0 ? '+' : '') + d + ')')
}

process.exit(0)