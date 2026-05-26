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
      setState({ pending: j.pending || 0, processing: j.processing || 0 })
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

  const { pending, processing } = state

  if (processing > 0) {
    return (
      <div className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200' title='reroll worker actively processing'>
        <Loader2 className='w-3 h-3 animate-spin' />
        {processing} processing
        {pending > 0 ? <span className="ml-1 text-blue-500">+ {pending} pending</span> : null}
      </div>
    )
  }

  if (pending > 0) {
    return (
      <div className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200' title='reroll jobs waiting; cache may lag behind cards'>
        <Clock className='w-3 h-3' />
        {pending} pending
      </div>
    )
  }

  return (
    <div className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200' title='listing cache fully synced with cards'>
      <CheckCircle2 className='w-3 h-3' />
      Synced
    </div>
  )
}
