'use client'

import { ChevronDown, X, SlidersHorizontal } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export interface FilterState {
  minPrice: string
  maxPrice: string
  beds: string
  baths: string
  sort: string
}

interface GeoQuickFiltersProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
  onToggleAdvanced: () => void
  advancedOpen: boolean
  activeFilterCount: number
  type: 'sale' | 'lease'
}

const SALE_PRICES = [
  { label: 'No Min', value: '' },
  { label: '$200K', value: '200000' },
  { label: '$300K', value: '300000' },
  { label: '$400K', value: '400000' },
  { label: '$500K', value: '500000' },
  { label: '$600K', value: '600000' },
  { label: '$750K', value: '750000' },
  { label: '$1M', value: '1000000' },
  { label: '$1.5M', value: '1500000' },
  { label: '$2M', value: '2000000' },
  { label: '$3M', value: '3000000' },
  { label: '$5M', value: '5000000' },
]

const LEASE_PRICES = [
  { label: 'No Min', value: '' },
  { label: '$1,000', value: '1000' },
  { label: '$1,500', value: '1500' },
  { label: '$2,000', value: '2000' },
  { label: '$2,500', value: '2500' },
  { label: '$3,000', value: '3000' },
  { label: '$3,500', value: '3500' },
  { label: '$4,000', value: '4000' },
  { label: '$5,000', value: '5000' },
  { label: '$7,500', value: '7500' },
  { label: '$10,000', value: '10000' },
]

function Dropdown({ label, value, options, onChange }: {
  label: string
  value: string
  options: { label: string; value: string }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = options.find(o => o.value === value)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-3 py-2 text-sm border rounded-lg transition-all ${
          value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:border-gray-400'
        }`}
      >
        <span className="whitespace-nowrap">{value ? selected?.label : label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 min-w-[140px] max-h-60 overflow-y-auto">
          {options.map(o => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                value === o.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function GeoQuickFilters({
  filters,
  onChange,
  onToggleAdvanced,
  advancedOpen,
  activeFilterCount,
  type,
}: GeoQuickFiltersProps) {
  const prices = type === 'lease' ? LEASE_PRICES : SALE_PRICES
  const maxPrices = [{ label: 'No Max', value: '' }, ...prices.filter(p => p.value !== '').map(p => ({ ...p }))]

  const hasAnyFilter = filters.minPrice || filters.maxPrice || filters.beds !== '0' || filters.baths !== '0' || filters.sort !== 'default'

  const update = (key: keyof FilterState, val: string) => {
    onChange({ ...filters, [key]: val })
  }

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Price Min */}
        <Dropdown
          label="Min Price"
          value={filters.minPrice}
          options={prices}
          onChange={(v) => update('minPrice', v)}
        />

        <span className="text-gray-400 text-sm">—</span>

        {/* Price Max */}
        <Dropdown
          label="Max Price"
          value={filters.maxPrice}
          options={maxPrices}
          onChange={(v) => update('maxPrice', v)}
        />

        {/* Divider */}
        <div className="w-px h-6 bg-gray-300 mx-1 hidden sm:block" />

        {/* Bedrooms */}
        <div className="flex items-center gap-1">
          {['0', '1', '2', '3', '4'].map(n => (
            <button
              key={n}
              onClick={() => update('beds', n)}
              className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                filters.beds === n
                  ? 'bg-blue-600 text-white font-medium'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {n === '0' ? 'Beds' : `${n}+`}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-gray-300 mx-1 hidden sm:block" />

        {/* Bathrooms */}
        <div className="flex items-center gap-1">
          {['0', '1', '2', '3'].map(n => (
            <button
              key={n}
              onClick={() => update('baths', n)}
              className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                filters.baths === n
                  ? 'bg-blue-600 text-white font-medium'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {n === '0' ? 'Baths' : `${n}+`}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-gray-300 mx-1 hidden sm:block" />

        {/* Sort */}
        <Dropdown
          label="Sort"
          value={filters.sort === 'default' ? '' : filters.sort}
          options={[
            { label: 'Default', value: '' },
            { label: 'Price: Low → High', value: 'price_asc' },
            { label: 'Price: High → Low', value: 'price_desc' },
            { label: 'Newest First', value: 'newest' },
          ]}
          onChange={(v) => update('sort', v || 'default')}
        />

        {/* More Filters */}
        <button
          onClick={onToggleAdvanced}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-all ${
            advancedOpen || activeFilterCount > 0
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-300 text-gray-700 hover:border-gray-400'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          More
          {activeFilterCount > 0 && (
            <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Clear All */}
        {hasAnyFilter && (
          <button
            onClick={() => onChange({ minPrice: '', maxPrice: '', beds: '0', baths: '0', sort: 'default' })}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-all"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>
    </div>
  )
}