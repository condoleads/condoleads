#!/usr/bin/env node
/**
 * patch-w-leads-workbench-w6a-2-3.js
 *
 * W6a-2 + W6a-3 (2026-05-16) -- audit writes for PATCH (status/quality)
 * and DELETE handlers in app/api/admin-homes/leads/[id]/route.ts.
 *
 * Full-file rewrite of the target route (77 -> ~175 lines). The two
 * handlers are preserved in shape (auth, can(), 404, 403, error returns,
 * success returns). Added behavior:
 *   (a) PATCH SELECT widened to include status, quality (for before_value)
 *   (b) DELETE SELECT widened to capture full lead snapshot
 *   (c) After successful PATCH UPDATE: one audit row per field changed
 *   (d) After successful DELETE: one lead_deleted audit row with snapshot
 *
 * All audit writes are best-effort via logLeadAdminAction (never-throw).
 *
 * MULTITENANT SAFETY: every audit row uses target.tenant_id (lead's),
 * never user's claimed tenant. Identical to W4e/W4f/W4g pattern.
 *
 * DEPENDS ON: W6a-1 migration (drop lead_admin_actions_lead_id_fkey).
 *
 * Idempotent: skips with exit 0 if W6a-2 marker present.
 * Atomic: file written only if all assertions pass.
 * LE preserved. Backup-before-write.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const TARGET = path.join(ROOT, 'app', 'api', 'admin-homes', 'leads', '[id]', 'route.ts')

if (!fs.existsSync(TARGET)) {
  console.error('FATAL: target missing: ' + TARGET)
  process.exit(2)
}

const origContent = fs.readFileSync(TARGET, 'utf8')
const origLen = origContent.length

const MARKER = 'W6a-2 + W6a-3 (2026-05-16)'
if (origContent.indexOf(MARKER) !== -1) {
  console.log('No-op: file already at W6a-2 + W6a-3 (marker present).')
  process.exit(0)
}

const sample = origContent.slice(0, 8192)
const crlfCount = (sample.match(/\r\n/g) || []).length
const bareLfCount = (sample.match(/(?<!\r)\n/g) || []).length
const useCRLF = crlfCount > 0 && bareLfCount === 0
const LE = useCRLF ? '\r\n' : '\n'
console.log('LE detected: ' + (useCRLF ? 'CRLF' : 'LF') + '  (crlf=' + crlfCount + ' bareLf=' + bareLfCount + ')')

const REQUIRED_ANCHORS = [
  'export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {',
  'export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {',
  "import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'",
  "import { createServiceClient } from '@/lib/admin-homes/service-client'",
  "import { can } from '@/lib/admin-homes/permissions'",
  ".select('id, tenant_id, agent_id')",
  "if (!user.isPlatformAdmin && user.permissions.roleDb === 'agent') {",
]
for (const anchor of REQUIRED_ANCHORS) {
  if (origContent.indexOf(anchor) === -1) {
    console.error('FATAL: required anchor not found: ' + anchor)
    process.exit(1)
  }
}
console.log('All ' + REQUIRED_ANCHORS.length + ' source anchors verified.')

const newLines = [
  '// app/api/admin-homes/leads/[id]/route.ts',
  '// Phase 3.4+: auth + tenant-check on every mutation via shared api-auth helper.',
  '// W-LEADS-WORKBENCH W6a-2 + W6a-3 (2026-05-16) -- audit writes for PATCH',
  '// (status/quality) and DELETE handlers.',
  '//',
  '// MULTITENANT CONTRACT (Rule Zero #1)',
  '//   Every audit row is written under the LEAD\'s tenant_id (target.tenant_id),',
  '//   never the user\'s claimed tenant. Identical to W4e/W4f/W4g pattern.',
  '//',
  '// PERMISSION CONTRACT',
  '//   can(user.permissions, \'lead.write\', { kind, leadId, tenantId, agentId })',
  '//   preserved verbatim. The agent-deletes-blocked check in DELETE is',
  '//   preserved verbatim. Audit writes happen ONLY after the mutation',
  '//   succeeds -- on failure (404, 403, 500) no audit row is written.',
  '//',
  '// AUDIT',
  '//   PATCH writes one audit row per field changed (status_changed and/or',
  '//   quality_changed), each with target_field set, before_value capturing',
  '//   the pre-mutation value, after_value capturing the new value. No row',
  '//   written when the sent value equals the current value.',
  '//',
  '//   DELETE captures a snapshot of the lead before deleting and writes a',
  '//   single lead_deleted audit row with the snapshot in before_value. The',
  '//   snapshot survives the lead\'s destruction because the FK on',
  '//   lead_admin_actions.lead_id was dropped in W6a-1.',
  '//',
  '//   All audit writes use logLeadAdminAction which is never-throw -- a',
  '//   failed audit logs to console but does NOT break the mutation response.',
  '',
  "import { NextRequest, NextResponse } from 'next/server'",
  "import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'",
  "import { createServiceClient } from '@/lib/admin-homes/service-client'",
  "import { can } from '@/lib/admin-homes/permissions'",
  "import { logLeadAdminAction } from '@/lib/admin-homes/log-lead-admin-action'",
  '',
  'export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {',
  '  try {',
  '    const user = await resolveAdminHomesUser()',
  "    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })",
  '    const supabase = createServiceClient()',
  '    // W6a-2: SELECT widened to include status, quality for audit before_value.',
  '    const { data: target } = await supabase',
  "      .from('leads')",
  "      .select('id, tenant_id, agent_id, status, quality')",
  "      .eq('id', params.id)",
  '      .maybeSingle()',
  '    if (!target) {',
  "      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })",
  '    }',
  "    const decision = can(user.permissions, 'lead.write', {",
  "      kind: 'lead',",
  '      leadId: target.id,',
  '      tenantId: target.tenant_id,',
  '      agentId: target.agent_id,',
  '    })',
  '    if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })',
  '',
  '    const { status, quality } = await request.json()',
  '    const update: any = { updated_at: new Date().toISOString() }',
  '    if (status) update.status = status',
  '    if (quality) update.quality = quality',
  '',
  "    const { error } = await supabase.from('leads').update(update).eq('id', params.id)",
  '    if (error) {',
  "      console.error('[admin-homes/leads PATCH] lead-update failed:', { leadId: target.id, tenantId: target.tenant_id, error })",
  '      return NextResponse.json({ error: error.message }, { status: 500 })',
  '    }',
  '',
  '    // W6a-2 audit: one row per field changed. Best-effort (never-throw).',
  "    const actorRole = user.role || (user.isPlatformAdmin ? 'platform_admin' : 'admin')",
  '    const auditWrites: Promise<void>[] = []',
  '    if (status && status !== target.status) {',
  '      auditWrites.push(',
  '        logLeadAdminAction({',
  '          supabase,',
  '          tenantId: target.tenant_id,',
  '          leadId: target.id,',
  '          actorAgentId: user.agentId || null,',
  '          actorRole,',
  "          actionType: 'status_changed',",
  "          targetField: 'status',",
  '          beforeValue: { status: target.status },',
  '          afterValue: { status },',
  "          notes: (target.status == null ? '(null)' : String(target.status)) + ' -> ' + String(status),",
  '        }),',
  '      )',
  '    }',
  '    if (quality && quality !== target.quality) {',
  '      auditWrites.push(',
  '        logLeadAdminAction({',
  '          supabase,',
  '          tenantId: target.tenant_id,',
  '          leadId: target.id,',
  '          actorAgentId: user.agentId || null,',
  '          actorRole,',
  "          actionType: 'quality_changed',",
  "          targetField: 'quality',",
  '          beforeValue: { quality: target.quality },',
  '          afterValue: { quality },',
  "          notes: (target.quality == null ? '(null)' : String(target.quality)) + ' -> ' + String(quality),",
  '        }),',
  '      )',
  '    }',
  '    if (auditWrites.length > 0) {',
  '      await Promise.all(auditWrites)',
  '    }',
  '',
  '    return NextResponse.json({ success: true })',
  '  } catch (error) {',
  "    console.error('[admin-homes/leads PATCH] error:', error)",
  "    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })",
  '  }',
  '}',
  '',
  'export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {',
  '  try {',
  '    const user = await resolveAdminHomesUser()',
  "    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })",
  '    const supabase = createServiceClient()',
  '    // W6a-3: SELECT widened to capture full snapshot for audit before_value.',
  '    // Snapshot survives lead destruction because the FK on',
  '    // lead_admin_actions.lead_id was dropped in W6a-1.',
  '    const { data: target } = await supabase',
  "      .from('leads')",
  "      .select('id, tenant_id, agent_id, contact_name, contact_email, contact_phone, status, quality, source, source_url, intent, geo_name, created_at')",
  "      .eq('id', params.id)",
  '      .maybeSingle()',
  '    if (!target) {',
  "      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })",
  '    }',
  "    const decision = can(user.permissions, 'lead.write', {",
  "      kind: 'lead',",
  '      leadId: target.id,',
  '      tenantId: target.tenant_id,',
  '      agentId: target.agent_id,',
  '    })',
  '    if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })',
  '',
  '    // DELETE additionally restricted: no agent destructive deletes (legacy compliance policy preserved).',
  "    if (!user.isPlatformAdmin && user.permissions.roleDb === 'agent') {",
  "      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })",
  '    }',
  '',
  "    const { error } = await supabase.from('leads').delete().eq('id', params.id)",
  '    if (error) {',
  "      console.error('[admin-homes/leads DELETE] lead-delete failed:', { leadId: target.id, tenantId: target.tenant_id, error })",
  '      return NextResponse.json({ error: error.message }, { status: 500 })',
  '    }',
  '',
  '    // W6a-3 audit: snapshot the deleted lead. Best-effort (never-throw).',
  "    const actorRole = user.role || (user.isPlatformAdmin ? 'platform_admin' : 'admin')",
  '    await logLeadAdminAction({',
  '      supabase,',
  '      tenantId: target.tenant_id,',
  '      leadId: target.id,',
  '      actorAgentId: user.agentId || null,',
  '      actorRole,',
  "      actionType: 'lead_deleted',",
  '      targetField: null,',
  '      beforeValue: {',
  '        contact_name: target.contact_name,',
  '        contact_email: target.contact_email,',
  '        contact_phone: target.contact_phone,',
  '        status: target.status,',
  '        quality: target.quality,',
  '        agent_id: target.agent_id,',
  '        source: target.source,',
  '        source_url: target.source_url,',
  '        intent: target.intent,',
  '        geo_name: target.geo_name,',
  '        created_at: target.created_at,',
  '      },',
  '      afterValue: null,',
  '      notes: target.contact_email || target.contact_name || target.id,',
  '    })',
  '',
  '    return NextResponse.json({ success: true })',
  '  } catch (error) {',
  "    console.error('[admin-homes/leads DELETE] error:', error)",
  "    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })",
  '  }',
  '}',
  '',
]

const newContent = newLines.join(LE)
const newLen = newContent.length

const assertions = [
  ['marker present', newContent.indexOf(MARKER) !== -1],
  ['logLeadAdminAction import present', newContent.indexOf("import { logLeadAdminAction } from '@/lib/admin-homes/log-lead-admin-action'") !== -1],
  ['PATCH SELECT widened to status, quality', newContent.indexOf(".select('id, tenant_id, agent_id, status, quality')") !== -1],
  ['DELETE SELECT widened to snapshot fields', newContent.indexOf("'id, tenant_id, agent_id, contact_name, contact_email, contact_phone, '") !== -1],
  ['status_changed action_type present', newContent.indexOf("actionType: 'status_changed'") !== -1],
  ['quality_changed action_type present', newContent.indexOf("actionType: 'quality_changed'") !== -1],
  ['lead_deleted action_type present', newContent.indexOf("actionType: 'lead_deleted'") !== -1],
  ['PATCH handler signature preserved', newContent.indexOf('export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {') !== -1],
  ['DELETE handler signature preserved', newContent.indexOf('export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {') !== -1],
  ['agent-delete 403 block preserved', newContent.indexOf("if (!user.isPlatformAdmin && user.permissions.roleDb === 'agent') {") !== -1],
  ['can(lead.write) gate present exactly twice', (newContent.match(/const decision = can\(user\.permissions, 'lead\.write'/g) || []).length === 2],
  ['actorRole inline pattern present exactly twice', (newContent.match(/user\.role \|\| \(user\.isPlatformAdmin \? 'platform_admin' : 'admin'\)/g) || []).length === 2],
  ['no stray CRLF in LF file', LE === '\r\n' || newContent.indexOf('\r\n') === -1],
  // W6a FU-B-1: diagnostic must be re-emitted on every re-run.
  ['PATCH error diagnostic in newContent', newContent.indexOf("console.error('[admin-homes/leads PATCH] lead-update failed:'") !== -1],
  ['DELETE error diagnostic in newContent', newContent.indexOf("console.error('[admin-homes/leads DELETE] lead-delete failed:'") !== -1],
]

let allPass = true
console.log('')
console.log('Post-build assertions:')
console.log('-'.repeat(60))
for (const [name, ok] of assertions) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name)
  if (!ok) allPass = false
}
console.log('-'.repeat(60))

if (!allPass) {
  console.error('\nFATAL: assertions failed. NO FILE WRITTEN.')
  process.exit(1)
}

const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const ts =
  now.getFullYear() +
  pad(now.getMonth() + 1) +
  pad(now.getDate()) +
  '_' +
  pad(now.getHours()) +
  pad(now.getMinutes()) +
  pad(now.getSeconds())

fs.copyFileSync(TARGET, TARGET + '.backup_' + ts)
console.log('')
console.log('Backup created:')
console.log('  ' + path.basename(TARGET) + '.backup_' + ts)

fs.writeFileSync(TARGET, newContent, 'utf8')

console.log('')
console.log('File written:')
console.log(
  '  route.ts: ' + origLen + ' -> ' + newLen +
    ' bytes  (net ' + (newLen >= origLen ? '+' : '') + (newLen - origLen) + ')',
)

process.exit(0)