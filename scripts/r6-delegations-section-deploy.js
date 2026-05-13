// scripts/r6-delegations-section-deploy.js
// W-ROLES-DELEGATION/R6 - Delegation grant/revoke/list UI.
//
// Creates components/admin-homes/DelegationsSection.tsx (new file) and patches
// app/admin-homes/agents/[id]/page.tsx to import and render it.
//
// Idempotent: aborts before any write if either anchor in the page does not
// match exactly once, or if the new component file already exists.
// Backup of the page is taken with a timestamp before patching.
// CRLF-aware: detects existing line endings and preserves them.
//
// Usage: node scripts/r6-delegations-section-deploy.js

const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = process.cwd()
const STAMP = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)

console.log('[R6-DEPLOY] W-ROLES-DELEGATION/R6 - Delegation UI section')
console.log('[R6-DEPLOY] STAMP=' + STAMP)
console.log('[R6-DEPLOY] PROJECT_ROOT=' + PROJECT_ROOT)
console.log('')

// ────────────────────────────────────────────────────────────────────────────
// 1. New file: components/admin-homes/DelegationsSection.tsx
// ────────────────────────────────────────────────────────────────────────────
const NEW_FILE_REL = "components/admin-homes/DelegationsSection.tsx"
const NEW_FILE_LINES = [
  "// components/admin-homes/DelegationsSection.tsx",
  "// W-ROLES-DELEGATION/R6 - Delegation grant/revoke/list UI.",
  "// Stacks below the assignment sections on /admin-homes/agents/[id].",
  "//",
  "// Behavior:",
  "//   - Lists active delegations where this agent is delegator OR delegate",
  "//   - Grant form: pick another agent in the tenant + optional notes",
  "//   - Revoke buttons on rows where this agent is the delegator",
  "//   - Permission enforcement is at the API (R5 routes); 403s surface inline",
  "//",
  "// API contracts (R5):",
  "//   GET    /api/admin-homes/delegations?agent_id=<uuid>",
  "//   POST   /api/admin-homes/delegations  body: { delegator_id, delegate_id, notes? }",
  "//   DELETE /api/admin-homes/delegations/[id]  body: { reason? }",
  "",
  "'use client'",
  "",
  "import { useState, useEffect } from 'react'",
  "import { Users, UserPlus, X, AlertCircle, Loader2 } from 'lucide-react'",
  "",
  "interface Delegation {",
  "  id: string",
  "  delegator_id: string",
  "  delegate_id: string",
  "  tenant_id: string",
  "  granted_at: string",
  "  granted_by: string",
  "  revoked_at: string | null",
  "  revoked_by: string | null",
  "  notes: string | null",
  "}",
  "",
  "interface AgentLite {",
  "  id: string",
  "  full_name: string | null",
  "  email: string | null",
  "  tenant_id: string | null",
  "}",
  "",
  "interface Props {",
  "  agentId: string",
  "}",
  "",
  "export default function DelegationsSection({ agentId }: Props) {",
  "  const [delegations, setDelegations] = useState<Delegation[]>([])",
  "  const [agents, setAgents] = useState<AgentLite[]>([])",
  "  const [loading, setLoading] = useState(true)",
  "  const [error, setError] = useState<string | null>(null)",
  "",
  "  // Grant form state",
  "  const [grantDelegateId, setGrantDelegateId] = useState('')",
  "  const [grantNotes, setGrantNotes] = useState('')",
  "  const [granting, setGranting] = useState(false)",
  "",
  "  // Per-row revoke state",
  "  const [revokingId, setRevokingId] = useState<string | null>(null)",
  "",
  "  // Initial fetch (delegations for this agent + tenant agent list for dropdown)",
  "  useEffect(() => {",
  "    let cancelled = false",
  "    const load = async () => {",
  "      setLoading(true)",
  "      setError(null)",
  "      try {",
  "        const [delRes, agRes] = await Promise.all([",
  "          fetch(`/api/admin-homes/delegations?agent_id=${encodeURIComponent(agentId)}`),",
  "          fetch('/api/admin-homes/agents'),",
  "        ])",
  "        if (!delRes.ok) throw new Error(`Failed to load delegations (${delRes.status})`)",
  "        if (!agRes.ok) throw new Error(`Failed to load agents (${agRes.status})`)",
  "        const delJson = await delRes.json()",
  "        const agJson = await agRes.json()",
  "        if (cancelled) return",
  "        setDelegations(delJson.delegations ?? [])",
  "        setAgents(agJson.agents ?? [])",
  "      } catch (e) {",
  "        if (cancelled) return",
  "        setError(e instanceof Error ? e.message : 'Load failed')",
  "      } finally {",
  "        if (!cancelled) setLoading(false)",
  "      }",
  "    }",
  "    load()",
  "    return () => { cancelled = true }",
  "  }, [agentId])",
  "",
  "  // Derived data",
  "  const grantedByThis = delegations.filter(",
  "    d => d.delegator_id === agentId && d.revoked_at === null,",
  "  )",
  "  const grantedToThis = delegations.filter(",
  "    d => d.delegate_id === agentId && d.revoked_at === null,",
  "  )",
  "",
  "  const activeDelegateIds = new Set(grantedByThis.map(d => d.delegate_id))",
  "  const eligibleDelegates = agents.filter(",
  "    a => a.id !== agentId && !activeDelegateIds.has(a.id),",
  "  )",
  "",
  "  const agentLookup = new Map(agents.map(a => [a.id, a]))",
  "  const nameOf = (id: string) =>",
  "    agentLookup.get(id)?.full_name ?? agentLookup.get(id)?.email ?? id.slice(0, 8) + '...'",
  "",
  "  // Actions",
  "  const handleGrant = async () => {",
  "    if (!grantDelegateId) return",
  "    setGranting(true)",
  "    setError(null)",
  "    try {",
  "      const res = await fetch('/api/admin-homes/delegations', {",
  "        method: 'POST',",
  "        headers: { 'Content-Type': 'application/json' },",
  "        body: JSON.stringify({",
  "          delegator_id: agentId,",
  "          delegate_id: grantDelegateId,",
  "          notes: grantNotes.trim() || undefined,",
  "        }),",
  "      })",
  "      const json = await res.json()",
  "      if (!res.ok) throw new Error(json?.error ?? `Grant failed (${res.status})`)",
  "      // POST returns { delegation_id, ... }; refetch list for full row data.",
  "      const refresh = await fetch(",
  "        `/api/admin-homes/delegations?agent_id=${encodeURIComponent(agentId)}`,",
  "      )",
  "      if (refresh.ok) {",
  "        const rj = await refresh.json()",
  "        setDelegations(rj.delegations ?? [])",
  "      }",
  "      setGrantDelegateId('')",
  "      setGrantNotes('')",
  "    } catch (e) {",
  "      setError(e instanceof Error ? e.message : 'Grant failed')",
  "    } finally {",
  "      setGranting(false)",
  "    }",
  "  }",
  "",
  "  const handleRevoke = async (id: string) => {",
  "    if (!confirm('Revoke this delegation? The delegate will no longer act on behalf of this agent.')) return",
  "    setRevokingId(id)",
  "    setError(null)",
  "    try {",
  "      const res = await fetch(`/api/admin-homes/delegations/${id}`, { method: 'DELETE' })",
  "      const json = await res.json()",
  "      if (!res.ok) throw new Error(json?.error ?? `Revoke failed (${res.status})`)",
  "      setDelegations(prev =>",
  "        prev.map(d =>",
  "          d.id === id",
  "            ? { ...d, revoked_at: json.delegation?.revoked_at ?? new Date().toISOString() }",
  "            : d,",
  "        ),",
  "      )",
  "    } catch (e) {",
  "      setError(e instanceof Error ? e.message : 'Revoke failed')",
  "    } finally {",
  "      setRevokingId(null)",
  "    }",
  "  }",
  "",
  "  // Render",
  "  if (loading) {",
  "    return (",
  "      <section className=\"bg-white rounded-lg shadow-sm border border-gray-200 p-6\">",
  "        <h2 className=\"text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2\">",
  "          <Users size={20} /> Delegations",
  "        </h2>",
  "        <div className=\"text-gray-500 flex items-center gap-2\">",
  "          <Loader2 size={16} className=\"animate-spin\" /> Loading...",
  "        </div>",
  "      </section>",
  "    )",
  "  }",
  "",
  "  return (",
  "    <section className=\"bg-white rounded-lg shadow-sm border border-gray-200 p-6\">",
  "      <h2 className=\"text-xl font-semibold text-gray-900 mb-1 flex items-center gap-2\">",
  "        <Users size={20} /> Delegations",
  "      </h2>",
  "      <p className=\"text-sm text-gray-500 mb-6\">",
  "        When this agent grants a delegation, the delegate receives BCC on every lead",
  "        email and gains scoped authority until the delegation is revoked.",
  "      </p>",
  "",
  "      {error && (",
  "        <div className=\"mb-4 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 flex items-start gap-2\">",
  "          <AlertCircle size={16} className=\"flex-shrink-0 mt-0.5\" />",
  "          <span>{error}</span>",
  "        </div>",
  "      )}",
  "",
  "      <div className=\"mb-6\">",
  "        <h3 className=\"text-sm font-medium text-gray-700 mb-2\">",
  "          Active delegations granted by this agent",
  "        </h3>",
  "        {grantedByThis.length === 0 ? (",
  "          <p className=\"text-sm text-gray-500 italic\">None.</p>",
  "        ) : (",
  "          <ul className=\"divide-y divide-gray-100 border border-gray-200 rounded\">",
  "            {grantedByThis.map(d => (",
  "              <li key={d.id} className=\"flex items-start justify-between gap-4 px-4 py-3\">",
  "                <div className=\"min-w-0\">",
  "                  <div className=\"font-medium text-gray-900\">{nameOf(d.delegate_id)}</div>",
  "                  <div className=\"text-xs text-gray-500\">",
  "                    Granted {new Date(d.granted_at).toLocaleString()}",
  "                  </div>",
  "                  {d.notes && (",
  "                    <div className=\"text-sm text-gray-600 mt-1\">{d.notes}</div>",
  "                  )}",
  "                </div>",
  "                <button",
  "                  type=\"button\"",
  "                  onClick={() => handleRevoke(d.id)}",
  "                  disabled={revokingId === d.id}",
  "                  className=\"flex-shrink-0 inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 disabled:opacity-50\"",
  "                >",
  "                  {revokingId === d.id ? (",
  "                    <Loader2 size={14} className=\"animate-spin\" />",
  "                  ) : (",
  "                    <X size={14} />",
  "                  )}",
  "                  Revoke",
  "                </button>",
  "              </li>",
  "            ))}",
  "          </ul>",
  "        )}",
  "      </div>",
  "",
  "      {grantedToThis.length > 0 && (",
  "        <div className=\"mb-6\">",
  "          <h3 className=\"text-sm font-medium text-gray-700 mb-2\">",
  "            Active delegations granted to this agent",
  "          </h3>",
  "          <ul className=\"divide-y divide-gray-100 border border-gray-200 rounded\">",
  "            {grantedToThis.map(d => (",
  "              <li key={d.id} className=\"px-4 py-3\">",
  "                <div className=\"font-medium text-gray-900\">",
  "                  From {nameOf(d.delegator_id)}",
  "                </div>",
  "                <div className=\"text-xs text-gray-500\">",
  "                  Granted {new Date(d.granted_at).toLocaleString()}",
  "                </div>",
  "                {d.notes && (",
  "                  <div className=\"text-sm text-gray-600 mt-1\">{d.notes}</div>",
  "                )}",
  "              </li>",
  "            ))}",
  "          </ul>",
  "        </div>",
  "      )}",
  "",
  "      <div className=\"border-t border-gray-200 pt-6\">",
  "        <h3 className=\"text-sm font-medium text-gray-700 mb-3 flex items-center gap-2\">",
  "          <UserPlus size={16} /> Grant a new delegation",
  "        </h3>",
  "        {eligibleDelegates.length === 0 ? (",
  "          <p className=\"text-sm text-gray-500 italic\">",
  "            No eligible delegates - all other agents in this tenant are already active",
  "            delegates of this agent.",
  "          </p>",
  "        ) : (",
  "          <div className=\"space-y-3\">",
  "            <div>",
  "              <label className=\"block text-xs font-medium text-gray-700 mb-1\">",
  "                Delegate",
  "              </label>",
  "              <select",
  "                value={grantDelegateId}",
  "                onChange={e => setGrantDelegateId(e.target.value)}",
  "                disabled={granting}",
  "                className=\"w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500\"",
  "              >",
  "                <option value=\"\">Select an agent...</option>",
  "                {eligibleDelegates.map(a => (",
  "                  <option key={a.id} value={a.id}>",
  "                    {a.full_name ?? a.email ?? a.id.slice(0, 8)}",
  "                  </option>",
  "                ))}",
  "              </select>",
  "            </div>",
  "            <div>",
  "              <label className=\"block text-xs font-medium text-gray-700 mb-1\">",
  "                Notes (optional)",
  "              </label>",
  "              <textarea",
  "                value={grantNotes}",
  "                onChange={e => setGrantNotes(e.target.value)}",
  "                disabled={granting}",
  "                rows={2}",
  "                placeholder=\"e.g. Maternity leave coverage Apr-Aug 2026\"",
  "                className=\"w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500\"",
  "              />",
  "            </div>",
  "            <button",
  "              type=\"button\"",
  "              onClick={handleGrant}",
  "              disabled={!grantDelegateId || granting}",
  "              className=\"inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-4 py-2 rounded text-sm font-medium\"",
  "            >",
  "              {granting ? (",
  "                <Loader2 size={14} className=\"animate-spin\" />",
  "              ) : (",
  "                <UserPlus size={14} />",
  "              )}",
  "              Grant Delegation",
  "            </button>",
  "          </div>",
  "        )}",
  "      </div>",
  "    </section>",
  "  )",
  "}",
  "",
]

