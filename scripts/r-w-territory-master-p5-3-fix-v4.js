#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * W-TERRITORY-MASTER P5.3 fix v4 — MINIMAL smoke surgery.
 *
 * The previous three fix attempts all over-engineered this. The actual change
 * needed in the smoke file is tiny:
 *   - Flip B6's predicate: condo_access = false -> condo_access = true
 *   - Flip B6's predicate: homes_access = false -> homes_access = true
 *   - Update B6's check message: "phantoms still in DB" -> "11 functional cards"
 *   - Update B7 likewise (the `phantomSampleRes` query)
 *
 * No region detection. No brace balancing. Just targeted substring swaps.
 *
 * Each swap has a uniqueness gate. CRLF-agnostic because we anchor on short
 * fragments that don't span newlines.
 *
 * Invocation:
 *   node scripts/r-w-territory-master-p5-3-fix-v4.js
 */

const fs = require('fs')
const path = require('path')

function ts() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  )
}

function countOccurrences(haystack, needle) {
  let count = 0
  let pos = 0
  while (true) {
    const idx = haystack.indexOf(needle, pos)
    if (idx === -1) return count
    count++
    pos = idx + needle.length
  }
}

function backupFile(filePath, tsStr) {
  const backupPath = filePath + '.backup_' + tsStr
  fs.copyFileSync(filePath, backupPath)
  return backupPath
}

function swap(content, oldStr, newStr, label) {
  const occ = countOccurrences(content, oldStr)
  if (occ !== 1) {
    throw new Error(label + ': expected 1 occurrence of ' + JSON.stringify(oldStr.slice(0, 50)) + ', got ' + occ)
  }
  return content.replace(oldStr, newStr)
}

const SMOKE_PATH = path.join(process.cwd(), 'scripts', 'r-w-territory-master-p5-3-smoke.js')
if (!fs.existsSync(SMOKE_PATH)) throw new Error('Smoke file not found')

const tsStr = ts()
console.log('=== P5.3 fix v4 (minimal smoke surgery) ===')

const original = fs.readFileSync(SMOKE_PATH, 'utf8')
console.log('  pre-state bytes: ' + original.length)

// Detect line-ending style. The smoke file was written by various tools across
// sessions; v3's probe showed it has CRLF. Build anchors accordingly.
const hasCRLF = original.indexOf('\r\n') !== -1
const NL = hasCRLF ? '\r\n' : '\n'
console.log('  line ending: ' + (hasCRLF ? 'CRLF' : 'LF'))

// The actual swaps. Each is a unique short fragment so CRLF doesn't matter
// (the anchors don't span line boundaries).

let next = original

// Swap 1: B6 condo_access = false -> condo_access = true
//   This fragment appears TWICE in original B6+B7 blocks (once each). We need
//   to be more specific. Anchor on enough context to disambiguate.
//   B6 has: `       AND agent_id = $2::uuid\n      ...AND condo_access = false`
//   B7 has the same pattern. Both need flipping.
//
//   Approach: do them as a pair using larger anchors.

// Swap 1a: B6 predicate block (4 lines of predicates)
next = swap(
  next,
  '       AND agent_id = $2::uuid' + NL +
  '       AND condo_access = false' + NL +
  '       AND homes_access = false`,' + NL +
  '    [WALLIAM_TENANT_ID, KING_SHAH_AGENT_ID]' + NL +
  '  )' + NL +
  '  check(' + NL +
  '    \'King Shah community phantoms still in DB (P5.3 does not delete them)\',',
  '       AND agent_id = $2::uuid' + NL +
  '       AND condo_access = true' + NL +
  '       AND homes_access = true`,' + NL +
  '    [WALLIAM_TENANT_ID, KING_SHAH_AGENT_ID]' + NL +
  '  )' + NL +
  '  check(' + NL +
  '    \'King Shah holds 11 community-level primary cards in WALLiam (functional)\',',
  'Swap 1 (B6 predicates + check message)'
)
console.log('  Swap 1 OK: B6 predicates flipped + check message updated')

