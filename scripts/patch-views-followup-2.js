// scripts/patch-views-followup-2.js
// W-TERRITORY-MASTER P5.2c-followup-2.
// v3: forbidden list no longer includes '!actingAgentId' because the picker's
// own conditional render `{!actingAgentId && (...)}` legitimately uses it.
// We still forbid the body-value usages (assigned_by/deactivated_by) which must
// all swap to effectiveActingAgentId.

const fs = require('fs')

function patchFile(targetPath, edits, v1Required, v2Required, v2Forbidden) {
  console.log('')
  console.log('=== ' + targetPath + ' ===')
  const original = fs.readFileSync(targetPath, 'utf8')
  console.log('  bytes:', Buffer.byteLength(original, 'utf8'))

  for (let i = 0; i < original.length; i++) {
    if (original.charCodeAt(i) > 127) throw new Error('non-ASCII pre-edit at byte ' + i)
  }
  for (const m of v1Required) {
    if (!original.includes(m)) throw new Error('v1 missing: ' + m.slice(0, 80))
  }

  let next = original
  for (const [i, e] of edits.entries()) {
    const before = next
    const count = next.split(e.find).length - 1
    if (count !== e.count) {
      throw new Error('edit ' + (i + 1) + ' "' + e.label + '" expected ' + e.count + ' occurrences, got ' + count)
    }
    next = next.split(e.find).join(e.replace)
    if (next === before) throw new Error('edit ' + (i + 1) + ' "' + e.label + '" no-op')
    console.log('  edit ' + (i + 1) + ' OK: ' + e.label)
  }

  for (let i = 0; i < next.length; i++) {
    if (next.charCodeAt(i) > 127) throw new Error('non-ASCII post-edit at byte ' + i)
  }
  for (const m of v2Required) {
    if (!next.includes(m)) throw new Error('v2 marker missing: ' + m.slice(0, 80))
  }
  for (const m of v2Forbidden) {
    if (next.includes(m)) throw new Error('forbidden still present: ' + m.slice(0, 80))
  }

  // Extra sanity: count occurrences of bare !actingAgentId. Must be exactly 1
  // (the JSX picker conditional). All other guard sites should have moved to
  // !effectiveActingAgentId.
  const bareCount = next.split('!actingAgentId').length - 1
  if (bareCount !== 1) {
    throw new Error('expected exactly 1 occurrence of !actingAgentId post-edit (JSX picker condition), got ' + bareCount)
  }
  console.log('  sanity OK: !actingAgentId appears exactly once (JSX picker)')

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  fs.writeFileSync(targetPath + '.backup_' + ts, original, 'utf8')
  fs.writeFileSync(targetPath, next, 'utf8')
  console.log('  wrote (bytes: ' + Buffer.byteLength(next, 'utf8') + ')')
}

const NL = '\r\n'

const pinsEdits = [
  {
    label: 'PV: import ActAsAgentPicker',
    count: 1,
    find: "import { useEffect, useMemo, useState } from 'react'",
    replace: "import { useEffect, useMemo, useState } from 'react'" + NL +
             "import ActAsAgentPicker from '@/components/admin-homes/cockpit/territory/ActAsAgentPicker'",
  },
  {
    label: 'PV: add actAsAgentId state + derived after resolvedListingId',
    count: 1,
    find: 'const [resolvedListingId, setResolvedListingId] = useState<string | null>(null)',
    replace: 'const [resolvedListingId, setResolvedListingId] = useState<string | null>(null)' + NL +
             '  // P5.2c-followup-2: platform admin act-as-agent picker' + NL +
             "  const [actAsAgentId, setActAsAgentId] = useState('')" + NL +
             '  const effectiveActingAgentId: string | null = actingAgentId || actAsAgentId || null',
  },
  {
    label: 'PV: rename all !actingAgentId to !effectiveActingAgentId',
    count: 4,
    find: '!actingAgentId',
    replace: '!effectiveActingAgentId',
  },
  {
    label: 'PV: assigned_by body refs (2 sites)',
    count: 2,
    find: 'assigned_by: actingAgentId',
    replace: 'assigned_by: effectiveActingAgentId',
  },
  {
    label: 'PV: deactivated_by body ref',
    count: 1,
    find: 'deactivated_by: actingAgentId',
    replace: 'deactivated_by: effectiveActingAgentId',
  },
]

