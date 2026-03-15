// app/charlie/components/BuyerForm.tsx
'use client'
import { useState } from 'react'

interface BuyerFormData {
  intent: 'buy' | 'lease'
  area: string
  budgetMin: string
  budgetMax: string
  propertyType: 'condo' | 'homes' | 'any'
  bedrooms: string
  timeline: string
}

interface Props {
  onSubmit: (data: BuyerFormData) => void
  onBack: () => void
}

const BUDGETS = ['$300K','$400K','$500K','$600K','$700K','$800K','$900K','$1M','$1.5M','$2M+']
const TIMELINES = ['ASAP','1-3 months','3-6 months','6-12 months','Just exploring']

export default function BuyerForm({ onSubmit, onBack }: Props) {
  const [form, setForm] = useState<BuyerFormData>({
    intent: 'buy', area: '', budgetMin: '', budgetMax: '', propertyType: 'any', bedrooms: '2', timeline: '3-6 months'
  })

  const set = (k: keyof BuyerFormData, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = () => {
    if (!form.area.trim()) return
    onSubmit(form)
  }

  const chip = (label: string, active: boolean, onClick: () => void, color = '#3b82f6') => (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 100, border: '1px solid',
      borderColor: active ? color : 'rgba(255,255,255,0.1)',
      background: active ? `${color}22` : 'transparent',
      color: active ? color : 'rgba(255,255,255,0.5)',
      fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
    }}>{label}</button>
  )

  const label = (text: string) => (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 10 }}>{text}</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '8px 0' }}>

      {/* Intent */}
      <div>
        {label('Are you buying or leasing?')}
        <div style={{ display: 'flex', gap: 10 }}>
          {chip('Buying', form.intent === 'buy', () => set('intent', 'buy'))}
          {chip('Leasing', form.intent === 'lease', () => set('intent', 'lease'))}
        </div>
      </div>
      {/* Area */}
      <div>
        {label('Where are you looking?')}
        <input
          value={form.area}
          onChange={e => set('area', e.target.value)}
          placeholder="e.g. Whitby, Mississauga, King West..."
          style={{
            width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: 14, outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Budget */}
      <div>
        {label('Budget Range')}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={form.budgetMin} onChange={e => set('budgetMin', e.target.value)} style={{
            flex: 1, background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
            padding: '11px 14px', color: form.budgetMin ? '#fff' : 'rgba(255,255,255,0.35)', fontSize: 13, outline: 'none',
          }}>
            <option value="">No Min</option>
            {BUDGETS.slice(0,-1).map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>to</span>
          <select value={form.budgetMax} onChange={e => set('budgetMax', e.target.value)} style={{
            flex: 1, background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
            padding: '11px 14px', color: form.budgetMax ? '#fff' : 'rgba(255,255,255,0.35)', fontSize: 13, outline: 'none',
          }}>
            <option value="">No Max</option>
            {BUDGETS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      {/* Property Type */}
      <div>
        {label('Property Type')}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {chip('Any', form.propertyType === 'any', () => set('propertyType', 'any'))}
          {chip('Condo', form.propertyType === 'condo', () => set('propertyType', 'condo'))}
          {chip('House', form.propertyType === 'homes', () => set('propertyType', 'homes'))}
        </div>
      </div>

      {/* Bedrooms */}
      <div>
        {label('Bedrooms')}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['Studio','1','2','3','4+'].map(b => chip(b, form.bedrooms === b, () => set('bedrooms', b)))}
        </div>
      </div>

      {/* Timeline */}
      <div>
        {label('Timeline')}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TIMELINES.map(t => chip(t, form.timeline === t, () => set('timeline', t), '#8b5cf6'))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
        <button onClick={onBack} style={{
          padding: '12px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
          background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>← Back</button>
        <button onClick={handleSubmit} disabled={!form.area.trim()} style={{
          flex: 1, padding: '12px', borderRadius: 12, border: 'none', cursor: form.area.trim() ? 'pointer' : 'default',
          background: form.area.trim() ? 'linear-gradient(135deg, #1d4ed8, #4f46e5)' : 'rgba(255,255,255,0.1)',
          color: form.area.trim() ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: 14, fontWeight: 700,
        }}>{form.intent === 'buy' ? 'Find My Home' : 'Find Rentals'} →</button>
      </div>
    </div>
  )
}