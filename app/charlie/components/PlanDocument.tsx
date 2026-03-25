// app/charlie/components/PlanDocument.tsx
'use client'
import { useState } from 'react'
import AppointmentForm from './AppointmentForm'

interface AgentInfo {
  name: string
  email?: string
  phone?: string
  photo?: string
  brokerage?: string
  title?: string
}

interface BuyerPlanProps {
  type: 'buyer'
  geoName: string
  budgetMin?: number
  budgetMax?: number
  propertyType?: string
  bedrooms?: number
  timeline?: string
  analytics: any
  listings: any[]
  agent?: AgentInfo
  onSendPlan: () => void
  leadCaptured: boolean
  sessionId?: string | null
  userId?: string | null
  geoContext?: { geoType: string; geoId: string; geoName: string } | null
  onLeadCaptured?: () => void
}

interface SellerPlanProps {
  type: 'seller'
  geoName: string
  propertyType?: string
  estimatedValueMin?: number
  estimatedValueMax?: number
  timeline?: string
  goal?: string
  analytics: any
  agent?: AgentInfo
  onSendPlan: () => void
  leadCaptured: boolean
  sessionId?: string | null
  userId?: string | null
  geoContext?: { geoType: string; geoId: string; geoName: string } | null
  onLeadCaptured?: () => void
}

type PlanDocumentProps = BuyerPlanProps | SellerPlanProps

const fmt = (n: number | null | undefined, prefix = '', suffix = '') =>
  n == null ? '—' : `${prefix}${n.toLocaleString('en-CA')}${suffix}`

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function PlanSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function StatRow({ label, value, color = '#fff' }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
    </div>
  )
}

