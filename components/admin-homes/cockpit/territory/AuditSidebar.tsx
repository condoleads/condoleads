'use client'
// components/admin-homes/cockpit/territory/AuditSidebar.tsx
// W-TERRITORY-OPS T1-6 -- collapsible audit-log right rail.
//
// Polls GET /api/admin-homes/territory/audit-log?tenant_id=X&limit=20.
// Renders a right-side rail attached inside the TerritoryTab container.
//
// Collapsed (default): 40px wide vertical tab with "Audit" label + dot
//                      badge showing unseen-event count.
// Expanded:            320px wide panel listing recent 20 events with
//                      coloured change_type badges + relative timestamps.
//
// Poll cadence: 30s while document visible; paused when hidden.
// First poll fires immediately on mount.
//
// "Seen" state: when the panel is expanded, the lastSeenAt timestamp is
// updated to now(); events newer than lastSeenAt show a subtle "new" dot.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight, ChevronLeft, RefreshCw, AlertCircle, Clock,
  Plus, Minus, ArrowRight, ToggleLeft, Trash2,
} from 'lucide-react'

interface AuditRow {
  id: string
  agent_id: string | null
  agent_name: string | null
  scope: string
  scope_id: string | null
  change_type: string
  before_state: any
  after_state: any
  changed_by: string | null
  changed_at: string
  notes: string | null
}

interface Props {
  tenantId: string
  /** Poll cadence in ms; default 30000. Set to 0 to disable polling. */
  cadenceMs?: number
}

