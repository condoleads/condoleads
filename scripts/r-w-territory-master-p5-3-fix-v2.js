#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * W-TERRITORY-MASTER P5.3 fix script v2.
 *
 * Supersedes scripts/r-w-territory-master-p5-3-fix.js which had two bugs:
 *   - Fix 1 used raw `->` inside JSX, which is invalid JSX syntax (TS1382).
 *     This fix uses JSX-safe `{'->'}` instead.
 *   - Fix 2 used hand-written anchors that didn't match the smoke file on
 *     disk. This fix locates B6/B7 regions by ASCII-only landmark substrings
 *     read from the file, then replaces by string slicing (no hand-written
 *     Unicode-containing anchors).
 *
 * Pre-state assumption: the previous fix's Fix 1 mutated GeographyView.tsx
 * (replaced U+2192 with raw `->`, leaving a broken JSX file). A timestamped
 * backup `GeographyView.tsx.backup_20260527_114528` was created BEFORE that
 * write. This script first restores from that backup, then applies the
 * correct JSX-safe fix.
 *
 * Discipline:
 *   - Restore-before-rewrite: explicit revert from backup at the start.
 *   - All anchors are ASCII-only landmark substrings, located dynamically
 *     in file content, not pre-baked literals containing Unicode.
 *   - Post-write ASCII purity gate on view file.
 *   - Post-write JSX-validity sanity (no raw `->` outside string literals).
 *
 * Invocation:
 *   node scripts/r-w-territory-master-p5-3-fix-v2.js
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
  if (needle.length === 0) return 0
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

function assertAscii(label, content) {
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) > 127) {
      throw new Error('ASCII violation in ' + label + ' at index ' + i + ' (charCode=' + content.charCodeAt(i) + ')')
    }
  }
}

const tsStr = ts()
console.log('=== W-TERRITORY-MASTER P5.3 fix v2 ===')
console.log('Timestamp: ' + tsStr)
console.log('')

// ============================================================
// FIX 1: revert GeographyView.tsx from previous backup, then re-apply
//        with JSX-safe `{'->'}` instead of raw `->`.
// ============================================================

const VIEW_PATH = path.join(
  process.cwd(),
  'components',
  'admin-homes',
  'cockpit',
  'territory',
  'GeographyView.tsx'
)

console.log('--- Fix 1: GeographyView.tsx (revert + JSX-safe re-fix) ---')

const PREV_BACKUP = VIEW_PATH + '.backup_20260527_114528'
if (!fs.existsSync(PREV_BACKUP)) {
  throw new Error(
    'Previous backup not found: ' + PREV_BACKUP +
    '. Cannot safely revert. Inspect manually before proceeding.'
  )
}

// 1a — backup the current (broken) state before reverting, in case we need it
const brokenBackup = backupFile(VIEW_PATH, tsStr + '_broken_jsx')
console.log('  pre-revert broken state backed up: ' + brokenBackup)

// 1b — restore from the previous backup (pre-Fix-1 state, which still has U+2192)
const preFix1Content = fs.readFileSync(PREV_BACKUP, 'utf8')
fs.writeFileSync(VIEW_PATH, preFix1Content, 'utf8')
console.log('  restored from ' + PREV_BACKUP)
console.log('  restored bytes: ' + preFix1Content.length)

// 1c — verify the restore: U+2192 must be present (1 occurrence)
const ARROW = String.fromCharCode(0x2192)
const restored = fs.readFileSync(VIEW_PATH, 'utf8')
const arrowCount = countOccurrences(restored, ARROW)
if (arrowCount !== 1) {
  throw new Error('Post-revert U+2192 count expected 1, got ' + arrowCount + '. Revert failed.')
}
console.log('  verified: U+2192 count = 1 (matches pre-Fix-1 state)')