export default function PlanDocument(props: PlanDocumentProps) {
  const { analytics, agent, onSendPlan, leadCaptured, sessionId, userId, onLeadCaptured, geoContext: planGeoContext } = props

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const seasonal = analytics?.insight_seasonal
  const bestMonth = seasonal?.best_months?.[0]
  const condition = (() => {
    const stl = analytics?.sale_to_list_ratio
    const dom = analytics?.closed_avg_dom_90
    if (!stl || !dom) return { label: 'Insufficient Data', color: '#94a3b8' }
    if (stl >= 99 && dom <= 20) return { label: "Strong Seller's Market", color: '#10b981' }
    if (stl >= 97 && dom <= 40) return { label: "Seller's Market", color: '#10b981' }
    if (stl < 95 || dom > 70) return { label: "Buyer's Market", color: '#ef4444' }
    return { label: 'Balanced Market', color: '#f59e0b' }
  })()

  const handleSubmitPlan = async () => {
    if (!name.trim() || !email.trim()) {
      setSubmitError('Name and email are required')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      const body: any = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        intent: props.type,
        analytics,
        sessionId: sessionId || null,
        community_id: planGeoContext?.geoType === 'community' ? planGeoContext.geoId : null,
        municipality_id: planGeoContext?.geoType === 'municipality' ? planGeoContext.geoId : null,
        area_id: planGeoContext?.geoType === 'area' ? planGeoContext.geoId : null,
        userId: userId || null,
      }

      if (props.type === 'buyer') {
        body.buyerProfile = {
          geoName: props.geoName,
          budgetMin: props.budgetMin,
          budgetMax: props.budgetMax,
          propertyType: props.propertyType,
          bedrooms: props.bedrooms,
          timeline: props.timeline,
        }
        body.listings = (props as BuyerPlanProps).listings || []
      } else {
        body.sellerProfile = {
          geoName: props.geoName,
          propertyType: props.propertyType,
          estimatedValueMin: props.estimatedValueMin,
          estimatedValueMax: props.estimatedValueMax,
          timeline: props.timeline,
          goal: props.goal,
        }
      }

      const res = await fetch('/api/charlie/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (data.success) {
        onLeadCaptured?.()
      } else {
        setSubmitError(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: '#fff',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 16,
      padding: 24,
      marginTop: 8,
    }}>
      {/* Plan header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: props.type === 'buyer' ? 'linear-gradient(135deg, #1d4ed8, #4f46e5)' : 'linear-gradient(135deg, #059669, #10b981)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
        }}>
          {props.type === 'buyer' ? '🏠' : '💰'}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
            {props.type === 'buyer' ? 'Your Buyer Plan' : 'Your Seller Strategy'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            {props.geoName} · {new Date().toLocaleDateString('en-CA')}
          </div>
        </div>
      </div>

      {/* Market condition */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${condition.color}18`, border: `1px solid ${condition.color}40`, borderRadius: 100, padding: '5px 14px', marginBottom: 20 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: condition.color, boxShadow: `0 0 6px ${condition.color}` }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: condition.color }}>{condition.label}</span>
      </div>

      {/* Buyer plan content */}
      {props.type === 'buyer' && (
        <>
          <PlanSection title="Your Profile">
            {props.budgetMax && <StatRow label="Budget" value={`${fmt(props.budgetMin, '$')} — ${fmt(props.budgetMax, '$')}`} color="#3b82f6" />}
            {props.propertyType && <StatRow label="Property Type" value={props.propertyType} />}
            {props.bedrooms && <StatRow label="Bedrooms" value={`${props.bedrooms}+`} />}
            {props.timeline && <StatRow label="Timeline" value={props.timeline} />}
          </PlanSection>

          <PlanSection title="Market Snapshot">
            <StatRow label="Median PSF" value={fmt(analytics?.median_psf, '$')} color="#3b82f6" />
            <StatRow label="Avg Days on Market" value={fmt(analytics?.closed_avg_dom_90, '', 'd')} color="#6366f1" />
            <StatRow label="Sale-to-List Ratio" value={fmt(analytics?.sale_to_list_ratio, '', '%')} color="#10b981" />
            <StatRow label="Active Listings" value={fmt(analytics?.active_count)} />
          </PlanSection>

          {bestMonth && (
            <PlanSection title="Best Time to Buy">
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7 }}>
                Based on 12 months of market data, <span style={{ color: '#f59e0b', fontWeight: 700 }}>{MONTHS[bestMonth - 1]}</span> historically offers the most negotiating power in {props.geoName}. Current avg DOM is <span style={{ color: '#fff', fontWeight: 700 }}>{fmt(analytics?.closed_avg_dom_90, '', 'd')}</span>.
              </div>
            </PlanSection>
          )}

          {props.listings.length > 0 && (
            <PlanSection title={`Top Matches (${props.listings.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {props.listings.slice(0, 5).map((l: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>${l.list_price?.toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{l.unparsed_address?.split(',')[0]}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'right' }}>
                      {l.bedrooms_total} bed · {l.bathrooms_total_integer} bath
                    </div>
                  </div>
                ))}
              </div>
            </PlanSection>
          )}
        </>
      )}

      {/* Seller plan content */}
      {props.type === 'seller' && (
        <>
          <PlanSection title="Your Property">
            {props.propertyType && <StatRow label="Type" value={props.propertyType} />}
            {props.estimatedValueMin && <StatRow label="Estimated Value" value={`${fmt(props.estimatedValueMin, '$')} — ${fmt(props.estimatedValueMax, '$')}`} color="#10b981" />}
            {props.timeline && <StatRow label="Timeline" value={props.timeline} />}
            {props.goal && <StatRow label="Goal" value={props.goal} />}
          </PlanSection>

          <PlanSection title="Market Snapshot">
            <StatRow label="Market Condition" value={condition.label} color={condition.color} />
            <StatRow label="Avg Days on Market" value={fmt(analytics?.closed_avg_dom_90, '', 'd')} color="#6366f1" />
            <StatRow label="Sale-to-List Ratio" value={fmt(analytics?.sale_to_list_ratio, '', '%')} color="#10b981" />
            <StatRow label="Active Competition" value={fmt(analytics?.active_count, '', ' listings')} />
          </PlanSection>

          {bestMonth && (
            <PlanSection title="Best Time to List">
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7 }}>
                Data shows <span style={{ color: '#10b981', fontWeight: 700 }}>{MONTHS[bestMonth - 1]}</span> is the strongest month for sellers in {props.geoName}. With a {fmt(analytics?.sale_to_list_ratio, '', '%')} sale-to-list ratio, pricing at market is critical.
              </div>
            </PlanSection>
          )}
        </>
      )}

      {/* Agent card */}
      {agent && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          {agent.photo && (
            <img src={agent.photo} alt={agent.name} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{agent.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{agent.title || 'Real Estate Agent'}{agent.brokerage ? ` · ${agent.brokerage}` : ''}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              {agent.phone && <a href={`tel:${agent.phone}`} style={{ fontSize: 11, color: '#3b82f6', textDecoration: 'none' }}>{agent.phone}</a>}
              {agent.email && <a href={`mailto:${agent.email}`} style={{ fontSize: 11, color: '#3b82f6', textDecoration: 'none' }}>{agent.email}</a>}
            </div>
          </div>
        </div>
      )}

      {/* CTA — contact form or confirmation */}
      {!leadCaptured ? (
        <AppointmentForm
          type={props.type}
          listings={props.type === 'buyer' ? (props as any).listings || [] : []}
          userId={userId}
          sessionId={sessionId}
          geoContext={planGeoContext}
          agent={agent ? { name: agent.name, email: agent.email, phone: agent.phone, photo: agent.photo, brokerage: agent.brokerage } : null}
          onBooked={() => { onLeadCaptured?.() }}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, color: '#10b981', fontSize: 13, fontWeight: 700 }}>
          ✓ Appointment requested! Your agent will confirm shortly.
        </div>
      )}
    </div>
  )
}