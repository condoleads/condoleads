#!/usr/bin/env node
/**
 * probe-t6a-plan-integration-recon.js
 *
 * W-LEADS-EMAIL T6a recon — feeds T6b LIKE-filter replacement + caller wiring.
 *
 * Output sections:
 *   [A] T2c migration content — the SQL that added `lead_origin_route` column
 *       (so we know exact type, default, constraints, and intended values).
 *   [B] vip-questionnaire LIKE filter — ±15 line context around any
 *       `.like('source', 'walliam_estimator%')` or similar pattern.
 *   [C] INSERT payload audit — for each of the 8 audit-wired lead-write routes,
 *       dump the `.from('leads').insert({...})` call with full multi-line
 *       payload so we can see whether each currently populates
 *       `lead_origin_route`, what `source` value it uses, and the geo-IDs.
 *   [D] lead_origin_route reference map — every file that mentions the column
 *       (callers, helpers, types, migrations).
 *   [E] Other `.like('source', ...)` filter sites — any source-LIKE filters
 *       elsewhere that may need the same lead_origin_route replacement.
 *   [F] Plan-integration end-to-end map — charlie/plan-email + charlie/lead
 *       relevant sections (lead creation at plan-ready + F57 UPSERT enrichment).
 *
 * Read-only. No file or DB modifications.
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

function exists(p) { try { fs.accessSync(p); return true } catch { return false } }
function read(p) { return fs.readFileSync(p, 'utf8') }
function rel(absPath) { return path.relative(ROOT, absPath).replace(/\\/g, '/') }

function walkAll(dir, results = []) {
  if (!fs.existsSync(dir)) return results
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (['node_modules', '.next', '.git'].includes(ent.name)) continue
      walkAll(full, results)
    } else if (ent.isFile() && /\.(tsx?|jsx?|sql)$/.test(ent.name)) {
      results.push(full)
    }
  }
  return results
}

function lineOf(text, idx) {
  let n = 1
  for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) n++
  return n
}

function findAll(text, regex) {
  regex.lastIndex = 0
  const out = []
  let m
  while ((m = regex.exec(text)) !== null) {
    out.push({ index: m.index, match: m[0], line: lineOf(text, m.index) })
    if (m.index === regex.lastIndex) regex.lastIndex++
  }
  return out
}

function sliceLines(text, line, before = 6, after = 12) {
  const lines = text.split('\n')
  const start = Math.max(1, line - before)
  const end = Math.min(lines.length, line + after)
  let out = ''
  for (let i = start; i <= end; i++) {
    const txt = lines[i - 1].length > 200 ? lines[i - 1].slice(0, 200) + '...' : lines[i - 1]
    out += `      L${String(i).padStart(4, ' ')}: ${txt}\n`
  }
  return out.replace(/\n$/, '')
}

const sep = (label) => {
  console.log('')
  console.log('=' .repeat(80))
  console.log(label)
  console.log('=' .repeat(80))
}

// ============================================================================
// [A] T2c migration content
// ============================================================================

sep('[A] T2c migration (lead_origin_route column)')

const migDir = path.resolve(ROOT, 'supabase/migrations')
let t2cFile = null
if (exists(migDir)) {
  for (const f of fs.readdirSync(migDir)) {
    if (/t2c|lead_origin_route|origin.route/i.test(f)) {
      t2cFile = path.join(migDir, f)
      break
    }
  }
}

if (t2cFile && exists(t2cFile)) {
  const content = read(t2cFile)
  console.log(`\nFound: ${rel(t2cFile)} (${content.split('\n').length} lines)\n`)
  console.log(content)
} else {
  console.log('\nNo T2c migration file found by name pattern in supabase/migrations/.')
  console.log('Falling back to grep for "lead_origin_route" in any .sql file:\n')
  if (exists(migDir)) {
    for (const f of fs.readdirSync(migDir)) {
      const full = path.join(migDir, f)
      if (full.endsWith('.sql')) {
        const text = read(full)
        if (/lead_origin_route/i.test(text)) {
          console.log(`Match in ${rel(full)}:`)
          const hits = findAll(text, /lead_origin_route/gi)
          for (const h of hits.slice(0, 5)) {
            console.log(`  L${h.line}:`)
            console.log(sliceLines(text, h.line, 2, 5))
          }
          console.log('')
        }
      }
    }
  }
}

// ============================================================================
// [B] vip-questionnaire LIKE filter location
// ============================================================================

sep('[B] vip-questionnaire LIKE filter (`source` LIKE walliam_estimator%)')

const vipqFile = path.resolve(ROOT, 'app/api/walliam/estimator/vip-questionnaire/route.ts')
if (exists(vipqFile)) {
  const text = read(vipqFile)
  // Match: .like(...source...) OR ilike OR `source LIKE`
  const hits = findAll(text, /\.like\s*\(\s*['"`]source['"`]/gi).concat(
    findAll(text, /\.ilike\s*\(\s*['"`]source['"`]/gi)
  )
  console.log(`\n${rel(vipqFile)} (${text.split('\n').length} lines)`)
  if (hits.length === 0) {
    console.log('  No `.like("source", ...)` or `.ilike("source", ...)` found.')
    console.log('  Also searching for `walliam_estimator%` pattern:')
    const altHits = findAll(text, /walliam_estimator%/g)
    if (altHits.length === 0) {
      console.log('  No matches.')
    } else {
      for (const h of altHits) {
        console.log(`\n  Match at L${h.line}:`)
        console.log(sliceLines(text, h.line, 6, 8))
      }
    }
  } else {
    for (const h of hits) {
      console.log(`\n  Match at L${h.line}:`)
      console.log(sliceLines(text, h.line, 6, 8))
    }
  }
} else {
  console.log(`\n${rel(vipqFile)}: NOT FOUND`)
}

// ============================================================================
// [C] INSERT payload audit — 8 audit-wired lead-write routes
// ============================================================================

sep('[C] INSERT payload audit — 8 audit-wired lead-write routes')

const WIRED_ROUTES = [
  'app/api/walliam/contact/route.ts',
  'app/api/walliam/charlie/vip-request/route.ts',
  'app/api/charlie/plan-email/route.ts',
  'lib/actions/leads.ts',
  'app/api/charlie/appointment/route.ts',
  'app/api/charlie/lead/route.ts',
  'app/api/walliam/estimator/vip-questionnaire/route.ts',
  'app/api/walliam/estimator/vip-request/route.ts',
]

for (const rel0 of WIRED_ROUTES) {
  const abs = path.resolve(ROOT, rel0)
  if (!exists(abs)) {
    console.log(`\n--- ${rel0} [NOT FOUND]`)
    continue
  }
  const text = read(abs)
  console.log(`\n--- ${rel0}`)

  // Find INSERT and UPSERT calls (multi-line aware)
  const inserts = findAll(text, /from\s*\(\s*['"]leads['"]\s*\)\s*\.\s*insert/gi)
  const upserts = findAll(text, /from\s*\(\s*['"]leads['"]\s*\)\s*\.\s*upsert/gi)
  const updates = findAll(text, /from\s*\(\s*['"]leads['"]\s*\)\s*\.\s*update/gi)
  const all = [
    ...inserts.map((h) => ({ ...h, kind: 'INSERT' })),
    ...upserts.map((h) => ({ ...h, kind: 'UPSERT' })),
    ...updates.map((h) => ({ ...h, kind: 'UPDATE' })),
  ].sort((a, b) => a.line - b.line)

  if (all.length === 0) {
    console.log('  (no lead write/upsert/update found)')
    continue
  }

  for (const h of all) {
    console.log(`\n  ${h.kind} at L${h.line}:`)
    // Dump ±4 before, +30 after to catch the whole payload
    console.log(sliceLines(text, h.line, 4, 30))
  }
}

// ============================================================================
// [D] lead_origin_route reference map
// ============================================================================

sep('[D] lead_origin_route reference map (all files)')

const allFiles = []
for (const d of ['app', 'lib', 'components', 'supabase', 'scripts']) {
  const abs = path.resolve(ROOT, d)
  if (exists(abs)) allFiles.push(...walkAll(abs))
}

let lorRefCount = 0
for (const abs of allFiles) {
  const text = read(abs)
  const hits = findAll(text, /lead_origin_route/gi)
  if (hits.length > 0) {
    lorRefCount += hits.length
    console.log(`\n  ${rel(abs)} (${hits.length} hit(s)):`)
    for (const h of hits.slice(0, 6)) {
      const lines = text.split('\n')
      const line = lines[h.line - 1]
      const trimmed = line.length > 180 ? line.slice(0, 180) + '...' : line
      console.log(`    L${h.line}: ${trimmed}`)
    }
    if (hits.length > 6) console.log(`    ... +${hits.length - 6} more`)
  }
}
console.log(`\n  Total lead_origin_route references: ${lorRefCount}`)

// ============================================================================
// [E] Other `.like('source', ...)` filter sites
// ============================================================================

sep('[E] Other `.like("source", ...)` / `.ilike("source", ...)` filter sites')

let likeRefCount = 0
for (const abs of allFiles) {
  if (!/\.(tsx?|jsx?)$/.test(abs)) continue
  const text = read(abs)
  const hits = findAll(text, /\.(i?like)\s*\(\s*['"`]source['"`]/gi)
  if (hits.length > 0) {
    likeRefCount += hits.length
    console.log(`\n  ${rel(abs)} (${hits.length} hit(s)):`)
    for (const h of hits) {
      console.log(`    L${h.line}:`)
      console.log(sliceLines(text, h.line, 1, 3))
    }
  }
}
if (likeRefCount === 0) console.log('\n  (no other source-LIKE filter sites found)')

// ============================================================================
// [F] Plan-integration end-to-end relevant sections
// ============================================================================

sep('[F] Plan-integration relevant sections (charlie/plan-email + charlie/lead)')

const PLAN_FILES = [
  'app/api/charlie/plan-email/route.ts',
  'app/api/charlie/lead/route.ts',
]

for (const rel0 of PLAN_FILES) {
  const abs = path.resolve(ROOT, rel0)
  if (!exists(abs)) {
    console.log(`\n--- ${rel0} [NOT FOUND]`)
    continue
  }
  const text = read(abs)
  const lines = text.split('\n')
  console.log(`\n--- ${rel0} (${lines.length} lines)`)

  // Find references to: plan_data, planType, planEmail, upsert, intent, F57
  const NEEDLES = [/plan_data/gi, /planType/g, /F57/gi, /plan-ready/gi, /buyer_plan|seller_plan/gi]
  const hitLines = new Set()
  for (const re of NEEDLES) {
    for (const h of findAll(text, re)) {
      for (let i = Math.max(0, h.line - 2); i <= Math.min(lines.length - 1, h.line + 4); i++) {
        hitLines.add(i)
      }
    }
  }

  const sorted = [...hitLines].sort((a, b) => a - b)
  let prev = -2
  for (const idx of sorted) {
    if (idx > prev + 1 && prev >= 0) console.log(`  ... [gap of ${idx - prev - 1} line(s)]`)
    const ln = idx + 1
    const txt = lines[idx].length > 180 ? lines[idx].slice(0, 180) + '...' : lines[idx]
    console.log(`  L${String(ln).padStart(4, ' ')}: ${txt}`)
    prev = idx
  }
  if (sorted.length === 0) console.log('  (no plan-related matches found by keyword scan)')
}

// ============================================================================
// SQL to run separately
// ============================================================================

sep('SQL TO RUN SEPARATELY (Supabase Studio or psql)')

console.log(`
-- 1. Current lead_origin_route population (per-tenant, top 20 values):
SELECT
  tenant_id,
  COALESCE(lead_origin_route, '<NULL>') AS lead_origin_route,
  COUNT(*) AS lead_count
FROM leads
GROUP BY tenant_id, lead_origin_route
ORDER BY lead_count DESC
LIMIT 20;

-- 2. Compare lead_origin_route vs source — should both have same shape after T6b:
SELECT
  COALESCE(lead_origin_route, '<NULL>') AS lead_origin_route,
  COALESCE(source, '<NULL>') AS source,
  COUNT(*) AS lead_count
FROM leads
GROUP BY lead_origin_route, source
ORDER BY lead_count DESC
LIMIT 30;

-- 3. NULL audit — how many leads lack lead_origin_route entirely:
SELECT
  COUNT(*) FILTER (WHERE lead_origin_route IS NULL) AS null_count,
  COUNT(*) FILTER (WHERE lead_origin_route IS NOT NULL) AS populated_count,
  COUNT(*) AS total
FROM leads;

-- 4. Check column structure (type, default, constraints):
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'lead_origin_route';

-- 5. Check any CHECK constraint on lead_origin_route:
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'leads'::regclass
  AND pg_get_constraintdef(oid) ILIKE '%lead_origin_route%';
`.trim())

console.log('\n=== END T6a recon probe ===')
console.log('\nPaste:')
console.log('  - The full probe output')
console.log('  - The 5 SQL query results (each in a separate Supabase paste — Supabase Studio')
console.log('    only returns the last result block when multiple queries are pasted together)')