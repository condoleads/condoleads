// app/charlie/components/SellerForm.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { AreaSearch } from './BuyerForm'

export interface SellerFormData {
  intent: 'sale' | 'lease'
  propertyCategory: 'condo' | 'home'
  streetNumber: string
  streetName: string
  city: string
  municipalityId: string
  // W-CHARLIE-FORM-UX-FIX (2026-06-14): condo path now uses AreaSearch
  // building typeahead. When a user picks a building from the dropdown
  // we persist buildingId + communityId + buildingSlug here so the
  // seller-estimate API can short-circuit the canonical-address fuzzy
  // resolve (skipping a costly ILIKE round-trip) and the matcher gets
  // the building anchor directly. Empty for the home flow and for any
  // condo flow that ever falls back to address entry.
  buildingId: string
  communityId: string
  buildingSlug: string
  propertySubtype: string
  bedrooms: string
  bathrooms: string
  livingAreaRange: string
  approximateAge: string
  parking: string
  locker: string
  frontage: string
  propertyTax: string
  timeline: string
  goal: string
}

interface Props {
  onSubmit: (data: SellerFormData) => void
  onBack: () => void
}

const HOME_SUBTYPES = ['Detached','Semi-Detached','Att/Row/Townhouse','Link','Duplex','Triplex']
const TIMELINES = ['ASAP','1-3 months','3-6 months','6-12 months','Not sure yet']
const GOALS = ['Top dollar','Fast sale','Balanced']

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

const AGE_OPTIONS = [
  'New','0-5 years','6-10 years','11-20 years','21-30 years','30+ years',
]