// Swap 2: B6 predicate assertion (n > 0 -> n === 11)
next = swap(
  next,
  '    phantomRes.rows[0].n > 0,' + NL +
  '    \'count=\' + phantomRes.rows[0].n',
  '    phantomRes.rows[0].n === 11,' + NL +
  '    \'count=\' + phantomRes.rows[0].n',
  'Swap 2 (B6 assertion)'
)
console.log('  Swap 2 OK: B6 assertion changed to === 11')

// Swap 3: B7 phantomSampleRes predicate block
next = swap(
  next,
  '         AND agent_id = $2::uuid' + NL +
  '         AND condo_access = false' + NL +
  '         AND homes_access = false' + NL +
  '       LIMIT 1`,',
  '         AND agent_id = $2::uuid' + NL +
  '         AND condo_access = true' + NL +
  '         AND homes_access = true' + NL +
  '       LIMIT 1`,',
  'Swap 3 (B7 phantomSampleRes predicates)'
)
console.log('  Swap 3 OK: B7 phantomSampleRes predicates flipped')

// Swap 4: B7 check message + assertion
next = swap(
  next,
  '      check(' + NL +
  '        \'route condo lookup correctly skips phantom community (own-scope returns 0)\',' + NL +
  '        condoSkipRes.rows.length === 0,' + NL +
  '        \'phantomCommunityId=\' + phantomCommunityId' + NL +
  '      )',
  '      check(' + NL +
  '        \'route condo lookup hits King Shah at own-scope community\',' + NL +
  '        condoSkipRes.rows.length === 1 && condoSkipRes.rows[0].agent_id === KING_SHAH_AGENT_ID,' + NL +
  '        \'rowCount=\' + condoSkipRes.rows.length + \' agent_id=\' + condoSkipRes.rows[0]?.agent_id' + NL +
  '      )',
  'Swap 4 (B7 condoSkipRes check)'
)
console.log('  Swap 4 OK: B7 condo lookup check now asserts own-scope hit')

// Swap 5: B7 parent muni check message (cosmetic)
next = swap(
  next,
  '      check(' + NL +
  '        \'phantom community parent muni is Whitby (route ancestor walk lands here)\',' + NL +
  '        parentMuniId === WHITBY_MUNI_ID,' + NL +
  '        \'parentMuniId=\' + parentMuniId' + NL +
  '      )',
  '      check(' + NL +
  '        \'sample community parent muni is Whitby (cascade target if King loses card)\',' + NL +
  '        parentMuniId === WHITBY_MUNI_ID,' + NL +
  '        \'parentMuniId=\' + parentMuniId' + NL +
  '      )',
  'Swap 5 (B7 parent muni message)'
)
console.log('  Swap 5 OK: B7 parent muni message updated (assertion unchanged)')

// Sanity checks
if (next.indexOf('still in DB') !== -1) throw new Error('Sanity: old "still in DB" text remains')
if (next.indexOf('skips phantom community') !== -1) throw new Error('Sanity: old "skips phantom" text remains')
if (next.indexOf('condo_access = false') !== -1) throw new Error('Sanity: old "condo_access = false" predicate remains')
if (next.indexOf('homes_access = false') !== -1) throw new Error('Sanity: old "homes_access = false" predicate remains')
if (next.indexOf('11 community-level primary cards') === -1) throw new Error('Sanity: new B6 message missing')
if (next.indexOf('hits King Shah at own-scope community') === -1) throw new Error('Sanity: new B7 message missing')
if (next.indexOf('=== 11') === -1) throw new Error('Sanity: new === 11 assertion missing')

// Ensure structural code is intact
if (next.indexOf('async function phaseC') === -1) throw new Error('Sanity: phaseC function lost')
if (next.indexOf('===== PHASE C') === -1) throw new Error('Sanity: PHASE C banner lost')
if (next.indexOf('async function phaseB') === -1) throw new Error('Sanity: phaseB function lost')

const backupS = backupFile(SMOKE_PATH, tsStr)
console.log('  backup: ' + backupS)

fs.writeFileSync(SMOKE_PATH, next, 'utf8')
console.log('  wrote (bytes: ' + next.length + ')')
console.log('')
console.log('=== FIX v4 COMPLETE ===')
console.log('Run: node scripts/r-w-territory-master-p5-3-smoke.js (expect 51/51 PASS)')