// 1d — apply the JSX-safe fix this time
// Anchor: find the U+2192 + surrounding context. We know from probe-p5-3-smoke-failures.js
// that the arrow sits in JSX at:
//   "              " + ARROW + " {childLevel ? LEVEL_LABEL[childLevel].toLowerCase() : \"(no children)\"} "
//
// The fix: replace the bare ARROW with JSX expression {'->'}. Note that the surrounding
// JSX context is a JSX text node, so {'->'} is the canonical escape.
const FIX1_OLD = '              ' + ARROW + " {childLevel ? LEVEL_LABEL[childLevel].toLowerCase() : \"(no children)\"} "
const FIX1_NEW = "              {'->'} {childLevel ? LEVEL_LABEL[childLevel].toLowerCase() : \"(no children)\"} "

assertAscii('FIX1_NEW', FIX1_NEW)

const fix1Occ = countOccurrences(restored, FIX1_OLD)
if (fix1Occ !== 1) {
  throw new Error('Fix1 anchor uniqueness: expected 1, got ' + fix1Occ)
}

const viewFixed = restored.replace(FIX1_OLD, FIX1_NEW)
if (viewFixed === restored) throw new Error('Fix1 replace produced no change')

// Post-write ASCII purity check
let viewFixedNonAscii = 0
for (let i = 0; i < viewFixed.length; i++) {
  if (viewFixed.charCodeAt(i) > 127) viewFixedNonAscii++
}
if (viewFixedNonAscii !== 0) {
  throw new Error('Post-fix view still has ' + viewFixedNonAscii + ' non-ASCII chars')
}

// Sanity: confirm {'->'} appears in the view
if (countOccurrences(viewFixed, "{'->'}") !== 1) {
  throw new Error("Expected exactly 1 occurrence of {'->'} after fix")
}

fs.writeFileSync(VIEW_PATH, viewFixed, 'utf8')
console.log('  wrote (bytes: ' + viewFixed.length + ')')
console.log("  view now uses JSX-safe {'->'} and is fully ASCII")
console.log('')

// ============================================================
// FIX 2: smoke B6/B7 prediction update via region-slicing.
//
// Strategy: find B6 region by its UNIQUE ASCII landmark `const phantomRes`
// (this variable name appears only once in the file). Splice from the
// preceding comment block start (`  // B6:`) through the end of the
// `check(...)` call. Similarly for B7 via `const phantomSampleRes`.
// ============================================================

const SMOKE_PATH = path.join(process.cwd(), 'scripts', 'r-w-territory-master-p5-3-smoke.js')

console.log('--- Fix 2: smoke B6/B7 (region-slice update) ---')
if (!fs.existsSync(SMOKE_PATH)) {
  throw new Error('Smoke file not found: ' + SMOKE_PATH)
}

const smokeOriginal = fs.readFileSync(SMOKE_PATH, 'utf8')
console.log('  pre-state bytes: ' + smokeOriginal.length)

// ---- 2a: locate B6 region by ASCII landmarks ----
// Landmark 1: line containing `const phantomRes = await c.query(`
// Landmark 2 (end): the closing of the `check(...)` call for "King Shah community phantoms still in DB"
// We slice from the line BEFORE `const phantomRes` that starts with `  // B6:` through the
// next blank line.

const B6_LANDMARK = '  const phantomRes = await c.query('
const b6LandmarkIdx = smokeOriginal.indexOf(B6_LANDMARK)
if (b6LandmarkIdx === -1) {
  throw new Error('B6 landmark not found: ' + JSON.stringify(B6_LANDMARK))
}
if (countOccurrences(smokeOriginal, B6_LANDMARK) !== 1) {
  throw new Error('B6 landmark not unique')
}

// Walk backward from landmark to find the start of the comment block (first line
// starting with `  // B6:`). Use newline boundaries.
let b6Start = b6LandmarkIdx
// Move to start of the landmark line
while (b6Start > 0 && smokeOriginal[b6Start - 1] !== '\n') b6Start--
// Now walk backward over comment lines until we find a non-comment line.
// Comment lines start with `  //`.
let probe = b6Start
while (probe > 0) {
  // find start of previous line
  let prevLineEnd = probe - 1
  if (prevLineEnd < 0) break
  let prevLineStart = prevLineEnd
  while (prevLineStart > 0 && smokeOriginal[prevLineStart - 1] !== '\n') prevLineStart--
  const prevLine = smokeOriginal.slice(prevLineStart, prevLineEnd)
  if (prevLine.trim().startsWith('//')) {
    probe = prevLineStart
    b6Start = prevLineStart
  } else {
    break
  }
}

