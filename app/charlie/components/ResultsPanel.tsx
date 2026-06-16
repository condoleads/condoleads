// app/charlie/components/ResultsPanel.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import PlanDocument from './PlanDocument'
import SellerEstimateBlock from './SellerEstimateBlock'
import ComparableCard from './ComparableCard'
import ActiveListingCard from './ActiveListingCard'
import PricingRiskBlock from './PricingRiskBlock'
import BuyerOfferBlock from './BuyerOfferBlock'
import BuildingCard from './BuildingCard'
// W-CHARLIE-BUYER-CHUNK4 (2026-06-15): in-chat buyer Tax-Matched now
// queries the SAME server endpoint that plan-email/route.ts persists
// from — /api/charlie/buyer-tax-match. Tax-match is SOLD-comp
// matching (real Closed listings whose tax falls in a band derived
// from the buyer's matched-listings tax median), NOT the prior
// "assessment / what you'll pay yearly" framing.
import type { BuyerTaxMatch } from '@/lib/charlie/buyer-tax-match'
import { BUYER_COMP_SOLD_CAP } from '@/lib/charlie/buyer-tax-match'
// W-CHARLIE-BUYER-NARRATION (2026-06-15): shared narration builders.
import { buildCompSoldNarration, buildTaxMatchNarration } from '@/lib/charlie/buyer-narration'

const AnalyticsSection = dynamic(() => import('@/components/analytics/AnalyticsSection'), { ssr: false })

interface Props {
  analytics: any[]
  listingGroups: { label: string; listings: any[] }[]
  comparables: any[]
  geoContext: { geoType: string; geoId: string; geoName: string } | null
  plan?: any | null
  agent?: any | null
  onSendPlan?: () => void
  leadCaptured?: boolean
  sellerEstimate?: any | null
  communityBuildings?: { affordable: any[], premium: any[] }
  sessionId?: string | null
  userId?: string | null
  onLeadCaptured?: () => void
  vipCreditUsed?: boolean
  vipCreditPlansUsed?: number
  vipCreditTotal?: number
  searchedBuildings?: { label: string; buildings: any[] }[]
  rankings: any[]
  priceTrends: any[]
  seasonalData?: any | null
  blocks?: any[]
  // W-CHARLIE-INCHAT-TAXMATCH-HYDRATE (2026-06-16): hydrated buyerTaxMatch
  // from plan-email response (failing-path session). Threaded to
  // BuyerTaxMatchInChat as initialBtm so it renders without depending
  // on the silent-failing self-fetch. Null on the in-session path.
  backfilledTaxMatch?: BuyerTaxMatch | null
}

const fmt = (n: number | null | undefined, prefix = '', suffix = '') =>
  n == null ? 'ΓÇö' : `${prefix}${n.toLocaleString('en-CA')}${suffix}`

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

export default function ResultsPanel({ analytics, listingGroups, comparables, geoContext, plan, agent, onSendPlan, leadCaptured, sellerEstimate, communityBuildings, sessionId, userId, onLeadCaptured, vipCreditUsed, vipCreditPlansUsed, vipCreditTotal, searchedBuildings, rankings, priceTrends, seasonalData, blocks, backfilledTaxMatch }: Props) {

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

      {/* Conversation blocks - rendered in conversation order, never overwritten */}
      {(blocks || []).map((block: any, _bi: number) => {

        /* ΓöÇΓöÇ ANALYTICS ΓöÇΓöÇ */
        if (block.type === 'analytics') {
          const a = block.data
          const cond = marketConditionLabel(a.sale_to_list_ratio, a.closed_avg_dom_90)
          return (
            <div key={_bi}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
                Market Intelligence ┬╖ {block.geoName}
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${cond.color}18`, border: `1px solid ${cond.color}40`, borderRadius: 100, padding: '5px 14px', marginBottom: 14 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: cond.color, boxShadow: `0 0 6px ${cond.color}` }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: cond.color }}>{cond.label}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    { label: 'Median PSF', value: fmt(a.median_psf, '$'), color: '#3b82f6' },
                    { label: 'Avg DOM', value: fmt(a.closed_avg_dom_90, '', 'd'), color: '#6366f1' },
                    { label: 'Sale/List', value: fmt(a.sale_to_list_ratio, '', '%'), color: '#10b981' },
                    { label: 'Active', value: fmt(a.active_count), color: '#8b5cf6' },
                    { label: 'Sold 90d', value: fmt(a.closed_sale_count_90), color: '#ec4899' },
                    { label: 'Absorption', value: fmt(a.absorption_rate_pct, '', '%'), color: '#f59e0b' },
                  ].map(m => (
                    <div key={m.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{m.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: m.color }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              {!(blocks||[]).some((b) => b.type === 'sellerEstimate') && (<div>
                <SectionHeader title="Buyer Intelligence" />
                <BuyerOfferBlock analytics={a} propertyType={a.track} geoName={block.geoName} />
              </div>)}
            </div>
          )
        }

        /* ΓöÇΓöÇ LISTINGS (For Sale) ΓöÇΓöÇ */
        if (block.type === 'listings') {
          // W-CHARLIE-BUYER-NARRATION (2026-06-15): clear "For Sale"
          // headline + the original geo label as secondary. The block
          // label (data-driven from search_listings, e.g. "Homes in
          // Whitby") was the operator-visible discoverability gap.
          // Tiles and data shape unchanged from Chunk 3.
          const hasSellerEstimate = (blocks||[]).some((b: any) => b.type === 'sellerEstimate')
          return (
            <div key={_bi}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 4, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {hasSellerEstimate ? `${block.label}` : 'For Sale'} ┬╖ {block.listings.length} found
              </div>
              {!hasSellerEstimate && block.label && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>{block.label}</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {block.listings.map((listing: any) => {
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
                          {listing.close_price ? '$' + listing.close_price.toLocaleString() : '$' + (listing.list_price?.toLocaleString() || 'ΓÇö')}
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
                      <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 18, flexShrink: 0 }}>ΓåÆ</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        }

        /* ΓöÇΓöÇ BUILDINGS ΓöÇΓöÇ */
        if (block.type === 'buildings') {
          return (
            <div key={_bi}>
              <SectionHeader title={`Buildings Found ┬╖ ${block.label} ┬╖ ${block.buildings.length}`} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {block.buildings.map((b: any, i: number) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                    {b.photo && <img src={b.photo} alt={b.buildingName} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <div>
                          <a href={b.url} target="_blank" rel="noopener noreferrer" style={{ color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>{b.buildingName}</a>
                          {b.yearBuilt && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginLeft: 8 }}>Built {b.yearBuilt}</span>}
                        </div>
                        {b.activeCount > 0 && <span style={{ background: '#10b981', color: '#fff', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{b.activeCount} active</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                        {b.medianPrice > 0 && <span style={{ color: '#60a5fa', fontSize: 13, fontWeight: 600 }}>{fmt(b.medianPrice, '$')}</span>}
                        {b.medianPsf > 0 && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{fmt(b.medianPsf, '$')}/sqft</span>}
                        {b.maintenanceFee > 0 && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Maint {fmt(b.maintenanceFee, '$')}/mo</span>}
                        {b.rentalYield > 0 && <span style={{ color: '#f59e0b', fontSize: 12 }}>{b.rentalYield.toFixed(1)}% yield</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        }

        /* ΓöÇΓöÇ RANKINGS ΓöÇΓöÇ */
        if (block.type === 'rankings') {
          if (block.rankType === 'investment' && block.data?.rankings?.length > 0) return (
            <div key={_bi}>
              <SectionHeader title={`${(block.data.ranking_type || '').split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} ┬╖ ${block.data.track === 'condo' ? 'Condos' : 'Homes'}`} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {block.data.rankings.slice(0, 8).map((r: any, i: number) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginRight: 8 }}>#{r.rank}</span>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: '#fff', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>{r.entity_name}</a>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {r.median_price && <span style={{ color: '#60a5fa', fontSize: 12, fontWeight: 600 }}>{fmt(r.median_price, '$')}</span>}
                      {r.gross_yield && <span style={{ color: '#f59e0b', fontSize: 12 }}>{r.gross_yield.toFixed(1)}% yield</span>}
                      {r.avg_dom && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{Math.round(r.avg_dom)}d DOM</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
          if (block.rankType === 'inventory') return (
            <div key={_bi}>
              {Object.entries(block.data.rankings || {}).map(([rankType, items]: [string, any]) => items.length > 0 && (
                <div key={rankType} style={{ marginBottom: 16 }}>
                  <SectionHeader title={rankType.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.slice(0, 5).map((r: any, i: number) => (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: '#fff', fontSize: 13, textDecoration: 'none' }}>{r.entity_name}</a>
                        <div style={{ display: 'flex', gap: 10 }}>
                          {r.median_price && <span style={{ color: '#60a5fa', fontSize: 12 }}>{fmt(r.median_price, '$')}</span>}
                          {r.price_reduction_rate && <span style={{ color: '#ef4444', fontSize: 12 }}>{r.price_reduction_rate.toFixed(0)}% reduced</span>}
                          {r.avg_dom && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{Math.round(r.avg_dom)}d DOM</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
          return null
        }

        /* ΓöÇΓöÇ PRICE TRENDS ΓöÇΓöÇ */
        if (block.type === 'priceTrends' && block.data.current_median_sale) return (
          <div key={_bi}>
            <SectionHeader title="Price Trends" />
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div><div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Median Price</div><div style={{ color: '#60a5fa', fontWeight: 700, fontSize: 16 }}>{fmt(block.data.current_median_sale, '$')}</div></div>
                {block.data.current_avg_psf && <div><div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Avg PSF</div><div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>{fmt(block.data.current_avg_psf, '$')}/sqft</div></div>}
                {block.data.psf_trend_pct != null && <div><div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>PSF Trend</div><div style={{ color: block.data.psf_trend_pct >= 0 ? '#10b981' : '#ef4444', fontWeight: 600, fontSize: 15 }}>{block.data.psf_trend_pct > 0 ? '+' : ''}{block.data.psf_trend_pct?.toFixed(1)}%</div></div>}
                {block.data.current_median_lease && <div><div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Median Rent</div><div style={{ color: '#f59e0b', fontWeight: 600, fontSize: 15 }}>{fmt(block.data.current_median_lease, '$')}/mo</div></div>}
              </div>
            </div>
          </div>
        )

        /* ΓöÇΓöÇ SELLER ESTIMATE (self-contained block with own analytics snapshot) ΓöÇΓöÇ */
        if (block.type === 'sellerEstimate') {
          const se = block.data
          const aSnap = block.analyticsSnapshot
          return (
            <div key={_bi}>
              {/* W-CHARLIE-FIX GAP 1 (2026-06-14): un-gate Market Intelligence
                  grid + Price by Home Type + Offer Intelligence for the seller
                  flow. Pre-fix bug: setSellerEstimate (useCharlie.ts:262-271)
                  pushes only a 'sellerEstimate' block to state.blocks, never
                  an 'analytics' block. The analytics-block render path
                  (line 78+) — which is where Market Intel + BuyerOfferBlock
                  live — was therefore unreachable in seller flow. Real-DOM
                  harness confirmed all 3 sections ABSENT pre-fix despite
                  source-grep reporting them PRESENT (CV-3's blind spot).
                  Fix: render the same 3 subsections inside the sellerEstimate
                  block, fed by block.analyticsSnapshot (already threaded
                  through). Buyer flow path (lines 78-110) untouched —
                  buyers still get the analytics block + BuyerOfferBlock via
                  the line-107 gate, which only suppresses BuyerOfferBlock
                  when a sellerEstimate block exists. */}
              {se?.success && aSnap && (() => {
                const cond = marketConditionLabel(aSnap.sale_to_list_ratio, aSnap.closed_avg_dom_90)
                return (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
                      Market Intelligence · {block.geoName}
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${cond.color}18`, border: `1px solid ${cond.color}40`, borderRadius: 100, padding: '5px 14px', marginBottom: 14 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: cond.color, boxShadow: `0 0 6px ${cond.color}` }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: cond.color }}>{cond.label}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                        {[
                          { label: 'Median PSF', value: fmt(aSnap.median_psf, '$'), color: '#3b82f6' },
                          { label: 'Avg DOM', value: fmt(aSnap.closed_avg_dom_90, '', 'd'), color: '#6366f1' },
                          { label: 'Sale/List', value: fmt(aSnap.sale_to_list_ratio, '', '%'), color: '#10b981' },
                          { label: 'Active', value: fmt(aSnap.active_count), color: '#8b5cf6' },
                          { label: 'Sold 90d', value: fmt(aSnap.closed_sale_count_90), color: '#ec4899' },
                          { label: 'Absorption', value: fmt(aSnap.absorption_rate_pct, '', '%'), color: '#f59e0b' },
                        ].map(m => (
                          <div key={m.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px' }}>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{m.label}</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: m.color }}>{m.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* BuyerOfferBlock contains Offer Intelligence + Price by
                        Home Type — both useful to sellers (anticipated offer
                        levels + subtype-level price breakdown). Rendering
                        them here closes the operator-confirmed GAP 1 without
                        changing the buyer-side render path.

                        W-CHARLIE-FIX GAP 1 (2026-06-14): derive propertyType
                        from se.path ('home'→'homes', 'condo'→'condo') with
                        aSnap.track as fallback. seller-estimate API now also
                        stamps `track` into marketAnalytics (see
                        app/api/charlie/seller-estimate/route.ts), so either
                        source resolves correctly; the path-derived fallback
                        guarantees isHomes/isCondo gate inside BuyerOfferBlock
                        fires even on legacy/cached payloads. */}
                    <BuyerOfferBlock
                      analytics={aSnap}
                      propertyType={aSnap.track || (se.path === 'home' ? 'homes' : 'condo')}
                      geoName={block.geoName}
                    />
                  </div>
                )
              })()}
              {se?.success && (
                <div>
                  <SectionHeader title="Property Estimate" />
                  <SellerEstimateBlock
                    estimate={se.estimate}
                    comparables={se.comparables || []}
                    buildingName={se.buildingName}
                    subjectAddress={se.subjectAddress}
                    geoLevel={se.geoLevel}
                    resolvedAddress={se.resolvedAddress}
                    intent={se.intent || 'sale'}
                    isLease={se.intent === 'lease'}
                  />
                </div>
              )}
              {se?.success && (
                <div>
                  <SectionHeader title={`Competing For Sale ┬╖ ${(se?.competingListings || []).length} found`} />
                  {(se?.competingListings || []).length === 0 && (
                    <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, padding: '12px 0' }}>No active competing listings found.</div>
                  )}
                  {(se?.competingListings || []).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(se?.competingListings || []).map((l: any, i: number) => (
                        <ActiveListingCard key={l.id || i} listing={l} />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {se?.success && aSnap && (
                <div>
                  <SectionHeader title="Pricing Strategy & Risk" />
                  <PricingRiskBlock
                    analytics={aSnap}
                    estimatedPrice={se.estimate?.estimatedPrice}
                    intent={se.intent || 'sale'}
                    geoName={block.geoName}
                  />
                </div>
              )}
              {se?.success && !plan?.planReady && (
                <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #059669, #10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>≡ƒÆ░</div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Your Seller Strategy</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{block.geoName} ┬╖ {new Date().toLocaleDateString('en-CA')}</div>
                    </div>
                  </div>
                  {aSnap && (() => {
                    const cond = marketConditionLabel(aSnap.sale_to_list_ratio, aSnap.closed_avg_dom_90)
                    return (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: cond.color + '18', border: '1px solid ' + cond.color + '40', borderRadius: 100, padding: '5px 14px', marginBottom: 16 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: cond.color }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: cond.color }}>{cond.label}</span>
                      </div>
                    )
                  })()}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 8 }}>Your Property</div>
                    {se.estimate?.estimatedPrice && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Estimated Value</span><span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>${se.estimate.priceRange?.low?.toLocaleString()} ΓÇô ${se.estimate.priceRange?.high?.toLocaleString()}</span></div>}
                  </div>
                  {aSnap && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 8 }}>Market Snapshot</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Avg Days on Market</span><span style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>{fmt(aSnap.closed_avg_dom_90, '', 'd')}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Sale-to-List Ratio</span><span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>{fmt(aSnap.sale_to_list_ratio, '', '%')}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Active Competition</span><span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{fmt(aSnap.active_count, '', ' listings')}</span></div>
                    </div>
                  )}
                </div>
              )}










            </div>
          )
        }

        /* ΓöÇΓöÇ COMPARABLES (standalone, non-seller) ΓöÇΓöÇ */
        if (block.type === 'comparables') {
          if ((blocks||[]).some((b) => b.type === 'sellerEstimate')) return null
          // W-CHARLIE-BUYER-INCHAT-FIX (2026-06-15): defense-in-depth gate.
          // The push site (useCharlie.ts:610-612) now refuses empty
          // arrays, so this branch should not normally see length===0;
          // keeping the gate prevents a stale or hand-injected empty
          // block from rendering as "Comparable Sold · 0 found".
          if (!block.listings || block.listings.length === 0) return null
          // W-CHARLIE-BUYER-CHUNK5 (2026-06-15): render Tax-Matched
          // IMMEDIATELY below Comparable Sold so the buyer in-chat
          // surface puts the two sold-comp sections adjacent — same
          // positioning the email + lead-page have (Defect 1 fix).
          // Pre-fix Chunk-5 the BuyerTaxMatchInChat block rendered
          // AFTER blocks.map closed → below the plan card, hard to
          // find. Now it's a sibling of Comparable Sold within the
          // same conversation block.
          // W-CHARLIE-BUYER-NARRATION (2026-06-15): offer narration —
          // shared builder. Reads analytics (most-recent snapshot) for
          // avg_concession_pct + plan?.budgetMax. Omits clause when
          // data is thin (Rule Zero).
          const _aSnap = analytics[analytics.length - 1] || null
          const _budgetMax = plan?.budgetMax
          const _avgConc = _aSnap?.avg_concession_pct ?? null
          const _compNarr = buildCompSoldNarration({
            comparables: block.listings,
            budgetMax: _budgetMax,
            avgConcessionPct: _avgConc,
          })
          return (
            <div key={_bi}>
              <SectionHeader title={`Comparable Sold ┬╖ ${block.listings.length} found`} />
              {_compNarr.text && (
                <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)', borderRadius: 10, fontSize: 12, color: '#a7f3d0', lineHeight: 1.5 }}>
                  {_compNarr.text}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {block.listings.map((c: any, i: number) => (
                  <ComparableCard key={(c.listingKey || c.listing_key) || i} comparable={c} isLease={block.intent === 'lease'} />
                ))}
              </div>
              {/* W-CHARLIE-INCHAT-CONVERGENCE (2026-06-16): BuyerTaxMatchInChat
                  sibling REMOVED from this branch — hoisted to a top-level
                  block that renders below the conversation blocks. Single
                  invocation site → guaranteed single render regardless of
                  whether the in-session get_comparables path OR the
                  backfill-hydration path provided the listings. */}
            </div>
          )
        }

        if (block.type === 'plan') {
          const p = block.data
          const aSnap = block.analyticsSnapshot
          const lSnap = listingGroups.flatMap((g) => g.listings)
          const gc = block.geoContext
          return (
            <div key={_bi}>
              {vipCreditUsed && (
                <div style={{ background: 'linear-gradient(135deg, rgba(29,78,216,0.15), rgba(79,70,229,0.15))', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>Γ£ª</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#a5b4fc' }}>VIP Access Credit Used</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{vipCreditPlansUsed} of {vipCreditTotal} plan{(vipCreditTotal || 1) > 1 ? 's' : ''} used ┬╖ Request more from your agent</div>
                  </div>
                </div>
              )}
              <PlanDocument
                {...(p.type === 'buyer' ? {
                  type: 'buyer',
                  geoName: p.geoName,
                  budgetMin: p.budgetMin,
                  budgetMax: p.budgetMax,
                  propertyType: p.propertyType,
                  bedrooms: p.bedrooms,
                  timeline: p.timeline,
                  analytics: aSnap,
                  listings: lSnap,
                  agent: agent ? { name: agent.full_name, email: agent.email, phone: agent.cell_phone, photo: agent.profile_photo_url, brokerage: agent.brokerage_name, title: agent.title } : undefined,
                  onSendPlan: onSendPlan || (() => {}),
                  leadCaptured: leadCaptured || false,
                  sessionId: sessionId || null,
                  userId: userId || null,
                  onLeadCaptured: onLeadCaptured,
                  geoContext: gc,
                } : {
                  type: 'seller',
                  geoName: p.geoName,
                  propertyType: p.propertyType,
                  estimatedValueMin: p.estimatedValueMin,
                  estimatedValueMax: p.estimatedValueMax,
                  timeline: p.timeline,
                  goal: p.goal,
                  analytics: aSnap,
                  agent: agent ? { name: agent.full_name, email: agent.email, phone: agent.cell_phone, photo: agent.profile_photo_url, brokerage: agent.brokerage_name, title: agent.title } : undefined,
                  onSendPlan: onSendPlan || (() => {}),
                  sessionId: sessionId || null,
                  userId: userId || null,
                  onLeadCaptured: onLeadCaptured,
                  geoContext: gc,
                  leadCaptured: leadCaptured || false,
                })}
              />
              <div style={{ margin: '12px 0', padding: '12px 14px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 10 }}>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                  <span style={{ color: '#fbbf24', fontWeight: 700 }}>ΓÜá AI Disclaimer:</span> This plan is generated by artificial intelligence using market data. For informational purposes only. Verify with a licensed real estate agent before making decisions.
                </p>
              </div>
            </div>
          )
        }

        return null
      })}

      {/* W-CHARLIE-INCHAT-CONVERGENCE (2026-06-16): BuyerTaxMatchInChat
          mounted as a TOP-LEVEL block. Single invocation site, so this
          is the ONLY place the component renders — guarantees no double-
          render regardless of which path provided data:
            • In-session path: search_listings + get_comparables fired
              normally → listingGroups populated → BuyerTaxMatchInChat
              self-fetches via /api/charlie/buyer-tax-match (existing
              behavior, unchanged).
            • Backfill-hydration path: search_listings did not fire in-
              session → plan-email response's backfilledListings hydrates
              listingGroups (useCharlie.ts:560+) → BuyerTaxMatchInChat
              self-fetches against the hydrated listings → same data
              persisted plan_data carries → cross-surface convergence.
          BuyerTaxMatchInChat self-gates: returns null when btm is null
          and not loading; only renders when its self-fetch resolves
          with data. So a non-buyer (no listingGroups) session sees no
          DOM output here. */}
      {(() => {
        const _aSnap = analytics[analytics.length - 1] || null
        const _budgetMax = plan?.budgetMax ?? null
        const _avgConc = _aSnap?.avg_concession_pct ?? null
        return (
          <BuyerTaxMatchInChat
            listingGroups={listingGroups}
            geoContext={geoContext}
            budgetMax={_budgetMax}
            avgConcessionPct={_avgConc}
            initialBtm={backfilledTaxMatch ?? null}
          />
        )
      })()}

      {/* Community Buildings - only when no buildings blocks exist in conversation */}
      {!(blocks || []).some((b: any) => b.type === 'buildings') && communityBuildings && (communityBuildings.affordable.length > 0 || communityBuildings.premium.length > 0) && (
        <div>
          {communityBuildings.affordable.length > 0 && (
            <>
              <SectionHeader title={`Most Affordable Buildings ┬╖ ${communityBuildings.affordable.length} found`} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {communityBuildings.affordable.map((b, i) => <BuildingCard key={i} building={b} />)}
              </div>
            </>
          )}
          {communityBuildings.premium.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <SectionHeader title={`Premium Buildings ┬╖ ${communityBuildings.premium.length} found`} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {communityBuildings.premium.map((b, i) => <BuildingCard key={i} building={b} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIP Credit Announcement ΓÇö registered users only */}
      {vipCreditUsed && plan?.planReady && !(blocks||[]).some((b:any) => b.type === "plan") && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(29,78,216,0.15), rgba(79,70,229,0.15))',
          border: '1px solid rgba(99,102,241,0.4)',
          borderRadius: 12,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>Γ£ª</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#a5b4fc' }}>
              VIP Access Credit Used
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {vipCreditPlansUsed} of {vipCreditTotal} plan{(vipCreditTotal || 1) > 1 ? 's' : ''} used ┬╖ Request more from your agent
            </div>
          </div>
        </div>
      )}

      {/* Plan ΓÇö fallback only when no plan blocks exist */}
      {plan?.planReady && !(blocks||[]).some((b:any) => b.type === "plan") && (
        <PlanDocument
          {...(plan.type === 'buyer' ? {
            type: 'buyer',
            geoName: plan.geoName,
            budgetMin: plan.budgetMin,
            budgetMax: plan.budgetMax,
            propertyType: plan.propertyType,
            bedrooms: plan.bedrooms,
            timeline: plan.timeline,
            analytics: analytics[analytics.length - 1] || null,
            listings: listingGroups.flatMap(g => g.listings),
            agent: agent ? { name: agent.full_name, email: agent.email, phone: agent.cell_phone, photo: agent.profile_photo_url, brokerage: agent.brokerage_name, title: agent.title } : undefined,
            onSendPlan: onSendPlan || (() => {}),
            leadCaptured: leadCaptured || false,
            sessionId: sessionId || null,
            userId: userId || null,
            onLeadCaptured: onLeadCaptured,
            geoContext: geoContext,
          } : {
            type: 'seller',
            geoName: plan.geoName,
            propertyType: plan.propertyType,
            estimatedValueMin: plan.estimatedValueMin,
            estimatedValueMax: plan.estimatedValueMax,
            timeline: plan.timeline,
            goal: plan.goal,
            analytics: analytics[analytics.length - 1] || null,
            agent: agent ? { name: agent.full_name, email: agent.email, phone: agent.cell_phone, photo: agent.profile_photo_url, brokerage: agent.brokerage_name, title: agent.title } : undefined,
            onSendPlan: onSendPlan || (() => {}),
            sessionId: sessionId || null,
            userId: userId || null,
            onLeadCaptured: onLeadCaptured,
            geoContext: geoContext,
            leadCaptured: leadCaptured || false,
          })}
        />
      )}
      {plan?.planReady && !(blocks||[]).some((b:any) => b.type === "plan") && (
        <div style={{ margin: '12px 0', padding: '12px 14px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 10 }}>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
            <span style={{ color: '#fbbf24', fontWeight: 700 }}>ΓÜá AI Disclaimer:</span> This plan is generated by artificial intelligence using market data. For informational purposes only. Verify with a licensed real estate agent before making decisions.
          </p>
        </div>
      )}

      {/* Empty state */}
      {(blocks || []).length === 0 && !communityBuildings?.affordable?.length && !communityBuildings?.premium?.length && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.15)', gap: 12,
          padding: '60px 20px',
        }}>
          <div style={{ fontSize: 40 }}>Γ£ª</div>
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

// ─── BuyerTaxMatchInChat ────────────────────────────────────────────────
// W-CHARLIE-BUYER-CHUNK4 (2026-06-15): the in-chat Tax-Matched block.
// Hits /api/charlie/buyer-tax-match whenever the matched-listings
// signature changes; renders the SAME shape email + lead page render.
// Sold-comp framing (NOT "what you'll pay yearly").
// W-CHARLIE-INCHAT-TAXMATCH-HYDRATE (2026-06-16): exported so the
// render-gate verify harness (scripts/inchat-taxmatch-hydrate-verify.ts)
// can mount the component in isolation with initialBtm pre-seeded and
// assert the Tax-Matched block NODE appears in the static output. The
// in-app caller (ResultsPanel) uses the same function — single source
// of truth, no duplication.
export function BuyerTaxMatchInChat({ listingGroups, geoContext, budgetMax, avgConcessionPct, initialBtm }: {
  listingGroups: { label: string; listings: any[] }[]
  geoContext: { geoType: string; geoId: string; geoName: string } | null
  budgetMax?: number | null
  avgConcessionPct?: number | null
  // W-CHARLIE-INCHAT-TAXMATCH-HYDRATE: pre-derived buyerTaxMatch from
  // the plan-email response (failing-path session). When provided,
  // bypass the self-fetch entirely — single source of truth with the
  // buyerTaxMatch persisted to plan_data and rendered in email + lead.
  initialBtm?: BuyerTaxMatch | null
}) {
  // Pre-seed btm with initialBtm so the FIRST render already produces
  // the Tax-Matched DOM. Without this, useState(null) would show the
  // empty branch (return null) until the late-arriving effect set btm,
  // and on the failing path the self-fetch silently failed entirely.
  const [btm, setBtm] = useState<BuyerTaxMatch | null>(initialBtm ?? null)
  const [loading, setLoading] = useState(false)
  const lastSigRef = useRef<string | null>(null)

  useEffect(() => {
    // W-CHARLIE-INCHAT-TAXMATCH-HYDRATE (2026-06-16): direct-hydrate
    // path. When initialBtm is provided (failing-path session, parent
    // hydrated us from plan-email response.backfilledTaxMatch), skip
    // the self-fetch entirely AND make sure btm is set even when
    // initialBtm arrives AFTER first render (useState only respects
    // its initial value on mount; subsequent prop changes need this
    // explicit setBtm). Use prev-state-functional setBtm so a btm
    // already populated by an earlier self-fetch is not clobbered.
    if (initialBtm) {
      setBtm(prev => prev ?? initialBtm)
      setLoading(false)
      return
    }
    const matched = (listingGroups || []).flatMap(g => g.listings)
    // Signature: listing keys + geoId. Skip refetch when nothing changed.
    const sig = matched.map(l => l?.listing_key || l?.listingKey).filter(Boolean).join(',') +
                '|' + (geoContext?.geoType || '') + ':' + (geoContext?.geoId || '')
    if (sig === lastSigRef.current) return
    if (matched.length === 0 || !geoContext?.geoId) {
      lastSigRef.current = sig
      setBtm(null)
      return
    }
    lastSigRef.current = sig
    setLoading(true)
    fetch('/api/charlie/buyer-tax-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchedListings: matched, geoContext }),
    })
      .then(r => r.json())
      .then(j => { if (j?.ok && j.buyerTaxMatch) setBtm(j.buyerTaxMatch) })
      .catch(err => console.error('[BuyerTaxMatchInChat] fetch error:', err))
      .finally(() => setLoading(false))
  }, [listingGroups, geoContext, initialBtm])

  if (loading && !btm) {
    return (
      <div>
        <SectionHeader title="Tax-Matched · loading…" />
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: '8px 0' }}>Computing tax-band-matched sold comps…</div>
      </div>
    )
  }
  if (!btm) return null

  // W-CHARLIE-BUYER-NARRATION (2026-06-15): value narration line.
  const _taxNarr = btm.isEmpty
    ? { text: null }
    : buildTaxMatchNarration({ samples: btm.samples, budgetMax: budgetMax ?? null, avgConcessionPct: avgConcessionPct ?? null })
  return (
    <div>
      <SectionHeader title={`Tax-Matched · ${btm.isEmpty ? 0 : btm.samples.length} sold comp${btm.isEmpty || btm.samples.length === 1 ? '' : 's'}`} />
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10, lineHeight: 1.5 }}>
        {btm.isEmpty
          ? (btm.reason || 'No sold comps matched the derived tax band.')
          : `Recently sold homes matched by property-tax band — real transaction evidence anchored to the ${btm.withTaxCount} of ${btm.totalCount} matched listings carrying tax data.`}
      </div>
      {_taxNarr.text && (
        <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.30)', borderRadius: 10, fontSize: 12, color: '#bfdbfe', lineHeight: 1.5 }}>
          {_taxNarr.text}
        </div>
      )}
      {!btm.isEmpty && btm.taxBand && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 12px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>Tax band (derived)</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
            ${Math.round(btm.taxBand.low).toLocaleString('en-CA')} – ${Math.round(btm.taxBand.high).toLocaleString('en-CA')}<span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>/yr</span>
          </span>
        </div>
      )}
      {!btm.isEmpty && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {btm.samples.map((s, i) => {
            // _slug not stamped here — buyer in-chat uses ComparableCard
            // when possible. Reuse the ComparableCard look via its dual-
            // shape reads. Pass listingKey + close_price so the price-
            // resolution logic in ComparableCard treats it as a sold comp.
            const comp = {
              listingKey: s.listingKey || undefined,
              unparsedAddress: s.address || undefined,
              closePrice: s.price ?? undefined,
              closeDate: s.closeDate || undefined,
              bedrooms: s.bedrooms ?? undefined,
              bathrooms: s.bathrooms ?? undefined,
              propertySubtype: s.propertySubtype || undefined,
              unitNumber: s.unitNumber || undefined,
              daysOnMarket: s.daysOnMarket ?? undefined,
              sourceTier: s.sourceTier || undefined,
              // W-CHARLIE-TAXMATCH-PHOTOS (2026-06-16): forward thumbnail
              // from sample so ComparableCard renders the real photo
              // instead of the placeholder. Email + admin pass `s`
              // directly so they pick this up from buyer-tax-match.ts
              // edit alone; only this in-chat projection needed widening.
              mediaUrl: s.media?.[0]?.media_url || s.media?.[0]?.url || undefined,
            }
            return <ComparableCard key={s.listingKey || i} comparable={comp as any} />
          })}
        </div>
      )}
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 8, lineHeight: 1.4 }}>
        Band derived from your matched-listings tax median, ±{Math.round((((btm.taxBand?.high ?? 0) - (btm.taxBand?.low ?? 0)) / 2 / (btm.bandCenter || 1)) * 100)}%. Cap: {BUYER_COMP_SOLD_CAP} comps.
      </div>
    </div>
  )
}
