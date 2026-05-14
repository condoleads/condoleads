// scripts/patch-w4e7-leadworkbenchclient-wire.js
// W-LEADS-WORKBENCH W4e.7 (2026-05-14)
// Wires EmailsTab into LeadWorkbenchClient.tsx:
//   - import EmailsTab + EmailLogRow type
//   - tighten Props.emailLog from any[] to EmailLogRow[]
//   - destructure emailLog
//   - add tab === 'emails' branch to ternary

const fs = require('node:fs')
const path = require('node:path')

const TARGET = path.join('app', 'admin-homes', 'leads', '[id]', 'LeadWorkbenchClient.tsx')

if (!fs.existsSync(TARGET)) {
  console.error('ABORT: ' + TARGET + ' not found.')
  process.exit(1)
}

const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp = '' + now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) +
              '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds())
const backupPath = TARGET + '.backup_' + stamp

fs.copyFileSync(TARGET, backupPath)
console.log('BACKUP ' + backupPath + ' (' + fs.statSync(backupPath).size + ' bytes)')

let source = fs.readFileSync(TARGET, 'utf8')
const hasCRLF = source.includes('\r\n')
const eolMode = hasCRLF ? 'CRLF' : 'LF'
console.log('LINE_ENDINGS: ' + eolMode)
if (hasCRLF) source = source.replace(/\r\n/g, '\n')

const J = (lines) => lines.join('\n')

const patches = [
  {
    name: 'p1_import_emailsTab',
    before: "import ActivityTab, { ActivityFeedItem } from '@/components/admin-homes/lead-workbench/ActivityTab'",
    after: J([
      "import ActivityTab, { ActivityFeedItem } from '@/components/admin-homes/lead-workbench/ActivityTab'",
      "import EmailsTab, { EmailLogRow } from '@/components/admin-homes/lead-workbench/EmailsTab'",
    ]),
  },
  {
    name: 'p2_props_tighten_emailLog_type',
    before: J([
      '  activityFeed: ActivityFeedItem[]',
      '  emailLog: any[]',
      '}',
    ]),
    after: J([
      '  activityFeed: ActivityFeedItem[]',
      '  emailLog: EmailLogRow[]',
      '}',
    ]),
  },
  {
    name: 'p3_function_signature_destructure_emailLog',
    before: 'export default function LeadWorkbenchClient({ anchorLead, leadFamily, currentRole, currentAgentId, userCredit, adminUser, activityFeed }: Props) {',
    after:  'export default function LeadWorkbenchClient({ anchorLead, leadFamily, currentRole, currentAgentId, userCredit, adminUser, activityFeed, emailLog }: Props) {',
  },
  {
    name: 'p4_ternary_emails_branch',
    before: J([
      "        ) : tab === 'activity' ? (",
      '          <ActivityTab activityFeed={activityFeed} leadFamily={leadFamily} anchorLeadId={anchorLead.id} />',
      '        ) : (',
      '          <PlaceholderTab name={activeTabMeta.label} phase={activeTabMeta.phase} />',
      '        )}',
    ]),
    after: J([
      "        ) : tab === 'activity' ? (",
      '          <ActivityTab activityFeed={activityFeed} leadFamily={leadFamily} anchorLeadId={anchorLead.id} />',
      "        ) : tab === 'emails' ? (",
      '          <EmailsTab emailLog={emailLog} leadFamily={leadFamily} anchorLeadId={anchorLead.id} />',
      '        ) : (',
      '          <PlaceholderTab name={activeTabMeta.label} phase={activeTabMeta.phase} />',
      '        )}',
    ]),
  },
]

for (const p of patches) {
  const count = source.split(p.before).length - 1
  if (count !== 1) {
    console.error('ABORT: patch "' + p.name + '" matched ' + count + ' times (expected 1).')
    console.error('  before-snippet (first 80 chars): ' + JSON.stringify(p.before.slice(0, 80)))
    fs.copyFileSync(backupPath, TARGET)
    console.error('RESTORED from backup; no changes written.')
    process.exit(1)
  }
  source = source.replace(p.before, p.after)
  console.log('APPLIED ' + p.name)
}

if (hasCRLF) source = source.replace(/\n/g, '\r\n')

fs.writeFileSync(TARGET, source, 'utf8')
const finalSize = fs.statSync(TARGET).size
console.log('')
console.log('WROTE ' + TARGET + ' (' + finalSize + ' bytes)')

console.log('')
console.log('=== Verification: lines mentioning EmailsTab or emailLog ===')
const finalContent = fs.readFileSync(TARGET, 'utf8')
const lines = finalContent.split(/\r?\n/)
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('EmailsTab') || lines[i].includes('emailLog') || lines[i].includes('EmailLogRow')) {
    console.log('L' + String(i+1).padStart(4) + ': ' + lines[i])
  }
}

console.log('')
console.log('Backup: ' + backupPath)