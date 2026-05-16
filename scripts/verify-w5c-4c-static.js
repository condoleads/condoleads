#!/usr/bin/env node
/**
 * verify-w5c-4c-static.js
 *
 * Static post-patch verification for W-LEADS-WORKBENCH W5c-4c:
 * migrate app/api/walliam/estimator/vip-approve/route.ts to the shared
 * approveVipRequest helper.
 *
 * Read-only. Exits 0 if all PASS, 1 if any FAIL, 2 on fatal (missing file).
 *
 * Pattern matches scripts/verify-w5c-3-static.js.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const FILE = path.join(
  ROOT,
  'app',
  'api',
  'walliam',
  'estimator',
  'vip-approve',
  'route.ts',
)

if (!fs.existsSync(FILE)) {
  console.error('FATAL: route file missing: ' + FILE)
  process.exit(2)
}

const text = fs.readFileSync(FILE, 'utf8')
const buf = fs.readFileSync(FILE)

const checks = []
function check(name, condition, detail) {
  checks.push({ name, pass: !!condition, detail: detail || '' })
}

// ============================================================
// W5c-4c MIGRATION MARKERS (header block)
// ============================================================
check(
  'header: W5c-4c marker comment present',
  text.indexOf('W-LEADS-WORKBENCH W5c-4c (2026-05-15)') !== -1,
  'expected migration header marker',
)
check(
  'header: F-W5C-4C-UNICODE-AS-ESCAPES finding logged',
  text.indexOf('F-W5C-4C-UNICODE-AS-ESCAPES') !== -1,
  'expected unicode-as-escapes finding in header',
)
check(
  'header: F-W5C-4C-EMPTY-TENANT-GUARD-ADDED finding logged',
  text.indexOf('F-W5C-4C-EMPTY-TENANT-GUARD-ADDED') !== -1,
  'expected empty-tenant-guard finding in header',
)
check(
  'header: F-VIP-APPROVE-EMAILS-NOT-AUDITED preservation noted',
  text.indexOf('F-VIP-APPROVE-EMAILS-NOT-AUDITED') !== -1,
  'expected audit-omission finding in header',
)
check(
  'header: H3.8b ADMIN_EMAIL-removal lineage noted',
  text.indexOf('W-HIERARCHY H3.8b') !== -1,
  'expected H3.8b reference in header',
)

// ============================================================
// HELPER WIRING (approveVipRequest call)
// ============================================================
check(
  'imports: approveVipRequest helper imported from @/lib/admin-homes/approve-vip-request',
  /import\s*\{[\s\S]*?approveVipRequest[\s\S]*?\}\s*from\s*'@\/lib\/admin-homes\/approve-vip-request'/.test(
    text,
  ),
  'expected approveVipRequest import',
)
check(
  'imports: VipRequestWithJoins type imported alongside approveVipRequest',
  /import\s*\{[\s\S]*?approveVipRequest[\s\S]*?type\s+VipRequestWithJoins[\s\S]*?\}\s*from\s*'@\/lib\/admin-homes\/approve-vip-request'/.test(
    text,
  ),
  'expected approveVipRequest + type VipRequestWithJoins in same import block',
)
check(
  'imports: buildBaseUrl preserved from @/lib/utils/tenant-brand',
  text.indexOf("from '@/lib/utils/tenant-brand'") !== -1,
  'expected buildBaseUrl import preserved',
)
check(
  'call: approveVipRequest invoked with await',
  text.indexOf('await approveVipRequest({') !== -1,
  'expected await approveVipRequest({ ... }) invocation',
)
check(
  "call: estimatorBccFailurePolicy: 'fail-closed' preserved (legacy abort posture)",
  text.indexOf("estimatorBccFailurePolicy: 'fail-closed'") !== -1,
  'expected fail-closed policy literal in helper call',
)
check(
  "call: creditGrantNotePrefix uses 'Email approval \\u2014' escape",
  text.indexOf("creditGrantNotePrefix: 'Email approval \\u2014'") !== -1,
  'expected escape em-dash literal in creditGrantNotePrefix',
)
check(
  'call: userId pulled from vipRequest.chat_sessions?.user_id',
  text.indexOf('userId: vipRequest.chat_sessions?.user_id ?? null') !== -1,
  'expected userId source preserved from legacy session-bound pattern',
)
check(
  'call: vipRequest cast via VipRequestWithJoins (helper contract)',
  text.indexOf('vipRequest as unknown as VipRequestWithJoins') !== -1,
  'expected double-cast to VipRequestWithJoins',
)
check(
  'call: brand object { brandName, baseUrl, domain } passed',
  /brand:\s*\{\s*brandName,\s*baseUrl,\s*domain\s*\}/.test(text),
  'expected brand: { brandName, baseUrl, domain } shape',
)

// audit param must be OMITTED (F-VIP-APPROVE-EMAILS-NOT-AUDITED)
const approveCallMatch = text.match(/await approveVipRequest\(\{[\s\S]*?\}\)/)
const auditPassed = approveCallMatch
  ? /[\n,]\s*audit\s*:/.test(approveCallMatch[0])
  : false
check(
  'call: audit param OMITTED (F-VIP-APPROVE-EMAILS-NOT-AUDITED)',
  !auditPassed,
  'audit must not be passed to helper (legacy estimator does not write lead_admin_actions)',
)

// ============================================================
// PRESERVED VERBATIM: ROUTE SCAFFOLDING
// ============================================================
check(
  'route: GET handler signature preserved',
  text.indexOf('export async function GET(request: NextRequest)') !== -1,
  'expected exact GET handler signature',
)
check(
  'route: createServiceClient inline (NOT switched to admin-homes/service-client)',
  text.indexOf('function createServiceClient()') !== -1 &&
    text.indexOf("from '@/lib/admin-homes/service-client'") === -1,
  'createServiceClient must remain inline; admin-homes service-client import must NOT be present',
)
check(
  'route: createClient sourced from @supabase/supabase-js',
  text.indexOf("from '@supabase/supabase-js'") !== -1,
  'expected legacy createClient import preserved',
)
check(
  'route: vip_requests fetch with chat_sessions(*) + agents(...) joins',
  /\.from\(['"]vip_requests['"]\)[\s\S]*?chat_sessions\s*\([\s\S]*?\*[\s\S]*?\)[\s\S]*?agents\s*\([\s\S]*?ai_manual_approve_limit/.test(
    text,
  ),
  'expected vip_requests select with chat_sessions(*) + agents(...ai_manual_approve_limit)',
)
check(
  'route: agents join shape includes full_name, email, notification_email, parent_id',
  /agents\s*\([\s\S]*?full_name[\s\S]*?email[\s\S]*?notification_email[\s\S]*?parent_id[\s\S]*?ai_manual_approve_limit/.test(
    text,
  ),
  'expected full agents join column set preserved',
)
check(
  'route: token-based fetch (.eq approval_token)',
  text.indexOf(".eq('approval_token', token)") !== -1,
  'expected single-gate by approval_token (no triple gate)',
)
check(
  'route: direct tenants SELECT (NOT getTenantContext)',
  /\.from\(['"]tenants['"]\)[\s\S]*?brand_name[\s\S]*?name[\s\S]*?domain/.test(
    text,
  ) && text.replace(/\/\/[^\n]*/g, '').indexOf('getTenantContext') === -1,
  'expected direct brand_name/name/domain SELECT; getTenantContext must NOT appear in active code (comments OK)',
)
check(
  "route: idempotency check (status !== 'pending')",
  text.indexOf("vipRequest.status !== 'pending'") !== -1,
  'expected pending-only check before processing',
)
check(
  "route: expiry handling marks status='expired'",
  text.indexOf("status: 'expired'") !== -1 &&
    text.indexOf('new Date(vipRequest.expires_at) < new Date()') !== -1,
  'expected expiry comparison + update to expired',
)
check(
  'route: empty-tenant guard (F-W5C-4C-EMPTY-TENANT-GUARD-ADDED)',
  /if\s*\(\s*!tenantId\s*\)\s*\{[\s\S]*?createHtmlResponse\(\s*'error'/.test(
    text,
  ),
  'expected if (!tenantId) early-return added by this migration',
)
check(
  "route: typedAction narrowed via 'approve' | 'deny' cast",
  text.indexOf("action as 'approve' | 'deny'") !== -1,
  'expected typedAction narrowing assertion',
)
check(
  "route: result.ok branch returns 'error' (fail-closed render)",
  /if\s*\(\s*!result\.ok\s*\)[\s\S]*?createHtmlResponse\(\s*'error'/.test(text),
  'expected !result.ok branch renders error HTML',
)

// ============================================================
// PRESERVED VERBATIM: HTML RESPONSE LAYER
// ============================================================
check(
  'html: createHtmlResponse signature preserved',
  /function createHtmlResponse\(\s*status:\s*string,\s*message:\s*string,\s*brandName:\s*string\s*=\s*''\s*,?\s*\):\s*NextResponse/.test(
    text,
  ),
  'expected exact createHtmlResponse signature',
)
check(
  "html: configs.approved -> #10b981, '\\u2705', 'Approved'",
  /approved:\s*\{\s*bg:\s*'#10b981',\s*icon:\s*'\\u2705',\s*title:\s*'Approved'\s*\}/.test(
    text,
  ),
  'expected approved config tuple (green + checkmark escape)',
)
check(
  "html: configs.denied -> #ef4444, '\\u274c', 'Denied'",
  /denied:\s*\{\s*bg:\s*'#ef4444',\s*icon:\s*'\\u274c',\s*title:\s*'Denied'\s*\}/.test(
    text,
  ),
  'expected denied config tuple (red + cross escape)',
)
check(
  "html: configs.error -> #ef4444, '\\u274c', 'Error'",
  /error:\s*\{\s*bg:\s*'#ef4444',\s*icon:\s*'\\u274c',\s*title:\s*'Error'\s*\}/.test(
    text,
  ),
  'expected error config tuple (red + cross escape)',
)
check(
  "html: configs.expired -> #f59e0b, '\\u23f0', 'Expired'",
  /expired:\s*\{\s*bg:\s*'#f59e0b',\s*icon:\s*'\\u23f0',\s*title:\s*'Expired'\s*\}/.test(
    text,
  ),
  'expected expired config tuple (amber + alarm-clock escape)',
)
check(
  "html: configs.already_processed -> #64748b, '\\u2139\\ufe0f', 'Already Processed'",
  /already_processed:\s*\{\s*bg:\s*'#64748b',\s*icon:\s*'\\u2139\\ufe0f',\s*title:\s*'Already Processed'\s*\}/.test(
    text,
  ),
  'expected already_processed config tuple (slate + info escape)',
)
check(
  'html: <title> em-dash uses \\u2014 escape',
  text.indexOf('${brandName} Estimator \\u2014 ${cfg.title}') !== -1,
  'expected escape em-dash in HTML <title>',
)
check(
  'html: dashboard link points to /admin-homes/leads (System 2)',
  text.indexOf('href="/admin-homes/leads"') !== -1,
  'expected System 2 dashboard URL',
)
check(
  "html: Content-Type 'text/html' response header preserved",
  /'Content-Type':\s*'text\/html'/.test(text),
  'expected text/html content-type on NextResponse',
)

// ============================================================
// PRESERVED VERBATIM: USER-FACING MESSAGES
// ============================================================
check(
  "msg: 'Estimator access granted to' (approve path)",
  text.indexOf('Estimator access granted to') !== -1,
  'expected approve message preserved verbatim',
)
check(
  "msg: 'Estimator VIP request from' (deny path)",
  text.indexOf('Estimator VIP request from') !== -1 &&
    text.indexOf('has been denied') !== -1,
  'expected deny message preserved verbatim',
)
check(
  "msg: fail-closed wording 'Approval recorded; please contact support.'",
  text.indexOf(
    'System notification failed. Approval recorded; please contact support.',
  ) !== -1,
  'expected fail-closed wording preserved verbatim',
)
check(
  "msg: 'Request not found or link has expired.'",
  text.indexOf('Request not found or link has expired.') !== -1,
  'expected not-found message preserved',
)
check(
  "msg: 'This request has expired.'",
  text.indexOf('This request has expired.') !== -1,
  'expected expired message preserved',
)
check(
  "msg: 'This request was already' (already_processed path)",
  text.indexOf('This request was already') !== -1,
  'expected already-processed message preserved',
)
check(
  "msg: 'Invalid request. Missing token or action.'",
  text.indexOf('Invalid request. Missing token or action.') !== -1,
  'expected missing-token message preserved',
)
check(
  "msg: 'Invalid action.'",
  text.indexOf('Invalid action.') !== -1,
  'expected invalid-action message preserved',
)
check(
  "msg: 'An unexpected error occurred.'",
  text.indexOf('An unexpected error occurred.') !== -1,
  'expected catch-all error message preserved',
)

// ============================================================
// SYSTEM 1 ISOLATION + NO REGRESSIONS
// ============================================================
check(
  'isolation: no imports from app/api/chat/* (System 1 paths)',
  !/from\s*['"][^'"]*app\/api\/chat\//.test(text),
  'System 1 chat path import must NOT appear',
)
check(
  'isolation: no getLeadEmailRecipients import in route (BCC is helper-internal)',
  text.replace(/\/\/[^\n]*/g, '').indexOf('getLeadEmailRecipients') === -1,
  'recipient helper must be called from inside approveVipRequest, not the route (comment-only references OK)',
)
check(
  'isolation: no inline ADMIN_EMAIL literal (H3.8b retired this)',
  !/ADMIN_EMAIL\s*=\s*['"]/.test(text),
  'H3.8b removed inline ADMIN_EMAIL; must not regress',
)
check(
  'isolation: no direct sendTenantEmail / resend.emails.send in route (helper owns send)',
  text.indexOf('sendTenantEmail') === -1 &&
    text.indexOf('resend.emails.send') === -1,
  'email send must be inside approveVipRequest, not the route',
)

// Multitenant: no 'walliam' literal in code body (only in comments + filename)
const nonCommentText = text
  .split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
  .join('\n')
check(
  "tenant: no hardcoded 'walliam' string literal in executable code",
  !/['"]walliam['"]/.test(nonCommentText),
  'tenant identity must be derived per request (Rule Zero multitenant)',
)
check(
  'tenant: no hardcoded tenant UUID literal',
  !/b16e1039-38ed-43d7-bbc5-dd02bb651bc9/.test(text),
  'WALLiam tenant UUID must never appear in code',
)

// ============================================================
// ASCII PURITY (F-W5C-4C-UNICODE-AS-ESCAPES)
// ============================================================
const nonAscii = []
for (let i = 0; i < buf.length; i++) {
  if (buf[i] > 0x7f) nonAscii.push({ offset: i, byte: buf[i] })
}
check(
  'encoding: source file is pure ASCII (no raw UTF-8 multi-byte chars)',
  nonAscii.length === 0,
  nonAscii.length === 0
    ? ''
    : 'found ' +
        nonAscii.length +
        ' non-ASCII byte(s); first at offset ' +
        nonAscii[0].offset +
        ' (byte 0x' +
        nonAscii[0].byte.toString(16) +
        ')',
)

// ============================================================
// LE PRESERVATION
// ============================================================
let crlf = 0
let lf = 0
for (let i = 0; i < buf.length; i++) {
  if (buf[i] === 0x0a) {
    if (i > 0 && buf[i - 1] === 0x0d) crlf++
    else lf++
  }
}
check(
  'encoding: LE pure (no mixed line endings)',
  !(crlf > 0 && lf > 0),
  'got crlf=' + crlf + ' lf=' + lf,
)
check(
  'encoding: CRLF expected (legacy was 260 CRLF / 0 LF)',
  crlf > 0 && lf === 0,
  'got crlf=' + crlf + ' lf=' + lf,
)

// ============================================================
// BACKUP PRESENT
// ============================================================
const dir = path.dirname(FILE)
const backups = fs
  .readdirSync(dir)
  .filter((f) => f.startsWith('route.ts.backup_'))
check(
  'backup: at least one route.ts.backup_<stamp> present in route dir',
  backups.length >= 1,
  'expected timestamped backup in ' + dir,
)

// ============================================================
// REPORT
// ============================================================
const passed = checks.filter((c) => c.pass).length
const failed = checks.filter((c) => !c.pass).length

console.log('')
console.log('W5c-4c static verification:')
console.log('-'.repeat(60))
for (const c of checks) {
  const mark = c.pass ? '  PASS' : '  FAIL'
  console.log(mark + '  ' + c.name)
  if (!c.pass) console.log('        -> ' + c.detail)
}
console.log('-'.repeat(60))
console.log(
  'Summary: ' +
    passed +
    ' passed, ' +
    failed +
    ' failed (' +
    (passed + failed) +
    ' total)',
)
console.log('File:          ' + FILE)
console.log('File size:     ' + buf.length + ' bytes')
console.log('Line endings:  crlf=' + crlf + '  lf=' + lf)
console.log('Backups in dir:' + backups.length)

if (failed > 0) process.exit(1)
process.exit(0)