// Walk forward from landmark to find the end of the `check(...)` call.
// The B6 block ends after the closing `  )` of the check call, on its own line.
// Find the end by: locate the `check(` call AFTER B6_LANDMARK, then find its matching `)`.
const checkAfterB6 = smokeOriginal.indexOf('  check(', b6LandmarkIdx)
if (checkAfterB6 === -1) throw new Error('B6 check( not found after landmark')

// Find end of the check call: parenthesis-balance scan
let parenDepth = 0
let b6CheckEnd = -1
let inString = false
let stringChar = ''
let inTemplate = false
for (let i = checkAfterB6; i < smokeOriginal.length; i++) {
  const ch = smokeOriginal[i]
  const prev = i > 0 ? smokeOriginal[i - 1] : ''
  if (inString) {
    if (ch === stringChar && prev !== '\\') inString = false
    continue
  }
  if (inTemplate) {
    if (ch === '`' && prev !== '\\') inTemplate = false
    continue
  }
  if (ch === "'" || ch === '"') { inString = true; stringChar = ch; continue }
  if (ch === '`') { inTemplate = true; continue }
  if (ch === '(') parenDepth++
  else if (ch === ')') {
    parenDepth--
    if (parenDepth === 0) {
      b6CheckEnd = i + 1
      break
    }
  }
}
if (b6CheckEnd === -1) throw new Error('B6 check( closing not found')

// Advance to end of line (consume the \n after the close paren)
let b6End = b6CheckEnd
while (b6End < smokeOriginal.length && smokeOriginal[b6End] !== '\n') b6End++
if (b6End < smokeOriginal.length) b6End++ // include the newline

console.log('  B6 region located: bytes ' + b6Start + ' to ' + b6End + ' (' + (b6End - b6Start) + ' bytes)')

// ---- 2b: locate B7 region by ASCII landmarks ----
// B7 follows B6 immediately (separated by blank line). Find `const phantomSampleRes`.
const B7_LANDMARK = 'const phantomSampleRes = await c.query('
const b7LandmarkIdx = smokeOriginal.indexOf(B7_LANDMARK)
if (b7LandmarkIdx === -1) throw new Error('B7 landmark not found')
if (countOccurrences(smokeOriginal, B7_LANDMARK) !== 1) throw new Error('B7 landmark not unique')

// Walk backward to start of B7 comment block
let b7Start = b7LandmarkIdx
while (b7Start > 0 && smokeOriginal[b7Start - 1] !== '\n') b7Start--
// Now back up to find the comment block start, AND back up over the `if (phantomRes...` guard line
// because the B7 block is inside that if-guard. We want to replace from the comment block
// through the closing brace of the if block.
let probe7 = b7Start
while (probe7 > 0) {
  let prevLineEnd = probe7 - 1
  if (prevLineEnd < 0) break
  let prevLineStart = prevLineEnd
  while (prevLineStart > 0 && smokeOriginal[prevLineStart - 1] !== '\n') prevLineStart--
  const prevLine = smokeOriginal.slice(prevLineStart, prevLineEnd)
  if (prevLine.trim().startsWith('//')) {
    probe7 = prevLineStart
    b7Start = prevLineStart
  } else if (prevLine.trim().startsWith('if (phantomRes')) {
    // The if-guard wraps the B7 block. Start here.
    probe7 = prevLineStart
    b7Start = prevLineStart
    // Now back up over the comment block above the if
    while (probe7 > 0) {
      let pLE = probe7 - 1
      if (pLE < 0) break
      let pLS = pLE
      while (pLS > 0 && smokeOriginal[pLS - 1] !== '\n') pLS--
      const pLine = smokeOriginal.slice(pLS, pLE)
      if (pLine.trim().startsWith('//')) {
        probe7 = pLS
        b7Start = pLS
      } else {
        break
      }
    }
    break
  } else {
    break
  }
}

// Find end of B7: matching `}` of the outer `if (phantomRes.rows[0].n > 0) {`
// Start from b7Start, find the `{` of the if, then balance braces.
const ifBraceStart = smokeOriginal.indexOf('{', b7Start)
if (ifBraceStart === -1) throw new Error('B7 if-block opening brace not found')

