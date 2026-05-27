#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * W-TERRITORY-MASTER P5.3 fix script.
 *
 * Two fixes in one atomic run:
 *
 * Fix 1 — ASCII purity violation in GeographyView.tsx (PRE-EXISTING).
 *   Line 452 col 15: U+2192 (right-arrow) in CarveUpModal header.
 *   Replace single U+2192 char with ASCII '->'.
 *   This is a 1-char surgical patch with timestamped backup.
 *
 * Fix 2 — Smoke prediction stale in scripts/r-w-territory-master-p5-3-smoke.js.
 *   Phase B's prediction (King Shah Whitby community phantoms with both flags
 *   FALSE) reflected W-COCKPIT v14 documentation. Probe `probe-p5-3-smoke-failures.js`
 *   confirmed real production state: 11 rows, all condo=true homes=true, all
 *   is_primary=true is_active=true. Documentation drifted, not code.
 *   Update B6/B7 to assert the ACTUAL behavior:
 *     - B6: 11 King Shah community PRIMARY cards exist (functional, not phantom)
 *           with condo=true AND homes=true.
 *     - B7: At one of those communities, the route's condo walker correctly
 *           resolves to King Shah at source_tier='community' (own-scope hit,
 *           cascade does NOT walk up to Whitby muni Neo Smith).
 *
 * Discipline:
 *   - Timestamped backups before write.
 *   - Anchor uniqueness gate per edit.
 *   - ASCII purity gate on new content.
 *   - Post-write ASCII purity gate on entire view file (must be 0 non-ASCII).
 *
 * Invocation:
 *   node scripts/r-w-territory-master-p5-3-fix.js
 *
 * Run TSC + smoke after.
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

function assertAscii(label, content) {
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i)
    if (code > 127) {
      throw new Error('ASCII violation in ' + label + ' at index ' + i + ' (charCode=' + code + ')')
    }
  }
}

function applyEdit(label, content, oldStr, newStr) {
  const occ = countOccurrences(content, oldStr)
  if (occ !== 1) {
    throw new Error(
      'Anchor uniqueness violation in ' +
        label +
        ': expected 1 occurrence, found ' +
        occ
    )
  }
  assertAscii(label + ' (new_str)', newStr)
  return content.replace(oldStr, newStr)
}

function backupFile(filePath, tsStr) {
  const backupPath = filePath + '.backup_' + tsStr
  fs.copyFileSync(filePath, backupPath)
  return backupPath
}

const tsStr = ts()
console.log('=== W-TERRITORY-MASTER P5.3 fix ===')
console.log('Timestamp: ' + tsStr)
console.log('')

// ============================================================
// FIX 1: U+2192 -> '->' in GeographyView.tsx
// ============================================================

const VIEW_PATH = path.join(
  process.cwd(),
  'components',
  'admin-homes',
  'cockpit',
  'territory',
  'GeographyView.tsx'
)

console.log('--- Fix 1: GeographyView.tsx ASCII purity ---')
if (!fs.existsSync(VIEW_PATH)) {
  throw new Error('View file not found: ' + VIEW_PATH)
}
const viewOriginal = fs.readFileSync(VIEW_PATH, 'utf8')
console.log('  pre-state bytes: ' + viewOriginal.length)

// Probe confirmed exactly 1 occurrence of U+2192 (right-arrow) in the file.
const ARROW = String.fromCharCode(0x2192) // U+2192 RIGHTWARDS ARROW

