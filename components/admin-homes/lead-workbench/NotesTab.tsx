'use client'

// components/admin-homes/lead-workbench/NotesTab.tsx
// W-LEADS-WORKBENCH W4g (2026-05-14)
//
// List of lead_notes rows for the lead family + inline Add note form.
// Optimistic update: new note prepended to local state on submit; reverts
// on server error. No router.refresh() -- the optimistic state IS the
// canonical state once the server confirms.
//
// ATTRIBUTION DISPLAY
//   Notes show 'by <agents.full_name>' from lead_notes.agent_id join.
//   When a platform admin types on an agent's behalf, the note attributes
//   to the lead's owning agent (per W4g author-fallback policy). The
//   precise actor (platform admin) is recorded in lead_admin_actions and
//   visible in the Activity tab.

import { useState, useMemo } from 'react'

export interface NoteRow {
  id: string
  lead_id: string
  agent_id: string
  note: string
  created_at: string
  updated_at: string | null
  agents: { id: string; full_name: string | null } | null
}

interface Props {
  notes: NoteRow[]
  leadFamily: any[]
  anchorLeadId: string
}

const MAX_NOTE_LEN = 10000

export default function NotesTab({ notes, leadFamily, anchorLeadId }: Props) {
  // Optimistic local state -- starts from server-prefetched notes, prepended
  // with anything the user adds in this session.
  const [localNotes, setLocalNotes] = useState<NoteRow[]>(notes)
  const [draft, setDraft] = useState<string>('')
  const [selectedLeadId, setSelectedLeadId] = useState<string>(anchorLeadId)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedLen = draft.trim().length
  const canSubmit = trimmedLen > 0 && trimmedLen <= MAX_NOTE_LEN && !submitting

  const sortedNotes = useMemo(() => {
    return [...localNotes].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
  }, [localNotes])

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    const note = draft.trim()
    try {
      const res = await fetch('/api/admin-homes/leads/' + selectedLeadId + '/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        let msg = (data && data.error) || 'Failed to add note'
        if (data && typeof data.length === 'number') {
          msg += ' (' + data.length + ' chars)'
        }
        setError(msg)
        setSubmitting(false)
        return
      }
      const inserted: NoteRow | null = data?.note || null
      if (inserted) {
        setLocalNotes((prev) => [inserted, ...prev])
      }
      setDraft('')
      setSubmitting(false)
    } catch (e: any) {
      setError((e && e.message) || 'Network error')
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Add a note
          </div>
          <div className="text-xs text-slate-400">
            {trimmedLen}{' / '}{MAX_NOTE_LEN}
          </div>
        </div>
        {leadFamily.length > 1 && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Lead context
            </label>
            <select
              value={selectedLeadId}
              onChange={(e) => setSelectedLeadId(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {leadFamily.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {(l.source || 'unknown') + ' - ' + new Date(l.created_at).toLocaleDateString('en-CA') + (l.id === anchorLeadId ? ' (current)' : '')}
                </option>
              ))}
            </select>
          </div>
        )}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={submitting}
          rows={4}
          placeholder="What did you learn from this lead? Customer call notes, follow-up reminders, internal context..."
          className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          maxLength={MAX_NOTE_LEN}
        />
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-900">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setDraft('')}
            disabled={submitting || trimmedLen === 0}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving\u2026' : 'Add note'}
          </button>
        </div>
      </div>

      {sortedNotes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-sm font-medium">No notes yet for this lead family</div>
          <div className="text-xs mt-1">
            Add the first note above. Notes are visible to anyone with access to this lead.
          </div>
        </div>
      ) : (
        <ul className="space-y-2 list-none p-0 m-0">
          {sortedNotes.map((n) => (
            <li key={n.id}>
              <NoteCard note={n} leadFamily={leadFamily} anchorLeadId={anchorLeadId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NoteCard({
  note, leadFamily, anchorLeadId,
}: {
  note: NoteRow
  leadFamily: any[]
  anchorLeadId: string
}) {
  const authorName = note.agents?.full_name || 'Unknown agent'
  const dateStr = new Date(note.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = new Date(note.created_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
  const targetLead = leadFamily.find((l: any) => l.id === note.lead_id)
  const isOtherLead = note.lead_id !== anchorLeadId && leadFamily.length > 1

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-base">
          {'\u270F\uFE0F'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-medium text-slate-900">{authorName}</div>
            <div className="text-xs text-slate-400 whitespace-nowrap">
              {dateStr} {timeStr}
            </div>
          </div>
          {isOtherLead && targetLead && (
            <div className="text-xs text-slate-400 mt-0.5">
              on lead: {targetLead.source || 'unknown'} ({new Date(targetLead.created_at).toLocaleDateString('en-CA')})
            </div>
          )}
          <div className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
            {note.note}
          </div>
        </div>
      </div>
    </div>
  )
}
