#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * W-TERRITORY-MASTER P5.3 fix v3 — smoke B6/B7 ONLY.
 *
 * v2 fixed GeographyView (committed to disk) but its brace-balance scan for
 * B7 region detection failed on a string/template edge case. This v3 uses a
 * simpler "landmark-to-landmark" slice:
 *
 *   - B6 starts at the line `  // B6:` (find by ASCII content)
 *   - B7 ends at the line `  console.log('')` that immediately precedes
 *     Phase B's closing `console.log('')` block (the boundary between B7
 *     and Phase C is `console.log('')` then `}` end of phaseB function).
 *
 * Actually even simpler: locate the start of the next ASCII-only landmark
 * AFTER both blocks — `console.log('')` at the end of phaseB. Replace
 * everything between B6's start and that next landmark.
 *
 * Strategy: split-by-line, find marker line indices, splice.
 *
 * Pre-state: GeographyView already fixed by v2. Smoke file unchanged from
 * pre-v2 state (v2 errored before writing it).
 *
 * Invocation:
 *   node scripts/r-w-territory-master-p5-3-fix-v3.js
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

function backupFile(filePath, tsStr) {
  const backupPath = filePath + '.backup_' + tsStr
  fs.copyFileSync(filePath, backupPath)
  return backupPath
}

const tsStr = ts()
console.log('=== W-TERRITORY-MASTER P5.3 fix v3 (smoke only) ===')
console.log('Timestamp: ' + tsStr)
console.log('')

const SMOKE_PATH = path.join(process.cwd(), 'scripts', 'r-w-territory-master-p5-3-smoke.js')
if (!fs.existsSync(SMOKE_PATH)) throw new Error('Smoke file not found: ' + SMOKE_PATH)

const original = fs.readFileSync(SMOKE_PATH, 'utf8')
console.log('  pre-state bytes: ' + original.length)

const lines = original.split('\n') // keep \n boundaries simple — file is unix LF per probe

// Find B6 start: first line whose trimmed content starts with `// B6:`
let b6StartLine = -1
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim().startsWith('// B6:')) {
    b6StartLine = i
    break
  }
}
if (b6StartLine === -1) throw new Error('Could not locate `// B6:` line in smoke file')
console.log('  B6 starts at line ' + (b6StartLine + 1) + ': ' + JSON.stringify(lines[b6StartLine].slice(0, 80)))

// Find the END of B7: the FIRST occurrence of `===== PHASE C` after B6
// (the Phase C banner is the console.log statement immediately after Phase B).
let phaseCLine = -1
for (let i = b6StartLine + 1; i < lines.length; i++) {
  if (lines[i].includes('===== PHASE C:')) {
    phaseCLine = i
    break
  }
}
if (phaseCLine === -1) throw new Error('Could not locate PHASE C banner after B6')
console.log('  PHASE C banner at line ' + (phaseCLine + 1) + ': ' + JSON.stringify(lines[phaseCLine].slice(0, 80)))

// Phase C banner line is `  console.log('===== PHASE C: cross-tenant safety smoke =====')`.
// B6 + B7 occupies the lines from b6StartLine up to (but not including) phaseCLine.
// We must preserve the blank line(s) that separate B7's end from Phase C's banner.
// Walk backward from phaseCLine: skip blank lines and the `console.log('')` that
// concludes B7's section to find the actual END of B7 content.
let b7EndLine = phaseCLine - 1
// Skip empty lines and `  console.log('')` lines walking backward
while (b7EndLine > b6StartLine) {
  const t = lines[b7EndLine].trim()
  if (t === '' || t === "console.log('')" || t === 'console.log("")') {
    b7EndLine--
  } else {
    break
  }
}
// b7EndLine now points to the LAST line of B7 content. Include it in slice.
const replaceFromLine = b6StartLine
const replaceToLine = b7EndLine + 1 // exclusive end
console.log('  splice range: lines ' + (replaceFromLine + 1) + ' to ' + replaceToLine + ' (inclusive count: ' + (replaceToLine - replaceFromLine) + ')')

