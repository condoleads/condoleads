'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, MapPin, Building2, Home, Map, Loader2, X } from 'lucide-react'
import type { SearchResult, SearchResultType } from '@/app/api/search/route'

const TYPE_LABELS: Record<SearchResultType, string> = {
  neighbourhood: 'Neighbourhood',
  community: 'Community',
  building: 'Building',
  municipality: 'City / Area',
}

const TYPE_ICON: Record<SearchResultType, React.ReactNode> = {
  neighbourhood: <Map className="w-4 h-4 text-blue-500" />,
  community: <MapPin className="w-4 h-4 text-green-500" />,
  building: <Building2 className="w-4 h-4 text-purple-500" />,
  municipality: <Home className="w-4 h-4 text-orange-500" />,
}

interface SearchBarProps {
  onClose?: () => void
  autoFocus?: boolean
  placeholder?: string
  className?: string
}

export default function SearchBar({
  onClose,
  autoFocus = false,
  placeholder = 'Search neighbourhoods, buildings, communities…',
  className = '',
}: SearchBarProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  // Debounced search
  const search = useCallback((q: string) => {
    clearTimeout(debounceRef.current)
    if (q.trim().length < 2) {
      setResults([])
      setOpen(false)
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
        const data = await res.json()
        setResults(data.results ?? [])
        setOpen(true)
        setActiveIdx(-1)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 220)
  }, [])

  useEffect(() => {
    search(query)
    return () => clearTimeout(debounceRef.current)
  }, [query, search])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (result: SearchResult) => {
    setOpen(false)
    setQuery('')
    router.push(result.url)
    onClose?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !results.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0 && results[activeIdx]) {
        handleSelect(results[activeIdx])
      }
      // If no selection, could trigger AI chat — wire later
    } else if (e.key === 'Escape') {
      setOpen(false)
      onClose?.()
    }
  }

  const clear = () => {
    setQuery('')
    setResults([])
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className={`relative w-full max-w-2xl ${className}`}>
      {/* Input */}
      <div className="relative flex items-center">
        <Search className="absolute left-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && results.length && setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="absolute right-3 flex items-center gap-1">
          {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
          {!loading && query && (
            <button onClick={clear} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50"
        >
          <ul>
            {results.map((r, i) => (
              <li key={`${r.type}-${r.slug}`}>
                <button
                  onClick={() => handleSelect(r)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={[
                    'flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors',
                    activeIdx === i ? 'bg-blue-50' : 'hover:bg-gray-50',
                  ].join(' ')}
                >
                  <span className="flex-shrink-0">{TYPE_ICON[r.type]}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate">
                      {r.name}
                    </span>
                    <span className="block text-xs text-gray-400 truncate">
                      {r.subtitle} · {TYPE_LABELS[r.type]}
                    </span>
                  </span>
                  <span className="text-xs text-gray-300 flex-shrink-0 hidden sm:block">
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* AI search hint */}
          <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs text-gray-500">
              Press <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-xs font-mono">Enter</kbd> for AI-powered search
            </span>
          </div>
        </div>
      )}

      {/* No results */}
      {open && !loading && query.length >= 2 && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
          <div className="px-4 py-4 text-center">
            <p className="text-sm text-gray-500">No results for "{query}"</p>
            <p className="text-xs text-gray-400 mt-1">
              Press Enter to search with AI
            </p>
          </div>
        </div>
      )}
    </div>
  )
}