let braceDepth = 0
let b7BraceEnd = -1
inString = false
stringChar = ''
inTemplate = false
for (let i = ifBraceStart; i < smokeOriginal.length; i++) {
  const ch = smokeOriginal[i]
  const prev = i > 0 ? smokeOriginal[i - 1] : ''
  if (inString) {
    if (ch === stringChar && prev !== '\\') inString = false
    continue
  }
  if (inTemplate) {
    if (ch === '`' && prev !== '\\') inTemplate = false
    continue
  }
  if (ch === "'" || ch === '"') { inString = true; stringChar = ch; continue }
  if (ch === '`') { inTemplate = true; continue }
  if (ch === '{') braceDepth++
  else if (ch === '}') {
    braceDepth--
    if (braceDepth === 0) {
      b7BraceEnd = i + 1
      break
    }
  }
}
if (b7BraceEnd === -1) throw new Error('B7 if-block closing brace not found')

let b7End = b7BraceEnd
while (b7End < smokeOriginal.length && smokeOriginal[b7End] !== '\n') b7End++
if (b7End < smokeOriginal.length) b7End++

console.log('  B7 region located: bytes ' + b7Start + ' to ' + b7End + ' (' + (b7End - b7Start) + ' bytes)')

// Sanity: B7 must come after B6
if (b7Start < b6End) {
  throw new Error('B7 region overlaps B6 region; abort')
}

// ---- 2c: construct replacement content (ASCII only) ----
const NEW_B6 =
  "  // B6: King Shah community-level primary cards in Whitby. Probe 2026-05-27\n" +
  "  //     confirmed 11 rows, all is_primary=true is_active=true condo=true homes=true\n" +
  "  //     bldg=false. (W-COCKPIT v14 documented these as phantoms with both flags\n" +
  "  //     false; documentation drift, not data drift -- created_at on all 11 rows is\n" +
  "  //     2026-05-06, predating the v14 doc. Logged as F-WCOCKPIT-V14-PHANTOM-DRIFT.)\n" +
  "  //     P5.3 behavior: route's condo+homes walkers MATCH these rows at own-scope\n" +
  "  //     because condo_access=true AND homes_access=true; King Shah wins at\n" +
  "  //     source_tier='community', cascade does NOT walk up to Whitby muni.\n" +
  "  const kingCommRes = await c.query(\n" +
  "    `SELECT COUNT(*)::int AS n\n" +
  "     FROM agent_property_access\n" +
  "     WHERE tenant_id = $1::uuid\n" +
  "       AND scope = 'community'\n" +
  "       AND is_primary = true\n" +
  "       AND is_active = true\n" +
  "       AND agent_id = $2::uuid\n" +
  "       AND condo_access = true\n" +
  "       AND homes_access = true`,\n" +
  "    [WALLIAM_TENANT_ID, KING_SHAH_AGENT_ID]\n" +
  "  )\n" +
  "  check(\n" +
  "    'King Shah holds 11 community-level primary cards in WALLiam (functional)',\n" +
  "    kingCommRes.rows[0].n === 11,\n" +
  "    'count=' + kingCommRes.rows[0].n\n" +
  "  )\n"

