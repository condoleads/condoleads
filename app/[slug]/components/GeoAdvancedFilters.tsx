'use client'

import { X } from 'lucide-react'

export interface AdvancedFilterState {
  subtypes: string[]
  minSqft: string
  maxSqft: string
  garage: string
  basement: string
  parking: string
  locker: string
}

interface GeoAdvancedFiltersProps {
  filters: AdvancedFilterState
  onChange: (filters: AdvancedFilterState) => void
  onClose: () => void
  propertyCategory?: 'condo' | 'homes'
}

const CONDO_SUBTYPES = [
  'Condo Apartment',
  'Condo Townhouse',
  'Co-op Apartment',
  'Common Element Condo',
]

const HOME_SUBTYPES = [
  'Detached',
  'Semi-Detached',
  'Att/Row/Townhouse',
  'Link',
  'Duplex',
  'Triplex',
  'Fourplex',
  'Multiplex',
]

const SQFT_OPTIONS = [
  { label: 'Any', value: '' },
  { label: '400', value: '400' },
  { label: '500', value: '500' },
  { label: '600', value: '600' },
  { label: '700', value: '700' },
  { label: '800', value: '800' },
  { label: '1,000', value: '1000' },
  { label: '1,200', value: '1200' },
  { label: '1,500', value: '1500' },
  { label: '2,000', value: '2000' },
  { label: '2,500', value: '2500' },
  { label: '3,000', value: '3000' },
]

export default function GeoAdvancedFilters({
  filters,
  onChange,
  onClose,
  propertyCategory,
}: GeoAdvancedFiltersProps) {
  const subtypeOptions = propertyCategory === 'condo' ? CONDO_SUBTYPES
    : propertyCategory === 'homes' ? HOME_SUBTYPES
    : [...CONDO_SUBTYPES, ...HOME_SUBTYPES]

  const update = (key: keyof AdvancedFilterState, val: any) => {
    onChange({ ...filters, [key]: val })
  }

  const toggleSubtype = (st: string) => {
    const current = filters.subtypes
    if (current.includes(st)) {
      update('subtypes', current.filter(s => s !== st))
    } else {
      update('subtypes', [...current, st])
    }
  }

  const activeCount = [
    filters.subtypes.length > 0,
    filters.minSqft,
    filters.maxSqft,
    filters.garage && filters.garage !== 'any',
    filters.basement && filters.basement !== 'any',
    filters.parking && filters.parking !== '0',
    filters.locker && filters.locker !== 'any',
  ].filter(Boolean).length

  const clearAll = () => {
    onChange({
      subtypes: [],
      minSqft: '',
      maxSqft: '',
      garage: 'any',
      basement: 'any',
      parking: '0',
      locker: 'any',
    })
  }

  return (
    <div className="mb-4 bg-gray-50 border border-gray-200 rounded-xl p-4 animate-in slide-in-from-top-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 text-sm">Advanced Filters</h3>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button onClick={clearAll} className="text-xs text-red-600 hover:text-red-700">
              Clear advanced
            </button>
          )}
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Property Subtypes */}
        <div>
          <label className="text-xs font-medium text-gray-600 mb-2 block">Property Type</label>
          <div className="flex flex-wrap gap-1.5">
            {subtypeOptions.map(st => (
              <button
                key={st}
                onClick={() => toggleSubtype(st)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                  filters.subtypes.includes(st)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Sqft Range */}
        <div>
          <label className="text-xs font-medium text-gray-600 mb-2 block">Square Feet</label>
          <div className="flex items-center gap-2">
            <select
              value={filters.minSqft}
              onChange={e => update('minSqft', e.target.value)}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
            >
              {SQFT_OPTIONS.map(o => (
                <option key={`min-${o.value}`} value={o.value}>
                  {o.value ? `${o.label}+ sqft` : 'Min sqft'}
                </option>
              ))}
            </select>
            <span className="text-gray-400 text-xs">—</span>
            <select
              value={filters.maxSqft}
              onChange={e => update('maxSqft', e.target.value)}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
            >
              {SQFT_OPTIONS.map(o => (
                <option key={`max-${o.value}`} value={o.value}>
                  {o.value ? `${o.label} sqft` : 'Max sqft'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Homes-specific: Garage + Basement */}
        {propertyCategory === 'homes' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Garage</label>
              <div className="flex gap-1">
                {[{ label: 'Any', value: 'any' }, { label: 'Yes', value: 'yes' }].map(o => (
                  <button
                    key={o.value}
                    onClick={() => update('garage', o.value)}
                    className={`px-3 py-1 text-xs rounded-md transition-all ${
                      filters.garage === o.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Basement</label>
              <div className="flex gap-1">
                {[
                  { label: 'Any', value: 'any' },
                  { label: 'Finished', value: 'Finished' },
                  { label: 'Unfinished', value: 'Unfinished' },
                ].map(o => (
                  <button
                    key={o.value}
                    onClick={() => update('basement', o.value)}
                    className={`px-3 py-1 text-xs rounded-md transition-all ${
                      filters.basement === o.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Condo-specific: Parking + Locker */}
        {propertyCategory === 'condo' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Parking</label>
              <div className="flex gap-1">
                {['0', '1', '2'].map(n => (
                  <button
                    key={n}
                    onClick={() => update('parking', n)}
                    className={`px-3 py-1 text-xs rounded-md transition-all ${
                      filters.parking === n
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {n === '0' ? 'Any' : `${n}+`}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Locker</label>
              <div className="flex gap-1">
                {[{ label: 'Any', value: 'any' }, { label: 'Yes', value: 'yes' }].map(o => (
                  <button
                    key={o.value}
                    onClick={() => update('locker', o.value)}
                    className={`px-3 py-1 text-xs rounded-md transition-all ${
                      filters.locker === o.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}