const PINS_PATH = 'components/admin-homes/cockpit/territory/PinsView.tsx'
const pinsContent = fs.readFileSync(PINS_PATH, 'utf8')
const pinsReturnMatch = pinsContent.match(/return\s*\(\s*\r?\n\s*<div className="[^"]*"[^>]*>/)
if (!pinsReturnMatch) throw new Error('PinsView: cannot locate return wrapper')
const pinsReturnAnchor = pinsReturnMatch[0]

pinsEdits.push({
  label: 'PV: inject ActAsAgentPicker JSX after return wrapper',
  count: 1,
  find: pinsReturnAnchor,
  replace: pinsReturnAnchor + NL +
           '      {!actingAgentId && (' + NL +
           '        <ActAsAgentPicker tenantId={tenantId} value={actAsAgentId} onChange={setActAsAgentId} />' + NL +
           '      )}',
})

patchFile(
  PINS_PATH,
  pinsEdits,
  [
    "import { useEffect, useMemo, useState } from 'react'",
    'const [resolvedListingId, setResolvedListingId] = useState<string | null>(null)',
    '!actingAgentId',
    'assigned_by: actingAgentId',
    'deactivated_by: actingAgentId',
  ],
  [
    "import ActAsAgentPicker from '@/components/admin-homes/cockpit/territory/ActAsAgentPicker'",
    "const [actAsAgentId, setActAsAgentId] = useState('')",
    'const effectiveActingAgentId: string | null = actingAgentId || actAsAgentId || null',
    '!effectiveActingAgentId',
    'assigned_by: effectiveActingAgentId',
    'deactivated_by: effectiveActingAgentId',
    '<ActAsAgentPicker tenantId={tenantId} value={actAsAgentId} onChange={setActAsAgentId} />',
  ],
  [
    'assigned_by: actingAgentId',
    'deactivated_by: actingAgentId',
  ]
)

// =============== BuildingsView ===============

const bvEdits = [
  {
    label: 'BV: import ActAsAgentPicker',
    count: 1,
    find: "import { useEffect, useMemo, useState } from 'react'",
    replace: "import { useEffect, useMemo, useState } from 'react'" + NL +
             "import ActAsAgentPicker from '@/components/admin-homes/cockpit/territory/ActAsAgentPicker'",
  },
  {
    label: 'BV: add actAsAgentId state + derived after deactivatingId',
    count: 1,
    find: "const [deactivatingId, setDeactivatingId] = useState<string | null>(null)",
    replace: "const [deactivatingId, setDeactivatingId] = useState<string | null>(null)" + NL +
             '  // P5.2c-followup-2: platform admin act-as-agent picker' + NL +
             "  const [actAsAgentId, setActAsAgentId] = useState('')" + NL +
             '  const effectiveActingAgentId: string | null = actingAgentId || actAsAgentId || null',
  },
  {
    label: 'BV: rename all !actingAgentId to !effectiveActingAgentId',
    count: 3,
    find: '!actingAgentId',
    replace: '!effectiveActingAgentId',
  },
  {
    label: 'BV: assigned_by body ref',
    count: 1,
    find: 'assigned_by: actingAgentId',
    replace: 'assigned_by: effectiveActingAgentId',
  },
  {
    label: 'BV: deactivated_by body ref',
    count: 1,
    find: 'deactivated_by: actingAgentId',
    replace: 'deactivated_by: effectiveActingAgentId',
  },
]

const BV_PATH = 'components/admin-homes/cockpit/territory/BuildingsView.tsx'
const bvContent = fs.readFileSync(BV_PATH, 'utf8')
const bvReturnMatch = bvContent.match(/return\s*\(\s*\r?\n\s*<div className="[^"]*"[^>]*>/)
if (!bvReturnMatch) throw new Error('BuildingsView: cannot locate return wrapper')
const bvReturnAnchor = bvReturnMatch[0]

bvEdits.push({
  label: 'BV: inject ActAsAgentPicker JSX after return wrapper',
  count: 1,
  find: bvReturnAnchor,
  replace: bvReturnAnchor + NL +
           '      {!actingAgentId && (' + NL +
           '        <ActAsAgentPicker tenantId={tenantId} value={actAsAgentId} onChange={setActAsAgentId} />' + NL +
           '      )}',
})

patchFile(
  BV_PATH,
  bvEdits,
  [
    "import { useEffect, useMemo, useState } from 'react'",
    "const [deactivatingId, setDeactivatingId] = useState<string | null>(null)",
    '!actingAgentId',
    'assigned_by: actingAgentId',
    'deactivated_by: actingAgentId',
  ],
  [
    "import ActAsAgentPicker from '@/components/admin-homes/cockpit/territory/ActAsAgentPicker'",
    "const [actAsAgentId, setActAsAgentId] = useState('')",
    'const effectiveActingAgentId: string | null = actingAgentId || actAsAgentId || null',
    '!effectiveActingAgentId',
    'assigned_by: effectiveActingAgentId',
    'deactivated_by: effectiveActingAgentId',
    '<ActAsAgentPicker tenantId={tenantId} value={actAsAgentId} onChange={setActAsAgentId} />',
  ],
  [
    'assigned_by: actingAgentId',
    'deactivated_by: actingAgentId',
  ]
)

console.log('')
console.log('=== PATCH COMPLETE ===')