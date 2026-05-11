// scripts/patch-t6f-c-1-contact-wire.js
//
// W-LEADS-EMAIL T6f-C-1 — brand-strings + sourceKey refactor for
// app/api/walliam/contact/route.ts (Shape D: no session, public form).
//
// 8 atomic anchor-validated patches:
//   A1 import getTenantContext
//   A2 brand-load block (after supabase init, before agent resolve)
//   A3 L113 source fallback (multi-line anchor with L112 prefix)
//   A4 L124 buildContactEmail call — add brandName field
//   A5 L125 subject — two brand subs in one line
//   A6 L175 trackUserActivity source fallback (multi-line anchor with L174 prefix)
//   A7 L189 buildContactEmail signature — append brandName field
//   A8 L194 split-tag wordmark — multitenant single-span replacement
//
// Re-runnable: re-run guards detect already-patched state and abort cleanly.
// LF-normalized matching; preserves original line endings on write.

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const F = 'app/api/walliam/contact/route.ts'

function exists(p) { try { fs.statSync(p); return true } catch { return false } }

function readFileLF(p) {
  const abs = path.resolve(ROOT, p)
  const raw = fs.readFileSync(abs, 'utf8')
  const usesCRLF = raw.includes('\r\n')
  const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw
  return { content, usesCRLF }
}

function writeFilePreserveLE(p, content, usesCRLF) {
  const abs = path.resolve(ROOT, p)
  const out = usesCRLF ? content.replace(/\n/g, '\r\n') : content
  fs.writeFileSync(abs, out, 'utf8')
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0
  let count = 0
  let i = 0
  while ((i = haystack.indexOf(needle, i)) !== -1) { count++; i += needle.length }
  return count
}

const j = (...lines) => lines.join('\n')

// ============================================================================
// Anchor matrix — 8 patches
// ============================================================================

// A1 — Add getTenantContext import (after logEmailRecipients import line)
const A1_OLD = "import { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'\n"
const A1_NEW = "import { logEmailRecipients } from '@/lib/admin-homes/log-email-recipients'\nimport { getTenantContext } from '@/lib/utils/tenant-brand'\n"

// A2 — Brand-load block insertion (between supabase init L66 and "// Resolve agent" L68)
const A2_OLD = j(
  "    const supabase = createServiceClient()",
  "",
  "    // Resolve agent"
)
const A2_NEW = j(
  "    const supabase = createServiceClient()",
  "",
  "    // T6f-C-1 — tenant brand context (tenant_id guaranteed non-null by L62 check)",
  "    let brandName = ''",
  "    let sourceKey = 'walliam'  // safe default — replaced when tenant load succeeds",
  "    const _t6fcCtx = await getTenantContext(supabase, tenant_id)",
  "    if (_t6fcCtx) {",
  "      brandName = _t6fcCtx.brandName",
  "      sourceKey = _t6fcCtx.sourceKey",
  "    } else {",
  "      console.warn('[walliam/contact] getTenantContext returned null for tenant_id:', tenant_id)",
  "    }",
  "",
  "    // Resolve agent"
)

// A3 — L113 source fallback in lead INSERT (multi-line anchor w/L112 prefix for uniqueness)
const A3_OLD = j(
  "      message: message || null,",
  "      source: source || 'walliam_contact',"
)
const A3_NEW = j(
  "      message: message || null,",
  "      source: source || `${sourceKey}_contact`,"
)

// A4 — L124 buildContactEmail call — add brandName field to typed-object arg
const A4_OLD = "    const html = buildContactEmail({ name, email, phone, message, source, geo_name, building_id, listing_id })"
const A4_NEW = "    const html = buildContactEmail({ name, email, phone, message, source, geo_name, building_id, listing_id, brandName })"

// A5 — L125 subject (two brand subs in one line)
// File contains literal escape sequences \u2756 and \u2014 (NOT pre-evaluated unicode chars).
// JS source uses \\u to produce literal \u in the string.
const A5_OLD = "    const subject = `\\u2756 WALLiam Inquiry \\u2014 ${name} \\u2014 ${geo_name || source || 'WALLiam'}`"
const A5_NEW = "    const subject = `\\u2756 ${brandName} Inquiry \\u2014 ${name} \\u2014 ${geo_name || source || brandName}`"

// A6 — L175 trackUserActivity source fallback (multi-line w/L174 prefix for uniqueness vs A3)
const A6_OLD = j(
  "    await trackUserActivity(supabase, email, agent?.id || null, 'contact_form', {",
  "      source: source || 'walliam_contact',"
)
const A6_NEW = j(
  "    await trackUserActivity(supabase, email, agent?.id || null, 'contact_form', {",
  "      source: source || `${sourceKey}_contact`,"
)

