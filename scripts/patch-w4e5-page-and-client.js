// scripts/patch-w4e5-page-and-client.js
// W-LEADS-WORKBENCH W4e.5 (2026-05-14)
// Adds emailLog fetch to page.tsx + plumbs the prop through LeadWorkbenchClient.tsx
// (Props interface only; destructure-and-consume lands in W4e.7).
//
// All-or-nothing: both files backed up first; if any patch fails to match
// exactly once, BOTH files are restored from their backups before any write.

const fs = require('node:fs')
const path = require('node:path')

const FILES = {
  page:   path.join('app', 'admin-homes', 'leads', '[id]', 'page.tsx'),
  client: path.join('app', 'admin-homes', 'leads', '[id]', 'LeadWorkbenchClient.tsx'),
}

for (const [key, p] of Object.entries(FILES)) {
  if (!fs.existsSync(p)) {
    console.error('ABORT: ' + p + ' not found.')
    process.exit(1)
  }
}

const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp = '' + now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) +
              '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds())

const backups = {}
const sources = {}
const eolModes = {}

for (const [key, p] of Object.entries(FILES)) {
  const backupPath = p + '.backup_' + stamp
  fs.copyFileSync(p, backupPath)
  backups[key] = backupPath
  console.log('BACKUP ' + backupPath + ' (' + fs.statSync(backupPath).size + ' bytes)')

  let raw = fs.readFileSync(p, 'utf8')
  eolModes[key] = raw.includes('\r\n') ? 'CRLF' : 'LF'
  if (eolModes[key] === 'CRLF') raw = raw.replace(/\r\n/g, '\n')
  sources[key] = raw
}
console.log('')

const J = (lines) => lines.join('\n')

const patchesByFile = {
  page: [
    {
      name: 'p1_emailLog_decl_and_comment',
      before: J([
        '  // W4d: Activity feed (cumulative visitor + admin timeline across leadFamily)',
        '  // Visitor activities keyed by contact_email; admin actions keyed by lead_id.',
        '  // Both tenant_id-scoped to anchorLead.tenant_id (trusted source from cross-tenant gate).',
        '  let activityFeed: any[] = []',
      ]),
      after: J([
        '  // W4d: Activity feed (cumulative visitor + admin timeline across leadFamily)',
        '  // Visitor activities keyed by contact_email; admin actions keyed by lead_id.',
        '  // W4e: Email log (lead_email_recipients_log rows across leadFamily, lead_id-keyed).',
        '  // All tenant_id-scoped to anchorLead.tenant_id (trusted source from cross-tenant gate).',
        '  let activityFeed: any[] = []',
        '  let emailLog: any[] = []',
      ]),
    },
    {
      name: 'p2_promise_all_destructure',
      before: '    const [activitiesResult, actionsResult] = await Promise.all([',
      after:  '    const [activitiesResult, actionsResult, emailLogResult] = await Promise.all([',
    },
    {
      name: 'p3_promise_all_third_query',
      before: J([
        '      familyIds.length > 0',
        '        ? supabase',
        "            .from('lead_admin_actions')",
        "            .select('id, lead_id, actor_user_id, actor_agent_id, actor_role, action_type, target_field, before_value, after_value, notes, created_at')",
        "            .in('lead_id', familyIds)",
        "            .eq('tenant_id', tenantIdForActivity)",
        "            .order('created_at', { ascending: false })",
        '            .limit(500)',
        '        : Promise.resolve({ data: [] as any[] }),',
        '    ])',
      ]),
      after: J([
        '      familyIds.length > 0',
        '        ? supabase',
        "            .from('lead_admin_actions')",
        "            .select('id, lead_id, actor_user_id, actor_agent_id, actor_role, action_type, target_field, before_value, after_value, notes, created_at')",
        "            .in('lead_id', familyIds)",
        "            .eq('tenant_id', tenantIdForActivity)",
        "            .order('created_at', { ascending: false })",
        '            .limit(500)',
        '        : Promise.resolve({ data: [] as any[] }),',
        '      familyIds.length > 0',
        '        ? supabase',
        "            .from('lead_email_recipients_log')",
        "            .select('id, lead_id, tenant_id, agent_id, recipient_email, recipient_layer, direction, subject, template_key, resend_message_id, status, sent_at, delivered_at, bounced_at, created_at')",
        "            .in('lead_id', familyIds)",
        "            .eq('tenant_id', tenantIdForActivity)",
        "            .order('created_at', { ascending: false })",
        '            .limit(500)',
        '        : Promise.resolve({ data: [] as any[] }),',
        '    ])',
      ]),
    },
    {
      name: 'p4_emailLog_assignment_after_activityFeed_sort',
      before: J([
        '    activityFeed = [...visitorRows, ...adminRows].sort((a: any, b: any) =>',
        '      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()',
        '    )',
        '  }',
      ]),
      after: J([
        '    activityFeed = [...visitorRows, ...adminRows].sort((a: any, b: any) =>',
        '      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()',
        '    )',
        '    emailLog = (emailLogResult.data as any[]) || []',
        '  }',
      ]),
    },
    {
      name: 'p5_jsx_emailLog_prop',
      before: J([
        '      activityFeed={activityFeed}',
        '    />',
      ]),
      after: J([
        '      activityFeed={activityFeed}',
        '      emailLog={emailLog}',
        '    />',
      ]),
    },
  ],
  client: [
    {
      name: 'p6_props_interface_emailLog_field',
      before: J([
        '  activityFeed: ActivityFeedItem[]',
        '}',
      ]),
      after: J([
        '  activityFeed: ActivityFeedItem[]',
        '  emailLog: any[]',
        '}',
      ]),
    },
  ],
}

function restoreAll(reason) {
  console.error('')
  console.error('FAILURE: ' + reason)
  for (const [key, backupPath] of Object.entries(backups)) {
    fs.copyFileSync(backupPath, FILES[key])
    console.error('RESTORED ' + FILES[key] + ' from ' + backupPath)
  }
}

// Apply all patches in-memory; abort on any miss before writing anything.
for (const [key, patches] of Object.entries(patchesByFile)) {
  for (const p of patches) {
    const count = sources[key].split(p.before).length - 1
    if (count !== 1) {
      restoreAll('patch "' + key + ':' + p.name + '" matched ' + count + ' times (expected 1)')
      console.error('  before-snippet (first 80 chars): ' + JSON.stringify(p.before.slice(0, 80)))
      process.exit(1)
    }
    sources[key] = sources[key].replace(p.before, p.after)
    console.log('APPLIED ' + key + ':' + p.name)
  }
}

// All patches succeeded — restore line endings + write.
for (const [key, p] of Object.entries(FILES)) {
  let out = sources[key]
  if (eolModes[key] === 'CRLF') out = out.replace(/\n/g, '\r\n')
  fs.writeFileSync(p, out, 'utf8')
  const size = fs.statSync(p).size
  console.log('WROTE ' + p + ' (' + size + ' bytes)')
}

console.log('')
console.log('=== Verification: lines mentioning emailLog ===')
for (const [key, p] of Object.entries(FILES)) {
  console.log('--- ' + p + ' ---')
  const finalContent = fs.readFileSync(p, 'utf8')
  const lines = finalContent.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('emailLog')) {
      console.log('  L' + String(i+1).padStart(4) + ': ' + lines[i])
    }
  }
}

console.log('')
console.log('Backups:')
for (const [key, b] of Object.entries(backups)) console.log('  ' + b)