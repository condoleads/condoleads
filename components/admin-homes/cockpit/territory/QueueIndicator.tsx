'use client'
// components/admin-homes/cockpit/territory/QueueIndicator.tsx
// W-TERRITORY-OPS T1-6 -- queue sync indicator pill.
//
// Polls GET /api/admin-homes/territory/reroll-worker for the current
// territory_reroll_queue depth (pending + processing counts). Renders
// a status pill in the TerritoryTab header.
//
// States:
//   ok        -- pending=0 AND processing=0   -> green check + 'Synced'
//   pending   -- pending > 0                  -> amber clock + '{n} pending'
//   busy      -- processing > 0               -> blue spinner + '{n} processing'
//
// Poll cadence: 10s while document visible; paused when hidden (battery).
// First poll fires immediately on mount; subsequent at the cadence.

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Clock, Loader2, AlertCircle } from 'lucide-react'

interface Props {
  tenantId: string
  /** Poll cadence in ms; default 10000. Set to 0 to disable polling (one-shot). */
  cadenceMs?: number
}

interface QueueState {
  pending: number
  processing: number
  // P-DASHBOARD GAP-C: cron observability fields (optional -- the legacy
  // reroll-worker GET predates these and may not return them; UI degrades
  // to "no cron history available" tooltip).
  last_done_at?: string | null
  last_error?: { message: string | null; at: string | null } | null
  recent_done_count?: number
  recent_error_count?: number
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 'unknown'
  const diff = Math.floor((Date.now() - t) / 1000)
  if (diff < 0) return 'just now'
  if (diff < 60) return diff + 's ago'
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
  return Math.floor(diff / 86400) + 'd ago'
}

export default function QueueIndicator({ tenantId, cadenceMs = 10000 }: Props) {
  const [state, setState] = useState<QueueState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const visible = useRef(true)
  const timer = useRef<NodeJS.Timeout | null>(null)

  async function poll() {
    if (!visible.current) return
    try {
      const res = await fetch('/api/admin-homes/territory/reroll-worker?tenant_id=' + encodeURIComponent(tenantId), {
        credentials: 'include',
        cache: 'no-store',
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'poll failed')
      setState({
        pending: j.pending || 0,
        processing: j.processing || 0,
        last_done_at: j.last_done_at ?? null,
        last_error: j.last_error ?? null,
        recent_done_count: j.recent_done_count ?? 0,
        recent_error_count: j.recent_error_count ?? 0,
      })
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

  // Render
  if (error) {
    return (
      <div className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 border border-red-200' title={error}>
        <AlertCircle className='w-3 h-3' />
        Queue: error
      </div>
    )
  }

  if (loading || !state) {
    return (
      <div className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-50 text-gray-500 border border-gray-200'>
        <Loader2 className='w-3 h-3 animate-spin' />
        Queue: ...
      </div>
    )
  }

  const { pending, processing, last_done_at, last_error, recent_done_count, recent_error_count } = state

  // P-DASHBOARD GAP-C: cron observability tooltip. Operators want to see WHY
  // a pending queue is OK (cron just ran, will run again in <5min) vs WHY
  // it's worrying (no done jobs in the last hour, last error 2 minutes ago).
  // The Event 4 cron drains every 5min; recent_done_count > 0 within the
  // last hour is the "cron is healthy" signal.
  const cronTooltip = [
    `Last drain: ${relativeTime(last_done_at)}` + (last_done_at ? ' (' + new Date(last_done_at).toISOString().slice(0, 19).replace('T', ' ') + 'Z)' : ''),
    `Last 1h: ${recent_done_count ?? 0} done` + ((recent_error_count ?? 0) > 0 ? ', ' + recent_error_count + ' error(s)' : ''),
    last_error?.at ? `Last error: ${relativeTime(last_error.at)} - ${(last_error.message || '').slice(0, 80)}` : null,
  ].filter(Boolean).join('\n')

  if (processing > 0) {
    return (
      <div className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200' title={'reroll worker actively processing\n' + cronTooltip}>
        <Loader2 className='w-3 h-3 animate-spin' />
        {processing} processing
        {pending > 0 ? <span className="ml-1 text-blue-500">+ {pending} pending</span> : null}
      </div>
    )
  }

  if (pending > 0) {
    // Pending + recent drain success = cron is healthy, just briefly behind.
    // Pending + zero recent drains = cron stalled, real concern.
    const cronOk = (recent_done_count ?? 0) > 0
    return (
      <div
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${cronOk ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}
        title={(cronOk ? 'reroll jobs waiting; cron drained ' + recent_done_count + ' job(s) in last hour' : 'pending jobs but NO cron drains in last hour -- cron may be stalled') + '\n' + cronTooltip}
      >
        <Clock className='w-3 h-3' />
        {pending} pending
      </div>
    )
  }

  // Synced: still surface cron-error tooltip if anything errored recently.
  const errBadge = (recent_error_count ?? 0) > 0
  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${errBadge ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-green-50 text-green-700 border-green-200'}`}
      title={(errBadge ? 'queue synced but ' + recent_error_count + ' cron error(s) in last hour' : 'listing cache fully synced with cards') + '\n' + cronTooltip}
    >
      {errBadge ? <AlertCircle className='w-3 h-3' /> : <CheckCircle2 className='w-3 h-3' />}
      {errBadge ? `Synced, ${recent_error_count} recent err` : 'Synced'}
    </div>
  )
}
