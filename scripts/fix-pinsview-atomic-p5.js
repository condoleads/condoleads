// scripts/fix-pinsview-atomic-p5.js
// Apply all PinsView nullable-actingAgentId edits atomically.
// Every edit must succeed OR the file is not written at all.
// The previous script logged success per-edit but threw before writing —
// so prior "patched" messages were misleading. This script defers ALL
// logging until after a successful write.

const fs = require('fs')
const path = require('path')

const TARGET = path.join(
  process.cwd(),
  'components',
  'admin-homes',
  'cockpit',
  'territory',
  'PinsView.tsx'
)

const original = fs.readFileSync(TARGET, 'utf8')

// Detect line endings
const usesCRLF = original.includes('\r\n')
const NL = usesCRLF ? '\r\n' : '\n'

function replaceExactlyOnce(text, oldStr, newStr, label) {
  // Count occurrences without regex (handles special chars).
  let count = 0
  let pos = 0
  while ((pos = text.indexOf(oldStr, pos)) !== -1) {
    count++
    pos += oldStr.length
  }
  if (count !== 1) {
    throw new Error(`Edit "${label}": found ${count} matches (expected 1)`)
  }
  return text.replace(oldStr, newStr)
}

let next = original
const applied = []

// ---- Edit 1: Props.actingAgentId -> nullable
const old1 = `  actingAgentId: string // the operator's own agent_id, used as assigned_by / deactivated_by`
const new1 = `  actingAgentId: string | null // the operator's own agent_id; null = not logged in as an agent`
if (next.includes(new1)) {
  applied.push('1. Props.actingAgentId already nullable (skipped)')
} else {
  next = replaceExactlyOnce(next, old1, new1, '1. Props.actingAgentId nullable')
  applied.push('1. Props.actingAgentId set to string | null')
}

// ---- Edit 2: submit button disabled-guard adds !actingAgentId
const old2 = `              disabled={pinSubmitting || !pinMlsInput.trim() || !pinAgentId}`
const new2 = `              disabled={pinSubmitting || !pinMlsInput.trim() || !pinAgentId || !actingAgentId}`
if (next.includes(new2)) {
  applied.push('2. submit button !actingAgentId already in disabled chain (skipped)')
} else {
  next = replaceExactlyOnce(next, old2, new2, '2. submit button disabled guard')
  applied.push('2. submit button disabled when !actingAgentId')
}

// ---- Edit 3: submitPin function: refuse if actingAgentId is null
// Insert AFTER `setPinFormOk(null)` (line 114) and BEFORE `if (!pinMlsInput.trim())` (line 115).
const old3 =
`    setPinFormError(null)${NL}` +
`    setPinFormOk(null)${NL}` +
`    if (!pinMlsInput.trim()) {`
const new3 =
`    setPinFormError(null)${NL}` +
`    setPinFormOk(null)${NL}` +
`    if (!actingAgentId) {${NL}` +
`      setPinFormError('You must be logged in as an agent to pin listings.')${NL}` +
`      return${NL}` +
`    }${NL}` +
`    if (!pinMlsInput.trim()) {`
if (next.includes(`if (!actingAgentId) {${NL}      setPinFormError('You must be logged in as an agent to pin listings.')`)) {
  applied.push('3. submitPin guard already present (skipped)')
} else {
  next = replaceExactlyOnce(next, old3, new3, '3. submitPin guard')
  applied.push('3. submitPin refuses when !actingAgentId')
}

// ---- Edit 4: deactivatePin guard
const old4 =
`  async function deactivatePin(pin: PinRow) {${NL}` +
`    if (!confirm(\`Unpin MLS \${pin.listing_mls_number || pin.listing_id}? This routes the listing back to the geo cascade.\`)) {`
const new4 =
`  async function deactivatePin(pin: PinRow) {${NL}` +
`    if (!actingAgentId) {${NL}` +
`      alert('You must be logged in as an agent to unpin listings.')${NL}` +
`      return${NL}` +
`    }${NL}` +
`    if (!confirm(\`Unpin MLS \${pin.listing_mls_number || pin.listing_id}? This routes the listing back to the geo cascade.\`)) {`
if (next.includes(`async function deactivatePin(pin: PinRow) {${NL}    if (!actingAgentId) {`)) {
  applied.push('4. deactivatePin guard already present (skipped)')
} else {
  next = replaceExactlyOnce(next, old4, new4, '4. deactivatePin guard')
  applied.push('4. deactivatePin refuses when !actingAgentId')
}

// ---- Edit 5: reactivatePin guard
const old5 =
`  async function reactivatePin(pin: PinRow) {${NL}` +
`    if (!confirm(\`Reactivate pin for MLS \${pin.listing_mls_number || pin.listing_id}? If another active pin exists for this listing, this will fail.\`)) {`
const new5 =
`  async function reactivatePin(pin: PinRow) {${NL}` +
`    if (!actingAgentId) {${NL}` +
`      alert('You must be logged in as an agent to reactivate pins.')${NL}` +
`      return${NL}` +
`    }${NL}` +
`    if (!confirm(\`Reactivate pin for MLS \${pin.listing_mls_number || pin.listing_id}? If another active pin exists for this listing, this will fail.\`)) {`
if (next.includes(`async function reactivatePin(pin: PinRow) {${NL}    if (!actingAgentId) {`)) {
  applied.push('5. reactivatePin guard already present (skipped)')
} else {
  next = replaceExactlyOnce(next, old5, new5, '5. reactivatePin guard')
  applied.push('5. reactivatePin refuses when !actingAgentId')
}

// All edits succeeded. NOW back up + write.
if (next === original) {
  console.log('No changes needed (all edits already applied).')
  process.exit(0)
}

const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const backup = `${TARGET}.backup_atomic_${ts}`
fs.writeFileSync(backup, original, 'utf8')
console.log('Backup written:', path.basename(backup))

fs.writeFileSync(TARGET, next, 'utf8')
console.log('Patched:', TARGET)
console.log('Edits applied:')
for (const a of applied) console.log('  ' + a)
console.log('')
console.log('Verify with: npx tsc --noEmit')