// A7 — L189 buildContactEmail signature — append brandName field
const A7_OLD = "function buildContactEmail({ name, email, phone, message, source, geo_name, building_id, listing_id }: any): string {"
const A7_NEW = "function buildContactEmail({ name, email, phone, message, source, geo_name, building_id, listing_id, brandName }: any): string {"

// A8 — L194 split-tag wordmark (T6f-A precedent: drop split aesthetic for multitenant correctness)
const A8_OLD = '          <span style="font-weight: 900;">WALL</span><span style="font-weight: 300; color: rgba(255,255,255,0.5);">iam</span>'
const A8_NEW = '          <span style="font-weight: 900;">${brandName}</span>'

// ============================================================================
// Patch list
// ============================================================================

const patches = [
  { name: 'A1 import getTenantContext', old: A1_OLD, new: A1_NEW },
  { name: 'A2 brand-load block insertion', old: A2_OLD, new: A2_NEW },
  { name: 'A3 L113 source fallback (lead INSERT)', old: A3_OLD, new: A3_NEW },
  { name: 'A4 L124 buildContactEmail call', old: A4_OLD, new: A4_NEW },
  { name: 'A5 L125 subject brand subs (x2)', old: A5_OLD, new: A5_NEW },
  { name: 'A6 L175 trackUserActivity source fallback', old: A6_OLD, new: A6_NEW },
  { name: 'A7 L189 buildContactEmail signature', old: A7_OLD, new: A7_NEW },
  { name: 'A8 L194 split-tag wordmark', old: A8_OLD, new: A8_NEW },
]

// ============================================================================
// Validation
// ============================================================================

const errors = []

if (!exists(path.resolve(ROOT, F))) {
  errors.push('file not found: ' + F)
}

let fileState = null
if (errors.length === 0) {
  fileState = readFileLF(F)

  for (const p of patches) {
    const c = countOccurrences(fileState.content, p.old)
    if (c !== 1) errors.push(p.name + ': expected 1 anchor match, found ' + c)
  }

  // Re-run guards
  const reRunMarkers = [
    { name: 'A1 re-run', needle: "import { getTenantContext } from '@/lib/utils/tenant-brand'" },
    { name: 'A2 re-run', needle: '_t6fcCtx = await getTenantContext' },
    { name: 'A3/A6 re-run', needle: '`${sourceKey}_contact`' },
    { name: 'A8 re-run', needle: '<span style="font-weight: 900;">${brandName}</span>' },
  ]
  for (const m of reRunMarkers) {
    if (fileState.content.includes(m.needle)) {
      errors.push(m.name + ': new content already present (re-run after partial state?). Aborting.')
    }
  }
}

if (errors.length > 0) {
  console.error('FAIL: validation errors:')
  for (const e of errors) console.error('  - ' + e)
  console.error('\nNo writes performed.')
  process.exit(1)
}

console.log('All 8 anchors validated. Line endings: ' + (fileState.usesCRLF ? 'CRLF' : 'LF'))

// ============================================================================
// Backup + write
// ============================================================================

const ts = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  ts.getFullYear() +
  pad(ts.getMonth() + 1) +
  pad(ts.getDate()) +
  '_' +
  pad(ts.getHours()) +
  pad(ts.getMinutes()) +
  pad(ts.getSeconds())

console.log('\nBackup suffix: .backup_' + stamp + '\n')

const absSrc = path.resolve(ROOT, F)
const absBackup = absSrc + '.backup_' + stamp
fs.copyFileSync(absSrc, absBackup)
console.log('  backup: ' + path.basename(absBackup))

let content = fileState.content
for (const p of patches) {
  content = content.replace(p.old, p.new)
  console.log('  applied: ' + p.name)
}

writeFilePreserveLE(F, content, fileState.usesCRLF)
console.log('  wrote: ' + F + ' (' + (fileState.usesCRLF ? 'CRLF' : 'LF') + ')')

console.log('')
console.log('T6f-C-1 wire applied: 8 atomic patches to ' + F + '.')
console.log('')
console.log('Next steps:')
console.log('  1. npx tsc --noEmit')
console.log('  2. node scripts/smoke-t3b.js  (Tier 1 directly tests walliam/contact)')
console.log('     node scripts/smoke-t3c.js  (no contact route touched, regression guard)')
console.log('     Expected: 9/9 GREEN.')
console.log('  3. Commit + push T6f-C-1; defer tracker bump to T6f-C-2 paired close.')