#!/usr/bin/env node
/**
 * verify-w5c-4b-static.js
 *
 * Static post-migration verification for W-LEADS-WORKBENCH W5c-4b
 * (admin-homes vip-approve route migrated to shared helper). Read-only.
 * Exits 0 if all PASS, 1 if any FAIL.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const FILE = path.join(
  ROOT,
  'app',
  'api',
  'admin-homes',
  'leads',
  '[id]',
  'vip-approve',
  'route.ts',
)

if (!fs.existsSync(FILE)) {
  console.error('FATAL: route file missing at ' + FILE)
  process.exit(2)
}

const text = fs.readFileSync(FILE, 'utf8')
const buf = fs.readFileSync(FILE)

const checks = []
function check(name, condition, detail) {
  checks.push({ name, pass: !!condition, detail: detail || '' })
}

// ============================================================================
// File size + LE sanity
// ============================================================================
check(
  'file shrunk substantially after migration (was ~16170 bytes, expect <8000)',
  buf.length < 8000,
  'current size ' + buf.length + ' bytes',
)
check(
  'file is at least 3KB (not empty / not stub)',
  buf.length > 3000,
  'current size ' + buf.length + ' bytes',
)
let crlf = 0,
  lf = 0
for (let i = 0; i < buf.length; i++) {
  if (buf[i] === 0x0a) {
    if (i > 0 && buf[i - 1] === 0x0d) crlf++
    else lf++
  }
}
check(
  'LE pure (no mixed line endings)',
  !(crlf > 0 && lf > 0),
  'crlf=' + crlf + ' lf=' + lf,
)

// ============================================================================
// New imports present (helper-based)
// ============================================================================
check(
  'imports approveVipRequest from helper',
  /import \{[\s\S]{0,200}approveVipRequest[\s\S]{0,200}\} from '@\/lib\/admin-homes\/approve-vip-request'/.test(
    text,
  ),
  'helper import',
)
check(
  'imports VipRequestWithJoins type from helper',
  /VipRequestWithJoins/.test(text),
  'type-only import for cast',
)

// ============================================================================
// Removed imports / removed inline logic
// ============================================================================
check(
  'no direct logLeadAdminAction import (delegated to helper)',
  !/from '@\/lib\/admin-homes\/log-lead-admin-action'/.test(text),
  'helper handles audit now',
)
check(
  'no direct sendTenantEmail import (delegated to helper)',
  !/import \{[\s\S]{0,500}sendTenantEmail[\s\S]{0,500}\} from '@\/lib\/email\/sendTenantEmail'/.test(
    text,
  ),
  'helper handles email send',
)
check(
  'no direct getLeadEmailRecipients import (delegated to helper)',
  !/getLeadEmailRecipients/.test(text),
  'helper handles BCC fetch',
)
check(
  'no direct AdminPlatformUnreachable handling in route',
  !/AdminPlatformUnreachable/.test(text),
  'helper handles fail-open recovery',
)
check(
  'no inline buildApprovalEmailHtml function definition',
  !/function buildApprovalEmailHtml/.test(text),
  'helper owns the template now',
)
check(
  'no inline sendTenantEmail call',
  !/await sendTenantEmail\(/.test(text),
  'helper sends email now',
)
check(
  'no inline logLeadAdminAction call',
  !/await logLeadAdminAction\(/.test(text),
  'helper writes audit now',
)
check(
  'no inline user_credit_overrides write',
  !/\.from\('user_credit_overrides'\)/.test(text),
  'helper handles credit grant',
)
check(
  'no inline chat_sessions write',
  !/\.from\('chat_sessions'\)/.test(text),
  'helper handles session upgrade',
)

// ============================================================================
// Preserved auth + lead fetch + permission gate
// ============================================================================
check(
  'resolveAdminHomesUser auth preserved',
  /resolveAdminHomesUser/.test(text),
  'admin auth',
)
check(
  "401 on !user preserved",
  /status: 401/.test(text),
  'unauth response',
)
check(
  "createServiceClient preserved",
  /createServiceClient\(\)/.test(text),
  'service-role client',
)
check(
  "lead fetch by params.id preserved",
  /\.from\('leads'\)[\s\S]{0,200}\.eq\('id', params\.id\)/.test(text),
  'lead fetch',
)
check(
  "404 on !lead preserved",
  /status: 404/.test(text),
  'lead-not-found response',
)
check(
  "can('lead.write') permission gate preserved",
  /can\(user\.permissions, 'lead\.write'/.test(text),
  'permission gate',
)
check(
  "permission gate uses decision.status + decision.reason",
  /decision\.reason/.test(text) && /decision\.status/.test(text),
  '403 response shape',
)

// ============================================================================
// Preserved body parse + vip_request fetch (triple gate) + idempotency + expiry
// ============================================================================
check(
  'body parse on vipRequestId preserved',
  /typeof body\?\.vipRequestId === 'string'/.test(text),
  'param validation',
)
check(
  "action 'approve' | 'deny' validation preserved",
  /action !== 'approve' && action !== 'deny'/.test(text),
  'action validation',
)
check(
  "400 on bad input preserved",
  /status: 400/.test(text),
  'bad-input response',
)
check(
  'vip_requests triple-gate (id + tenant + lead) preserved',
  /\.from\('vip_requests'\)[\s\S]{0,400}\.eq\('id', vipRequestId\)[\s\S]{0,200}\.eq\('tenant_id', lead\.tenant_id\)[\s\S]{0,200}\.eq\('lead_id', lead\.id\)/.test(
    text,
  ),
  'triple gate on vip fetch',
)
check(
  'agents join shape preserved (full_name, email, notification_email, parent_id, ai_manual_approve_limit)',
  /full_name, email, notification_email, parent_id, ai_manual_approve_limit/.test(
    text,
  ),
  'helper needs this select shape',
)
check(
  "idempotency: status !== 'pending' returns 409",
  /vipRequest\.status !== 'pending'[\s\S]{0,400}status: 409/.test(text),
  '409 with currentStatus',
)
check(
  "currentStatus in idempotency response",
  /currentStatus: vipRequest\.status/.test(text),
  'idempotency response shape',
)
check(
  "expiry mark + 410 preserved",
  /\.update\(\{ status: 'expired' \}\)[\s\S]{0,400}status: 410/.test(text),
  'expiry handling',
)

// ============================================================================
// Helper invocation with correct admin-homes options
// ============================================================================
check(
  'approveVipRequest call present',
  /await approveVipRequest\(\{/.test(text),
  'helper call',
)
check(
  "estimatorBccFailurePolicy: 'fail-open' (admin-homes posture)",
  /estimatorBccFailurePolicy: 'fail-open'/.test(text),
  'fail-open preserves W4f behavior',
)
check(
  "creditGrantNotePrefix: 'Admin approve --' (preserves W4f wording)",
  /creditGrantNotePrefix: 'Admin approve --'/.test(text),
  'credit note prefix preserved',
)
check(
  'userId from lead.user_id (admin-homes source)',
  /userId: lead\.user_id/.test(text),
  'lead-bound user source',
)
check(
  'audit hook set (admin-homes audits)',
  /audit: \{/.test(text),
  'audit param',
)
check(
  "audit actorRole resolution chain present",
  /user\.role \|\| \(user\.isPlatformAdmin \? 'platform_admin' : 'admin'\)/.test(
    text,
  ),
  'actorRole computation',
)
check(
  "audit notes preserved ('VIP request <action>d from admin workbench')",
  /'VIP request ' \+ action \+ 'd from admin workbench'/.test(text),
  'audit notes string',
)
check(
  'brand context resolved before helper call',
  /getTenantContext\(supabase, lead\.tenant_id\)/.test(text),
  'brand resolution',
)
check(
  'buildBaseUrl used for brand.baseUrl',
  /buildBaseUrl\(brandCtx\.domain\)/.test(text),
  'baseUrl from domain',
)

// ============================================================================
// Result handling + response shape
// ============================================================================
check(
  'result.ok false branch present (defensive)',
  /if \(!result\.ok\)/.test(text),
  'defensive handling',
)
check(
  'success response shape preserved',
  /success: true,[\s\S]{0,200}vipRequestId: vipRequest\.id,[\s\S]{0,200}status: result\.status,[\s\S]{0,200}messagesGranted: result\.messagesGranted/.test(
    text,
  ),
  'response JSON shape',
)
check(
  'top-level try/catch with 500 preserved',
  /catch \(error\)[\s\S]{0,400}status: 500/.test(text),
  '500 on unexpected',
)

// ============================================================================
// Docblock + provenance markers
// ============================================================================
check(
  'header notes W5c-4b migration',
  /W5c-4b/.test(text),
  'migration provenance',
)
check(
  'header preserves MULTITENANT CONTRACT block',
  /MULTITENANT CONTRACT/.test(text),
  'safety block',
)
check(
  'header preserves IDEMPOTENCY block',
  /IDEMPOTENCY/.test(text),
  'idempotency block',
)
check(
  'header documents PRESERVED BEHAVIOR list',
  /PRESERVED BEHAVIOR/.test(text),
  'verbatim preservation notes',
)
check(
  'header documents SMALL BEHAVIOR DELTA (brand)',
  /SMALL BEHAVIOR DELTA/.test(text),
  'brand-resolution delta acknowledged',
)

// ============================================================================
// REPORT
// ============================================================================
const passed = checks.filter((c) => c.pass).length
const failed = checks.filter((c) => !c.pass).length

console.log('')
console.log('W5c-4b static verification:')
console.log('-'.repeat(60))
for (const c of checks) {
  console.log((c.pass ? '  PASS  ' : '  FAIL  ') + c.name)
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

if (failed > 0) process.exit(1)
process.exit(0)