// ────────────────────────────────────────────────────────────────────────────
// 2. Patches to app/admin-homes/agents/[id]/page.tsx
// ────────────────────────────────────────────────────────────────────────────
const PAGE_REL = "app/admin-homes/agents/[id]/page.tsx"

// Patch 1: import line — appended directly after ListingAssignmentSection import.
const PATCH1_OLD = "import ListingAssignmentSection from '@/components/admin-homes/ListingAssignmentSection'"
const PATCH1_NEW_TAIL = "\nimport DelegationsSection from '@/components/admin-homes/DelegationsSection'"

// Patch 2: render — insert <DelegationsSection /> between the existing
// <ListingAssignmentSection> and the closing </div> of the assignment-sections container.
const PATCH2_OLD_LINES = [
  "        <ListingAssignmentSection",
  "          agentId={params.id}",
  "        />",
  "      </div>",
]
const PATCH2_NEW_LINES = [
  "        <ListingAssignmentSection",
  "          agentId={params.id}",
  "        />",
  "        <DelegationsSection",
  "          agentId={params.id}",
  "        />",
  "      </div>",
]

// ────────────────────────────────────────────────────────────────────────────
// Phase 1: pre-flight (verify everything before any write)
// ────────────────────────────────────────────────────────────────────────────
const newFileAbs = path.join(PROJECT_ROOT, NEW_FILE_REL)
const pageAbs = path.join(PROJECT_ROOT, PAGE_REL)

