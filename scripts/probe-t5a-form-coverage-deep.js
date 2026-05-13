#!/usr/bin/env node
/**
 * probe-t5a-form-coverage-deep.js
 *
 * W-LEADS-EMAIL T5a deep probe — directory-based classification failed in the
 * first probe because this app uses slug-based dynamic routing (entity type
 * resolved at runtime from the slug). This probe inspects the actual content
 * of the public dynamic route files + builds a components inventory for
 * lead-capture form-like components.
 *
 * Read-only.
 *
 * Output sections:
 *   [A] Public dynamic route files — full content of the key entry points
 *       so we can see how slug -> entity type discrimination happens and
 *       which components are composed per type.
 *   [B] components/ inventory — every file whose name contains form / lead /
 *       cta / capture / contact / inquiry / vip / launcher, with first 40
 *       lines (imports + component signature).
 *   [C] WalliamCTA definition + all usage sites — props passed in each usage.
 *   [D] Form-related imports across all public pages — what each page actually
 *       composes.
 *   [E] Existence check on T0-C recon files (which prior recon produced).
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

function exists(p) {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}

function read(p) {
  return fs.readFileSync(p, 'utf8')
}

function rel(absPath) {
  return path.relative(ROOT, absPath).replace(/\\/g, '/')
}

function head(text, n) {
  return text.split('\n').slice(0, n).join('\n')
}

function walkAll(dir, results = []) {
  if (!fs.existsSync(dir)) return results
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.next' || ent.name === '.git') continue
      walkAll(full, results)
    } else if (ent.isFile() && /\.(tsx?|jsx?)$/.test(ent.name)) {
      results.push(full)
    }
  }
  return results
}

function findAll(text, regex, group = 0) {
  regex.lastIndex = 0
  const out = []
  let m
  while ((m = regex.exec(text)) !== null) {
    out.push({ index: m.index, match: m[group] })
    if (m.index === regex.lastIndex) regex.lastIndex++
  }
  return out
}

function lineOf(text, idx) {
  let n = 1
  for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) n++
  return n
}

const sep = (label) => {
  console.log('')
  console.log('=' .repeat(80))
  console.log(label)
  console.log('=' .repeat(80))
}

// ============================================================================
// [A] Public dynamic route files
// ============================================================================

sep('[A] PUBLIC DYNAMIC ROUTE FILES — full content')

const KEY_PAGES = [
  'app/[slug]/page.tsx',
  'app/page.tsx',
  'app/property/[id]/page.tsx',
  'app/comprehensive-site/[slug]/page.tsx',
  'app/comprehensive-site/toronto/[neighbourhood]/page.tsx',
  'app/comprehensive-site/page.tsx',
  'app/comprehensive-site/contact/page.tsx',
]

const MAX_FULL_LINES = 250 // dump full content up to this; truncate if longer

for (const rel0 of KEY_PAGES) {
  const abs = path.resolve(ROOT, rel0)
  if (!exists(abs)) {
    console.log('\n--- ' + rel0 + ' [NOT FOUND]')
    continue
  }
  const content = read(abs)
  const lines = content.split('\n')
  console.log('\n--- ' + rel0 + ' (' + lines.length + ' lines)')
  if (lines.length <= MAX_FULL_LINES) {
    console.log(content)
  } else {
    console.log(lines.slice(0, MAX_FULL_LINES).join('\n'))
    console.log(`... [truncated; ${lines.length - MAX_FULL_LINES} more lines]`)
  }
}

// ============================================================================
// [B] components/ inventory — form/lead/cta/capture/contact/inquiry/vip/launcher
// ============================================================================

sep('[B] COMPONENTS INVENTORY — files whose name suggests lead capture')

const COMPONENTS_DIRS = ['components', 'app/components', 'src/components']
const namePattern = /(form|lead|cta|capture|contact|inquiry|vip|launcher|charlie|estimator|appointment|schedule|book|plan|signup|register)/i

const componentMatches = []
for (const d of COMPONENTS_DIRS) {
  const abs = path.resolve(ROOT, d)
  if (!exists(abs)) continue
  for (const f of walkAll(abs)) {
    if (namePattern.test(path.basename(f))) componentMatches.push(f)
  }
}

console.log(`\nFound ${componentMatches.length} component file(s) matching lead-capture name patterns:\n`)
for (const abs of componentMatches) {
  const content = read(abs)
  const lines = content.split('\n')
  console.log('--- ' + rel(abs) + ' (' + lines.length + ' lines)')
  console.log(lines.slice(0, 40).join('\n'))
  if (lines.length > 40) console.log(`... [+${lines.length - 40} more lines]`)
  console.log('')
}

// ============================================================================
// [C] WalliamCTA — definition + usage sites
// ============================================================================

sep('[C] WalliamCTA — definition + usage map')

// Find definition: search components dirs for "WalliamCTA"
let walliamCTADef = null
for (const d of COMPONENTS_DIRS) {
  const abs = path.resolve(ROOT, d)
  if (!exists(abs)) continue
  for (const f of walkAll(abs)) {
    const text = read(f)
    if (/(export\s+(default\s+)?(function|const|class)\s+WalliamCTA\b)/.test(text)) {
      walliamCTADef = { file: rel(f), text }
      break
    }
  }
  if (walliamCTADef) break
}

if (walliamCTADef) {
  const lines = walliamCTADef.text.split('\n')
  console.log('\nDefinition: ' + walliamCTADef.file + ' (' + lines.length + ' lines)')
  console.log(lines.slice(0, 120).join('\n'))
  if (lines.length > 120) console.log(`... [+${lines.length - 120} more lines]`)
} else {
  console.log('\nWalliamCTA definition NOT FOUND in standard component directories.')
  console.log('Searching app/ as fallback...')
  const appAbs = path.resolve(ROOT, 'app')
  if (exists(appAbs)) {
    for (const f of walkAll(appAbs)) {
      const text = read(f)
      if (/(export\s+(default\s+)?(function|const|class)\s+WalliamCTA\b)/.test(text)) {
        console.log('  found in: ' + rel(f))
        walliamCTADef = { file: rel(f), text }
        break
      }
    }
  }
}

// Find all usages across app/ + components/
console.log('\nUsage sites:')
const allTsxFiles = []
for (const d of ['app', 'components', 'app/components', 'src/components']) {
  const abs = path.resolve(ROOT, d)
  if (exists(abs)) allTsxFiles.push(...walkAll(abs))
}
const seen = new Set()
let usageCount = 0
for (const f of allTsxFiles) {
  if (seen.has(f)) continue
  seen.add(f)
  if (walliamCTADef && f === path.resolve(ROOT, walliamCTADef.file)) continue
  const text = read(f)
  const hits = findAll(text, /<\s*WalliamCTA\b[^>]*\/?>|import[^;]*\bWalliamCTA\b[^;]*;/g)
  if (hits.length > 0) {
    usageCount++
    console.log('  ' + rel(f) + ':')
    for (const h of hits.slice(0, 6)) {
      const ln = lineOf(text, h.index)
      const snippet = h.match.length > 180 ? h.match.slice(0, 180) + '...' : h.match
      console.log(`    L${ln}: ${snippet}`)
    }
    if (hits.length > 6) console.log(`    ... +${hits.length - 6} more occurrences`)
  }
}
if (usageCount === 0) console.log('  (no usages found outside the definition file)')

// ============================================================================
// [D] Form-related imports across all public pages
// ============================================================================

sep('[D] Form-related component imports across public app/ pages')

const publicPagesAll = []
const appAbs2 = path.resolve(ROOT, 'app')
if (exists(appAbs2)) {
  for (const f of walkAll(appAbs2)) {
    if (!/page\.(tsx?|jsx?)$/.test(f)) continue
    const r = rel(f)
    const segs = r.split('/')
    const excluded = segs.some((s) =>
      ['api', 'admin-homes', 'admin', 'zerooneleads', 'auth', 'login', 'logout', 'signup', 'register', 'dev', 'test', 'fonts'].includes(s.toLowerCase())
    )
    if (!excluded) publicPagesAll.push(f)
  }
}

const IMPORT_RE = /import\s*(?:\{([^}]+)\}|(\w+))\s*from\s*['"]([^'"]+)['"]/g
const targetWord = /(Form|Lead|Cta|CTA|Capture|Contact|Inquiry|Vip|Launcher|Charlie|Estimator|Appointment|Schedule|Book|Plan|Signup|Register)/

for (const f of publicPagesAll) {
  const text = read(f)
  const matches = []
  let m
  IMPORT_RE.lastIndex = 0
  while ((m = IMPORT_RE.exec(text)) !== null) {
    const named = m[1] ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : []
    const def = m[2]
    const src = m[3]
    const interesting = []
    for (const n of named) if (targetWord.test(n.split(/\s+as\s+/)[0])) interesting.push(n)
    if (def && targetWord.test(def)) interesting.push(def + ' (default)')
    if (interesting.length > 0) {
      matches.push({ from: src, names: interesting, line: lineOf(text, m.index) })
    }
  }
  if (matches.length > 0) {
    console.log('\n' + rel(f) + ':')
    for (const m of matches) {
      console.log(`  L${m.line}: { ${m.names.join(', ')} } from '${m.from}'`)
    }
  }
}

// ============================================================================
// [E] T0-C recon files existence check
// ============================================================================

sep('[E] T0-C recon files on disk')

const RECON_FILES = [
  'recon/W-LEADS-EMAIL-T0-C-form-coverage.txt',
  'recon/W-LEADS-EMAIL-T0-C-2-form-render-callsites.txt',
  'recon/W-LEADS-EMAIL-T0-C-3-action-writer-dumps.txt',
]

console.log('')
for (const r of RECON_FILES) {
  const abs = path.resolve(ROOT, r)
  if (exists(abs)) {
    const stat = fs.statSync(abs)
    const sizeKB = (stat.size / 1024).toFixed(1)
    console.log(`  ${r}: EXISTS (${sizeKB} KB)`)
  } else {
    console.log(`  ${r}: NOT FOUND`)
  }
}

console.log('\n=== END T5a deep probe ===')
console.log('\nPaste the full output. T5b decision lock will use sections [A]-[D] to')
console.log('determine: which entity types each dynamic router handles, what form')
console.log('components currently exist, and which compositions need to change to')
console.log('meet OD-5=(a) "per-page-type form variants".')