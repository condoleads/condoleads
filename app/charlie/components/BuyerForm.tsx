// app/charlie/components/BuyerForm.tsx
'use client'
import { useState, useEffect, useRef } from 'react'

export interface BuyerFormData {
  intent: 'buy' | 'lease'
  area: string
  geoType: string
  geoId: string
  geoSlug: string
  budgetMin: string
  budgetMax: string
  propertyType: 'condo' | 'homes' | 'any'
  propertySubtype: string
  bedrooms: string
  livingAreaRange: string
  approximateAge: string
  timeline: string
}

interface Props {
  onSubmit: (data: BuyerFormData) => void
  onBack: () => void
}

const CONDO_SUBTYPES = ['Condo Apt', 'Condo Townhouse']
const HOME_SUBTYPES = ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex', 'Vacant Land']

const SQFT_RANGES_HOMES = [
  '< 700','700-1100','1100-1500','1500-2000',
  '2000-2500','2500-3000','3000-3500','3500-5000','5000 +',
]
const SQFT_RANGES_CONDOS = [
  '0-499','500-599','600-699','700-799','800-899','900-999',
  '1000-1199','1200-1399','1400-1599','1600-1799','1800-1999',
  '2000-2249','2250-2499','2500-2749','2750-2999',
  '3000-3249','3250-3499','3500-3749','3750-3999','5000 +',
]
const AGE_OPTIONS = ['New','0-5 years','6-10 years','11-20 years','21-30 years','30+ years']
const BUDGETS_BUY = ['$300K','$400K','$500K','$600K','$700K','$800K','$900K','$1M','$1.25M','$1.5M','$2M','$2.5M','$3M+']
const BUDGETS_LEASE = ['$1,500','$2,000','$2,500','$3,000','$3,500','$4,000','$5,000','$6,000','$7,500','$10,000+']
const TIMELINES = ['ASAP','1-3 months','3-6 months','6-12 months','Just exploring']

const inputStyle = {
  width: '100%', background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
  padding: '11px 14px', color: '#fff', fontSize: 14, outline: 'none',
  boxSizing: 'border-box' as const,
}