if (fs.existsSync(newFileAbs)) {
  console.error('[R6-DEPLOY] REFUSE: ' + NEW_FILE_REL + ' already exists.')
  process.exit(1)
}
if (!fs.existsSync(pageAbs)) {
  console.error('[R6-DEPLOY] MISSING target page: ' + PAGE_REL)
  process.exit(1)
}

const pageOriginal = fs.readFileSync(pageAbs, 'utf8')
const usesCRLF = pageOriginal.includes('\r\n')
const lineEnd = usesCRLF ? '\r\n' : '\n'
console.log('[R6-DEPLOY] Page line endings: ' + (usesCRLF ? 'CRLF' : 'LF'))

const PATCH2_OLD = PATCH2_OLD_LINES.join(lineEnd)
const PATCH2_NEW = PATCH2_NEW_LINES.join(lineEnd)
const PATCH1_NEW = PATCH1_OLD + PATCH1_NEW_TAIL.replace(/\n/g, lineEnd)

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const count1 = (pageOriginal.match(new RegExp(escapeRe(PATCH1_OLD), 'g')) || []).length
const count2 = (pageOriginal.match(new RegExp(escapeRe(PATCH2_OLD), 'g')) || []).length

console.log('[R6-DEPLOY] PATCH1 anchor matches: ' + count1 + ' (need 1)')
console.log('[R6-DEPLOY] PATCH2 anchor matches: ' + count2 + ' (need 1)')

