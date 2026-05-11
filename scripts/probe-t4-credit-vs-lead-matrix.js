#!/usr/bin/env node
/**
 * probe-t4-credit-vs-lead-matrix.js
 *
 * W-LEADS-EMAIL T4: re-verify OD-1=(c) "Credits unrelated to leads" holds
 * post-T2/T3 work.
 *
 * Read-only. No file modifications. No DB connections.
 *
 * Two matrices:
 *
 *   [A] CREDIT-IN-LEAD-SURFACE check
 *       For each of the 9 known lead-touching surfaces, grep for credit-related
 *       references (`credit` keyword, RPC counter names, override-table name).
 *       Expected: zero hits in all 9 files.
 *
 *   [B] LEAD-INSERT-OUTSIDE-KNOWN-SET check
 *       For every route.ts under app/api/** and every .ts under lib/actions/,
 *       grep for lead-INSERT / lead-UPSERT patterns. Expected: hits ONLY in
 *       the 8 known lead-WRITER surfaces (the 9th, vip-approve, GETs/UPDATEs
 *       vip_requests but does NOT insert leads).
 *
 * If A is clean AND B's hit set equals the expected 8 → OD-1=(c) HOLDS.
 * Otherwise the script prints offenders and exits non-zero.
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

// ============================================================================
// Expected surface lists (from T0-A recon + T3b/T3c ship records)
// ============================================================================

// All 9 surfaces that touch leads in any way (INSERT, UPSERT, GET, or UPDATE).
const NINE_SURFACES = [
  // T3b wired (4 LEAD_WRITER + EMAIL):
  'app/api/walliam/contact/route.ts',
  'app/api/walliam/charlie/vip-request/route.ts',
  'app/api/charlie/plan-email/route.ts',
  'lib/actions/leads.ts',
  // T3c wired (4 EMAIL_ONLY, of which 3 also write leads):
  'app/api/charlie/appointment/route.ts',
  'app/api/charlie/lead/route.ts',
  'app/api/walliam/estimator/vip-questionnaire/route.ts',
  'app/api/walliam/estimator/vip-request/route.ts',
  // T3c verify-skip (1 EMAIL_ONLY, no lead INSERT — GETs/UPDATEs vip_requests only):
  'app/api/walliam/estimator/vip-approve/route.ts',
]

// 8 of the 9 are lead WRITERS (insert/upsert leads). vip-approve does not.
const EIGHT_WRITERS = NINE_SURFACES.filter(
  (p) => !p.endsWith('vip-approve/route.ts')
)

// ============================================================================
// Patterns
// ============================================================================

// CREDIT patterns — broad on purpose. Any hit in a lead surface is suspicious.
// Each pattern includes a label for the report.
const CREDIT_PATTERNS = [
  { label: 'credit-word', re: /\bcredit/i },
  { label: 'increment_chat_session_counter', re: /increment_chat_session_counter/i },
  { label: 'decrement_chat_session_counter', re: /decrement_chat_session_counter/i },
  { label: 'user_credit_overrides', re: /user_credit_overrides/i },
  { label: 'deduct_credits', re: /deduct_credits/i },
  { label: 'consume_credit', re: /consume_credit/i },
  { label: 'tenant.credits', re: /\.credits\b/i },
]

// LEAD-INSERT patterns — detect any code path that writes a row to `leads`.
const LEAD_INSERT_PATTERNS = [
  { label: ".from('leads').insert", re: /from\(\s*['"]leads['"]\s*\)\s*\.\s*insert/i },
  { label: ".from('leads').upsert", re: /from\(\s*['"]leads['"]\s*\)\s*\.\s*upsert/i },
  { label: 'INSERT INTO leads (raw SQL)', re: /INSERT\s+INTO\s+leads\b/i },
]

// ============================================================================
// File walkers
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
      if (full.endsWith('.ts') || full.endsWith('.tsx')) {
        results.push(full)
      }
    }
  }
  return results
}

function scanFile(absPath, patterns) {
  const text = fs.readFileSync(absPath, 'utf8')
  const lines = text.split('\n')
  const hits = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const p of patterns) {
      if (p.re.test(line)) {
        hits.push({
          lineNumber: i + 1,
          pattern: p.label,
          snippet: line.length > 160 ? line.slice(0, 160) + '...' : line,
        })
      }
    }
  }
  return hits
}

function rel(absPath) {
  return path.relative(ROOT, absPath).replace(/\\/g, '/')
}

// ============================================================================
// Matrix A — credit references in lead-touching surfaces
// ============================================================================

console.log('=== T4 PROBE: Credit-vs-Lead matrix ===\n')
console.log('[A] Credit references in 9 lead-touching surfaces:\n')

let matrixA_clean = true
const A_offenders = []

for (const surface of NINE_SURFACES) {
  const abs = path.resolve(ROOT, surface)
  if (!fs.existsSync(abs)) {
    console.log(`  MISSING: ${surface}`)
    matrixA_clean = false
    A_offenders.push({ surface, reason: 'file not found' })
    continue
  }
  const hits = scanFile(abs, CREDIT_PATTERNS)
  if (hits.length === 0) {
    console.log(`  ${surface}: 0 hits`)
  } else {
    console.log(`  ${surface}: ${hits.length} HIT(S)`)
    for (const h of hits) {
      console.log(`    L${h.lineNumber} [${h.pattern}]: ${h.snippet}`)
    }
    matrixA_clean = false
    A_offenders.push({ surface, hits })
  }
}

console.log('')
if (matrixA_clean) {
  console.log('  -> A CLEAN: zero credit references in any of the 9 lead-touching surfaces.')
} else {
  console.log(`  -> A NEEDS REVIEW: ${A_offenders.length} surface(s) have credit references (see above).`)
}

// ============================================================================
// Matrix B — lead-INSERT calls outside the known 8 writers
// ============================================================================

console.log('\n[B] Lead-INSERT / lead-UPSERT pattern scan across app/api/ + lib/actions/:\n')

const candidates = []
walkDir(path.resolve(ROOT, 'app/api'), candidates)
walkDir(path.resolve(ROOT, 'lib/actions'), candidates)

const writerHits = new Map() // relPath -> [hits]

for (const abs of candidates) {
  const hits = scanFile(abs, LEAD_INSERT_PATTERNS)
  if (hits.length > 0) {
    writerHits.set(rel(abs), hits)
  }
}

console.log(`  Scanned ${candidates.length} .ts/.tsx files under app/api/ + lib/actions/`)
console.log(`  Found ${writerHits.size} file(s) with lead-INSERT/UPSERT patterns:\n`)

const detectedSet = new Set(writerHits.keys())
const expectedSet = new Set(EIGHT_WRITERS)

for (const [file, hits] of writerHits.entries()) {
  const tag = expectedSet.has(file) ? 'EXPECTED' : 'UNEXPECTED'
  console.log(`  [${tag}] ${file} (${hits.length} hit(s))`)
  for (const h of hits) {
    console.log(`    L${h.lineNumber} [${h.pattern}]: ${h.snippet}`)
  }
}

console.log('')

const unexpected = [...detectedSet].filter((f) => !expectedSet.has(f))
const missing = [...expectedSet].filter((f) => !detectedSet.has(f))

let matrixB_clean = true
if (unexpected.length > 0) {
  console.log(`  -> B UNEXPECTED WRITERS (${unexpected.length}): new lead-INSERT site introduced since T0-A recon:`)
  for (const f of unexpected) console.log(`     - ${f}`)
  matrixB_clean = false
}
if (missing.length > 0) {
  console.log(`  -> B MISSING WRITERS (${missing.length}): expected lead writer no longer inserts leads:`)
  for (const f of missing) console.log(`     - ${f}`)
  matrixB_clean = false
}
if (matrixB_clean) {
  console.log(`  -> B CLEAN: detected lead-writer set matches expected 8 exactly.`)
}

// ============================================================================
// Verdict
// ============================================================================

console.log('\n=== VERDICT ===')
if (matrixA_clean && matrixB_clean) {
  console.log('OD-1=(c) HOLDS post-T2/T3.')
  console.log('  - Zero credit references in 9 lead-touching surfaces (A clean)')
  console.log('  - 8 known lead writers detected, none new, none missing (B clean)')
  console.log('')
  console.log('Ready for T4 close: tracker v9 -> v10 with OD-1=(c) FINAL anchor.')
  process.exit(0)
} else {
  console.log('OD-1=(c) NEEDS REVIEW.')
  if (!matrixA_clean) console.log(`  - Matrix A: ${A_offenders.length} surface(s) with credit references`)
  if (!matrixB_clean) {
    if (unexpected.length > 0) console.log(`  - Matrix B: ${unexpected.length} unexpected lead writer(s)`)
    if (missing.length > 0) console.log(`  - Matrix B: ${missing.length} missing expected writer(s)`)
  }
  console.log('')
  console.log('T4 close is BLOCKED until the offenders above are explained or fixed.')
  process.exit(2)
}