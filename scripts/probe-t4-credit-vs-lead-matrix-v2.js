#!/usr/bin/env node
/**
 * probe-t4-credit-vs-lead-matrix-v2.js
 *
 * W-LEADS-EMAIL T4 probe v2 — fixes two defects in v1:
 *   - v1 scanned line-by-line, missing multi-line `.from('leads').insert` chains
 *   - v1 flagged any credit-word occurrence regardless of distance from any
 *     actual lead INSERT, producing false positives
 *
 * v2 strategy:
 *   - Whole-file regex (multi-line) for lead-write detection — catches
 *     chained patterns where `from('leads')` and `.insert/.upsert/.update`
 *     span lines.
 *   - For each credit reference, compute MIN-LINE-DISTANCE to the nearest
 *     lead-write in the same file. Classify:
 *       PROXIMITY-CONCERN  → credit ref within 25 lines of a lead write
 *                            (possible gating; needs manual review)
 *       DISTANT            → credit ref >25 lines from any lead write
 *                            (likely benign co-occurrence in same route)
 *       NO-LEAD-WRITE      → file has no lead writes; credit refs out of
 *                            OD-1 scope (e.g. vip-approve)
 *
 * Read-only. No file or DB mods.
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const PROXIMITY_THRESHOLD = 25 // lines

// ============================================================================
// Expected surface lists
// ============================================================================

const NINE_SURFACES = [
  'app/api/walliam/contact/route.ts',
  'app/api/walliam/charlie/vip-request/route.ts',
  'app/api/charlie/plan-email/route.ts',
  'lib/actions/leads.ts',
  'app/api/charlie/appointment/route.ts',
  'app/api/charlie/lead/route.ts',
  'app/api/walliam/estimator/vip-questionnaire/route.ts',
  'app/api/walliam/estimator/vip-request/route.ts',
  'app/api/walliam/estimator/vip-approve/route.ts',
]

const EIGHT_WRITERS = NINE_SURFACES.filter((p) => !p.endsWith('vip-approve/route.ts'))

// ============================================================================
// Whole-file regex patterns (multi-line aware via \s*)
// ============================================================================

// Lead-write patterns — `\s*` between `from('leads')` and `.method` allows
// chained multi-line patterns like:
//     await supabase
//       .from('leads')
//       .insert({...})
const LEAD_WRITE_RE = /from\s*\(\s*['"]leads['"]\s*\)\s*\.\s*(insert|upsert|update)\b/gi

// Credit patterns — same as v1, broad
const CREDIT_PATTERNS = [
  { label: 'credit-word', re: /\bcredit/gi },
  { label: 'increment_chat_session_counter', re: /increment_chat_session_counter/gi },
  { label: 'decrement_chat_session_counter', re: /decrement_chat_session_counter/gi },
  { label: 'user_credit_overrides', re: /user_credit_overrides/gi },
  { label: 'deduct_credits', re: /deduct_credits/gi },
  { label: 'consume_credit', re: /consume_credit/gi },
  { label: '.credits property', re: /\.credits\b/gi },
]

// ============================================================================
// Helpers
// ============================================================================

function walkDir(dir, results) {
  if (!fs.existsSync(dir)) return results
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.next' || ent.name === '.git') continue
      walkDir(full, results)
    } else if (ent.isFile()) {
      if (full.endsWith('.ts') || full.endsWith('.tsx')) results.push(full)
    }
  }
  return results
}

function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

function findAllWithLines(text, regex) {
  regex.lastIndex = 0
  const out = []
  let m
  while ((m = regex.exec(text)) !== null) {
    out.push({ line: lineOf(text, m.index), match: m[0], index: m.index })
    if (m.index === regex.lastIndex) regex.lastIndex++ // guard zero-length
  }
  return out
}

function snippet(text, line, ctx = 0) {
  const lines = text.split('\n')
  const start = Math.max(1, line - ctx)
  const end = Math.min(lines.length, line + ctx)
  let out = ''
  for (let i = start; i <= end; i++) {
    const trimmed = lines[i - 1].length > 140 ? lines[i - 1].slice(0, 140) + '...' : lines[i - 1]
    out += `      L${i}: ${trimmed}\n`
  }
  return out.replace(/\n$/, '')
}

function rel(absPath) {
  return path.relative(ROOT, absPath).replace(/\\/g, '/')
}

// ============================================================================
// Matrix A — credit refs in 9 surfaces, classified by proximity to lead writes
// ============================================================================

console.log('=== T4 PROBE v2: Credit-vs-Lead matrix (proximity-aware) ===\n')
console.log(`Proximity threshold: ${PROXIMITY_THRESHOLD} lines\n`)
console.log('[A] Credit references in 9 lead-touching surfaces:\n')

let A_concerns = 0
let A_distant = 0
let A_outOfScope = 0
const A_concernList = []

for (const surface of NINE_SURFACES) {
  const abs = path.resolve(ROOT, surface)
  if (!fs.existsSync(abs)) {
    console.log(`  MISSING: ${surface}\n`)
    continue
  }
  const text = fs.readFileSync(abs, 'utf8')

  const leadWrites = findAllWithLines(text, LEAD_WRITE_RE)
  const leadLines = leadWrites.map((w) => w.line)

  let creditHits = []
  for (const p of CREDIT_PATTERNS) {
    for (const h of findAllWithLines(text, p.re)) {
      creditHits.push({ line: h.line, pattern: p.label, match: h.match })
    }
  }
  // Dedupe by (line + pattern) — broad regex can hit overlapping things
  const seen = new Set()
  creditHits = creditHits.filter((h) => {
    const k = h.line + '|' + h.pattern
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  creditHits.sort((a, b) => a.line - b.line)

  if (leadWrites.length === 0) {
    if (creditHits.length === 0) {
      console.log(`  ${surface}: 0 lead writes, 0 credit refs — clean`)
    } else {
      console.log(`  ${surface}: NO-LEAD-WRITE (out of OD-1 scope), ${creditHits.length} credit ref(s) ignored`)
      A_outOfScope++
    }
    console.log('')
    continue
  }

  // File has lead writes — classify credit refs by min-distance
  let fileConcerns = 0
  let fileDistant = 0
  const concernsHere = []
  for (const ch of creditHits) {
    const minDist = Math.min(...leadLines.map((ll) => Math.abs(ll - ch.line)))
    if (minDist <= PROXIMITY_THRESHOLD) {
      fileConcerns++
      concernsHere.push({ ...ch, minDist })
    } else {
      fileDistant++
    }
  }
  A_concerns += fileConcerns
  A_distant += fileDistant

  const leadLineLabel = leadLines.length === 1 ? `L${leadLines[0]}` : 'L' + leadLines.join(',L')
  console.log(`  ${surface}:`)
  console.log(`    lead writes: ${leadWrites.length} (at ${leadLineLabel})`)
  console.log(`    credit refs: ${creditHits.length} total — ${fileConcerns} PROXIMITY-CONCERN, ${fileDistant} DISTANT`)
  if (fileConcerns > 0) {
    console.log(`    PROXIMITY-CONCERN hits (within ${PROXIMITY_THRESHOLD} lines of a lead write — needs manual review):`)
    for (const ch of concernsHere) {
      console.log(`      L${ch.line} [${ch.pattern}] (min ${ch.minDist} lines from lead write):`)
      console.log(snippet(text, ch.line, 2))
      A_concernList.push({ surface, line: ch.line, pattern: ch.pattern, minDist: ch.minDist })
    }
  }
  console.log('')
}

console.log(`  Matrix A summary: ${A_concerns} proximity-concern, ${A_distant} distant, ${A_outOfScope} surfaces out of scope`)
const A_clean = A_concerns === 0
console.log(A_clean ? '  -> A CLEAN: no credit refs co-located with any lead write.' : `  -> A NEEDS REVIEW: ${A_concerns} hit(s) within ${PROXIMITY_THRESHOLD} lines of a lead write.`)

// ============================================================================
// Matrix B — all lead writers (whole-file multi-line scan)
// ============================================================================

console.log('\n[B] Lead-INSERT/UPSERT/UPDATE pattern scan across app/api/ + lib/actions/ (whole-file regex):\n')

const candidates = []
walkDir(path.resolve(ROOT, 'app/api'), candidates)
walkDir(path.resolve(ROOT, 'lib/actions'), candidates)

const writerHits = new Map()
for (const abs of candidates) {
  const text = fs.readFileSync(abs, 'utf8')
  const matches = findAllWithLines(text, LEAD_WRITE_RE)
  if (matches.length > 0) {
    writerHits.set(rel(abs), matches)
  }
}

console.log(`  Scanned ${candidates.length} .ts/.tsx files`)
console.log(`  Found ${writerHits.size} file(s) with lead-write patterns:\n`)

const detectedSet = new Set(writerHits.keys())
const expectedSet = new Set(EIGHT_WRITERS)

for (const [file, hits] of writerHits.entries()) {
  const tag = expectedSet.has(file) ? 'EXPECTED' : 'UNEXPECTED'
  const lineList = hits.map((h) => `L${h.line} ${h.match}`).join(', ')
  console.log(`  [${tag}] ${file} — ${lineList}`)
}

console.log('')

const unexpected = [...detectedSet].filter((f) => !expectedSet.has(f))
const missing = [...expectedSet].filter((f) => !detectedSet.has(f))

let matrixB_clean = true
if (unexpected.length > 0) {
  console.log(`  -> B UNEXPECTED WRITERS (${unexpected.length}):`)
  for (const f of unexpected) console.log(`     - ${f}`)
  matrixB_clean = false
}
if (missing.length > 0) {
  console.log(`  -> B MISSING WRITERS (${missing.length}):`)
  for (const f of missing) console.log(`     - ${f}`)
  matrixB_clean = false
}
if (matrixB_clean) console.log('  -> B CLEAN: detected lead-writer set matches expected 8 exactly.')

// ============================================================================
// Verdict
// ============================================================================

console.log('\n=== VERDICT ===')
if (A_clean && matrixB_clean) {
  console.log('OD-1=(c) HOLDS post-T2/T3.')
  console.log(`  - Matrix A: ${A_concerns} proximity-concerns (none within ${PROXIMITY_THRESHOLD} lines of a lead write)`)
  console.log(`             ${A_distant} distant credit refs (plan-credit grants in unrelated blocks — benign co-occurrence)`)
  console.log(`             ${A_outOfScope} surface(s) out of OD-1 scope (no lead writes)`)
  console.log('  - Matrix B: 8 expected lead writers detected, none new, none missing')
  console.log('')
  console.log('Ready for T4 close: tracker v9 -> v10 with OD-1=(c) FINAL anchor.')
  process.exit(0)
} else {
  console.log('OD-1=(c) NEEDS REVIEW.')
  if (!A_clean) {
    console.log(`  - Matrix A: ${A_concerns} proximity-concern(s) — manual review of context above required`)
    for (const c of A_concernList) {
      console.log(`     ${c.surface} L${c.line} [${c.pattern}] @ ${c.minDist}lines from nearest lead write`)
    }
  }
  if (!matrixB_clean) {
    if (unexpected.length > 0) console.log(`  - Matrix B: ${unexpected.length} unexpected lead writer(s)`)
    if (missing.length > 0) console.log(`  - Matrix B: ${missing.length} missing expected writer(s)`)
  }
  console.log('')
  console.log('T4 close BLOCKED until offenders explained or fixed.')
  process.exit(2)
}