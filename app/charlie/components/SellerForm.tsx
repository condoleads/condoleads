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
  sqft: string
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

export default function SellerForm({ onSubmit, onBack }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [form, setForm] = useState<SellerFormData>({
    intent: 'sale',
    propertyCategory: 'home',
    streetNumber: '', streetName: '', city: '',
    propertySubtype: 'Detached',
    bedrooms: '3', bathrooms: '2',
    sqft: '', parking: '', locker: 'none',
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

  const input = (key: keyof SellerFormData, placeholder: string, type = 'text') => (
    <input
      type={type}
      value={form[key]}
      onChange={e => set(key, e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
        padding: '11px 14px', color: '#fff', fontSize: 14, outline: 'none',
        boxSizing: 'border-box' as const,
      }}
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
          {input('streetNumber', 'No.')}
          {input('streetName', 'Street Name')}
        </div>
        {input('city', 'City (e.g. Whitby)')}
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

      {/* Sqft */}
      <div>
        {lbl('Square Footage', false, 'Improves estimate accuracy significantly')}
        {input('sqft', 'e.g. 1200', 'number')}
      </div>

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
          {input('frontage', 'e.g. 40', 'number')}
        </div>
      )}

      {/* Property Tax */}
      <div>
        {lbl('Annual Property Tax ($)', false, 'Used for future value calculations')}
        {input('propertyTax', 'e.g. 4500', 'number')}
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