const arrowCount = countOccurrences(viewOriginal, ARROW)
console.log('  U+2192 occurrences pre-patch: ' + arrowCount)
if (arrowCount === 0) {
  console.log('  SKIP: no U+2192 in file (already fixed)')
} else if (arrowCount > 1) {
  throw new Error(
    'Expected exactly 1 U+2192 in view; found ' + arrowCount + '. ' +
      'Run scripts/probe-p5-3-smoke-failures.js to locate each occurrence.'
  )
} else {
  // Anchor with surrounding context (verified by probe: line 452 col 15,
  // CarveUpModal child-level label). Anchor on the full line content fragment
  // so we cannot accidentally match elsewhere.
  const V_OLD =
    '              ' + ARROW + " {childLevel ? LEVEL_LABEL[childLevel].toLowerCase() : \"(no children)\"} \n"
  const V_NEW =
    "              -> {childLevel ? LEVEL_LABEL[childLevel].toLowerCase() : \"(no children)\"} \n"

  // Confirm anchor uniqueness
  const occ = countOccurrences(viewOriginal, V_OLD)
  if (occ !== 1) {
    throw new Error(
      'Anchor uniqueness failed for U+2192 fix: expected 1, got ' + occ + '. ' +
        'Probe re-run needed.'
    )
  }

  const backupV = backupFile(VIEW_PATH, tsStr)
  console.log('  backup: ' + backupV)

  const viewNext = applyEdit('view ASCII fix', viewOriginal, V_OLD, V_NEW)

  // Post-write: assert zero non-ASCII anywhere in the file
  let nonAsciiCount = 0
  for (let i = 0; i < viewNext.length; i++) {
    if (viewNext.charCodeAt(i) > 127) nonAsciiCount++
  }
  if (nonAsciiCount !== 0) {
    throw new Error('Post-write ASCII purity violation: ' + nonAsciiCount + ' non-ASCII chars remain')
  }

  fs.writeFileSync(VIEW_PATH, viewNext, 'utf8')
  console.log('  wrote (bytes: ' + viewNext.length + ')')
  console.log('  view is now fully ASCII')
}
console.log('')

// ============================================================
// FIX 2: Update smoke B6/B7 predictions to match real production state
// ============================================================

const SMOKE_PATH = path.join(process.cwd(), 'scripts', 'r-w-territory-master-p5-3-smoke.js')

console.log('--- Fix 2: smoke B6/B7 prediction update ---')
if (!fs.existsSync(SMOKE_PATH)) {
  throw new Error('Smoke file not found: ' + SMOKE_PATH)
}
const smokeOriginal = fs.readFileSync(SMOKE_PATH, 'utf8')
console.log('  pre-state bytes: ' + smokeOriginal.length)

// Replace the B6 block. Anchored on the comment header through the check call,
// since the comment is unique and the predicate is unique.
const S_OLD_B6 =
  "  // B6: Whitby community phantoms — recon documented 11 King Shah rows with\n" +
  "  //     condo_access=false AND homes_access=false. The route's condo+homes\n" +
  "  //     walker correctly SKIPS these because of the property-flag filter.\n" +
  "  //     Then walks up to Whitby muni and finds Neo Smith.\n" +
  "  const phantomRes = await c.query(\n" +
  "    `SELECT COUNT(*)::int AS n\n" +
  "     FROM agent_property_access\n" +
  "     WHERE tenant_id = $1::uuid\n" +
  "       AND scope = 'community'\n" +
  "       AND is_primary = true\n" +
  "       AND is_active = true\n" +
  "       AND agent_id = $2::uuid\n" +
  "       AND condo_access = false\n" +
  "       AND homes_access = false`,\n" +
  "    [WALLIAM_TENANT_ID, KING_SHAH_AGENT_ID]\n" +
  "  )\n" +
  "  check(\n" +
  "    'King Shah community phantoms still in DB (P5.3 does not delete them)',\n" +
  "    phantomRes.rows[0].n > 0,\n" +
  "    'count=' + phantomRes.rows[0].n\n" +
  "  )\n"

const S_NEW_B6 =
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

