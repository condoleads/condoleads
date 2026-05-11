#!/usr/bin/env node
/**
 * probe-smoke-t3c-tier7-fixture.js
 *
 * Read-only. Locates the tier 7 fixture "pre-existing lead" INSERT in
 * scripts/smoke-t3c.js and prints surrounding context so the next-turn
 * patch can use a precise anchor.
 *
 * No writes. No mutations. No side effects.
 */

const fs = require('fs')
const path = require('path')

const TARGET = path.resolve(process.cwd(), 'scripts/smoke-t3c.js')

if (!fs.existsSync(TARGET)) {
  console.error('FAIL: scripts/smoke-t3c.js not found at ' + TARGET)
  process.exit(1)
}

const raw = fs.readFileSync(TARGET, 'utf8')
const usesCRLF = /\r\n/.test(raw)
const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw
const lines = content.split('\n')

console.log('File: scripts/smoke-t3c.js')
console.log('Line endings: ' + (usesCRLF ? 'CRLF' : 'LF'))
console.log('Total lines: ' + lines.length)
console.log('')

// ----------------------------------------------------------------------------
// Pass 1: locate "Tier 7" section boundary
// ----------------------------------------------------------------------------

const tier7Lines = []
const tier8Lines = []
for (let i = 0; i < lines.length; i++) {
  const L = lines[i]
  if (/Tier 7/.test(L) || /tier7/i.test(L) || /tier 7/i.test(L)) tier7Lines.push(i + 1)
  if (/Tier 8/.test(L) || /tier8/i.test(L) || /tier 8/i.test(L)) tier8Lines.push(i + 1)
}
console.log('=== Pass 1: Tier 7 / Tier 8 markers ===')
console.log('Tier 7 markers at lines: ' + (tier7Lines.length ? tier7Lines.join(', ') : '(none)'))
console.log('Tier 8 markers at lines: ' + (tier8Lines.length ? tier8Lines.join(', ') : '(none)'))
console.log('')

// ----------------------------------------------------------------------------
// Pass 2: scan for every "from('leads').insert" or ".insert" near "leads"
// ----------------------------------------------------------------------------

console.log('=== Pass 2: every leads INSERT in the file ===')
const insertHits = []
for (let i = 0; i < lines.length; i++) {
  const L = lines[i]
  if (/\.from\(\s*['"`]leads['"`]\s*\)/.test(L) || /from\(['"`]leads['"`]\)\s*\.insert/.test(L)) {
    insertHits.push(i + 1)
  }
}
if (insertHits.length === 0) {
  // Fallback: search for any insert that mentions 'walliam_estimator_vip_request'
  console.log('(no direct from("leads") hits — falling back to source-string scan)')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('walliam_estimator_vip_request')) insertHits.push(i + 1)
  }
}
console.log('Candidate fixture insert lines: ' + (insertHits.length ? insertHits.join(', ') : '(none)'))
console.log('')

// ----------------------------------------------------------------------------
// Pass 3: dump 30 lines of context around the tier-7-adjacent inserts
// ----------------------------------------------------------------------------

const tier7Start = tier7Lines.length > 0 ? tier7Lines[tier7Lines.length - 1] : null
const tier8Start = tier8Lines.length > 0 ? tier8Lines[0] : null

const tier7Inserts = insertHits.filter(n =>
  (tier7Start === null || n >= tier7Start - 5) &&
  (tier8Start === null || n < tier8Start)
)

console.log('=== Pass 3: context dump around tier-7-region inserts ===')
console.log('Tier 7 region: lines ' + (tier7Start || '?') + ' .. ' + ((tier8Start || lines.length) - 1))
console.log('Inserts in that region: ' + (tier7Inserts.length ? tier7Inserts.join(', ') : '(none)'))
console.log('')

if (tier7Inserts.length === 0) {
  console.log('No tier-7-region inserts. Dumping context around EVERY insert hit instead:')
  for (const n of insertHits) dump(n)
} else {
  for (const n of tier7Inserts) dump(n)
}

function dump(centerLine1Based) {
  const center = centerLine1Based - 1
  const from = Math.max(0, center - 5)
  const to = Math.min(lines.length, center + 30)
  console.log('')
  console.log('--- lines ' + (from + 1) + '..' + to + ' (centered on ' + centerLine1Based + ') ---')
  for (let i = from; i < to; i++) {
    const marker = (i + 1 === centerLine1Based) ? '>' : ' '
    console.log(marker + ' ' + String(i + 1).padStart(4, ' ') + ': ' + lines[i])
  }
}

console.log('')
console.log('=== END PROBE ===')
console.log('Paste the entire output back. Next turn delivers the precise patch.')