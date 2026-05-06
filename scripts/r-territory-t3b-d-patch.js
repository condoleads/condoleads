// scripts/r-territory-t3b-d-patch.js
// W-TERRITORY/T3b-D — thread p_neighbourhood_id: null through 9 callers of resolve_agent_for_context.
//
// For each target file:
//   1. Find the .rpc('resolve_agent_for_context', { ... }) call (first occurrence)
//   2. Locate its object literal (matching brace depth)
//   3. If p_neighbourhood_id already present in that object → SKIP (idempotent)
//   4. Find the p_community_id: line, capture its indentation + line ending
//   5. Insert a new line `<indent>p_neighbourhood_id: null,<line_ending>` ABOVE p_community_id
//   6. Write timestamped backup of original, write patched file
//
// Patch reasoning: T3a-02 added p_neighbourhood_id at position P3 in the new 8-arg
// signature (between p_building_id at P2 and p_community_id at P4). Existing 7-arg
// callers still work via NULL default, but neighbourhood-level routing is unreachable
// until the param is threaded. NULL through everywhere is the conservative V1 choice
// — geo pages don't yet send neighbourhood IDs (T4b will revisit when public site
// gains neighbourhood routes).
//
// Idempotent: re-running on already-patched files reports SKIP, no double-insert.
// Line endings: handles both \r\n and \n.

const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = process.cwd()
const STAMP = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)

const TARGETS = [
  'app/api/charlie/appointment/route.ts',
  'app/api/charlie/lead/route.ts',
  'app/api/walliam/assign-user-agent/route.ts',
  'app/api/walliam/charlie/session/route.ts',
  'app/api/walliam/contact/route.ts',
  'app/api/walliam/estimator/session/route.ts',
  'app/api/walliam/resolve-agent/route.ts',
  'lib/actions/leads.ts',
  'lib/utils/is-walliam.ts',
]

const RPC_PATTERN = /\.rpc\(\s*['"]resolve_agent_for_context['"]/
const COMMUNITY_FULL_PATTERN = /^([ \t]*)(p_community_id:[^\r\n]*)(\r?\n)/m
const NEIGHBOURHOOD_PRESENT = /p_neighbourhood_id\s*:/

let patched = 0, skipped = 0, failed = 0
const failedDetail = []

console.log('[T3B-D-PATCH] W-TERRITORY/T3b-D — thread p_neighbourhood_id: null through 9 callers')
console.log('[T3B-D-PATCH] STAMP=' + STAMP)
console.log('')

for (const rel of TARGETS) {
  const abs = path.join(PROJECT_ROOT, rel)

  if (!fs.existsSync(abs)) {
    console.error('[T3B-D-PATCH] MISSING:    ' + rel)
    failed++
    failedDetail.push(rel + ' — file not found')
    continue
  }

  const original = fs.readFileSync(abs, 'utf8')

  // Find the rpc call (first occurrence)
  const rpcMatch = original.match(RPC_PATTERN)
  if (!rpcMatch) {
    console.error('[T3B-D-PATCH] NO RPC:     ' + rel)
    failed++
    failedDetail.push(rel + ' — no .rpc(\'resolve_agent_for_context\'... pattern found')
    continue
  }

  // Find object literal { ... } following the rpc call
  const objStart = original.indexOf('{', rpcMatch.index)
  if (objStart === -1) {
    console.error('[T3B-D-PATCH] NO OBJ:     ' + rel)
    failed++
    failedDetail.push(rel + ' — no { after rpc call')
    continue
  }

  // Match closing brace at same depth
  let depth = 0, objEnd = -1
  for (let i = objStart; i < original.length; i++) {
    const c = original[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) { objEnd = i; break }
    }
  }
  if (objEnd === -1) {
    console.error('[T3B-D-PATCH] UNBALANCED: ' + rel)
    failed++
    failedDetail.push(rel + ' — unbalanced braces in rpc object literal')
    continue
  }

  const callBlock = original.substring(objStart, objEnd + 1)

  // Idempotency check
  if (NEIGHBOURHOOD_PRESENT.test(callBlock)) {
    console.log('[T3B-D-PATCH] SKIP:       ' + rel + '  (already has p_neighbourhood_id)')
    skipped++
    continue
  }

  // Find the p_community_id: line with its indentation + line ending
  const lineMatch = callBlock.match(COMMUNITY_FULL_PATTERN)
  if (!lineMatch) {
    console.error('[T3B-D-PATCH] NO ANCHOR:  ' + rel + '  (no p_community_id: line in rpc object)')
    failed++
    failedDetail.push(rel + ' — no p_community_id: line found in rpc object literal')
    continue
  }

  const indent = lineMatch[1]
  const lineEnding = lineMatch[3]
  const newLine = indent + 'p_neighbourhood_id: null,' + lineEnding

  // Insert the new line above the community line, preserving everything else
  const patchedCallBlock = callBlock.replace(lineMatch[0], newLine + lineMatch[0])
  const patchedFile =
    original.substring(0, objStart) +
    patchedCallBlock +
    original.substring(objEnd + 1)

  // Backup before write
  const backupPath = abs + '.backup_' + STAMP
  fs.writeFileSync(backupPath, original, 'utf8')

  // Write patched
  fs.writeFileSync(abs, patchedFile, 'utf8')

  console.log('[T3B-D-PATCH] PATCHED:    ' + rel)
  patched++
}

console.log('')
console.log('[T3B-D-PATCH] Summary: patched=' + patched + ', skipped=' + skipped + ', failed=' + failed + ', total=' + TARGETS.length)

if (failed > 0) {
  console.log('')
  console.log('[T3B-D-PATCH] Failures:')
  for (const detail of failedDetail) {
    console.log('  - ' + detail)
  }
  process.exitCode = 1
}

console.log('')
console.log('[T3B-D-PATCH] Next steps:')
console.log('  1. Run: npx tsc --noEmit  (verify TypeScript clean)')
console.log('  2. Review: git diff  (eyeball the changes)')
console.log('  3. If clean: git add + commit + push')
console.log('  4. Optional: Remove .backup_' + STAMP + ' files after confirming patch is good')