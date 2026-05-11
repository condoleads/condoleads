'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const OUT = path.join(ROOT, 'recon', 'W-LEADS-EMAIL-T6F-B-FRESH.txt')

const ROUTES = [
  'app/api/walliam/estimator/vip-request/route.ts',
  'app/api/walliam/estimator/vip-approve/route.ts',
  'app/api/walliam/estimator/session/route.ts',
  'app/api/walliam/estimator/vip-questionnaire/route.ts',
]

const out = []
out.push('=== T6f-B FRESH FOCUSED PROBE (live source) ===')
out.push('Generated: ' + new Date().toISOString())
out.push('Carries T6f-A lesson: complete BASE_URL/baseUrl identifier pass separate from /walliam/i text hits.')
out.push('')

for (const routePath of ROUTES) {
  const abs = path.resolve(ROOT, routePath)
  if (!fs.existsSync(abs)) { out.push('!!! NOT FOUND: ' + routePath); out.push(''); continue }

  const raw = fs.readFileSync(abs, 'utf8')
  const le = /\r\n/.test(raw) ? 'CRLF' : 'LF'
  const bom = raw.charCodeAt(0) === 0xFEFF ? 'BOM' : 'no-BOM'
  const lines = raw.split(/\r?\n/)

  out.push('='.repeat(72))
  out.push('ROUTE: ' + routePath)
  out.push('  lines: ' + lines.length + ' | LE: ' + le + ' | ' + bom + ' | bytes: ' + Buffer.byteLength(raw, 'utf8'))
  out.push('='.repeat(72))
  out.push('')

  out.push('--- A. All /walliam/i hits (uncapped) ---')
  let wc = 0
  for (let i = 0; i < lines.length; i++) {
    if (/walliam/i.test(lines[i])) {
      wc++
      out.push('  L' + (i + 1).toString().padStart(4) + ': ' + lines[i].trimEnd())
    }
  }
  out.push('  TOTAL: ' + wc)
  out.push('')

  out.push('--- B. All BASE_URL / baseUrl identifier references ---')
  let bc = 0
  for (let i = 0; i < lines.length; i++) {
    if (/\b(BASE_URL|baseUrl)\b/.test(lines[i])) {
      bc++
      out.push('  L' + (i + 1).toString().padStart(4) + ': ' + lines[i].trimEnd())
    }
  }
  out.push('  TOTAL: ' + bc)
  out.push('')

  out.push('--- C. Inline NEXT_PUBLIC_APP_URL references ---')
  let nc = 0
  for (let i = 0; i < lines.length; i++) {
    if (/process\.env\.NEXT_PUBLIC_APP_URL/.test(lines[i])) {
      nc++
      out.push('  L' + (i + 1).toString().padStart(4) + ': ' + lines[i].trimEnd())
    }
  }
  out.push('  TOTAL: ' + nc)
  out.push('')

  out.push('--- D. Tenant SELECT blocks (.from("tenants"), -3/+15 context) ---')
  for (let i = 0; i < lines.length; i++) {
    if (/\.from\(\s*['"]tenants['"]\s*\)/.test(lines[i])) {
      const start = Math.max(0, i - 3)
      const end = Math.min(lines.length - 1, i + 15)
      out.push('  match @ L' + (i + 1) + ' (window L' + (start + 1) + '..L' + (end + 1) + '):')
      for (let j = start; j <= end; j++) {
        out.push('    L' + (j + 1).toString().padStart(4) + ': ' + lines[j].trimEnd())
      }
      out.push('')
    }
  }

  out.push('--- E. Email helper definitions (function build*Html) signatures ---')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^function\s+(build[A-Z][a-zA-Z0-9_]*Html)\b/)
    if (m) {
      let sigEnd = i
      while (sigEnd < i + 25 && sigEnd < lines.length && !/\):\s*\w+(?:<[^>]+>)?\s*\{\s*$/.test(lines[sigEnd])) sigEnd++
      if (sigEnd >= i + 25) sigEnd = i + 1
      out.push('  HELPER ' + m[1] + ' @ L' + (i + 1) + '..L' + (sigEnd + 1) + ':')
      for (let j = i; j <= sigEnd && j < lines.length; j++) {
        out.push('    L' + (j + 1).toString().padStart(4) + ': ' + lines[j].trimEnd())
      }
      out.push('')
    }
  }

  out.push('')
}

fs.writeFileSync(OUT, out.join('\n'))
console.log('Wrote: ' + OUT)
console.log('Output bytes: ' + Buffer.byteLength(out.join('\n'), 'utf8'))