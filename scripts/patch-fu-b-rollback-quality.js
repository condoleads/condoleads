#!/usr/bin/env node
/**
 * patch-fu-b-rollback-quality.js
 *
 * D1=(c) rollback: removes the per-row Quality column (C1, C2, C3, C7)
 * from AdminHomesLeadsClient.tsx. Delete consolidation + bulk honesty
 * (C4, C5, C6) are KEPT. Quality lands properly in commit 2 with the
 * temperature split.
 *
 * NOT touched: scripts/patch-w-leads-workbench-w6a-2-3.js, app/api/.../route.ts
 *
 * Idempotent (exits 0 if marker already absent). Atomic backup-before-write.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const TARGET = path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx')

if (!fs.existsSync(TARGET)) { console.error('FATAL: target missing: ' + TARGET); process.exit(2) }

const origRaw = fs.readFileSync(TARGET, 'utf8')

function detectLE(content) {
  const sample = content.slice(0, 8192)
  const crlf = (sample.match(/\r\n/g) || []).length
  const bareLf = (sample.match(/(?<!\r)\n/g) || []).length
  return crlf > 0 && bareLf === 0 ? '\r\n' : '\n'
}
const LE = detectLE(origRaw)
const orig = origRaw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

const MARKER = 'W6a followup-B: Inline quality update'
if (orig.indexOf(MARKER) === -1) {
  console.log('No-op: Quality column already rolled back (marker absent).')
  process.exit(0)
}

function replaceOnce(haystack, needle, replacement, label) {
  const idx = haystack.indexOf(needle)
  if (idx === -1) throw new Error('Anchor NOT FOUND: ' + label)
  const dup = haystack.indexOf(needle, idx + needle.length)
  if (dup !== -1) throw new Error('Anchor matched TWICE: ' + label)
  return haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length)
}

let next = orig

// R1: revert C1 (headers list)
next = replaceOnce(next,
  "['Date', 'Contact', 'Source', 'Intent', 'Area', 'Agent', 'Hierarchy', 'Status', 'Quality', 'Actions']",
  "['Date', 'Contact', 'Source', 'Intent', 'Area', 'Agent', 'Hierarchy', 'Status', 'Actions']",
  'R1: revert Quality header')

// R2: revert C2 (no-results colSpan)
next = replaceOnce(next,
  '<tr><td colSpan={11} className="px-6 py-12 text-center text-gray-400">No leads found</td></tr>',
  '<tr><td colSpan={10} className="px-6 py-12 text-center text-gray-400">No leads found</td></tr>',
  'R2: revert no-results colSpan')

// R3: revert C3 (Quality <td> block)
const r3Anchor = [
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
const r3Replacement = [
  '                      </select>',
  '                    </td>',
  '                    <td className="px-4 py-3 whitespace-nowrap">',
].join('\n')
next = replaceOnce(next, r3Anchor, r3Replacement, 'R3: revert Quality <td>')

// R4: revert C7 (activity colSpan)
next = replaceOnce(next,
  '<td colSpan={11} className="px-6 py-2 bg-slate-50 border-b">',
  '<td colSpan={10} className="px-6 py-2 bg-slate-50 border-b">',
  'R4: revert activity colSpan')

const assertions = [
  ['Quality removed from headers list',
    next.indexOf("'Status', 'Quality', 'Actions'") === -1 && next.indexOf("'Status', 'Actions'") !== -1],
  ['no-results colSpan back to 10',
    next.indexOf('<td colSpan={10} className="px-6 py-12 text-center text-gray-400">No leads found</td>') !== -1],
  ['activity colSpan back to 10',
    next.indexOf('<td colSpan={10} className="px-6 py-2 bg-slate-50 border-b">') !== -1],
  ['FU-B quality marker is gone',
    next.indexOf('W6a followup-B: Inline quality update') === -1],
  ['no leftover quality <td>',
    next.indexOf('{QUALITY_VALUES.map(v => (') === -1],
  ['no leftover quality updateLeadStatus call',
    next.indexOf("updateLeadStatus(lead.id, 'quality', e.target.value)") === -1],
  // C4/C5/C6 must remain
  ['C4 sanity: per-row Delete onClick still gone',
    next.indexOf('onClick={() => deleteLead(lead.id)}') === -1],
  ['C5 sanity: deleteLead function still gone',
    next.indexOf('const deleteLead = async (leadId: string) => {') === -1],
  ['C6 sanity: bulk handler still honest (res.ok check)',
    next.indexOf('if (!res.ok) {') !== -1],
  ['C6 sanity: failures still surfaced via alert',
    next.indexOf('deletes failed:') !== -1],
  ['sanity: handleDeleteSelected still defined',
    next.indexOf('const handleDeleteSelected = async () => {') !== -1],
  ['sanity: QUALITY_VALUES constant still defined (kept for commit 2)',
    next.indexOf("const QUALITY_VALUES = ['unqualified'") !== -1],
  ['sanity: status inline select still defined',
    next.indexOf("onChange={e => updateLeadStatus(lead.id, 'status', e.target.value)}") !== -1],
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
  console.error('\nFATAL: assertions failed. NO FILE WRITTEN.')
  process.exit(1)
}

const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const ts = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' +
          pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds())

const backup = TARGET + '.backup_' + ts
fs.copyFileSync(TARGET, backup)
console.log('')
console.log('Backup: ' + path.basename(backup))

const finalContent = LE === '\r\n' ? next.replace(/\n/g, '\r\n') : next
fs.writeFileSync(TARGET, finalContent, 'utf8')

console.log('')
console.log('Byte delta: ' + origRaw.length + ' -> ' + finalContent.length + ' (' + (finalContent.length - origRaw.length) + ')')

process.exit(0)