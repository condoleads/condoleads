// probe-t6f-anchor-prep.js
//
// Read-only probe gathering the four anchor categories T6f needs:
//   A. Each module-level email-builder helper — first 30 lines of definition
//      (signature + early body, captures param destructure end).
//   B. Each call site of each helper — line + 10 lines context.
//   C. Post-validateSession destructure block in Shape A routes
//      (charlie/lead, charlie/plan-email, charlie/appointment) — anchored on
//      `const sourceKey = _sessionCheck.sourceKey` per T6c.
//   D. Every `.from('tenants').select(` call — 15 lines context.
//
// Output: recon/W-LEADS-EMAIL-T6F-ANCHOR-PREP.txt + stdout.

'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const REPORT = path.join('recon', 'W-LEADS-EMAIL-T6F-ANCHOR-PREP.txt')

// File → list of helpers to dump (excluding util helpers we don't touch)
const FILE_HELPERS = {
  'app/api/charlie/lead/route.ts': ['buildUserPlanEmail', 'buildAgentLeadEmail'],
  'app/api/charlie/plan-email/route.ts': ['buildRichPlanEmail'],
  'app/api/charlie/appointment/route.ts': ['buildUserConfirmationEmail', 'buildAgentNotificationEmail'],
  'app/api/walliam/estimator/vip-request/route.ts': ['buildApprovalEmailHtml', 'buildUserApprovalEmailHtml'],
  'app/api/walliam/estimator/vip-approve/route.ts': ['buildUserApprovalEmailHtml', 'createHtmlResponse'],
  'app/api/walliam/estimator/vip-questionnaire/route.ts': ['buildQuestionnaireEmailHtml'],
  'app/api/walliam/charlie/vip-approve/route.ts': ['buildUserApprovalEmailHtml', 'createHtmlResponse'],
  'app/api/walliam/contact/route.ts': ['buildContactEmail'],
}

const SHAPE_A_FILES = [
  'app/api/charlie/lead/route.ts',
  'app/api/charlie/plan-email/route.ts',
  'app/api/charlie/appointment/route.ts',
]

const out = []
function emit(s) { out.push(s); process.stdout.write(s + '\n') }

emit('W-LEADS-EMAIL T6f anchor-prep recon')
emit('Generated: ' + new Date().toISOString())

const ALL_FILES = Object.keys(FILE_HELPERS)

for (const file of ALL_FILES) {
  emit('\n' + '='.repeat(78))
  emit('FILE: ' + file)
  emit('='.repeat(78))

  const abs = path.resolve(ROOT, file)
  if (!fs.existsSync(abs)) { emit('  MISSING'); continue }
  const content = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n')
  const lines = content.split('\n')

  // ============= A. Helper definitions (signature + first 30 lines) =============
  emit('\n  --- A. Helper definitions ---')
  for (const helper of FILE_HELPERS[file]) {
    const declRe = new RegExp('^(?:export\\s+)?(?:async\\s+)?function\\s+' + helper + '\\s*\\(')
    let declLine = -1
    for (let i = 0; i < lines.length; i++) {
      if (declRe.test(lines[i])) { declLine = i; break }
    }
    if (declLine < 0) { emit('    ' + helper + ': NOT FOUND'); continue }
    emit('')
    emit('    HELPER: ' + helper + ' (decl at L' + (declLine + 1) + ')')
    const from = declLine + 1
    const to = Math.min(lines.length, declLine + 30)
    for (let i = from; i <= to; i++) {
      emit('      L' + String(i).padStart(4) + ': ' + lines[i - 1])
    }
  }

  // ============= B. Helper call sites =============
  emit('\n  --- B. Helper call sites ---')
  for (const helper of FILE_HELPERS[file]) {
    const callRe = new RegExp('\\b' + helper + '\\s*\\(')
    const declRe = new RegExp('^(?:export\\s+)?(?:async\\s+)?function\\s+' + helper + '\\s*\\(')
    const sites = []
    for (let i = 0; i < lines.length; i++) {
      if (declRe.test(lines[i])) continue // skip the declaration itself
      if (callRe.test(lines[i])) sites.push(i + 1)
    }
    if (sites.length === 0) { emit('    ' + helper + ': no call sites found (suspicious — verify)'); continue }
    for (const ln of sites) {
      emit('')
      emit('    CALL: ' + helper + ' @ L' + ln)
      const from = Math.max(1, ln - 2)
      const to = Math.min(lines.length, ln + 10)
      for (let i = from; i <= to; i++) {
        const marker = (i === ln) ? '>>' : '  '
        emit('      ' + marker + ' L' + String(i).padStart(4) + ': ' + lines[i - 1])
      }
    }
  }

  // ============= C. Post-validateSession destructure (Shape A only) =============
  if (SHAPE_A_FILES.includes(file)) {
    emit('\n  --- C. Post-validateSession destructure (Shape A) ---')
    const anchor = 'const sourceKey = _sessionCheck.sourceKey'
    let hit = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(anchor)) { hit = i; break }
    }
    if (hit < 0) {
      emit('    ANCHOR NOT FOUND: "' + anchor + '" — check T6c shipped state')
    } else {
      const from = Math.max(1, hit - 4)
      const to = Math.min(lines.length, hit + 8)
      for (let i = from; i <= to; i++) {
        const marker = (i === hit + 1) ? '>>' : '  '
        emit('    ' + marker + ' L' + String(i).padStart(4) + ': ' + lines[i - 1])
      }
    }
  }

  // ============= D. .from('tenants').select( contexts =============
  emit('\n  --- D. .from(\'tenants\').select( contexts ---')
  const tenantSelectRe = /\.from\(['"]tenants['"]\)/
  const sites = []
  for (let i = 0; i < lines.length; i++) {
    if (tenantSelectRe.test(lines[i])) sites.push(i + 1)
  }
  if (sites.length === 0) {
    emit('    (none — route doesn\'t directly query tenants table)')
  } else {
    for (const ln of sites) {
      emit('')
      emit('    SELECT @ L' + ln)
      const from = Math.max(1, ln - 2)
      const to = Math.min(lines.length, ln + 15)
      for (let i = from; i <= to; i++) {
        const marker = (i === ln) ? '>>' : '  '
        emit('      ' + marker + ' L' + String(i).padStart(4) + ': ' + lines[i - 1])
      }
    }
  }
}

emit('')

fs.mkdirSync(path.resolve(ROOT, 'recon'), { recursive: true })
fs.writeFileSync(path.resolve(ROOT, REPORT), out.join('\n'), 'utf8')
emit('[probe-t6f-anchor-prep] Report: ' + REPORT)