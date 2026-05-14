#!/usr/bin/env node
/**
 * patch-w-leads-workbench-w4g-notes-tab.js
 *
 * W-LEADS-WORKBENCH W4g (2026-05-14) -- Notes tab + Add note inline.
 *
 * CREATES (2):
 *   app/api/admin-homes/leads/[id]/notes/route.ts
 *   components/admin-homes/lead-workbench/NotesTab.tsx
 *
 * MODIFIES (2):
 *   app/admin-homes/leads/[id]/page.tsx           (5th parallel query for lead_notes)
 *   app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx  (import + Props + dispatch)
 *
 * DOES NOT TOUCH:
 *   lib/actions/lead-management.ts  (System 1; INSERT shape mirrored instead)
 *   app/dashboard/leads/[id]/page.tsx  (System 1)
 *
 * Findings logged in W4g status log entry:
 *   F-LEAD-NOTES-AUTHOR-FALLBACK-LOSSY -- agent_id fallback to lead.agent_id when
 *     user.agentId is null. NotesTab display attributes to lead.agent, not typist.
 *     ActivityTab shows precise actor via lead_admin_actions.actor_agent_id.
 *   F-LEAD-NOTES-DUAL-SYSTEM-READERS -- System 1 (dashboard) and System 2
 *     (admin-homes) both read/write lead_notes. Schema changes require
 *     coordination.
 *
 * No schema migration: lead_notes columns already match the System 1 INSERT
 *   shape; lead_admin_actions.action_type is free-form (verified W4f).
 *
 * Atomic: all validations pass for all 4 files BEFORE any write.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const d = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp =
  d.getFullYear() +
  pad(d.getMonth() + 1) +
  pad(d.getDate()) +
  '_' +
  pad(d.getHours()) +
  pad(d.getMinutes()) +
  pad(d.getSeconds())

const PATH_ROUTE = path.join(
  ROOT,
  'app',
  'api',
  'admin-homes',
  'leads',
  '[id]',
  'notes',
  'route.ts',
)
const PATH_TAB = path.join(
  ROOT,
  'components',
  'admin-homes',
  'lead-workbench',
  'NotesTab.tsx',
)
const PATH_PAGE = path.join(
  ROOT,
  'app',
  'admin-homes',
  'leads',
  '[id]',
  'page.tsx',
)
const PATH_CLIENT = path.join(
  ROOT,
  'app',
  'admin-homes',
  'leads',
  '[id]',
  'LeadWorkbenchClient.tsx',
)

// ============================================================================
// PRE-FLIGHT
// ============================================================================

if (fs.existsSync(PATH_ROUTE)) {
  throw new Error('NEW file already exists (refusing to overwrite): ' + PATH_ROUTE)
}
if (fs.existsSync(PATH_TAB)) {
  throw new Error('NEW file already exists (refusing to overwrite): ' + PATH_TAB)
}
if (!fs.existsSync(PATH_PAGE)) {
  throw new Error('EXISTING file missing: ' + PATH_PAGE)
}
if (!fs.existsSync(PATH_CLIENT)) {
  throw new Error('EXISTING file missing: ' + PATH_CLIENT)
}

function detectLE(filePath) {
  const buf = fs.readFileSync(filePath)
  let crlf = 0
  let lfOnly = 0
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      if (i > 0 && buf[i - 1] === 0x0d) crlf++
      else lfOnly++
    }
  }
  if (crlf > 0 && lfOnly === 0) return 'crlf'
  if (lfOnly > 0 && crlf === 0) return 'lf'
  throw new Error('mixed or no LE: ' + filePath)
}

const PAGE_LE = detectLE(PATH_PAGE)
const CLIENT_LE = detectLE(PATH_CLIENT)
console.log('LE detected -- page.tsx: ' + PAGE_LE + ', LeadWorkbenchClient.tsx: ' + CLIENT_LE)

// ============================================================================
// NEW FILE 1: app/api/admin-homes/leads/[id]/notes/route.ts
// ============================================================================

const ROUTE_CONTENT = [
  "// app/api/admin-homes/leads/[id]/notes/route.ts",
  "// W-LEADS-WORKBENCH W4g (2026-05-14)",
  "//",
  "// POST endpoint for adding a note to a lead. Mirrors the existing System 1",
  "// addLeadNote INSERT shape (from lib/actions/lead-management.ts L59-67) so",
  "// rows written by either system are mutually readable. System 1 file is",
  "// UNTOUCHED -- this endpoint does its own INSERT directly against lead_notes.",
  "//",
  "// MULTITENANT CONTRACT (Rule Zero #1)",
  "//   - lead_notes has no tenant_id column (F-LEAD-NOTES-NO-TENANT-ID-COLUMN).",
  "//   - Tenant safety derives from lead.tenant_id verified before INSERT.",
  "//   - lead_id FK to leads.id provides implicit tenant binding for reads.",
  "//",
  "// AUTHOR RESOLUTION (b) -- fallback chain",
  "//   1. user.agentId (if the actor has an agents row in this tenant)",
  "//   2. lead.agent_id (the lead's owning agent)",
  "// Both options write a valid agent_id to lead_notes (NOT NULL satisfied).",
  "// The precise actor (e.g. platform_admin Syed Shah) is captured in",
  "// lead_admin_actions.actor_agent_id + actor_role. NotesTab UI attributes",
  "// to lead_notes.agent_id; ActivityTab shows the precise actor.",
  "//",
  "// PERMISSION CONTRACT",
  "//   can(user.permissions, 'lead.write', { kind: 'lead', ... }) -- same gate",
  "//   as PATCH and W4e send-email. Adding a note is a write-class action.",
  "//",
  "// REQUEST BODY",
  "//   { note: string }  // 1..10000 chars after trim",
  "//",
  "// AUDIT",
  "//   logLeadAdminAction writes one row with action_type='note_added' and",
  "//   after_value containing { note_id, note_length, note_preview (first 80",
  "//   chars), agent_id (resolved), via_fallback (true if used lead.agent_id) }.",
  "//   Audit is best-effort (never-throw).",
  "",
  "import { NextRequest, NextResponse } from 'next/server'",
  "import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'",
  "import { createServiceClient } from '@/lib/admin-homes/service-client'",
  "import { can } from '@/lib/admin-homes/permissions'",
  "import { logLeadAdminAction } from '@/lib/admin-homes/log-lead-admin-action'",
  "",
  "const MAX_NOTE_LEN = 10_000",
  "",
  "export async function POST(request: NextRequest, { params }: { params: { id: string } }) {",
  "  try {",
  "    const user = await resolveAdminHomesUser()",
  "    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })",
  "",
  "    const supabase = createServiceClient()",
  "",
  "    const { data: lead } = await supabase",
  "      .from('leads')",
  "      .select('id, tenant_id, agent_id')",
  "      .eq('id', params.id)",
  "      .maybeSingle()",
  "",
  "    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })",
  "",
  "    const decision = can(user.permissions, 'lead.write', {",
  "      kind: 'lead',",
  "      leadId: lead.id,",
  "      tenantId: lead.tenant_id,",
  "      agentId: lead.agent_id,",
  "    })",
  "    if (!decision.ok) {",
  "      return NextResponse.json({ error: decision.reason }, { status: decision.status })",
  "    }",
  "",
  "    let body: any",
  "    try {",
  "      body = await request.json()",
  "    } catch {",
  "      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })",
  "    }",
  "    const rawNote = typeof body?.note === 'string' ? body.note : ''",
  "    const note = rawNote.trim()",
  "    if (!note) {",
  "      return NextResponse.json({ error: 'Note is required' }, { status: 400 })",
  "    }",
  "    if (note.length > MAX_NOTE_LEN) {",
  "      return NextResponse.json(",
  "        { error: 'Note exceeds ' + MAX_NOTE_LEN + ' chars', length: note.length },",
  "        { status: 400 },",
  "      )",
  "    }",
  "",
  "    // Author resolution: prefer the user's own agent_id; fall back to the",
  "    // lead's owning agent when the user has no agents row in this tenant",
  "    // (typical for platform admins viewing a tenant lead).",
  "    const resolvedAgentId: string | null = user.agentId || lead.agent_id || null",
  "    const viaFallback = !user.agentId && Boolean(lead.agent_id)",
  "",
  "    if (!resolvedAgentId) {",
  "      // No agent context available at all: neither the user nor the lead",
  "      // has an agent. lead_notes.agent_id is NOT NULL -- cannot proceed.",
  "      return NextResponse.json(",
  "        {",
  "          error:",
  "            'Cannot resolve note author: neither the current user nor the lead has an associated agent',",
  "        },",
  "        { status: 409 },",
  "      )",
  "    }",
  "",
  "    const { data: inserted, error: insertError } = await supabase",
  "      .from('lead_notes')",
  "      .insert({",
  "        lead_id: lead.id,",
  "        agent_id: resolvedAgentId,",
  "        note,",
  "        created_at: new Date().toISOString(),",
  "      })",
  "      .select('id, lead_id, agent_id, note, created_at, updated_at, agents(id, full_name)')",
  "      .single()",
  "",
  "    if (insertError || !inserted) {",
  "      console.error('[admin-homes/leads/[id]/notes POST] insert failed:', insertError)",
  "      return NextResponse.json(",
  "        { error: 'Failed to insert note', detail: insertError?.message ?? null },",
  "        { status: 500 },",
  "      )",
  "    }",
  "",
  "    // Audit (best-effort).",
  "    const actorRole =",
  "      user.role || (user.isPlatformAdmin ? 'platform_admin' : 'admin')",
  "    const preview = note.length > 80 ? note.slice(0, 80) + '\\u2026' : note",
  "    await logLeadAdminAction({",
  "      supabase,",
  "      tenantId: lead.tenant_id,",
  "      leadId: lead.id,",
  "      actorAgentId: user.agentId || null,",
  "      actorRole,",
  "      actionType: 'note_added',",
  "      targetField: null,",
  "      afterValue: {",
  "        note_id: (inserted as any).id,",
  "        note_length: note.length,",
  "        note_preview: preview,",
  "        agent_id: resolvedAgentId,",
  "        via_fallback: viaFallback,",
  "      },",
  "      notes: preview,",
  "    })",
  "",
  "    return NextResponse.json({",
  "      success: true,",
  "      note: inserted,",
  "      viaFallback,",
  "    })",
  "  } catch (error) {",
  "    console.error('[admin-homes/leads/[id]/notes POST] error:', error)",
  "    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })",
  "  }",
  "}",
  "",
].join('\n')

// ============================================================================
// NEW FILE 2: components/admin-homes/lead-workbench/NotesTab.tsx
// ============================================================================

const TAB_CONTENT = [
  "'use client'",
  "",
  "// components/admin-homes/lead-workbench/NotesTab.tsx",
  "// W-LEADS-WORKBENCH W4g (2026-05-14)",
  "//",
  "// List of lead_notes rows for the lead family + inline Add note form.",
  "// Optimistic update: new note prepended to local state on submit; reverts",
  "// on server error. No router.refresh() -- the optimistic state IS the",
  "// canonical state once the server confirms.",
  "//",
  "// ATTRIBUTION DISPLAY",
  "//   Notes show 'by <agents.full_name>' from lead_notes.agent_id join.",
  "//   When a platform admin types on an agent's behalf, the note attributes",
  "//   to the lead's owning agent (per W4g author-fallback policy). The",
  "//   precise actor (platform admin) is recorded in lead_admin_actions and",
  "//   visible in the Activity tab.",
  "",
  "import { useState, useMemo } from 'react'",
  "",
  "export interface NoteRow {",
  "  id: string",
  "  lead_id: string",
  "  agent_id: string",
  "  note: string",
  "  created_at: string",
  "  updated_at: string | null",
  "  agents: { id: string; full_name: string | null } | null",
  "}",
  "",
  "interface Props {",
  "  notes: NoteRow[]",
  "  leadFamily: any[]",
  "  anchorLeadId: string",
  "}",
  "",
  "const MAX_NOTE_LEN = 10000",
  "",
  "export default function NotesTab({ notes, leadFamily, anchorLeadId }: Props) {",
  "  // Optimistic local state -- starts from server-prefetched notes, prepended",
  "  // with anything the user adds in this session.",
  "  const [localNotes, setLocalNotes] = useState<NoteRow[]>(notes)",
  "  const [draft, setDraft] = useState<string>('')",
  "  const [selectedLeadId, setSelectedLeadId] = useState<string>(anchorLeadId)",
  "  const [submitting, setSubmitting] = useState<boolean>(false)",
  "  const [error, setError] = useState<string | null>(null)",
  "",
  "  const trimmedLen = draft.trim().length",
  "  const canSubmit = trimmedLen > 0 && trimmedLen <= MAX_NOTE_LEN && !submitting",
  "",
  "  const sortedNotes = useMemo(() => {",
  "    return [...localNotes].sort(",
  "      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),",
  "    )",
  "  }, [localNotes])",
  "",
  "  async function handleSubmit() {",
  "    if (!canSubmit) return",
  "    setSubmitting(true)",
  "    setError(null)",
  "    const note = draft.trim()",
  "    try {",
  "      const res = await fetch('/api/admin-homes/leads/' + selectedLeadId + '/notes', {",
  "        method: 'POST',",
  "        headers: { 'Content-Type': 'application/json' },",
  "        body: JSON.stringify({ note }),",
  "      })",
  "      const data = await res.json().catch(() => ({} as any))",
  "      if (!res.ok) {",
  "        let msg = (data && data.error) || 'Failed to add note'",
  "        if (data && typeof data.length === 'number') {",
  "          msg += ' (' + data.length + ' chars)'",
  "        }",
  "        setError(msg)",
  "        setSubmitting(false)",
  "        return",
  "      }",
  "      const inserted: NoteRow | null = data?.note || null",
  "      if (inserted) {",
  "        setLocalNotes((prev) => [inserted, ...prev])",
  "      }",
  "      setDraft('')",
  "      setSubmitting(false)",
  "    } catch (e: any) {",
  "      setError((e && e.message) || 'Network error')",
  "      setSubmitting(false)",
  "    }",
  "  }",
  "",
  "  return (",
  "    <div className=\"space-y-6\">",
  "      <div className=\"bg-white border border-slate-200 rounded-lg p-4 space-y-3\">",
  "        <div className=\"flex items-center justify-between gap-2 flex-wrap\">",
  "          <div className=\"text-xs font-semibold text-slate-500 uppercase tracking-wider\">",
  "            Add a note",
  "          </div>",
  "          <div className=\"text-xs text-slate-400\">",
  "            {trimmedLen}{' / '}{MAX_NOTE_LEN}",
  "          </div>",
  "        </div>",
  "        {leadFamily.length > 1 && (",
  "          <div>",
  "            <label className=\"block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1\">",
  "              Lead context",
  "            </label>",
  "            <select",
  "              value={selectedLeadId}",
  "              onChange={(e) => setSelectedLeadId(e.target.value)}",
  "              disabled={submitting}",
  "              className=\"w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500\"",
  "            >",
  "              {leadFamily.map((l: any) => (",
  "                <option key={l.id} value={l.id}>",
  "                  {(l.source || 'unknown') + ' - ' + new Date(l.created_at).toLocaleDateString('en-CA') + (l.id === anchorLeadId ? ' (current)' : '')}",
  "                </option>",
  "              ))}",
  "            </select>",
  "          </div>",
  "        )}",
  "        <textarea",
  "          value={draft}",
  "          onChange={(e) => setDraft(e.target.value)}",
  "          disabled={submitting}",
  "          rows={4}",
  "          placeholder=\"What did you learn from this lead? Customer call notes, follow-up reminders, internal context...\"",
  "          className=\"w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500\"",
  "          maxLength={MAX_NOTE_LEN}",
  "        />",
  "        {error && (",
  "          <div className=\"p-3 bg-red-50 border border-red-200 rounded text-sm text-red-900\">",
  "            {error}",
  "          </div>",
  "        )}",
  "        <div className=\"flex items-center justify-end gap-2\">",
  "          <button",
  "            type=\"button\"",
  "            onClick={() => setDraft('')}",
  "            disabled={submitting || trimmedLen === 0}",
  "            className=\"px-3 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed\"",
  "          >",
  "            Clear",
  "          </button>",
  "          <button",
  "            type=\"button\"",
  "            onClick={handleSubmit}",
  "            disabled={!canSubmit}",
  "            className=\"px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed\"",
  "          >",
  "            {submitting ? 'Saving\\u2026' : 'Add note'}",
  "          </button>",
  "        </div>",
  "      </div>",
  "",
  "      {sortedNotes.length === 0 ? (",
  "        <div className=\"text-center py-16 text-gray-400\">",
  "          <div className=\"text-sm font-medium\">No notes yet for this lead family</div>",
  "          <div className=\"text-xs mt-1\">",
  "            Add the first note above. Notes are visible to anyone with access to this lead.",
  "          </div>",
  "        </div>",
  "      ) : (",
  "        <ul className=\"space-y-2 list-none p-0 m-0\">",
  "          {sortedNotes.map((n) => (",
  "            <li key={n.id}>",
  "              <NoteCard note={n} leadFamily={leadFamily} anchorLeadId={anchorLeadId} />",
  "            </li>",
  "          ))}",
  "        </ul>",
  "      )}",
  "    </div>",
  "  )",
  "}",
  "",
  "function NoteCard({",
  "  note, leadFamily, anchorLeadId,",
  "}: {",
  "  note: NoteRow",
  "  leadFamily: any[]",
  "  anchorLeadId: string",
  "}) {",
  "  const authorName = note.agents?.full_name || 'Unknown agent'",
  "  const dateStr = new Date(note.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })",
  "  const timeStr = new Date(note.created_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })",
  "  const targetLead = leadFamily.find((l: any) => l.id === note.lead_id)",
  "  const isOtherLead = note.lead_id !== anchorLeadId && leadFamily.length > 1",
  "",
  "  return (",
  "    <div className=\"bg-white border border-slate-200 rounded-lg p-3\">",
  "      <div className=\"flex items-start gap-3\">",
  "        <div className=\"flex-shrink-0 w-8 h-8 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-base\">",
  "          {'\\u270F\\uFE0F'}",
  "        </div>",
  "        <div className=\"flex-1 min-w-0\">",
  "          <div className=\"flex items-center justify-between gap-2 flex-wrap\">",
  "            <div className=\"text-sm font-medium text-slate-900\">{authorName}</div>",
  "            <div className=\"text-xs text-slate-400 whitespace-nowrap\">",
  "              {dateStr} {timeStr}",
  "            </div>",
  "          </div>",
  "          {isOtherLead && targetLead && (",
  "            <div className=\"text-xs text-slate-400 mt-0.5\">",
  "              on lead: {targetLead.source || 'unknown'} ({new Date(targetLead.created_at).toLocaleDateString('en-CA')})",
  "            </div>",
  "          )}",
  "          <div className=\"text-sm text-slate-700 mt-2 whitespace-pre-wrap\">",
  "            {note.note}",
  "          </div>",
  "        </div>",
  "      </div>",
  "    </div>",
  "  )",
  "}",
  "",
].join('\n')

// ============================================================================
// PATCH 1: app/admin-homes/leads/[id]/page.tsx
//   - Extend destructure to 5 elements
//   - Add 5th parallel query for lead_notes
//   - Add `let notes` declaration
//   - Add notes assignment in if-block
//   - Pass notes prop to LeadWorkbenchClient
// ============================================================================

const PAGE_NL = PAGE_LE === 'crlf' ? '\r\n' : '\n'

let pageText = fs.readFileSync(PATH_PAGE, 'utf8')

// Anchor 1: extend the Promise.all destructure.
const PAGE_A1_OLD = "    const [activitiesResult, actionsResult, emailLogResult, vipRequestsResult] = await Promise.all(["
const PAGE_A1_NEW = "    const [activitiesResult, actionsResult, emailLogResult, vipRequestsResult, notesResult] = await Promise.all(["

// Anchor 2: extend parallel-query block with 5th query (lead_notes).
// Anchored on the vipRequests fallback close + the closing ]).
const PAGE_A2_OLD = [
  "      familyIds.length > 0",
  "        ? supabase",
  "            .from('vip_requests')",
  "            .select('id, lead_id, tenant_id, agent_id, session_id, status, request_type, request_source, phone, full_name, email, budget_range, timeline, buyer_type, requirements, approval_token, page_url, building_name, messages_granted, created_at, responded_at, expires_at')",
  "            .in('lead_id', familyIds)",
  "            .eq('tenant_id', tenantIdForActivity)",
  "            .order('created_at', { ascending: false })",
  "            .limit(500)",
  "        : Promise.resolve({ data: [] as any[] }),",
  "    ])",
].join(PAGE_NL)

const PAGE_A2_NEW = [
  "      familyIds.length > 0",
  "        ? supabase",
  "            .from('vip_requests')",
  "            .select('id, lead_id, tenant_id, agent_id, session_id, status, request_type, request_source, phone, full_name, email, budget_range, timeline, buyer_type, requirements, approval_token, page_url, building_name, messages_granted, created_at, responded_at, expires_at')",
  "            .in('lead_id', familyIds)",
  "            .eq('tenant_id', tenantIdForActivity)",
  "            .order('created_at', { ascending: false })",
  "            .limit(500)",
  "        : Promise.resolve({ data: [] as any[] }),",
  "      familyIds.length > 0",
  "        ? supabase",
  "            .from('lead_notes')",
  "            .select('id, lead_id, agent_id, note, created_at, updated_at, agents(id, full_name)')",
  "            .in('lead_id', familyIds)",
  "            .order('created_at', { ascending: false })",
  "            .limit(500)",
  "        : Promise.resolve({ data: [] as any[] }),",
  "    ])",
].join(PAGE_NL)

// Anchor 3: add `let notes` declaration after `let vipRequests`.
const PAGE_A3_OLD = "  let vipRequests: any[] = []"
const PAGE_A3_NEW = [
  "  let vipRequests: any[] = []",
  "  let notes: any[] = []",
].join(PAGE_NL)

// Anchor 4: assign notes after vipRequests inside the if-block.
const PAGE_A4_OLD = "    vipRequests = (vipRequestsResult.data as any[]) || []"
const PAGE_A4_NEW = [
  "    vipRequests = (vipRequestsResult.data as any[]) || []",
  "    notes = (notesResult.data as any[]) || []",
].join(PAGE_NL)

// Anchor 5: pass notes prop to LeadWorkbenchClient.
const PAGE_A5_OLD = [
  "      vipRequests={vipRequests}",
  "    />",
].join(PAGE_NL)

const PAGE_A5_NEW = [
  "      vipRequests={vipRequests}",
  "      notes={notes}",
  "    />",
].join(PAGE_NL)

const pageAnchors = [
  { name: 'PAGE_A1 destructure', old: PAGE_A1_OLD, new: PAGE_A1_NEW },
  { name: 'PAGE_A2 5th query',    old: PAGE_A2_OLD, new: PAGE_A2_NEW },
  { name: 'PAGE_A3 declaration', old: PAGE_A3_OLD, new: PAGE_A3_NEW },
  { name: 'PAGE_A4 assignment',  old: PAGE_A4_OLD, new: PAGE_A4_NEW },
  { name: 'PAGE_A5 prop pass',   old: PAGE_A5_OLD, new: PAGE_A5_NEW },
]

for (const a of pageAnchors) {
  const count = pageText.split(a.old).length - 1
  if (count !== 1) {
    throw new Error('page.tsx anchor "' + a.name + '" found ' + count + ' times (expected 1)')
  }
}
for (const a of pageAnchors) {
  pageText = pageText.replace(a.old, a.new)
}

// ============================================================================
// PATCH 2: app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx
// ============================================================================

const CLIENT_NL = CLIENT_LE === 'crlf' ? '\r\n' : '\n'

let clientText = fs.readFileSync(PATH_CLIENT, 'utf8')

// Anchor 1: extend imports after VipRequestsTab import.
const CLIENT_A1_OLD = "import VipRequestsTab, { VipRequestRow } from '@/components/admin-homes/lead-workbench/VipRequestsTab'"
const CLIENT_A1_NEW = [
  "import VipRequestsTab, { VipRequestRow } from '@/components/admin-homes/lead-workbench/VipRequestsTab'",
  "import NotesTab, { NoteRow } from '@/components/admin-homes/lead-workbench/NotesTab'",
].join(CLIENT_NL)

// Anchor 2: extend Props with notes.
const CLIENT_A2_OLD = [
  "  vipRequests: VipRequestRow[]",
  "}",
].join(CLIENT_NL)

const CLIENT_A2_NEW = [
  "  vipRequests: VipRequestRow[]",
  "  notes: NoteRow[]",
  "}",
].join(CLIENT_NL)

// Anchor 3: extend component params destructuring.
const CLIENT_A3_OLD = "export default function LeadWorkbenchClient({ anchorLead, leadFamily, currentRole, currentAgentId, userCredit, adminUser, activityFeed, emailLog, vipRequests }: Props) {"
const CLIENT_A3_NEW = "export default function LeadWorkbenchClient({ anchorLead, leadFamily, currentRole, currentAgentId, userCredit, adminUser, activityFeed, emailLog, vipRequests, notes }: Props) {"

// Anchor 4: add tab === 'notes' branch before PlaceholderTab fallthrough.
const CLIENT_A4_OLD = [
  "        ) : tab === 'vip' ? (",
  "          <VipRequestsTab vipRequests={vipRequests} leadFamily={leadFamily} anchorLeadId={anchorLead.id} />",
  "        ) : (",
  "          <PlaceholderTab name={activeTabMeta.label} phase={activeTabMeta.phase} />",
  "        )}",
].join(CLIENT_NL)

const CLIENT_A4_NEW = [
  "        ) : tab === 'vip' ? (",
  "          <VipRequestsTab vipRequests={vipRequests} leadFamily={leadFamily} anchorLeadId={anchorLead.id} />",
  "        ) : tab === 'notes' ? (",
  "          <NotesTab notes={notes} leadFamily={leadFamily} anchorLeadId={anchorLead.id} />",
  "        ) : (",
  "          <PlaceholderTab name={activeTabMeta.label} phase={activeTabMeta.phase} />",
  "        )}",
].join(CLIENT_NL)

const clientAnchors = [
  { name: 'CLIENT_A1 import',       old: CLIENT_A1_OLD, new: CLIENT_A1_NEW },
  { name: 'CLIENT_A2 Props',        old: CLIENT_A2_OLD, new: CLIENT_A2_NEW },
  { name: 'CLIENT_A3 destructure',  old: CLIENT_A3_OLD, new: CLIENT_A3_NEW },
  { name: 'CLIENT_A4 dispatch',     old: CLIENT_A4_OLD, new: CLIENT_A4_NEW },
]

for (const a of clientAnchors) {
  const count = clientText.split(a.old).length - 1
  if (count !== 1) {
    throw new Error('LeadWorkbenchClient.tsx anchor "' + a.name + '" found ' + count + ' times (expected 1)')
  }
}
for (const a of clientAnchors) {
  clientText = clientText.replace(a.old, a.new)
}

// ============================================================================
// POST-PATCH VALIDATION (before any write)
// ============================================================================

if (pageText.indexOf('notesResult') === -1) throw new Error('page.tsx missing notesResult marker')
if (pageText.indexOf("from('lead_notes')") === -1) throw new Error('page.tsx missing lead_notes query')
if (pageText.indexOf('notes={notes}') === -1) throw new Error('page.tsx missing notes prop pass')
if (clientText.indexOf('NotesTab') === -1) throw new Error('LeadWorkbenchClient.tsx missing NotesTab import')
if (clientText.indexOf("tab === 'notes'") === -1) throw new Error('LeadWorkbenchClient.tsx missing notes dispatch')

if (PAGE_LE === 'lf' && pageText.indexOf('\r\n') !== -1) throw new Error('CRLF in LF page.tsx')
if (CLIENT_LE === 'lf' && clientText.indexOf('\r\n') !== -1) throw new Error('CRLF in LF LeadWorkbenchClient.tsx')

// ============================================================================
// WRITES
// ============================================================================

fs.copyFileSync(PATH_PAGE, PATH_PAGE + '.backup_' + stamp)
fs.copyFileSync(PATH_CLIENT, PATH_CLIENT + '.backup_' + stamp)

fs.mkdirSync(path.dirname(PATH_ROUTE), { recursive: true })
fs.mkdirSync(path.dirname(PATH_TAB), { recursive: true })

fs.writeFileSync(PATH_ROUTE, ROUTE_CONTENT, 'utf8')
fs.writeFileSync(PATH_TAB, TAB_CONTENT, 'utf8')
fs.writeFileSync(PATH_PAGE, pageText, 'utf8')
fs.writeFileSync(PATH_CLIENT, clientText, 'utf8')

const postPageLE = detectLE(PATH_PAGE)
const postClientLE = detectLE(PATH_CLIENT)
if (postPageLE !== PAGE_LE) {
  throw new Error('LE drift on page.tsx: was ' + PAGE_LE + ', now ' + postPageLE)
}
if (postClientLE !== CLIENT_LE) {
  throw new Error('LE drift on LeadWorkbenchClient.tsx: was ' + CLIENT_LE + ', now ' + postClientLE)
}

console.log('')
console.log('W4g patch applied successfully.')
console.log('')
console.log('  CREATED:')
console.log('    + ' + PATH_ROUTE)
console.log('    + ' + PATH_TAB)
console.log('  MODIFIED:')
console.log('    ~ ' + PATH_PAGE + '  (backup: page.tsx.backup_' + stamp + ')')
console.log('    ~ ' + PATH_CLIENT + '  (backup: LeadWorkbenchClient.tsx.backup_' + stamp + ')')
console.log('')
console.log('Next:')
console.log('  1. npx tsc --noEmit')
console.log('  2. npm run dev')
console.log('  3. Open http://localhost:3000/admin-homes/leads/996b5d71-4a67-418a-9dfa-c11b2170e5d0')
console.log('  4. Click Notes tab; type a note; click Add note.')
console.log('  5. Verify lead_notes new row + lead_admin_actions vip_added row (wait: note_added).')
console.log('  6. Commit + push; tracker patch separate.')