// New B6 + B7 content, ASCII-only.
const NEW_BLOCK = [
  "  // B6: King Shah community-level primary cards in Whitby. Probe 2026-05-27",
  "  //     confirmed 11 rows, all is_primary=true is_active=true condo=true homes=true",
  "  //     bldg=false. (W-COCKPIT v14 documented these as phantoms with both flags",
  "  //     false; documentation drift, not data drift -- created_at on all 11 rows is",
  "  //     2026-05-06, predating the v14 doc. Logged as F-WCOCKPIT-V14-PHANTOM-DRIFT.)",
  "  //     P5.3 behavior: route's condo+homes walkers MATCH these rows at own-scope",
  "  //     because condo_access=true AND homes_access=true; King Shah wins at",
  "  //     source_tier='community', cascade does NOT walk up to Whitby muni.",
  "  const kingCommRes = await c.query(",
  "    `SELECT COUNT(*)::int AS n",
  "     FROM agent_property_access",
  "     WHERE tenant_id = $1::uuid",
  "       AND scope = 'community'",
  "       AND is_primary = true",
  "       AND is_active = true",
  "       AND agent_id = $2::uuid",
  "       AND condo_access = true",
  "       AND homes_access = true`,",
  "    [WALLIAM_TENANT_ID, KING_SHAH_AGENT_ID]",
  "  )",
  "  check(",
  "    'King Shah holds 11 community-level primary cards in WALLiam (functional)',",
  "    kingCommRes.rows[0].n === 11,",
  "    'count=' + kingCommRes.rows[0].n",
  "  )",
  "",
  "  // B7: Verify the route's condo lookup at a King Shah community card returns",
  "  //     King Shah's agent_id at own-scope (NOT cascaded to muni). This is the",
  "  //     property-type-filtered path that protects against the",
  "  //     F-RESOLVE-GEO-PRIMARY-NO-PROPERTY-TYPE gap.",
  "  if (kingCommRes.rows[0].n > 0) {",
  "    const sampleRes = await c.query(",
  "      `SELECT community_id FROM agent_property_access",
  "       WHERE tenant_id = $1::uuid",
  "         AND scope = 'community'",
  "         AND is_primary = true",
  "         AND is_active = true",
  "         AND agent_id = $2::uuid",
  "         AND condo_access = true",
  "         AND homes_access = true",
  "       LIMIT 1`,",
  "      [WALLIAM_TENANT_ID, KING_SHAH_AGENT_ID]",
  "    )",
  "    const sampleCommunityId = sampleRes.rows[0]?.community_id",
  "    if (sampleCommunityId) {",
  "      const condoHitRes = await c.query(",
  "        `SELECT agent_id FROM agent_property_access",
  "         WHERE tenant_id = $1::uuid",
  "           AND scope = 'community'",
  "           AND community_id = $2::uuid",
  "           AND is_primary = true",
  "           AND is_active = true",
  "           AND condo_access = true",
  "         LIMIT 1`,",
  "        [WALLIAM_TENANT_ID, sampleCommunityId]",
  "      )",
  "      check(",
  "        'route condo lookup hits King Shah at own-scope community',",
  "        condoHitRes.rows.length === 1 && condoHitRes.rows[0].agent_id === KING_SHAH_AGENT_ID,",
  "        'rowCount=' + condoHitRes.rows.length + ' agent_id=' + condoHitRes.rows[0]?.agent_id",
  "      )",
  "      const communityMuniRes = await c.query(",
  "        'SELECT municipality_id FROM communities WHERE id = $1::uuid LIMIT 1',",
  "        [sampleCommunityId]",
  "      )",
  "      const parentMuniId = communityMuniRes.rows[0]?.municipality_id",
  "      check(",
  "        'sample community parent muni is Whitby (cascade target if King loses card)',",
  "        parentMuniId === WHITBY_MUNI_ID,",
  "        'parentMuniId=' + parentMuniId",
  "      )",
  "    }",
  "  }",
]

// Pre-write: assert ASCII purity on the new block content
for (const line of NEW_BLOCK) {
  for (let i = 0; i < line.length; i++) {
    if (line.charCodeAt(i) > 127) {
      throw new Error('NEW_BLOCK contains non-ASCII char at line: ' + JSON.stringify(line))
    }
  }
}

// Splice the lines array
const newLines = [
  ...lines.slice(0, replaceFromLine),
  ...NEW_BLOCK,
  ...lines.slice(replaceToLine),
]
const fixed = newLines.join('\n')

// Sanity checks on the result
if (fixed.indexOf('const kingCommRes = await c.query(') === -1) {
  throw new Error('Sanity: kingCommRes not in result')
}
if (fixed.indexOf('King Shah holds 11 community-level primary cards in WALLiam (functional)') === -1) {
  throw new Error('Sanity: new B6 check message not in result')
}
if (fixed.indexOf('route condo lookup hits King Shah at own-scope community') === -1) {
  throw new Error('Sanity: new B7 check message not in result')
}
if (fixed.indexOf('King Shah community phantoms still in DB') !== -1) {
  throw new Error('Sanity: OLD B6 check message still in result')
}
if (fixed.indexOf('route condo lookup correctly skips phantom community') !== -1) {
  throw new Error('Sanity: OLD B7 check message still in result')
}
if (fixed.indexOf('const phantomRes = await c.query(') !== -1) {
  throw new Error('Sanity: old phantomRes query still present')
}
if (fixed.indexOf('const phantomSampleRes') !== -1) {
  throw new Error('Sanity: old phantomSampleRes query still present')
}

// Verify Phase C still intact
if (fixed.indexOf('===== PHASE C: cross-tenant safety smoke =====') === -1) {
  throw new Error('Sanity: PHASE C banner lost in splice')
}
if (fixed.indexOf('async function phaseC(c)') === -1) {
  throw new Error('Sanity: phaseC function lost in splice')
}

const backupS = backupFile(SMOKE_PATH, tsStr)
console.log('  backup: ' + backupS)

fs.writeFileSync(SMOKE_PATH, fixed, 'utf8')
console.log('  wrote (bytes: ' + fixed.length + ')')
console.log('')
console.log('=== FIX v3 COMPLETE ===')
console.log('Next:')
console.log('  node scripts/r-w-territory-master-p5-3-smoke.js  (expect 51/51 PASS)')