function CitySearch({ value, onChange, onSelect }: {
  value: string
  onChange: (v: string) => void
  onSelect: (name: string, id: string) => void
}) {
  const [results, setResults] = useState<{ id: string; displayName: string }[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounce = useRef<any>(null)

  useEffect(() => {
    if (!value.trim()) { setResults([]); return }
    clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/charlie/municipalities?q=${encodeURIComponent(value)}`)
        const d = await res.json()
        if (d.success) setResults(d.municipalities)
      } catch {}
      setLoading(false)
    }, 250)
  }, [value])

  return (
    <div style={{ position: 'relative' as const }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="e.g. Toronto, Pickering, Whitby"
        style={inputStyle}
      />
      {open && value.trim() && (
        <div style={{
          position: 'absolute' as const, top: '100%', left: 0, right: 0,
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10, zIndex: 999, maxHeight: 200, overflowY: 'auto' as const, marginTop: 4,
        }}>
          {loading && <div style={{ padding: '10px 14px', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Searching...</div>}
          {!loading && results.length === 0 && <div style={{ padding: '10px 14px', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No results found</div>}
          {!loading && results.map(r => (
            <div key={r.id} onMouseDown={() => { onSelect(r.displayName, r.id); setOpen(false) }} style={{
              padding: '10px 14px', fontSize: 14, color: '#fff', cursor: 'pointer',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >{r.displayName}</div>
          ))}
        </div>
      )}
    </div>
  )
}

const inputStyle = {
  width: '100%', background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
  padding: '11px 14px', color: '#fff', fontSize: 14, outline: 'none',
  boxSizing: 'border-box' as const,
}

const selectStyle = {
  ...inputStyle,
  appearance: 'none' as const,
  cursor: 'pointer',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 36,
  WebkitAppearance: 'none' as const,
  MozAppearance: 'none' as const,
  colorScheme: 'dark' as const,
}

function ComboField({
  label, value, onChange, options, placeholder, hint, required = false
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
  hint?: string
  required?: boolean
}) {
  const [mode, setMode] = useState<'select' | 'type'>('select')
  const [open, setOpen] = useState(false)

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
          {label}{required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
          {!required && <span style={{ color: 'rgba(245,158,11,0.8)', marginLeft: 6, fontSize: 10, fontWeight: 400, textTransform: 'none' }}>⚠ Improves accuracy</span>}
        </div>
        {hint && <div style={{ fontSize: 11, color: 'rgba(245,158,11,0.8)', marginTop: 2 }}>⚠ {hint}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {mode === 'select' ? (
          <div style={{ flex: 1, position: 'relative' as const }}>
            {/* Custom dark dropdown trigger */}
            <div
              onClick={() => setOpen(o => !o)}
              style={{
                ...inputStyle,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                userSelect: 'none' as const,
              }}
            >
              <span style={{ color: value ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                {value || placeholder}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>▾</span>
            </div>
            {/* Dropdown list */}
            {open && (
              <div style={{
                position: 'absolute' as const,
                top: '100%', left: 0, right: 0,
                background: '#1e293b',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                zIndex: 999,
                maxHeight: 200,
                overflowY: 'auto' as const,
                marginTop: 4,
              }}>
                {options.map(o => (
                  <div
                    key={o}
                    onClick={() => { onChange(o); setOpen(false) }}
                    style={{
                      padding: '10px 14px',
                      fontSize: 14,
                      color: value === o ? '#10b981' : '#fff',
                      background: value === o ? 'rgba(16,185,129,0.1)' : 'transparent',
                      cursor: 'pointer',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                    onMouseLeave={e => (e.currentTarget.style.background = value === o ? 'rgba(16,185,129,0.1)' : 'transparent')}
                  >{o}</div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            style={{ ...inputStyle, flex: 1 }}
          />
        )}
        <button
          onClick={() => { setMode(m => m === 'select' ? 'type' : 'select'); onChange(''); setOpen(false) }}
          style={{
            padding: '0 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)',
            fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0,
          }}
        >{mode === 'select' ? '✎ Type' : '▾ List'}</button>
      </div>
    </div>
  )
}

export default function SellerForm({ onSubmit, onBack }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [form, setForm] = useState<SellerFormData>({
    intent: 'sale',
    propertyCategory: 'home',
    streetNumber: '', streetName: '', city: '', municipalityId: '',
    buildingId: '', communityId: '', buildingSlug: '',
    propertySubtype: 'Detached',
    bedrooms: '3', bathrooms: '2',
    livingAreaRange: '', approximateAge: '',
    parking: '', locker: 'none',
    frontage: '', propertyTax: '',
    timeline: '3-6 months', goal: 'Top dollar',
  })
  // W-CHARLIE-FORM-UX-FIX (2026-06-14): per-field inline error state.
  // Populated when the user attempts submit with required fields missing.
  // Keys match the field's stable string id used for scroll/focus
  // targeting. Cleared on any field change so the message disappears
  // as soon as the user fills it.
  const [errors, setErrors] = useState<Record<string, string>>({})
  // The condo-building typeahead's typed-but-not-selected sentinel.
  // Mirrors BuyerForm.tsx:274 — only set after a non-empty type with
  // no buildingId picked.
  const [condoBuildingTyped, setCondoBuildingTyped] = useState('')

  const set = (k: keyof SellerFormData, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    // Clear the error for this field as soon as the user touches it.
    if (errors[k]) setErrors(e => { const { [k]: _, ...rest } = e; return rest })
  }

  const chip = (label: string, active: boolean, onClick: () => void, color = '#10b981') => (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 100, border: '1px solid',
      borderColor: active ? color : 'rgba(255,255,255,0.1)',
      background: active ? color + '22' : 'transparent',
      color: active ? color : 'rgba(255,255,255,0.5)',
      fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
    }}>{label}</button>
  )

  const lbl = (text: string, required = false, hint?: string) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' as const }}>
        {text}{required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
      </div>
      {hint && <div style={{ fontSize: 11, color: 'rgba(245,158,11,0.8)', marginTop: 2 }}>⚠ {hint}</div>}
    </div>
  )

  const inp = (key: keyof SellerFormData, placeholder: string, type = 'text', extraProps: any = {}) => (
    <input
      type={type}
      value={form[key]}
      onChange={e => set(key, e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
      {...extraProps}
    />
  )

  // W-CHARLIE-FORM-UX-FIX (2026-06-14): inline error renderer. Sits below
  // a field; when errors[key] is set, surfaces the amber "⚠ {message}"
  // line styled like BuyerForm.tsx:274's "select from dropdown" hint —
  // the only inline-validation pattern that existed pre-fix. Clones it
  // rather than inventing a new style.
  const err = (key: string) => errors[key]
    ? <div style={{ fontSize: 11, color: 'rgba(245,158,11,0.8)', marginTop: 6 }}>⚠ {errors[key]}</div>
    : null

  // W-CHARLIE-FORM-UX-FIX (2026-06-14): build a missing-required-fields
  // list. Each entry maps a stable scroll/focus target id to a human
  // label that becomes the inline error text. The order in this array
  // is the priority order for "scroll to first missing".
  type ReqCheck = { key: string; missing: boolean; label: string }
  const buildRequiredChecks = (): ReqCheck[] => {
    const isCondo = form.propertyCategory === 'condo'
    const checks: ReqCheck[] = []
    if (isCondo) {
      // Condo: building selection via typeahead replaces street address
      checks.push({
        key: 'buildingId',
        missing: !form.buildingId,
        label: 'Building (pick from the dropdown)',
      })
    } else {
      // Home: existing street address + municipality requirements
      checks.push({ key: 'streetNumber',   missing: !form.streetNumber, label: 'Street number' })
      checks.push({ key: 'streetName',     missing: !form.streetName,   label: 'Street name' })
      checks.push({ key: 'municipalityId', missing: !form.municipalityId,
                    label: !form.city ? 'City' : 'City (pick from the dropdown)' })
      checks.push({
        key: 'propertySubtype',
        missing: !form.propertySubtype,
        label: 'Property subtype',
      })
    }
    checks.push({ key: 'bedrooms',         missing: !form.bedrooms,        label: 'Bedrooms' })
    checks.push({ key: 'bathrooms',        missing: !form.bathrooms,       label: 'Bathrooms' })
    checks.push({ key: 'livingAreaRange',  missing: !form.livingAreaRange, label: 'Square footage range' })
    if (form.intent === 'sale') {
      checks.push({
        key: 'propertyTax',
        missing: !form.propertyTax,
        label: 'Annual property tax',
      })
    }
    checks.push({ key: 'timeline', missing: !form.timeline, label: 'Timeline' })
    checks.push({ key: 'goal',     missing: !form.goal,     label: 'Your goal' })
    return checks
  }
  const missingChecks = buildRequiredChecks().filter(c => c.missing)
  const canSubmit = missingChecks.length === 0

  // W-CHARLIE-FORM-UX-FIX (2026-06-14): submit handler. Removes the
  // silent-disabled pattern — button is ALWAYS clickable; on attempt
  // with missing required, populates `errors` (drives inline messages)
  // and scrolls/focuses the first missing field. Mirrors the only
  // existing inline-validation pattern in the codebase (BuyerForm.tsx:
  // 274 "Please select a location from the dropdown") generalized to
  // every required field.
  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit(form)
      return
    }
    const newErrors: Record<string, string> = {}
    for (const c of missingChecks) newErrors[c.key] = `${c.label} required`
    setErrors(newErrors)
    // Scroll + focus the first missing required field (priority order
    // defined by buildRequiredChecks). The target element must carry
    // id={`f-${key}`} on its scroll anchor.
    const firstId = `f-${missingChecks[0].key}`
    setTimeout(() => {
      const el = typeof document !== 'undefined' ? document.getElementById(firstId) : null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const focusable = el.querySelector('input, button') as HTMLElement | null
        if (focusable) focusable.focus()
      }
    }, 0)
  }

  // Step 1 — Intent + Category
  if (step === 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '8px 0' }}>
        <div>
          {lbl('Are you selling or leasing?', true)}
          <div style={{ display: 'flex', gap: 10 }}>
            {chip('For Sale', form.intent === 'sale', () => set('intent', 'sale'), '#10b981')}
            {chip('For Lease', form.intent === 'lease', () => set('intent', 'lease'), '#10b981')}
          </div>
        </div>
        <div>
          {lbl('Property Type', true)}
          <div style={{ display: 'flex', gap: 10 }}>
            {chip('🏠 House / Townhouse', form.propertyCategory === 'home', () => set('propertyCategory', 'home'), '#10b981')}
            {chip('🏢 Condo', form.propertyCategory === 'condo', () => set('propertyCategory', 'condo'), '#10b981')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
          <button onClick={onBack} style={{
            padding: '12px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>← Back</button>
          <button onClick={() => setStep(2)} style={{
            flex: 1, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontSize: 14, fontWeight: 700,
          }}>Next →</button>
        </div>
      </div>
    )
  }

  // Step 2 — Property details
  // W-CHARLIE-FORM-UX-FIX (2026-06-14): field order is REQUIRED-FIRST.
  // The previous order interleaved optional accuracy-boosters (age,
  // parking, locker, frontage) between required fields, which made the
  // path-to-submit non-obvious. New order: address → subtype → beds →
  // baths → sqft → property tax (for sale) → timeline → goal, then ALL
  // optional accuracy-boosters at the bottom under a divider. Each
  // field's required/optional flag and its hint text are PRESERVED
  // EXACTLY — only the rendering order changes.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 0' }}>

      {/* W-CHARLIE-FORM-UX-FIX (2026-06-14): up-front required-fields
          signal so the * marker is explained, not assumed. */}
      <div style={{
        fontSize: 11, color: 'rgba(255,255,255,0.55)',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8, padding: '8px 12px',
      }}>
        Fields marked <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span> are required. Optional fields below improve accuracy.
      </div>

      {/* Address — CONDO branches to AreaSearch building typeahead;
          HOME keeps the existing street-number + street-name + CitySearch. */}
      {form.propertyCategory === 'condo' ? (
        <div id="f-buildingId">
          {lbl('Your Building', true, 'Search by building name or street address — pick from the dropdown')}
          <AreaSearch
            value={form.buildingId ? form.city : condoBuildingTyped}
            onChange={v => {
              // Typing always clears any previously-picked building so
              // the gate fires until the user picks again.
              setCondoBuildingTyped(v)
              if (form.buildingId) {
                setForm(f => ({ ...f, buildingId: '', communityId: '', buildingSlug: '', city: '', municipalityId: '', streetNumber: '', streetName: '' }))
              }
              if (errors.buildingId) setErrors(e => { const { buildingId: _, ...rest } = e; return rest })
            }}
            onSelect={r => {
              if (r.type !== 'building') return
              // Subtitle is "{street_number} {street_name} · {N} active";
              // split on " · " to recover the street portion for display.
              const streetPortion = (r as any).subtitle ? String((r as any).subtitle).split(' · ')[0].trim() : ''
              const parts = streetPortion.match(/^(\S+)\s+(.+)$/)
              setForm(f => ({
                ...f,
                buildingId: r.id,
                communityId: r.community_id || '',
                buildingSlug: r.slug,
                city: r.name, // building name displayed in field
                streetNumber: parts ? parts[1] : '',
                streetName: parts ? parts[2] : streetPortion,
                municipalityId: '', // condo path doesn't need muni — community_id is the geo
              }))
              setCondoBuildingTyped('')
              if (errors.buildingId) setErrors(e => { const { buildingId: _, ...rest } = e; return rest })
            }}
            placeholder="e.g. Aura, 1 King St W, X2 Condos..."
            filterTypes={['building']}
          />
          {condoBuildingTyped && !form.buildingId && (
            <div style={{ fontSize: 11, color: 'rgba(245,158,11,0.8)', marginTop: 6 }}>⚠ Please select a building from the dropdown</div>
          )}
          {err('buildingId')}
        </div>
      ) : (
        <div>
          {lbl('Property Address', true)}
          <div id="f-streetNumber" style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 10, marginBottom: 10 }}>
            {inp('streetNumber', 'No.')}
            <span id="f-streetName">{inp('streetName', 'Street Name')}</span>
          </div>
          <div id="f-municipalityId">
            <CitySearch
              value={form.city}
              onChange={v => set('city', v)}
              onSelect={(name, id) => { set('city', name); set('municipalityId', id) }}
            />
          </div>
          {form.city && !form.municipalityId && (
            <div style={{ fontSize: 11, color: 'rgba(245,158,11,0.8)', marginTop: 6 }}>⚠ Please select a city from the dropdown</div>
          )}
          {err('streetNumber')}
          {err('streetName')}
          {err('municipalityId')}
        </div>
      )}

      {/* Home subtype (required for HOME path) */}
      {form.propertyCategory === 'home' && (
        <div id="f-propertySubtype">
          {lbl('Property Subtype', true)}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {HOME_SUBTYPES.map(t => chip(t, form.propertySubtype === t, () => set('propertySubtype', t)))}
          </div>
          {err('propertySubtype')}
        </div>
      )}

      {/* Beds + Baths */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div id="f-bedrooms">
          {lbl('Bedrooms', true)}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['1','2','3','4','5+'].map(b => chip(b, form.bedrooms === b, () => set('bedrooms', b)))}
          </div>
          {err('bedrooms')}
        </div>
        <div id="f-bathrooms">
          {lbl('Bathrooms', true)}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['1','2','3','4+'].map(b => chip(b, form.bathrooms === b, () => set('bathrooms', b)))}
          </div>
          {err('bathrooms')}
        </div>
      </div>

      {/* Sqft Range — combo. Mandatory for both condo and home (C-ENHANCE-2-
          RENDER). The matcher uses it as the primary specs gate; without it
          comparable matching can't pick the right cohort. */}
      <div id="f-livingAreaRange">
        <ComboField
          label="Square Footage Range"
          value={form.livingAreaRange}
          onChange={v => set('livingAreaRange', v)}
          options={form.propertyCategory === 'condo' ? SQFT_RANGES_CONDOS : SQFT_RANGES_HOMES}
          placeholder="Select or type range"
          required={true}
        />
        {err('livingAreaRange')}
      </div>

      {/* Property Tax — required for sale (gates the matcher's tax-match
          cascade; without it Charlie can't show same-tax-band comparables).
          Lease keeps it optional (lease has ~0% tax fill).
          W-CHARLIE-FORM-UX-FIX (2026-06-14): sale hint expanded to GUIDE
          the user — tells them where to find the value (tax bill / MPAC
          assessment) in addition to why it matters. Lease hint unchanged. */}
      <div id="f-propertyTax">
        {form.intent === 'sale'
          ? lbl('Annual Property Tax ($)', true, 'Find it on your property tax bill or MPAC assessment. Affects accuracy — matches you against same-tax-band comparables.')
          : lbl('Annual Property Tax ($)', false, 'Optional for lease — most lease records have no tax')}
        {inp('propertyTax', 'e.g. 4500', 'number')}
        {err('propertyTax')}
      </div>

      {/* Timeline */}
      <div id="f-timeline">
        {lbl('Timeline', true)}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TIMELINES.map(t => chip(t, form.timeline === t, () => set('timeline', t), '#f59e0b'))}
        </div>
        {err('timeline')}
      </div>

      {/* Goal */}
      <div id="f-goal">
        {lbl('Your Goal', true)}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {GOALS.map(g => chip(g, form.goal === g, () => set('goal', g), '#ec4899'))}
        </div>
        {err('goal')}
      </div>

      {/* W-CHARLIE-FORM-UX-FIX (2026-06-14): optional accuracy-boosters
          grouped at the bottom under a subtle divider. Each field's
          required-flag (false) and hint text are unchanged — only the
          render position moves. */}
      <div style={{
        paddingTop: 16, marginTop: 4,
        borderTop: '1px dashed rgba(255,255,255,0.08)',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.15em',
          color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const,
        }}>
          Optional — improves accuracy
        </div>

        {/* Approximate Age — combo */}
        <ComboField
          label="Approximate Age"
          value={form.approximateAge}
          onChange={v => set('approximateAge', v)}
          options={AGE_OPTIONS}
          placeholder="Select or type age"
        />

        {/* Condo: Parking + Locker */}
        {form.propertyCategory === 'condo' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              {lbl('Parking Spaces')}
              <div style={{ display: 'flex', gap: 6 }}>
                {['0','1','2'].map(n => chip(n, form.parking === n, () => set('parking', n)))}
              </div>
            </div>
            <div>
              {lbl('Locker')}
              <div style={{ display: 'flex', gap: 6 }}>
                {chip('None', form.locker === 'none', () => set('locker', 'none'))}
                {chip('Owned', form.locker === 'Owned', () => set('locker', 'Owned'))}
                {chip('Exclusive', form.locker === 'Exclusive', () => set('locker', 'Exclusive'))}
              </div>
            </div>
          </div>
        )}

        {/* Home: Frontage */}
        {form.propertyCategory === 'home' && (
          <div>
            {lbl('Lot Frontage (ft)', false, 'Affects accuracy — major value factor for homes')}
            {inp('frontage', 'e.g. 40', 'number')}
          </div>
        )}
      </div>

      {/* Actions — W-CHARLIE-FORM-UX-FIX: button is ALWAYS clickable.
          handleSubmit() either submits or populates inline errors +
          scrolls to the first missing required field. */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
        <button onClick={() => setStep(1)} style={{
          padding: '12px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
          background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>← Back</button>
        <button onClick={handleSubmit} style={{
          flex: 1, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: canSubmit
            ? 'linear-gradient(135deg, #059669, #10b981)'
            : 'rgba(255,255,255,0.1)',
          color: canSubmit ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: 700,
        }}
        aria-disabled={!canSubmit}
        >Get My {form.intent === 'sale' ? 'Sale' : 'Lease'} Estimate →</button>
      </div>
      {!canSubmit && Object.keys(errors).length > 0 && (
        <div style={{
          fontSize: 11, color: 'rgba(245,158,11,0.9)',
          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 8, padding: '8px 12px', marginTop: -8,
        }}>
          ⚠ {missingChecks.length} required field{missingChecks.length === 1 ? '' : 's'} missing — see highlighted fields above.
        </div>
      )}
    </div>
  )
}