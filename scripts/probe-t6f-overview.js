// probe-t6f-overview.js
//
// Two-part recon for T6f (brand-strings & URL hardcoding refactor):
//
//   PART A: dump full tenants schema by selecting one row (walliam tenant).
//           This surfaces every column available for tenant-scoped branding
//           (name, assistant_name, domain, email_from_domain, etc.) so the
//           wire patch can use the right column for each kind of hardcode.
//
//   PART B: scan 12 candidate files for /walliam/i hits, categorize each hit
//           (URL / brand-name / user-fallback / domain / source-id / other),
//           and print a per-file count matrix + a full hit list with line
//           numbers and content.
//
// Loads .env.local inline so no dotenv dependency. Read-only — never writes
// to DB or filesystem (except the report file under recon/).

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ROOT = process.cwd()
const REPORT = path.join('recon', 'W-LEADS-EMAIL-T6F-RECON.txt')

// ---------------------------------------------------------------- .env.local
const dotenvPath = path.resolve(ROOT, '.env.local')
if (fs.existsSync(dotenvPath)) {
  for (const raw of fs.readFileSync(dotenvPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

// ---------------------------------------------------------------- output
const out = []
function log(s) { out.push(s); process.stdout.write(s + '\n') }

// ============================================================================
// PART A: tenants schema dump
// ============================================================================

async function dumpTenantSchema() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    log('WARN: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — skipping schema dump')
    return
  }
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

  const { data, error } = await supabase.from('tenants').select('*').eq('id', TENANT_ID).single()
  if (error) { log('SCHEMA FETCH ERROR: ' + error.message); return }

  log('\n' + '='.repeat(78))
  log('PART A: tenants schema (walliam row — all columns)')
  log('='.repeat(78) + '\n')
  const cols = Object.keys(data).sort()
  for (const c of cols) {
    let v = data[c]
    if (v === null) v = '(null)'
    else if (typeof v === 'string' && v.length > 80) v = v.slice(0, 77) + '...'
    else if (typeof v === 'object') v = JSON.stringify(v).slice(0, 80)
    log('  ' + c.padEnd(38) + ' | ' + JSON.stringify(v))
  }
  log('\n  total columns: ' + cols.length)
}

// ============================================================================
// PART B: file-level /walliam/i hit inventory
// ============================================================================

const FILES = [
  'app/api/charlie/lead/route.ts',
  'app/api/charlie/plan-email/route.ts',
  'app/api/charlie/appointment/route.ts',
  'app/api/walliam/estimator/vip-request/route.ts',
  'app/api/walliam/estimator/vip-approve/route.ts',
  'app/api/walliam/estimator/session/route.ts',
  'app/api/walliam/estimator/vip-questionnaire/route.ts',
  'app/api/walliam/charlie/vip-request/route.ts',
  'app/api/walliam/charlie/vip-approve/route.ts',
  'app/api/walliam/contact/route.ts',
  'app/api/email/welcome/route.ts',
  'app/api/email/low-credits/route.ts',
]

function readLines(p) {
  const abs = path.resolve(ROOT, p)
  if (!fs.existsSync(abs)) return null
  return fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n').split('\n')
}

function categorize(line) {
  const cats = []
  if (/https?:\/\/walliam/i.test(line))                       cats.push('URL')
  if (/walliam\.ca/i.test(line) && !cats.includes('URL'))     cats.push('domain')
  if (/['"`]WALLiam User['"`]/.test(line))                    cats.push('user-fallback')
  if (/agentName\s*=\s*['"`]WALLiam['"`]/.test(line))         cats.push('agent-fallback')
  if (/['"`]walliam_[a-z_]+['"`]/.test(line))                 cats.push('source-id')
  if (/\$\{sourceKey\}/.test(line))                           cats.push('templated')
  if (/['"`]WALLiam['"`]/.test(line) && !cats.length)         cats.push('brand-name')
  if (/WALLiam/.test(line) && !cats.length)                   cats.push('brand-text')
  if (/walliam/i.test(line) && !cats.length)                  cats.push('other')
  return cats
}

function scanFiles() {
  log('\n' + '='.repeat(78))
  log('PART B: /walliam/i hit inventory across ' + FILES.length + ' candidate files')
  log('='.repeat(78))

  const stats = []
  for (const f of FILES) {
    const lines = readLines(f)
    if (lines === null) { stats.push({ f, missing: true, hits: [] }); continue }
    const hits = []
    for (let i = 0; i < lines.length; i++) {
      if (/walliam/i.test(lines[i])) {
        hits.push({ ln: i + 1, cats: categorize(lines[i]), text: lines[i] })
      }
    }
    const catSummary = {}
    for (const h of hits) for (const c of h.cats) catSummary[c] = (catSummary[c] || 0) + 1
    stats.push({ f, missing: false, total: hits.length, cats: catSummary, hits })
  }

  // category matrix
  const allCats = new Set()
  for (const s of stats) if (!s.missing) for (const c of Object.keys(s.cats)) allCats.add(c)
  const catList = [...allCats].sort()

  log('\n-- per-file hit counts by category --\n')
  const fileW = 55
  log('  ' + 'FILE'.padEnd(fileW) + '  ' + catList.map(c => c.padStart(12)).join(' ') + '  ' + 'TOTAL'.padStart(6))
  log('  ' + '-'.repeat(fileW) + '  ' + catList.map(() => '-'.repeat(12)).join(' ') + '  ' + '-'.repeat(6))
  for (const s of stats) {
    if (s.missing) { log('  ' + s.f.padEnd(fileW) + '  MISSING'); continue }
    const row = catList.map(c => String(s.cats[c] || '·').padStart(12)).join(' ')
    log('  ' + s.f.padEnd(fileW) + '  ' + row + '  ' + String(s.total).padStart(6))
  }

  // full hit list per file
  log('\n\n-- full hit list per file (only files with hits) --')
  for (const s of stats) {
    if (s.missing || s.total === 0) continue
    log('\n  ' + s.f + ' (' + s.total + ' hits)')
    for (const h of s.hits) {
      const trimmed = h.text.length > 130 ? h.text.slice(0, 127) + '...' : h.text
      log('    L' + String(h.ln).padStart(4) + ' [' + h.cats.join(',').padEnd(20) + '] ' + trimmed)
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  log('W-LEADS-EMAIL T6f recon — brand-strings & URL hardcoding')
  log('Generated: ' + new Date().toISOString())
  log('')

  await dumpTenantSchema()
  scanFiles()

  fs.mkdirSync(path.resolve(ROOT, 'recon'), { recursive: true })
  fs.writeFileSync(path.resolve(ROOT, REPORT), out.join('\n'), 'utf8')
  log('\n[probe-t6f-overview] Report: ' + REPORT)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })