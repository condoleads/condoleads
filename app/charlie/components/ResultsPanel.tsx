// app/charlie/components/ResultsPanel.tsx
'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import PlanDocument from './PlanDocument'
import SellerEstimateBlock from './SellerEstimateBlock'
import ComparableCard from './ComparableCard'
import ActiveListingCard from './ActiveListingCard'

const AnalyticsSection = dynamic(() => import('@/components/analytics/AnalyticsSection'), { ssr: false })

interface Props {
  analytics: any | null
  listingGroups: { label: string; listings: any[] }[]
  comparables: any[]
  geoContext: { geoType: string; geoId: string; geoName: string } | null
  plan?: any | null
  agent?: any | null
  onSendPlan?: () => void
  leadCaptured?: boolean
  sellerEstimate?: any | null
}

const fmt = (n: number | null | undefined, prefix = '', suffix = '') =>
  n == null ? '—' : `${prefix}${n.toLocaleString('en-CA')}${suffix}`

function marketConditionLabel(stl: number | null, dom: number | null) {
  if (!stl || !dom) return { label: 'Insufficient Data', color: '#94a3b8' }
  if (stl >= 99 && dom <= 20) return { label: "Strong Seller's Market", color: '#10b981' }
  if (stl >= 97 && dom <= 40) return { label: "Seller's Market", color: '#10b981' }
  if (stl < 95 || dom > 70) return { label: "Buyer's Market", color: '#ef4444' }
  return { label: 'Balanced Market', color: '#f59e0b' }
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
      color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
      marginBottom: 12, paddingTop: 8,
      borderTop: '1px solid rgba(255,255,255,0.06)',
    }}>{title}</div>
  )
}

export default function ResultsPanel({ analytics, listingGroups, comparables, geoContext, plan, agent, onSendPlan, leadCaptured, sellerEstimate }: Props) {
  const [competingListings, setCompetingListings] = useState<any[]>([])
  const [competingLoading, setCompetingLoading] = useState(false)

  useEffect(() => {
    if (!sellerEstimate?.success) return
    const { path, communityId, municipalityId, bedrooms, livingAreaRange, propertySubtype } = sellerEstimate
    if (!path) return
    if (path === 'condo' && !communityId) return
    if (path === 'home' && !municipalityId) return

    setCompetingLoading(true)
    fetch('/api/charlie/competing-listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, communityId, municipalityId, bedrooms, livingAreaRange, propertySubtype }),
    })
      .then(r => r.json())
      .then(d => { if (d.success) setCompetingListings(d.listings || []) })
      .catch(e => console.error('[competing-listings]', e))
      .finally(() => setCompetingLoading(false))
  }, [sellerEstimate?.success, sellerEstimate?.communityId, sellerEstimate?.municipalityId])

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      background: '#080f1a',
    }}>

      {/* Market snapshot */}
      {analytics && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
            Market Intelligence · {geoContext?.geoName}
          </div>
          {(() => {
            const cond = marketConditionLabel(analytics.sale_to_list_ratio, analytics.closed_avg_dom_90)
            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: `${cond.color}18`,
                  border: `1px solid ${cond.color}40`,
                  borderRadius: 100, padding: '5px 14px', marginBottom: 14,
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: cond.color, boxShadow: `0 0 6px ${cond.color}` }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: cond.color }}>{cond.label}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    { label: 'Median PSF', value: fmt(analytics.median_psf, '$'), color: '#3b82f6' },
                    { label: 'Avg DOM', value: fmt(analytics.closed_avg_dom_90, '', 'd'), color: '#6366f1' },
                    { label: 'Sale/List', value: fmt(analytics.sale_to_list_ratio, '', '%'), color: '#10b981' },
                    { label: 'Active', value: fmt(analytics.active_count), color: '#8b5cf6' },
                    { label: 'Sold 90d', value: fmt(analytics.closed_sale_count_90), color: '#ec4899' },
                    { label: 'Absorption', value: fmt(analytics.absorption_rate_pct, '', '%'), color: '#f59e0b' },
                  ].map(m => (
                    <div key={m.label} style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 12, padding: '12px',
                    }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{m.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: m.color }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Seller estimate */}
      {sellerEstimate?.success && (
        <div>
          <SectionHeader title="Property Estimate" />
          <SellerEstimateBlock
            estimate={sellerEstimate.estimate}
            comparables={[]}
            buildingName={sellerEstimate.buildingName}
            geoLevel={sellerEstimate.geoLevel}
            resolvedAddress={sellerEstimate.resolvedAddress}
            intent={sellerEstimate.intent || 'sale'}
            isLease={sellerEstimate.intent === 'lease'}
          />
        </div>
      )}

      {/* Comparable Sold */}
      {comparables.length > 0 && (
        <div>
          <SectionHeader title={`Comparable Sold · ${comparables.length} found`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {comparables.map((c, i) => (
              <ComparableCard key={c.listingKey || i} comparable={c} isLease={sellerEstimate?.intent === 'lease'} />
            ))}
          </div>
        </div>
      )}

      {/* Competing For Sale */}
      {sellerEstimate?.success && (
        <div>
          <SectionHeader title={competingLoading ? 'Competing For Sale · Loading...' : `Competing For Sale · ${competingListings.length} found`} />
          {competingLoading && (
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, padding: '12px 0' }}>Searching active listings...</div>
          )}
          {!competingLoading && competingListings.length === 0 && (
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, padding: '12px 0' }}>No active competing listings found.</div>
          )}
          {!competingLoading && competingListings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {competingListings.map((l, i) => (
                <ActiveListingCard key={l.id || i} listing={l} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Buyer listings */}
      {listingGroups.map((group, gi) => (
        <div key={gi}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12, paddingTop: gi > 0 ? 8 : 0, borderTop: gi > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            {group.label} · {group.listings.length} found
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {group.listings.map((listing) => {
              const url = listing._slug || ('/' + (listing.listing_key || '').toLowerCase())
              return (
                <div key={listing.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '14px', display: 'flex', gap: 14, alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => window.open(url, '_blank')}>
                  <div style={{ width: 72, height: 72, borderRadius: 10, background: 'rgba(255,255,255,0.08)', flexShrink: 0, overflow: 'hidden' }}>
                    {(listing.media?.[0]?.media_url || listing.media?.[0]?.url) && (
                      <img src={listing.media[0].media_url || listing.media[0].url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 3 }}>
                      {listing.close_price ? '$' + listing.close_price.toLocaleString() : '$' + (listing.list_price?.toLocaleString() || '—')}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {listing.unparsed_address}
                    </div>
                    <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                      {listing.bedrooms_total && <span>{listing.bedrooms_total} bed</span>}
                      {listing.bathrooms_total_integer && <span>{listing.bathrooms_total_integer} bath</span>}
                      {listing.property_subtype && <span style={{ color: 'rgba(255,255,255,0.2)' }}>{listing.property_subtype}</span>}
                    </div>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 18, flexShrink: 0 }}>→</div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Plan */}
      {plan?.planReady && (
        <PlanDocument
          {...(plan.type === 'buyer' ? {
            type: 'buyer',
            geoName: plan.geoName,
            budgetMin: plan.budgetMin,
            budgetMax: plan.budgetMax,
            propertyType: plan.propertyType,
            bedrooms: plan.bedrooms,
            timeline: plan.timeline,
            analytics,
            listings: listingGroups.flatMap(g => g.listings),
            agent: agent ? { name: agent.full_name, email: agent.email, phone: agent.cell_phone, photo: agent.profile_photo_url, brokerage: agent.brokerage_name, title: agent.title } : undefined,
            onSendPlan: onSendPlan || (() => {}),
            leadCaptured: leadCaptured || false,
          } : {
            type: 'seller',
            geoName: plan.geoName,
            propertyType: plan.propertyType,
            estimatedValueMin: plan.estimatedValueMin,
            estimatedValueMax: plan.estimatedValueMax,
            timeline: plan.timeline,
            goal: plan.goal,
            analytics,
            agent: agent ? { name: agent.full_name, email: agent.email, phone: agent.cell_phone, photo: agent.profile_photo_url, brokerage: agent.brokerage_name, title: agent.title } : undefined,
            onSendPlan: onSendPlan || (() => {}),
            leadCaptured: leadCaptured || false,
          })}
        />
      )}

      {/* Empty state */}
      {!analytics && listingGroups.length === 0 && comparables.length === 0 && !sellerEstimate && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.15)', gap: 12,
          padding: '60px 20px',
        }}>
          <div style={{ fontSize: 40 }}>✦</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.25)' }}>
            Results will appear here
          </div>
          <div style={{ fontSize: 12, textAlign: 'center' }}>
            Tell Charlie where you're looking and what you need
          </div>
        </div>
      )}
    </div>
  )
}