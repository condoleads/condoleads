#!/usr/bin/env node
/**
 * verify-w5c-4a-helper.js
 *
 * Static post-creation verification for W-LEADS-WORKBENCH W5c-4a (helper
 * creation, no callers yet). Read-only. Exits 0 if all PASS, 1 if any FAIL.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const FILE = path.join(ROOT, 'lib', 'admin-homes', 'approve-vip-request.ts')

if (!fs.existsSync(FILE)) {
  console.error('FATAL: helper file missing at ' + FILE)
  process.exit(2)
}

const text = fs.readFileSync(FILE, 'utf8')
const buf = fs.readFileSync(FILE)

const checks = []
function check(name, condition, detail) {
  checks.push({ name, pass: !!condition, detail: detail || '' })
}

// ============================================================================
// LE + size sanity
// ============================================================================
let crlf = 0, lf = 0
for (let i = 0; i < buf.length; i++) {
  if (buf[i] === 0x0a) {
    if (i > 0 && buf[i - 1] === 0x0d) crlf++
    else lf++
  }
}
check('LE is LF only (lib/admin-homes/ convention)', lf > 0 && crlf === 0, 'crlf=' + crlf + ' lf=' + lf)
check('file is >5KB (substantive helper)', buf.length > 5000, 'got ' + buf.length + ' bytes')

// ============================================================================
// Exports + types
// ============================================================================
check('exports approveVipRequest function', /export async function approveVipRequest/.test(text), 'main entry point')
check('exports ApproveVipRequestParams interface', /export interface ApproveVipRequestParams/.test(text), 'param interface')
check('exports VipRequestWithJoins interface', /export interface VipRequestWithJoins/.test(text), 'data shape')
check('exports ApproveVipRequestResult type', /export type ApproveVipRequestResult/.test(text), 'result union')

// ============================================================================
// Branching markers
// ============================================================================
check('isEstimator computation present', /vipRequest\.request_type === 'estimator'/.test(text), 'request_type branch')
check('plan_manual_approve_limit override present', /plan_manual_approve_limit/.test(text), 'tenant override path')
check('ai_manual_approve_limit fallback present', /ai_manual_approve_limit \?\? 3/.test(text), 'agent fallback for plan/chat')
check('estimator_manual_approve_attempts default present', /estimator_manual_approve_attempts \?\? 3/.test(text), 'estimator grant amount')

// ============================================================================
// Recovery posture
// ============================================================================
check('estimatorBccFailurePolicy param present', /estimatorBccFailurePolicy/.test(text), 'recovery dial')
check("'fail-open' literal present", /'fail-open'/.test(text), 'fail-open option')
check("'fail-closed' literal present", /'fail-closed'/.test(text), 'fail-closed option')
check('AdminPlatformUnreachable handled', /AdminPlatformUnreachable/.test(text), 'recipient error class')

// ============================================================================
// Email template -- verbatim wording preserved per branch
// ============================================================================
check('plan branch accessLabel literal present', /'Plan Access'/.test(text), 'plan ternary branch')
check('estimator branch accessLabel literal present', /'Estimator Access'/.test(text), 'estimator ternary branch')
check("legacy plan body 'approved your request' preserved", /approved your request/.test(text), 'plan branch body wording')
check("legacy estimator body 'approved your estimator access' preserved", /approved your estimator access/.test(text), 'estimator branch body wording')
check("plan branch 'agent may also reach out' preserved", /Your agent may also reach out/.test(text), 'plan branch extra paragraph')
check('icon unified on U+2726 (legacy glyph)', /\\u2726/.test(text), 'F-W5C-4-EMAIL-ICON-UNIFIED-ON-LEGACY-GLYPH')

// ============================================================================
// Writes performed
// ============================================================================
check("vip_requests UPDATE present", /\.from\('vip_requests'\)[\s\S]{0,300}\.update/.test(text), 'status flip')
check("chat_sessions UPDATE present", /\.from\('chat_sessions'\)[\s\S]{0,400}\.update/.test(text), 'session upgrade')
check("user_credit_overrides UPSERT present", /\.from\('user_credit_overrides'\)[\s\S]{0,400}\.upsert/.test(text), 'credit grant')
check("session_id gate present (W4f safer pattern)", /if \(vipRequest\.session_id\)/.test(text), 'no-op .eq(null) avoided')
check("granted_by_tier 'manager' hardcode preserved", /granted_by_tier: 'manager'/.test(text), 'F-VIP-APPROVE-GRANTED-BY-TIER-HARDCODED-MANAGER preserved')

// ============================================================================
// Per-route preserved options
// ============================================================================
check('userId param present (caller-decided source)', /userId: string \| null/.test(text), 'userId source preservation')
check('creditGrantNotePrefix param present', /creditGrantNotePrefix/.test(text), 'audit wording preservation')
check('audit hook conditional', /if \(audit\)/.test(text), 'optional audit')

// ============================================================================
// Imports + integrations
// ============================================================================
check('imports sendTenantEmail', /import \{[\s\S]{0,200}sendTenantEmail/.test(text), 'email send')
check('imports TenantEmailNotConfigured', /TenantEmailNotConfigured/.test(text), 'email error class 1')
check('imports TenantEmailFailed', /TenantEmailFailed/.test(text), 'email error class 2')
check('imports getLeadEmailRecipients', /getLeadEmailRecipients/.test(text), 'recipient resolver')
check('imports logLeadAdminAction', /logLeadAdminAction/.test(text), 'audit helper')

// ============================================================================
// Audit shape
// ============================================================================
check("audit actionType 'vip_approved' present", /vip_approved/.test(text), 'audit action_type approve')
check("audit actionType 'vip_denied' present", /vip_denied/.test(text), 'audit action_type deny')
check("audit beforeValue { status: 'pending' } present", /beforeValue: \{ status: 'pending' \}/.test(text), 'audit before')

// ============================================================================
// Header docblock + preserved findings
// ============================================================================
check('header lists CALLER CONTRACT', /CALLER CONTRACT/.test(text), 'caller contract block')
check('header lists WRITES PERFORMED', /WRITES PERFORMED/.test(text), 'writes block')
check('header lists NEVER-THROW POLICY', /NEVER-THROW POLICY/.test(text), 'never-throw block')
check('header lists MULTI-TENANT SAFETY', /MULTI-TENANT SAFETY/.test(text), 'safety block')
check('header lists PRESERVED FINDINGS', /PRESERVED FINDINGS/.test(text), 'findings block')
check('F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F mentioned', /F-VIP-APPROVE-DUPLICATE-LOGIC-IN-W4F/.test(text), 'closes-finding reference')
check('F-VIP-APPROVE-GRANTED-BY-TIER-HARDCODED-MANAGER mentioned', /F-VIP-APPROVE-GRANTED-BY-TIER-HARDCODED-MANAGER/.test(text), 'preserved-finding ref')

// ============================================================================
// REPORT
// ============================================================================
const passed = checks.filter((c) => c.pass).length
const failed = checks.filter((c) => !c.pass).length

console.log('')
console.log('W5c-4a helper static verification:')
console.log('-'.repeat(60))
for (const c of checks) {
  console.log((c.pass ? '  PASS  ' : '  FAIL  ') + c.name)
  if (!c.pass) console.log('        -> ' + c.detail)
}
console.log('-'.repeat(60))
console.log('Summary: ' + passed + ' passed, ' + failed + ' failed (' + (passed + failed) + ' total)')

if (failed > 0) process.exit(1)
process.exit(0)