function ComboField({ label, value, onChange, options, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
}) {
  const [mode, setMode] = useState<'select' | 'type'>('select')
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        {mode === 'select' ? (
          <div style={{ flex: 1, position: 'relative' as const }}>
            <div onClick={() => setOpen(o => !o)} style={{
              ...inputStyle, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' as const,
            }}>
              <span style={{ color: value ? '#fff' : 'rgba(255,255,255,0.3)' }}>{value || placeholder}</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>▾</span>
            </div>
            {open && (
              <div style={{
                position: 'absolute' as const, top: '100%', left: 0, right: 0,
                background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10, zIndex: 999, maxHeight: 200, overflowY: 'auto' as const, marginTop: 4,
              }}>
                {options.map(o => (
                  <div key={o} onClick={() => { onChange(o); setOpen(false) }} style={{
                    padding: '10px 14px', fontSize: 14,
                    color: value === o ? '#10b981' : '#fff',
                    background: value === o ? 'rgba(16,185,129,0.1)' : 'transparent',
                    cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                  onMouseLeave={e => (e.currentTarget.style.background = value === o ? 'rgba(16,185,129,0.1)' : 'transparent')}
                  >{o}</div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <input type="text" value={value} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} style={{ ...inputStyle, flex: 1 }} />
        )}
        <button onClick={() => { setMode(m => m === 'select' ? 'type' : 'select'); onChange(''); setOpen(false) }}
          style={{
            padding: '0 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)',
            fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0,
          }}>{mode === 'select' ? '✎ Type' : '▾ List'}</button>
      </div>
    </div>
  )
}

function AreaSearch({ value, onChange, onSelect }: {
  value: string
  onChange: (v: string) => void
  onSelect: (result: { name: string; type: string; id: string; slug: string }) => void
}) {
  const [groups, setGroups] = useState<{ label: string; results: any[] }[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounce = useRef<any>(null)

  useEffect(() => {
    if (!value.trim() || value.length < 2) { setGroups([]); return }
    clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`)
        const d = await res.json()
        setGroups(d.groups || [])
      } catch {}
      setLoading(false)
    }, 250)
  }, [value])

  const TYPE_ICONS: Record<string, string> = {
    municipality: '🏙',
    community: '🏘',
    neighbourhood: '📍',
    building: '🏢',
    listing: '🏠',
  }

  return (
    <div style={{ position: 'relative' as const }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="e.g. Whitby, Waterfront Communities, X2 Condos..."
        style={inputStyle}
      />
      {open && value.trim().length >= 2 && (
        <div style={{
          position: 'absolute' as const, top: '100%', left: 0, right: 0,
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10, zIndex: 999, maxHeight: 280, overflowY: 'auto' as const, marginTop: 4,
        }}>
          {loading && <div style={{ padding: '10px 14px', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Searching...</div>}
          {!loading && groups.length === 0 && <div style={{ padding: '10px 14px', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No results found</div>}
          {!loading && groups.map((group, gi) => (
            <div key={gi}>
              <div style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', background: 'rgba(255,255,255,0.03)' }}>
                {group.label}
              </div>
              {group.results.map((r, ri) => (
                <div key={ri} onMouseDown={() => { onSelect({ name: r.name, type: r.type, id: r.id, slug: r.slug }); setOpen(false) }}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 10 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{TYPE_ICONS[r.type] || '📍'}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{r.name}</div>
                    {r.subtitle && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{r.subtitle}</div>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BudgetSelect({ value, onChange, options, placeholder }: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ flex: 1, position: 'relative' as const }}>
      <div onClick={() => setOpen(o => !o)} style={{
        ...inputStyle, cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' as const,
      }}>
        <span style={{ color: value ? '#fff' : 'rgba(255,255,255,0.3)' }}>{value || placeholder}</span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>▾</span>
      </div>
      {open && (
        <div style={{
          position: 'absolute' as const, top: '100%', left: 0, right: 0,
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10, zIndex: 999, maxHeight: 200, overflowY: 'auto' as const, marginTop: 4,
        }}>
          <div onClick={() => { onChange(''); setOpen(false) }} style={{ padding: '10px 14px', fontSize: 14, color: 'rgba(255,255,255,0.4)', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{placeholder}</div>
          {options.map(o => (
            <div key={o} onClick={() => { onChange(o); setOpen(false) }} style={{
              padding: '10px 14px', fontSize: 14, color: value === o ? '#3b82f6' : '#fff',
              background: value === o ? 'rgba(59,130,246,0.1)' : 'transparent',
              cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
            onMouseLeave={e => (e.currentTarget.style.background = value === o ? 'rgba(59,130,246,0.1)' : 'transparent')}
            >{o}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BuyerForm({ onSubmit, onBack }: Props) {
  const [form, setForm] = useState<BuyerFormData>({
    intent: 'buy', area: '', geoType: '', geoId: '', geoSlug: '',
    budgetMin: '', budgetMax: '', propertyType: 'any', propertySubtype: '',
    bedrooms: '', livingAreaRange: '', approximateAge: '', timeline: '3-6 months'
  })

  const set = (k: keyof BuyerFormData, v: string) => setForm(f => ({ ...f, [k]: v }))

  const canSubmit = form.area.trim() && form.geoId

  const chip = (label: string, active: boolean, onClick: () => void, color = '#3b82f6') => (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 100, border: '1px solid',
      borderColor: active ? color : 'rgba(255,255,255,0.1)',
      background: active ? `${color}22` : 'transparent',
      color: active ? color : 'rgba(255,255,255,0.5)',
      fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
    }}>{label}</button>
  )

  const lbl = (text: string, required = false) => (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' as const, marginBottom: 10 }}>
      {text}{required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
    </div>
  )

  const budgets = form.intent === 'lease' ? BUDGETS_LEASE : BUDGETS_BUY

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '8px 0' }}>

      {/* Intent */}
      <div>
        {lbl('Are you buying or leasing?', true)}
        <div style={{ display: 'flex', gap: 10 }}>
          {chip('Buying', form.intent === 'buy', () => set('intent', 'buy'))}
          {chip('Leasing', form.intent === 'lease', () => set('intent', 'lease'))}
        </div>
      </div>

      {/* Area search */}
      <div>
        {lbl('Where are you looking?', true)}
        <AreaSearch
          value={form.area}
          onChange={v => { set('area', v); set('geoId', ''); set('geoType', ''); set('geoSlug', '') }}
          onSelect={r => { set('area', r.name); set('geoType', r.type); set('geoId', r.id); set('geoSlug', r.slug) }}
        />
        {form.area && !form.geoId && (
          <div style={{ fontSize: 11, color: 'rgba(245,158,11,0.8)', marginTop: 6 }}>⚠ Please select a location from the dropdown</div>
        )}
      </div>

      {/* Budget */}
      <div>
        {lbl('Budget Range')}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <BudgetSelect value={form.budgetMin} onChange={v => set('budgetMin', v)} options={budgets.slice(0, -1)} placeholder="No Min" />
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, flexShrink: 0 }}>to</span>
          <BudgetSelect value={form.budgetMax} onChange={v => set('budgetMax', v)} options={budgets} placeholder="No Max" />
        </div>
      </div>

      {/* Property Type */}
      <div>
        {lbl('Property Type')}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          {chip('Any', form.propertyType === 'any', () => { set('propertyType', 'any'); set('propertySubtype', '') })}
          {chip('Condo', form.propertyType === 'condo', () => { set('propertyType', 'condo'); set('propertySubtype', '') })}
          {chip('House', form.propertyType === 'homes', () => { set('propertyType', 'homes'); set('propertySubtype', '') })}
        </div>
      </div>

      {/* Property Subtype */}
      {form.propertyType !== 'any' && (
        <div>
          {lbl('Property Subtype')}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {chip('Any', form.propertySubtype === '', () => set('propertySubtype', ''))}
            {(form.propertyType === 'condo' ? CONDO_SUBTYPES : HOME_SUBTYPES).map(t =>
              chip(t, form.propertySubtype === t, () => set('propertySubtype', t))
            )}
          </div>
        </div>
      )}

      {/* Sqft Range - optional */}
      {form.propertyType !== 'any' && (
        <div>
          {lbl('Square Footage')}
          <ComboField
            label=""
            value={form.livingAreaRange}
            onChange={v => set('livingAreaRange', v)}
            options={form.propertyType === 'condo' ? SQFT_RANGES_CONDOS : SQFT_RANGES_HOMES}
            placeholder="Any size"
          />
        </div>
      )}

      {/* Approximate Age - optional */}
      {form.propertyType !== 'any' && (
        <div>
          {lbl('Approximate Age')}
          <ComboField
            label=""
            value={form.approximateAge}
            onChange={v => set('approximateAge', v)}
            options={AGE_OPTIONS}
            placeholder="Any age"
          />
        </div>
      )}

      {/* Bedrooms - optional */}
      <div>
        {lbl('Bedrooms')}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          {chip('Any', form.bedrooms === '', () => set('bedrooms', ''))}
          {['Studio','1','2','3','4+'].map(b => chip(b, form.bedrooms === b, () => set('bedrooms', b)))}
        </div>
      </div>

      {/* Timeline */}
      <div>
        {lbl('Timeline')}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          {TIMELINES.map(t => chip(t, form.timeline === t, () => set('timeline', t), '#8b5cf6'))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
        <button onClick={onBack} style={{
          padding: '12px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
          background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>← Back</button>
        <button onClick={() => canSubmit && onSubmit(form)} disabled={!canSubmit} style={{
          flex: 1, padding: '12px', borderRadius: 12, border: 'none',
          cursor: canSubmit ? 'pointer' : 'default',
          background: canSubmit ? 'linear-gradient(135deg, #1d4ed8, #4f46e5)' : 'rgba(255,255,255,0.1)',
          color: canSubmit ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: 14, fontWeight: 700,
        }}>{form.intent === 'buy' ? 'Find My Home' : 'Find Rentals'} →</button>
      </div>
    </div>
  )
}