// Replace the B7 block. Anchored on the unique "if (phantomRes.rows[0].n > 0)"
// guard and the block that follows. The new block has matching logic but
// anchors on kingCommRes and asserts own-scope hit (not own-scope skip).
const S_OLD_B7 =
  "  // B7: Verify the route's condo lookup at a King Shah phantom community\n" +
  "  //     correctly skips the phantom (returns 0 rows) because of condo_access=true filter\n" +
  "  if (phantomRes.rows[0].n > 0) {\n" +
  "    const phantomSampleRes = await c.query(\n" +
  "      `SELECT community_id FROM agent_property_access\n" +
  "       WHERE tenant_id = $1::uuid\n" +
  "         AND scope = 'community'\n" +
  "         AND is_primary = true\n" +
  "         AND is_active = true\n" +
  "         AND agent_id = $2::uuid\n" +
  "         AND condo_access = false\n" +
  "         AND homes_access = false\n" +
  "       LIMIT 1`,\n" +
  "      [WALLIAM_TENANT_ID, KING_SHAH_AGENT_ID]\n" +
  "    )\n" +
  "    const phantomCommunityId = phantomSampleRes.rows[0]?.community_id\n" +
  "    if (phantomCommunityId) {\n" +
  "      // Route's lookupPrimary with propertyCol='condo_access' on this community\n" +
  "      const condoSkipRes = await c.query(\n" +
  "        `SELECT agent_id FROM agent_property_access\n" +
  "         WHERE tenant_id = $1::uuid\n" +
  "           AND scope = 'community'\n" +
  "           AND community_id = $2::uuid\n" +
  "           AND is_primary = true\n" +
  "           AND is_active = true\n" +
  "           AND condo_access = true\n" +
  "         LIMIT 1`,\n" +
  "        [WALLIAM_TENANT_ID, phantomCommunityId]\n" +
  "      )\n" +
  "      check(\n" +
  "        'route condo lookup correctly skips phantom community (own-scope returns 0)',\n" +
  "        condoSkipRes.rows.length === 0,\n" +
  "        'phantomCommunityId=' + phantomCommunityId\n" +
  "      )\n" +
  "      // Then route walks up: community.municipality_id -> Whitby muni -> Neo Smith\n" +
  "      const communityMuniRes = await c.query(\n" +
  "        'SELECT municipality_id FROM communities WHERE id = $1::uuid LIMIT 1',\n" +
  "        [phantomCommunityId]\n" +
  "      )\n" +
  "      const parentMuniId = communityMuniRes.rows[0]?.municipality_id\n" +
  "      check(\n" +
  "        'phantom community parent muni is Whitby (route ancestor walk lands here)',\n" +
  "        parentMuniId === WHITBY_MUNI_ID,\n" +
  "        'parentMuniId=' + parentMuniId\n" +
  "      )\n" +
  "    }\n" +
  "  }\n"

const S_NEW_B7 =
  "  // B7: Verify the route's condo lookup at a King Shah community card returns\n" +
  "  //     King Shah's agent_id at own-scope (NOT skipped, NOT cascaded to muni).\n" +
  "  //     This is the property-type-filtered path that protects against the\n" +
  "  //     F-RESOLVE-GEO-PRIMARY-NO-PROPERTY-TYPE gap: if any of these 11 rows had\n" +
  "  //     asymmetric flags in the future, the route would correctly route them\n" +
  "  //     per-property-type while the RPC chain would still mis-route. Today,\n" +
  "  //     symmetric flags = same behavior either way.\n" +
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
  "      // Route's lookupPrimary at own-scope with condo_access=true filter\n" +
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
  "      // Cascade check: route would NOT walk to Whitby muni for this community\n" +
  "      // because own-scope already won. We still verify the parent FK is intact\n" +
  "      // so that IF King Shah ever loses this card, cascade lands at Whitby muni.\n" +
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

const backupS = backupFile(SMOKE_PATH, tsStr)
console.log('  backup: ' + backupS)

let smokeNext = smokeOriginal
smokeNext = applyEdit('smoke B6', smokeNext, S_OLD_B6, S_NEW_B6)
console.log('  edit B6 OK: King Shah community functional cards (not phantoms)')
smokeNext = applyEdit('smoke B7', smokeNext, S_OLD_B7, S_NEW_B7)
console.log('  edit B7 OK: route own-scope hit prediction')

// Post-write: ASCII purity on smoke file
let smokeNonAscii = 0
for (let i = 0; i < smokeNext.length; i++) {
  if (smokeNext.charCodeAt(i) > 127) smokeNonAscii++
}
if (smokeNonAscii !== 0) {
  throw new Error('Smoke file ASCII violation post-write: ' + smokeNonAscii + ' non-ASCII chars')
}

fs.writeFileSync(SMOKE_PATH, smokeNext, 'utf8')
console.log('  wrote (bytes: ' + smokeNext.length + ')')
console.log('')

console.log('=== FIX COMPLETE ===')
console.log('Next steps:')
console.log('  1. npx tsc --noEmit')
console.log('  2. node scripts/r-w-territory-master-p5-3-smoke.js  (expect 51/51 PASS)')
console.log('  3. local browser smoke as King Shah tenant admin')
console.log('  4. tracker patch to v10 (P5.3 CLOSED + F-WCOCKPIT-V14-PHANTOM-DRIFT logged)')
console.log('  5. atomic commit + push')