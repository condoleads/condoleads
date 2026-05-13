const fs = require('fs')
const path = 'C:/Condoleads/project/lib/admin-homes/lead-email-recipients.ts'

const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')
console.log('Detected line ending:', useCRLF ? 'CRLF' : 'LF')

let content = original.replace(/\r\n/g, '\n')

const replacements = [
  {
    name: '1. resolved interface — add delegate fields',
    old: '  resolved: {\n    agent: string | null\n    manager: string | null\n    area_manager: string | null\n    tenant_admin: string | null\n    manager_platforms: string[]\n    admin_platforms: string[]\n  }',
    new: '  resolved: {\n    agent: string | null\n    manager: string | null\n    area_manager: string | null\n    tenant_admin: string | null\n    manager_platforms: string[]\n    admin_platforms: string[]\n    /** W-ROLES-DELEGATION R7 \u2014 active delegates of each layer-1\u20134 principal. */\n    agent_delegates: string[]\n    manager_delegates: string[]\n    area_manager_delegates: string[]\n    tenant_admin_delegates: string[]\n  }'
  },
  {
    name: '2. resolved initializer — add delegate arrays',
    old: '  const resolved: LeadEmailRecipients[\'resolved\'] = {\n    agent: null,\n    manager: null,\n    area_manager: null,\n    tenant_admin: null,\n    manager_platforms: [],\n    admin_platforms: [],\n  }',
    new: '  const resolved: LeadEmailRecipients[\'resolved\'] = {\n    agent: null,\n    manager: null,\n    area_manager: null,\n    tenant_admin: null,\n    manager_platforms: [],\n    admin_platforms: [],\n    agent_delegates: [],\n    manager_delegates: [],\n    area_manager_delegates: [],\n    tenant_admin_delegates: [],\n  }'
  },
  {
    name: '3. Hoist chain out of walker if-block',
    old: '  // \u2500\u2500\u2500 Layers 2\u20134: walker (manager / area_manager / tenant_admin) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  if (agentId) {\n    const chain = await walkHierarchy(agentId, supabase)\n\n    // Resolve emails for any walker-classified ancestor in one query',
    new: '  // \u2500\u2500\u2500 Layers 2\u20134: walker (manager / area_manager / tenant_admin) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  // R7: walker hoisted to outer scope so the delegation overlay block below\n  // can reuse the chain without a second walkHierarchy round-trip.\n  const chain = agentId ? await walkHierarchy(agentId, supabase) : null\n  if (chain) {\n    // Resolve emails for any walker-classified ancestor in one query',
  },
  {
    name: '4. Insert delegation overlay block before Layer 5',
    old: '  // \u2500\u2500\u2500 Layer 5: Manager Platforms assigned to this tenant \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  // Two-step query (cleaner than nested-join type inference):',
    new: '  // \u2500\u2500\u2500 Layers 1\u20134 delegation overlay (W-ROLES-DELEGATION R7) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  // For each populated principal at layers 1\u20134, fetch active delegates and add\n  // their notification_email to BCC. Single batched query; in-memory map keyed\n  // by delegator. Layers 5\u20136 are platform_admins (different table); their\n  // delegation overlay would require a parallel mechanism \u2014 out of R7 scope.\n  const principalAgentIds: string[] = [\n    agentId,\n    chain?.manager_id ?? null,\n    chain?.area_manager_id ?? null,\n    chain?.tenant_admin_id ?? null,\n  ].filter((x): x is string => !!x)\n\n  const delegateEmailsByDelegator = new Map<string, string[]>()\n  if (principalAgentIds.length > 0) {\n    const { data: delegationRows } = await supabase\n      .from(\'agent_delegations\')\n      .select(\'delegator_id, delegate_id\')\n      .in(\'delegator_id\', principalAgentIds)\n      .eq(\'tenant_id\', tenantId)\n      .is(\'revoked_at\', null)\n\n    const delegateIds = (delegationRows || [])\n      .map(r => (r as { delegator_id: string; delegate_id: string }).delegate_id)\n\n    if (delegateIds.length > 0) {\n      const { data: delegateAgentRows } = await supabase\n        .from(\'agents\')\n        .select(\'id, email, notification_email\')\n        .in(\'id\', delegateIds)\n\n      const emailByDelegateId = new Map<string, string | null>()\n      for (const r of (delegateAgentRows || []) as AgentEmailRow[]) {\n        emailByDelegateId.set(r.id, r.notification_email || r.email || null)\n      }\n\n      for (const d of (delegationRows || []) as Array<{ delegator_id: string; delegate_id: string }>) {\n        const email = emailByDelegateId.get(d.delegate_id)\n        if (email) {\n          const arr = delegateEmailsByDelegator.get(d.delegator_id) || []\n          arr.push(email)\n          delegateEmailsByDelegator.set(d.delegator_id, arr)\n        }\n      }\n\n      // Populate diagnostic resolved.* fields\n      if (agentId) resolved.agent_delegates = delegateEmailsByDelegator.get(agentId) || []\n      if (chain?.manager_id) resolved.manager_delegates = delegateEmailsByDelegator.get(chain.manager_id) || []\n      if (chain?.area_manager_id) resolved.area_manager_delegates = delegateEmailsByDelegator.get(chain.area_manager_id) || []\n      if (chain?.tenant_admin_id) resolved.tenant_admin_delegates = delegateEmailsByDelegator.get(chain.tenant_admin_id) || []\n    }\n  }\n\n  // \u2500\u2500\u2500 Layer 5: Manager Platforms assigned to this tenant \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  // Two-step query (cleaner than nested-join type inference):'
  },
  {
    name: '5. Push delegate emails into BCC in assembly',
    old: '  // Layer 4 \u2192 BCC\n  if (tenantAdminEmail) bcc.push(tenantAdminEmail)\n  // Layer 5 \u2192 BCC\n  for (const e of managerPlatformEmails) bcc.push(e)',
    new: '  // Layer 4 \u2192 BCC\n  if (tenantAdminEmail) bcc.push(tenantAdminEmail)\n  // Layers 1\u20134 delegate overlay \u2192 BCC (W-ROLES-DELEGATION R7)\n  for (const emails of delegateEmailsByDelegator.values()) {\n    for (const e of emails) bcc.push(e)\n  }\n  // Layer 5 \u2192 BCC\n  for (const e of managerPlatformEmails) bcc.push(e)'
  },
]

for (const r of replacements) {
  const occurrences = content.split(r.old).length - 1
  if (occurrences === 0) { console.error('NOT FOUND:', r.name); process.exit(1) }
  if (occurrences > 1) { console.error('NOT UNIQUE:', r.name, '(occurrences:', occurrences, ')'); process.exit(1) }
  content = content.replace(r.old, r.new)
  console.log('  Patched:', r.name)
}

const finalContent = useCRLF ? content.replace(/\n/g, '\r\n') : content
fs.writeFileSync(path, finalContent, 'utf8')

console.log('Original size:', original.length)
console.log('New size:', finalContent.length)
console.log('Delta:', finalContent.length - original.length)