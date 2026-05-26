'use client'
// components/admin-homes/cockpit/territory/TerritorySearchBar.tsx
// W-TERRITORY-OPS T1-6 -- global search input with grouped suggestions.
//
// Calls GET /api/admin-homes/territory/geo-search?tenant_id=X&q=Y&limit=20.
// On selection, fires onSelect(result) which TerritoryTab wires to the right
// view + filter (agent kind -> Cards filtered by agent; geo kind -> Cards
// filtered by geo OR Geography drilled to that geo).
//
// Behaviour:
//   - 300ms debounce on keystrokes; minimum 2 chars (server returns empty <2)
//   - Suggestions dropdown grouped by kind (Agents / Areas / Munis / etc.)
//   - Keyboard: ArrowUp/Down navigates; Enter selects highlighted; Esc closes
//   - Click outside closes dropdown
//   - Clear button (X) inside input when query is non-empty

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, X, User, MapPin, Building, Building2, Home, Loader2,
} from 'lucide-react'

export type SearchResultKind = 'agent' | 'area' | 'municipality' | 'community' | 'neighbourhood'

export interface SearchResult {
  kind: SearchResultKind
  id: string
  name: string
  slug: string | null
  parent_name: string | null
  is_selling: boolean | null
  is_active: boolean | null
}

interface Props {
  tenantId: string
  onSelect: (result: SearchResult) => void
  /** Debounce ms; default 300. */
  debounceMs?: number
}

const KIND_ORDER: SearchResultKind[] = [
  'agent', 'area', 'municipality', 'community', 'neighbourhood',
]

const KIND_LABEL: Record<SearchResultKind, string> = {
  agent: 'Agents',
  area: 'Areas',
  municipality: 'Municipalities',
  community: 'Communities',
  neighbourhood: 'Neighbourhoods',
}

const KIND_ICON: Record<SearchResultKind, any> = {
  agent: User,
  area: MapPin,
  municipality: Building2,
  community: Building,
  neighbourhood: Home,
}

export default function TerritorySearchBar({ tenantId, onSelect, debounceMs = 300 }: Props) {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Debounce.
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(q.trim()), debounceMs)
    return () => clearTimeout(h)
  }, [q, debounceMs])

  // Fetch on debounced change.
  useEffect(() => {
    if (debouncedQ.length < 2) {
      setResults([])
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(
      '/api/admin-homes/territory/geo-search?tenant_id=' + encodeURIComponent(tenantId) +
        '&q=' + encodeURIComponent(debouncedQ) + '&limit=20',
      { credentials: 'include', cache: 'no-store' }
    )
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error || 'search failed')
        if (!cancelled) {
          setResults((j.results || []) as SearchResult[])
          setHighlightIndex(0)
        }
      })
      .catch(e => {
        if (!cancelled) setError(e.message || 'search failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [debouncedQ, tenantId])

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Grouped results in display order.
  const grouped = useMemo(() => {
    const map: Record<SearchResultKind, SearchResult[]> = {
      agent: [], area: [], municipality: [], community: [], neighbourhood: [],
    }
    for (const r of results) {
      if (map[r.kind]) map[r.kind].push(r)
    }
    return map
  }, [results])

  // Flat list in display order for keyboard nav.
  const flat = useMemo(() => {
    const acc: SearchResult[] = []
    for (const k of KIND_ORDER) for (const r of grouped[k]) acc.push(r)
    return acc
  }, [grouped])

  function pick(r: SearchResult) {
    onSelect(r)
    setOpen(false)
    setQ('')
    setDebouncedQ('')
    setResults([])
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlightIndex(i => Math.min(flat.length - 1, i + 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(i => Math.max(0, i - 1))
      return
    }
    if (e.key === 'Enter' && flat.length > 0) {
      e.preventDefault()
      pick(flat[Math.min(highlightIndex, flat.length - 1)])
      return
    }
  }

  const showDropdown = open && (loading || error || results.length > 0 || debouncedQ.length >= 2)

  // Track running flat-index for keyboard highlight matching.
  let flatIdx = -1

  return (
    <div ref={containerRef} className='relative w-full max-w-md'>
      <div className='relative'>
        <Search className='w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2 pointer-events-none' />
        <input
          ref={inputRef}
          type='text'
          placeholder='Search agents, areas, munis, communities...'
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className='w-full pl-7 pr-7 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500'
        />
        {q && (
          <button
            type='button'
            onClick={() => { setQ(''); setDebouncedQ(''); setResults([]); inputRef.current?.focus() }}
            className='absolute right-2 top-1.5 text-gray-400 hover:text-gray-700'
            title='Clear search'
          >
            <X className='w-3.5 h-3.5' />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className='absolute left-0 right-0 top-full mt-1 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg z-20'>
          {loading && (
            <div className='px-3 py-2 text-xs text-gray-500 flex items-center gap-2'>
              <Loader2 className='w-3 h-3 animate-spin' /> Searching...
            </div>
          )}
          {error && (
            <div className='px-3 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100'>{error}</div>
          )}
          {!loading && !error && debouncedQ.length >= 2 && results.length === 0 && (
            <div className='px-3 py-3 text-xs text-gray-500'>No matches for &quot;{debouncedQ}&quot;.</div>
          )}
          {KIND_ORDER.map(kind => {
            const rows = grouped[kind]
            if (rows.length === 0) return null
            const Icon = KIND_ICON[kind]
            return (
              <div key={kind}>
                <div className='px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500 bg-gray-50 border-b border-gray-100'>
                  {KIND_LABEL[kind]} ({rows.length})
                </div>
                {rows.map(r => {
                  flatIdx += 1
                  const highlighted = flatIdx === highlightIndex
                  return (
                    <button
                      key={r.kind + r.id}
                      type='button'
                      onClick={() => pick(r)}
                      onMouseEnter={() => setHighlightIndex(flatIdx)}
                      className={'w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 border-b border-gray-50 ' + (highlighted ? 'bg-green-50' : 'hover:bg-gray-50')}
                    >
                      <Icon className='w-3 h-3 text-gray-400 flex-shrink-0' />
                      <span className='font-medium text-gray-800 truncate'>{r.name}</span>
                      {r.parent_name && (
                        <span className='text-gray-400 text-[11px] truncate'>({r.parent_name})</span>
                      )}
                      {kind === 'agent' && r.is_active === false && (
                        <span className='ml-auto text-[10px] text-red-600'>inactive</span>
                      )}
                      {kind === 'agent' && r.is_active === true && r.is_selling === false && (
                        <span className='ml-auto text-[10px] text-amber-600'>non-selling</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