// Per-change_type colour + icon classification. Falls back to grey for
// any value not in this map (forward compat with new change types).
const CHANGE_TYPE_STYLE: Record<string, { bg: string; text: string; border: string; Icon: any }> = {
  assignment_granted:   { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  Icon: Plus },
  assignment_revoked:   { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    Icon: Minus },
  primary_set:          { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   Icon: ArrowRight },
  primary_unset:        { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   Icon: ArrowRight },
  access_toggle_changed:{ bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', Icon: ToggleLeft },
  scope_widened:        { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  Icon: ArrowRight },
  scope_narrowed:       { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  Icon: ArrowRight },
  pin_added:            { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  Icon: Plus },
  pin_removed:          { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    Icon: Trash2 },
  percentage_set:       { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', Icon: ArrowRight },
  percentage_changed:   { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', Icon: ArrowRight },
}

function styleFor(ct: string) {
  return CHANGE_TYPE_STYLE[ct] || {
    bg: 'bg-gray-50',
    text: 'text-gray-700',
    border: 'border-gray-200',
    Icon: ArrowRight,
  }
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (sec < 60) return sec + 's ago'
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago'
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago'
  return Math.floor(sec / 86400) + 'd ago'
}

export default function AuditSidebar({ tenantId, cadenceMs = 30000 }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastSeenAt, setLastSeenAt] = useState<string>('1970-01-01T00:00:00Z')
  const visible = useRef(true)
  const timer = useRef<NodeJS.Timeout | null>(null)

  async function poll() {
    if (!visible.current) return
    try {
      const res = await fetch('/api/admin-homes/territory/audit-log?tenant_id=' + encodeURIComponent(tenantId) + '&limit=20', {
        credentials: 'include',
        cache: 'no-store',
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'poll failed')
      setRows((j.rows || []) as AuditRow[])
      setError(null)
    } catch (e: any) {
      setError(e.message || 'poll failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    visible.current = !document.hidden
    const onVis = () => {
      visible.current = !document.hidden
      if (visible.current) poll()
    }
    document.addEventListener('visibilitychange', onVis)

    poll()
    if (cadenceMs > 0) {
      timer.current = setInterval(poll, cadenceMs)
    }
    return () => {
      if (timer.current) clearInterval(timer.current)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, cadenceMs])

  // When the user expands, mark the most recent row as seen.
  useEffect(() => {
    if (expanded && rows.length > 0) {
      setLastSeenAt(rows[0].changed_at)
    }
  }, [expanded, rows])

  const unseenCount = useMemo(() => {
    if (!rows.length) return 0
    return rows.filter(r => r.changed_at > lastSeenAt).length
  }, [rows, lastSeenAt])

  // Collapsed rail
  if (!expanded) {
    return (
      <button
        type='button'
        onClick={() => setExpanded(true)}
        className='fixed right-0 top-1/2 -translate-y-1/2 z-30 bg-white border border-gray-200 border-r-0 rounded-l-md shadow-sm hover:bg-gray-50 px-2 py-3 flex flex-col items-center gap-1 text-xs text-gray-700'
        title='Open audit log'
      >
        <ChevronLeft className='w-3.5 h-3.5' />
        <span className='font-medium' style={{ writingMode: 'vertical-rl' }}>Audit</span>
        {unseenCount > 0 && (
          <span className='inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold'>
            {unseenCount}
          </span>
        )}
      </button>
    )
  }

  // Expanded panel
  return (
    <div className='fixed right-0 top-1/2 -translate-y-1/2 z-30 w-80 max-h-[80vh] bg-white border border-gray-200 rounded-l-md shadow-lg flex flex-col'>
      <div className='flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50'>
        <div className='flex items-center gap-2'>
          <Clock className='w-4 h-4 text-gray-500' />
          <span className='text-sm font-semibold text-gray-700'>Audit log</span>
          <span className='text-xs text-gray-500'>(latest 20)</span>
        </div>
        <div className='flex items-center gap-1'>
          <button
            type='button'
            onClick={poll}
            className='text-gray-500 hover:text-gray-800 p-1'
            title='Refresh now'
          >
            <RefreshCw className={'w-3.5 h-3.5 ' + (loading ? 'animate-spin' : '')} />
          </button>
          <button
            type='button'
            onClick={() => setExpanded(false)}
            className='text-gray-500 hover:text-gray-800 p-1'
            title='Collapse'
          >
            <ChevronRight className='w-3.5 h-3.5' />
          </button>
        </div>
      </div>

      {error && (
        <div className='mx-3 my-2 p-2 rounded text-xs bg-red-50 text-red-700 border border-red-200 flex items-center gap-1'>
          <AlertCircle className='w-3 h-3' /> {error}
        </div>
      )}

      <div className='flex-1 overflow-y-auto'>
        {loading && rows.length === 0 && (
          <div className='px-3 py-6 text-center text-gray-500 text-sm'>
            <RefreshCw className='w-4 h-4 animate-spin inline-block mr-2' /> Loading...
          </div>
        )}
        {!loading && rows.length === 0 && !error && (
          <div className='px-3 py-6 text-center text-gray-500 text-sm'>No audit rows yet.</div>
        )}
        {rows.map(r => {
          const s = styleFor(r.change_type)
          const isNew = r.changed_at > lastSeenAt
          const Icon = s.Icon
          return (
            <div key={r.id} className={'px-3 py-2 border-b border-gray-100 ' + (isNew ? 'bg-yellow-50' : '')}>
              <div className='flex items-start justify-between gap-2'>
                <div className='flex items-center gap-1.5 min-w-0'>
                  <span className={'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ' + s.bg + ' ' + s.text + ' ' + s.border}>
                    <Icon className='w-2.5 h-2.5' />
                    {r.change_type}
                  </span>
                  {isNew && (
                    <span className='inline-flex w-1.5 h-1.5 rounded-full bg-red-500' title='new since last view' />
                  )}
                </div>
                <span className='text-[10px] text-gray-400 whitespace-nowrap'>{relTime(r.changed_at)}</span>
              </div>
              <div className='mt-1 text-xs text-gray-700 truncate'>
                <span className='font-medium'>{r.agent_name || '(no agent)'}</span>
                <span className='text-gray-500'> at </span>
                <span className='font-mono text-[11px]'>{r.scope}</span>
                {r.scope_id && (
                  <span className='font-mono text-[10px] text-gray-400'> /{(r.scope_id || '').substring(0, 8)}</span>
                )}
              </div>
              {r.notes && (
                <div className='mt-1 text-[11px] text-gray-500 truncate' title={r.notes}>{r.notes}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
