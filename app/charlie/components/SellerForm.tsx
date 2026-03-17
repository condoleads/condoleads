// app/charlie/components/SellerForm.tsx
'use client'
import { useState } from 'react'

export interface SellerFormData {
  intent: 'sale' | 'lease'
  propertyCategory: 'condo' | 'home'
  streetNumber: string
  streetName: string
  city: string
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
    streetNumber: '', streetName: '', city: '',
    propertySubtype: 'Detached',
    bedrooms: '3', bathrooms: '2',
    livingAreaRange: '', approximateAge: '',
    parking: '', locker: 'none',
    frontage: '', propertyTax: '',
    timeline: '3-6 months', goal: 'Top dollar',
  })

  const set = (k: keyof SellerFormData, v: string) => setForm(f => ({ ...f, [k]: v }))

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

  const inp = (key: keyof SellerFormData, placeholder: string, type = 'text') => (
    <input
      type={type}
      value={form[key]}
      onChange={e => set(key, e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
    />
  )

  const canProceed = form.streetNumber && form.streetName && form.city
  const canSubmit = canProceed && form.bedrooms && form.bathrooms &&
    (form.propertyCategory === 'home' ? !!form.propertySubtype : true)

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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 0' }}>

      {/* Address */}
      <div>
        {lbl('Property Address', true)}
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 10, marginBottom: 10 }}>
          {inp('streetNumber', 'No.')}
          {inp('streetName', 'Street Name')}
        </div>
        {inp('city', 'City (e.g. Toronto)')}
      </div>

      {/* Home subtype */}
      {form.propertyCategory === 'home' && (
        <div>
          {lbl('Property Subtype', true)}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {HOME_SUBTYPES.map(t => chip(t, form.propertySubtype === t, () => set('propertySubtype', t)))}
          </div>
        </div>
      )}

      {/* Beds + Baths */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          {lbl('Bedrooms', true)}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['1','2','3','4','5+'].map(b => chip(b, form.bedrooms === b, () => set('bedrooms', b)))}
          </div>
        </div>
        <div>
          {lbl('Bathrooms', true)}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['1','2','3','4+'].map(b => chip(b, form.bathrooms === b, () => set('bathrooms', b)))}
          </div>
        </div>
      </div>

      {/* Sqft Range — combo */}
      <ComboField
        label="Square Footage Range"
        value={form.livingAreaRange}
        onChange={v => set('livingAreaRange', v)}
        options={form.propertyCategory === 'condo' ? SQFT_RANGES_CONDOS : SQFT_RANGES_HOMES}
        placeholder="Select or type range"
      />

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

      {/* Property Tax */}
      <div>
        {lbl('Annual Property Tax ($)', false, 'Used for future value calculations')}
        {inp('propertyTax', 'e.g. 4500', 'number')}
      </div>

      {/* Timeline */}
      <div>
        {lbl('Timeline', true)}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TIMELINES.map(t => chip(t, form.timeline === t, () => set('timeline', t), '#f59e0b'))}
        </div>
      </div>

      {/* Goal */}
      <div>
        {lbl('Your Goal', true)}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {GOALS.map(g => chip(g, form.goal === g, () => set('goal', g), '#ec4899'))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
        <button onClick={() => setStep(1)} style={{
          padding: '12px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
          background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>← Back</button>
        <button onClick={() => canSubmit && onSubmit(form)} disabled={!canSubmit} style={{
          flex: 1, padding: '12px', borderRadius: 12, border: 'none', cursor: canSubmit ? 'pointer' : 'default',
          background: canSubmit ? 'linear-gradient(135deg, #059669, #10b981)' : 'rgba(255,255,255,0.1)',
          color: canSubmit ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: 14, fontWeight: 700,
        }}>Get My {form.intent === 'sale' ? 'Sale' : 'Lease'} Estimate →</button>
      </div>
    </div>
  )
}