const NEW_B7 =
  "  // B7: Verify the route's condo lookup at a King Shah community card returns\n" +
  "  //     King Shah's agent_id at own-scope (NOT cascaded to muni). This is the\n" +
  "  //     property-type-filtered path that protects against the\n" +
  "  //     F-RESOLVE-GEO-PRIMARY-NO-PROPERTY-TYPE gap.\n" +
  "  if (kingCommRes.rows[0].n > 0) {\n" +
  "    const sampleRes = await c.query(\n" +
  "      `SELECT community_id FROM agent_property_access\n" +
  "       WHERE tenant_id = $1::uuid\n" +
  "         AND scope = 'community'\n" +
  "         AND is_primary = true\n" +
  "         AND is_active = true\n" +
  "         AND agent_id = $2::uuid\n" +
  "         AND condo_access = true\n" +
  "         AND homes_access = true\n" +
  "       LIMIT 1`,\n" +
  "      [WALLIAM_TENANT_ID, KING_SHAH_AGENT_ID]\n" +
  "    )\n" +
  "    const sampleCommunityId = sampleRes.rows[0]?.community_id\n" +
  "    if (sampleCommunityId) {\n" +
  "      const condoHitRes = await c.query(\n" +
  "        `SELECT agent_id FROM agent_property_access\n" +
  "         WHERE tenant_id = $1::uuid\n" +
  "           AND scope = 'community'\n" +
  "           AND community_id = $2::uuid\n" +
  "           AND is_primary = true\n" +
  "           AND is_active = true\n" +
  "           AND condo_access = true\n" +
  "         LIMIT 1`,\n" +
  "        [WALLIAM_TENANT_ID, sampleCommunityId]\n" +
  "      )\n" +
  "      check(\n" +
  "        'route condo lookup hits King Shah at own-scope community',\n" +
  "        condoHitRes.rows.length === 1 && condoHitRes.rows[0].agent_id === KING_SHAH_AGENT_ID,\n" +
  "        'rowCount=' + condoHitRes.rows.length + ' agent_id=' + condoHitRes.rows[0]?.agent_id\n" +
  "      )\n" +
  "      const communityMuniRes = await c.query(\n" +
  "        'SELECT municipality_id FROM communities WHERE id = $1::uuid LIMIT 1',\n" +
  "        [sampleCommunityId]\n" +
  "      )\n" +
  "      const parentMuniId = communityMuniRes.rows[0]?.municipality_id\n" +
  "      check(\n" +
  "        'sample community parent muni is Whitby (cascade target if King loses card)',\n" +
  "        parentMuniId === WHITBY_MUNI_ID,\n" +
  "        'parentMuniId=' + parentMuniId\n" +
  "      )\n" +
  "    }\n" +
  "  }\n"

assertAscii('NEW_B6', NEW_B6)
assertAscii('NEW_B7', NEW_B7)

// ---- 2d: splice ----
// Splice in reverse order (B7 first, then B6) so b6's offsets stay valid.
const before6 = smokeOriginal.slice(0, b6Start)
const between6and7 = smokeOriginal.slice(b6End, b7Start)
const after7 = smokeOriginal.slice(b7End)

const smokeFixed = before6 + NEW_B6 + between6and7 + NEW_B7 + after7

// ASCII purity gate on full smoke file
let smokeNonAscii = 0
for (let i = 0; i < smokeFixed.length; i++) {
  if (smokeFixed.charCodeAt(i) > 127) smokeNonAscii++
}
console.log('  post-fix smoke non-ASCII chars: ' + smokeNonAscii + ' (informational; original file had em-dashes in other comments)')

// Sanity checks on the new content
if (smokeFixed.indexOf('const kingCommRes = await c.query(') === -1) {
  throw new Error('Smoke fix sanity: kingCommRes not present')
}
if (smokeFixed.indexOf('King Shah holds 11 community-level primary cards') === -1) {
  throw new Error('Smoke fix sanity: new B6 check message not present')
}
if (smokeFixed.indexOf('route condo lookup hits King Shah at own-scope community') === -1) {
  throw new Error('Smoke fix sanity: new B7 check message not present')
}
// Old assertions must be gone
if (smokeFixed.indexOf('King Shah community phantoms still in DB') !== -1) {
  throw new Error('Smoke fix sanity: old B6 check message still present')
}
if (smokeFixed.indexOf('route condo lookup correctly skips phantom community') !== -1) {
  throw new Error('Smoke fix sanity: old B7 check message still present')
}

const backupS = backupFile(SMOKE_PATH, tsStr)
console.log('  backup: ' + backupS)

fs.writeFileSync(SMOKE_PATH, smokeFixed, 'utf8')
console.log('  wrote (bytes: ' + smokeFixed.length + ')')
console.log('')

console.log('=== FIX v2 COMPLETE ===')
console.log('Next:')
console.log('  1. npx tsc --noEmit  (must be clean)')
console.log('  2. node scripts/r-w-territory-master-p5-3-smoke.js  (expect 51/51 PASS)')