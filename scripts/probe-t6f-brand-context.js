// probe-t6f-brand-context.js
//
// For each T6f-scope file, dump 10-line context around every USER-FACING
// /walliam/i hit, plus the enclosing function/handler name. Filters out
// comments, console.error labels, T6c-handled source-id assignments, and
// already-templated lines.
//
// Output: recon/W-LEADS-EMAIL-T6F-BRAND-CONTEXT.txt + stdout.
// Read-only.

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const REPORT = path.join('recon', 'W-LEADS-EMAIL-T6F-BRAND-CONTEXT.txt')

const FILES = [
  'app/api/charlie/lead/route.ts',
  'app/api/charlie/plan-email/route.ts',
  'app/api/charlie/appointment/route.ts',
  'app/api/walliam/estimator/vip-request/route.ts',
  'app/api/walliam/estimator/vip-approve/route.ts',
  'app/api/walliam/estimator/session/route.ts',
  'app/api/walliam/estimator/vip-questionnaire/route.ts',
  'app/api/walliam/charlie/vip-approve/route.ts',
  'app/api/walliam/contact/route.ts',
]

function isUserFacing(line) {
  const trimmed = line.trimStart()
  if (trimmed.startsWith('//')) return false
  if (/console\.(error|warn|log|info)\s*\(/.test(line)) return false
  if (/templateKey\s*:\s*['"]/.test(line)) return false
  if (/\bsource\s*:\s*['"]walliam_/.test(line)) return false
  if (/\brequest_source\s*:\s*['"]walliam_/.test(line)) return false
  if (/\$\{sourceKey\}/.test(line)) return false
  if (/\bsource\s+LIKE\s+/.test(line)) return false
  return /walliam/i.test(line)
}

function findEnclosingFunction(lines, lineIdx) {
  // Search backward for nearest function declaration. Track brace depth so we
  // only count declarations at the depth that contains lineIdx.
  // Patterns matched:
  //   export async function POST/GET/...
  //   function name(...) {
  //   const name = async (...) => {
  //   export async function name(...) {
  //   async name(...) {  (method)
  let depth = 0
  for (let i = lineIdx; i >= 0; i--) {
    const line = lines[i]
    // Count closing braces moving backward (would have decreased depth)
    for (const ch of line) {
      if (ch === '}') depth++
      else if (ch === '{') depth--
    }
    if (depth >= 0) {
      // We are at or above the function-opening brace. Look for declaration.
      const m =
        /export\s+async\s+function\s+(POST|GET|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(/.exec(line) ||
        /export\s+function\s+(POST|GET|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(/.exec(line) ||
        /export\s+default\s+(?:async\s+)?function\s+(\w+)?\s*\(/.exec(line) ||
        /(?:async\s+)?function\s+(\w+)\s*\(/.exec(line) ||
        /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/.exec(line) ||
        /(?:const|let|var)\s+(\w+)\s*:\s*[\w<>\[\]]+\s*=\s*(?:async\s*)?\(/.exec(line)
      if (m) return m[1] || '<default>'
    }
  }
  return '(module-level)'
}

const out = []
function emit(s) { out.push(s); process.stdout.write(s + '\n') }

emit('W-LEADS-EMAIL T6f user-facing brand-context + enclosing-function recon')
emit('Generated: ' + new Date().toISOString())

let totalHits = 0
for (const f of FILES) {
  emit('\n' + '='.repeat(78))
  emit('FILE: ' + f)
  emit('='.repeat(78))

  const abs = path.resolve(ROOT, f)
  if (!fs.existsSync(abs)) { emit('  MISSING'); continue }
  const lines = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n').split('\n')

  const hits = []
  for (let i = 0; i < lines.length; i++) {
    if (isUserFacing(lines[i])) hits.push(i + 1)
  }

  emit('  total lines: ' + lines.length + ', user-facing /walliam/i hits: ' + hits.length)
  totalHits += hits.length

  for (const ln of hits) {
    const fn = findEnclosingFunction(lines, ln - 1)
    const from = Math.max(1, ln - 4)
    const to = Math.min(lines.length, ln + 5)
    emit('')
    emit('  --- L' + ln + ' [enclosing fn: ' + fn + '] (window L' + from + '..L' + to + ') ---')
    for (let i = from; i <= to; i++) {
      const marker = (i === ln) ? '>>' : '  '
      emit('  ' + marker + ' L' + String(i).padStart(4) + ': ' + lines[i - 1])
    }
  }
}

emit('\n' + '='.repeat(78))
emit('TOTAL user-facing hits across ' + FILES.length + ' files: ' + totalHits)
emit('='.repeat(78))

fs.mkdirSync(path.resolve(ROOT, 'recon'), { recursive: true })
fs.writeFileSync(path.resolve(ROOT, REPORT), out.join('\n'), 'utf8')
emit('\n[probe-t6f-brand-context] Report: ' + REPORT)