if (count1 !== 1) {
  console.error('[R6-DEPLOY] ABORT: PATCH1 anchor does not match exactly once. No files written.')
  process.exit(1)
}
if (count2 !== 1) {
  console.error('[R6-DEPLOY] ABORT: PATCH2 anchor does not match exactly once. No files written.')
  process.exit(1)
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2: write the new component file
// ────────────────────────────────────────────────────────────────────────────
fs.mkdirSync(path.dirname(newFileAbs), { recursive: true })
fs.writeFileSync(newFileAbs, NEW_FILE_LINES.join('\n'), 'utf8')
const newSize = fs.statSync(newFileAbs).size
console.log('[R6-DEPLOY] WROTE  ' + NEW_FILE_REL + '  (' + newSize + ' bytes)')

// ────────────────────────────────────────────────────────────────────────────
// Phase 3: backup the page, apply both patches, write back
// ────────────────────────────────────────────────────────────────────────────
const pageBak = pageAbs + '.backup_' + STAMP
fs.copyFileSync(pageAbs, pageBak)
console.log('[R6-DEPLOY] BACKUP ' + path.basename(pageBak))

let updated = pageOriginal.replace(PATCH1_OLD, PATCH1_NEW)
if (updated === pageOriginal) {
  console.error('[R6-DEPLOY] ABORT: PATCH1 was a no-op (replace did nothing).')
  process.exit(1)
}

const updated2 = updated.replace(PATCH2_OLD, PATCH2_NEW)
if (updated2 === updated) {
  console.error('[R6-DEPLOY] ABORT: PATCH2 was a no-op (replace did nothing).')
  process.exit(1)
}

fs.writeFileSync(pageAbs, updated2, 'utf8')
const pageNewSize = fs.statSync(pageAbs).size
console.log('[R6-DEPLOY] PATCH  ' + PAGE_REL + '  (' + pageNewSize + ' bytes)')

console.log('')
console.log('[R6-DEPLOY] Done. Next steps:')
console.log('  1. npx tsc --noEmit')
console.log('  2. Manual test: open /admin-homes/agents/<some-agent-id> in dev')
console.log('  3. git add components/admin-homes/DelegationsSection.tsx app/admin-homes/agents')
console.log('  4. git commit -m "W-ROLES-DELEGATION/R6 - Delegation grant/revoke UI"')
console.log('  5. git push')
console.log('')