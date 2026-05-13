#!/usr/bin/env node
/**
 * probe-t5a-form-coverage-matrix.js
 *
 * W-LEADS-EMAIL T5a — recon probe for OD-5=(a) "per-page-type form variants".
 *
 * Walks app/ to find all public page.tsx/.ts files (excluding API routes
 * and admin/marketing surfaces), classifies each by inferred page type, and
 * scans for lead-capture form indicators (component imports, JSX usage,
 * POST targets, form elements).
 *
 * Read-only. No file or DB mods.
 *
 * Output sections:
 *   [1] Page-type coverage matrix: for each of 6 expected types + Other,
 *       list pages + indicators found.
 *   [2] Form component inventory: all unique form-like components seen
 *       across all pages, with which pages reference them.
 *   [3] Action-writer route inventory: all unique POST targets seen, with
 *       reference counts.
 *   [4] Gaps & flags: page types with 0 form indicators, pages with form
 *       indicators we couldn't classify, etc.
 *
 * This is recon, not verdict — output feeds T5b decision lock (decide
 * whether OD-5=(a) requires new form variants per page type, or whether
 * a single universal form with per-context props suffices).
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const APP_DIR = path.resolve(ROOT, 'app')

// ============================================================================
// Page-type classification (path-segment based)
// ============================================================================

const PAGE_TYPES = {
  Area: { res: [/\/areas?\//i, /\/treb[-_]?areas?\//i], pages: [] },
  Municipality: { res: [/\/municipalit(y|ies)\//i, /\/muni\//i], pages: [] },
  Community: { res: [/\/communit(y|ies)\//i], pages: [] },
  Neighbourhood: { res: [/\/neighbou?rhoods?\//i], pages: [] },
  Building: { res: [/\/buildings?\//i, /\/condos?\//i, /\/towers?\//i], pages: [] },
  Property: { res: [/\/propert(y|ies)\//i, /\/listings?\//i, /\/mls\//i, /\/homes?\//i, /\/residential\//i], pages: [] },
  Other: { res: [], pages: [] },
}

const EXCLUDED_SEGMENTS = new Set([
  'api',
  'admin-homes',
  'admin',
  'zerooneleads',
  'fonts',
  'auth',
  'login',
  'logout',
  'signup',
  'register',
  'dev',
  'test',
])

function classify(relPath) {
  const lower = '/' + relPath.replace(/\\/g, '/').toLowerCase() + '/'
  for (const [name, def] of Object.entries(PAGE_TYPES)) {
    if (name === 'Other') continue
    for (const re of def.res) {
      if (re.test(lower)) return name
    }
  }
  return 'Other'
}

function shouldExclude(relPath) {
  const segs = relPath.split(/[\\/]/)
  for (const s of segs) {
    if (EXCLUDED_SEGMENTS.has(s.toLowerCase())) return true
  }
  return false
}

// ============================================================================
// Form indicator patterns (whole-file regex)
// ============================================================================

const FORM_PATTERNS = [
  {
    label: 'JSX form-like component usage',
    re: /<\s*(LeadForm|LeadCapture\w*|ContactForm|ContactCapture\w*|VipRequest\w*|VipQuestionnaire\w*|WalliamCTA\w*|BuyerPlan\w*|SellerPlan\w*|EstimatorForm\w*|InquiryForm\w*|ScheduleForm\w*|AppointmentForm\w*|ChatLauncher\w*|CharlieLauncher\w*|GetEstimate\w*|BookViewing\w*)\b/g,
  },
  {
    label: 'POST to known lead route',
    re: /['"`](\/api\/(?:walliam\/(?:contact|charlie\/vip-request)|charlie\/(?:plan-email|lead|appointment)|walliam\/estimator\/(?:vip-request|vip-questionnaire|vip-approve)))/g,
  },
  {
    label: 'Form HTML element (raw)',
    re: /<\s*form\b[^>]*>/gi,
  },
  {
    label: 'fetch/submit to lead route',
    re: /(?:fetch|axios\.post|supabase\.from)\s*\(\s*['"`]\/api\/(?:walliam|charlie)/g,
  },
]

// ============================================================================
// Helpers
// ============================================================================

function walkPages(dir, results = []) {
  if (!fs.existsSync(dir)) return results
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.next' || ent.name === '.git') continue
      walkPages(full, results)
    } else if (ent.isFile() && /^page\.(tsx?|jsx?)$/i.test(ent.name)) {
      results.push(full)
    }
  }
  return results
}

function findAll(text, regex, captureGroup = 0) {
  regex.lastIndex = 0
  const out = []
  let m
  while ((m = regex.exec(text)) !== null) {
    out.push(m[captureGroup])
    if (m.index === regex.lastIndex) regex.lastIndex++
  }
  return out
}

function rel(absPath) {
  return path.relative(ROOT, absPath).replace(/\\/g, '/')
}

function uniqueCounts(arr) {
  const map = new Map()
  for (const x of arr) map.set(x, (map.get(x) || 0) + 1)
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}

// ============================================================================
// Walk + classify + scan
// ============================================================================

if (!fs.existsSync(APP_DIR)) {
  console.error('FAIL: app/ directory not found at ' + APP_DIR)
  process.exit(1)
}

console.log('=== T5a PROBE: Form coverage matrix ===\n')

const allPages = walkPages(APP_DIR)
const included = []
const excluded = []

for (const abs of allPages) {
  const relPath = rel(abs)
  if (shouldExclude(relPath)) {
    excluded.push(relPath)
  } else {
    included.push(abs)
  }
}

console.log(`Found ${allPages.length} page files under app/`)
console.log(`  ${included.length} included (public-facing)`)
console.log(`  ${excluded.length} excluded (admin/api/marketing/auth)\n`)

// Per-page scan + classification
const allFormComponents = []
const allLeadRoutes = []
const pagesWithoutIndicators = []
const otherPagesWithIndicators = []

for (const abs of included) {
  const relPath = rel(abs)
  const pageType = classify(relPath)
  const text = fs.readFileSync(abs, 'utf8')

  const indicators = {}
  let totalHits = 0
  for (const p of FORM_PATTERNS) {
    const hits = findAll(text, p.re, p.label === 'JSX form-like component usage' || p.label === 'POST to known lead route' ? 1 : 0)
    if (hits.length > 0) {
      indicators[p.label] = hits
      totalHits += hits.length
      if (p.label === 'JSX form-like component usage') {
        allFormComponents.push(...hits)
      }
      if (p.label === 'POST to known lead route') {
        allLeadRoutes.push(...hits)
      }
    }
  }

  const entry = { relPath, indicators, totalHits }
  PAGE_TYPES[pageType].pages.push(entry)

  if (totalHits === 0) pagesWithoutIndicators.push({ relPath, pageType })
  if (totalHits > 0 && pageType === 'Other') otherPagesWithIndicators.push(entry)
}

// ============================================================================
// [1] Page-type coverage matrix
// ============================================================================

console.log('[1] Page-type coverage matrix:\n')

for (const [name, def] of Object.entries(PAGE_TYPES)) {
  const pages = def.pages
  const pagesWithForms = pages.filter((p) => p.totalHits > 0)
  console.log(`  ${name}: ${pages.length} page(s), ${pagesWithForms.length} with form indicators`)
  if (pages.length === 0) {
    console.log(`    (no pages classified as ${name})`)
  } else {
    for (const p of pages) {
      const hitsLabel = p.totalHits === 0 ? 'NO INDICATORS' : `${p.totalHits} indicator hits`
      console.log(`    - ${p.relPath} [${hitsLabel}]`)
      for (const [label, hits] of Object.entries(p.indicators)) {
        const sample = hits.slice(0, 5).join(', ') + (hits.length > 5 ? `, ... (+${hits.length - 5} more)` : '')
        console.log(`        ${label}: ${sample}`)
      }
    }
  }
  console.log('')
}

// ============================================================================
// [2] Form component inventory
// ============================================================================

console.log('[2] Form component inventory (unique JSX components found, by frequency):\n')
const componentCounts = uniqueCounts(allFormComponents)
if (componentCounts.length === 0) {
  console.log('  (none found)')
} else {
  for (const [name, count] of componentCounts) {
    console.log(`  ${name}: ${count}×`)
  }
}
console.log('')

// ============================================================================
// [3] Lead route inventory
// ============================================================================

console.log('[3] Lead-route POST target inventory (unique, by frequency):\n')
const routeCounts = uniqueCounts(allLeadRoutes)
if (routeCounts.length === 0) {
  console.log('  (none found — pages may submit via Server Actions / form actions instead of fetch)')
} else {
  for (const [route, count] of routeCounts) {
    console.log(`  ${route}: ${count}×`)
  }
}
console.log('')

// ============================================================================
// [4] Gaps & flags
// ============================================================================

console.log('[4] Gaps & flags:\n')

const emptyTypes = Object.entries(PAGE_TYPES).filter(([n, d]) => n !== 'Other' && d.pages.length > 0 && d.pages.every((p) => p.totalHits === 0))
const missingTypes = Object.entries(PAGE_TYPES).filter(([n, d]) => n !== 'Other' && d.pages.length === 0)

if (emptyTypes.length === 0 && missingTypes.length === 0) {
  console.log('  All 6 expected page types have classified pages with form indicators.')
} else {
  if (missingTypes.length > 0) {
    console.log(`  Page types with ZERO pages classified (possible directory naming mismatch):`)
    for (const [name] of missingTypes) console.log(`    - ${name}`)
    console.log('')
  }
  if (emptyTypes.length > 0) {
    console.log(`  Page types where ALL classified pages have NO form indicators (gap):`)
    for (const [name] of emptyTypes) console.log(`    - ${name}`)
    console.log('')
  }
}

if (otherPagesWithIndicators.length > 0) {
  console.log(`  ${otherPagesWithIndicators.length} "Other" page(s) have form indicators (may need re-classification):`)
  for (const p of otherPagesWithIndicators.slice(0, 20)) {
    console.log(`    - ${p.relPath} (${p.totalHits} hits)`)
  }
  if (otherPagesWithIndicators.length > 20) {
    console.log(`    ... and ${otherPagesWithIndicators.length - 20} more`)
  }
}

console.log('')
console.log('=== END T5a PROBE ===')
console.log('')
console.log('Next: paste this output. T5b decision lock will define whether form coverage')
console.log('meets OD-5=(a), which gaps need new variants, and how to wire missing pieces.')