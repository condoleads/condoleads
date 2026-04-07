// app/charlie/components/ResultsPanel.tsx
'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import PlanDocument from './PlanDocument'
import SellerEstimateBlock from './SellerEstimateBlock'
import ComparableCard from './ComparableCard'
import ActiveListingCard from './ActiveListingCard'
import PricingRiskBlock from './PricingRiskBlock'
import BuyerOfferBlock from './BuyerOfferBlock'
import BuildingCard from './BuildingCard'

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
  searchedBuildings?: any[]
  rankings: any[]
  priceTrends: any[]
  seasonalData?: any | null
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

export default function ResultsPanel({ analytics, listingGroups, comparables, geoContext, plan, agent, onSendPlan, leadCaptured, sellerEstimate, communityBuildings, sessionId, userId, onLeadCaptured, vipCreditUsed, vipCreditPlansUsed, vipCreditTotal, searchedBuildings, rankings, priceTrends, seasonalData }: Props) {



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
      {analytics.map((a, _ai) => (
        <div key={_ai}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 12 }}>
            Market Intelligence · {geoContext?.geoName}
          </div>
          {(() => {
            const cond = marketConditionLabel(a.sale_to_list_ratio, a.closed_avg_dom_90)
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
                    { label: 'Median PSF', value: fmt(a.median_psf, '$'), color: '#3b82f6' },
                    { label: 'Avg DOM', value: fmt(a.closed_avg_dom_90, '', 'd'), color: '#6366f1' },
                    { label: 'Sale/List', value: fmt(a.sale_to_list_ratio, '', '%'), color: '#10b981' },
                    { label: 'Active', value: fmt(a.active_count), color: '#8b5cf6' },
                    { label: 'Sold 90d', value: fmt(a.closed_sale_count_90), color: '#ec4899' },
                    { label: 'Absorption', value: fmt(a.absorption_rate_pct, '', '%'), color: '#f59e0b' },
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
      ))}

      {/* Buyer Offer Intelligence */}
      {!sellerEstimate && analytics.length > 0 && (
        <div>
          <SectionHeader title="Buyer Intelligence" />
          <BuyerOfferBlock
            analytics={analytics[analytics.length-1]}
            propertyType={analytics[analytics.length-1].track}
            geoName={geoContext?.geoName}
          />
        </div>
      )}

      {/* Searched Buildings from Charlie tool */}
      {!sellerEstimate && searchedBuildings && searchedBuildings.length > 0 && (
        <div>
          <SectionHeader title={`Buildings Found · ${searchedBuildings.length}`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {searchedBuildings.map((b, i) => (
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
      )}

      {/* Investment Rankings */}
      {!sellerEstimate && rankings.filter((rg: any) => rg.type === "investment").map((rg: any, _ri: number) => rg.data?.rankings?.length > 0 && (
        <div key={_ri}>
          <SectionHeader title={`${(rg.data.ranking_type || "").split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} · ${rg.data.track === "condo" ? "Condos" : "Homes"}`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rg.data.rankings.slice(0, 8).map((r: any, i: number) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 14px", border: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginRight: 8 }}>#{r.rank}</span>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", fontWeight: 600, fontSize: 13, textDecoration: "none" }}>{r.entity_name}</a>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {r.median_price && <span style={{ color: "#60a5fa", fontSize: 12, fontWeight: 600 }}>{fmt(r.median_price, "$")}</span>}
                  {r.gross_yield && <span style={{ color: "#f59e0b", fontSize: 12 }}>{r.gross_yield.toFixed(1)}% yield</span>}
                  {r.avg_dom && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{Math.round(r.avg_dom)}d DOM</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Inventory Rankings */}
      {!sellerEstimate && rankings.filter((rg: any) => rg.type === "inventory").map((rg: any, _ri: number) => (
        <div key={_ri}>
          {Object.entries(rg.data.rankings || {}).map(([rankType, items]: [string, any]) => items.length > 0 && (
            <div key={rankType} style={{ marginBottom: 16 }}>
              <SectionHeader title={rankType.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.slice(0, 5).map((r: any, i: number) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 12px", border: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", fontSize: 13, textDecoration: "none" }}>{r.entity_name}</a>
                    <div style={{ display: "flex", gap: 10 }}>
                      {r.median_price && <span style={{ color: "#60a5fa", fontSize: 12 }}>{fmt(r.median_price, "$")}</span>}
                      {r.price_reduction_rate && <span style={{ color: "#ef4444", fontSize: 12 }}>{r.price_reduction_rate.toFixed(0)}% reduced</span>}
                      {r.avg_dom && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{Math.round(r.avg_dom)}d DOM</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Price Trends */}
      {!sellerEstimate && priceTrends.map((pt: any, _pti: number) => pt.current_median_sale && (
        <div key={_pti}>
          <SectionHeader title="Price Trends" />
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "14px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div><div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Median Price</div><div style={{ color: "#60a5fa", fontWeight: 700, fontSize: 16 }}>{fmt(pt.current_median_sale, "$")}</div></div>
              {pt.current_avg_psf && <div><div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Avg PSF</div><div style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{fmt(pt.current_avg_psf, "$")}/sqft</div></div>}
              {pt.psf_trend_pct != null && <div><div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>PSF Trend</div><div style={{ color: pt.psf_trend_pct >= 0 ? "#10b981" : "#ef4444", fontWeight: 600, fontSize: 15 }}>{pt.psf_trend_pct > 0 ? "+" : ""}{pt.psf_trend_pct?.toFixed(1)}%</div></div>}
              {pt.current_median_lease && <div><div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Median Rent</div><div style={{ color: "#f59e0b", fontWeight: 600, fontSize: 15 }}>{fmt(pt.current_median_lease, "$")}/mo</div></div>}
            </div>
          </div>
        </div>
      ))}

      {/* Community Buildings - condo buyer */}
      {!sellerEstimate && !(searchedBuildings && searchedBuildings.length > 0) && communityBuildings && (communityBuildings.affordable.length > 0 || communityBuildings.premium.length > 0) && (
        <div>
          {communityBuildings.affordable.length > 0 && (
            <>
              <SectionHeader title={`Most Affordable Buildings · ${communityBuildings.affordable.length} found`} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {communityBuildings.affordable.map((b, i) => <BuildingCard key={i} building={b} />)}
              </div>
            </>
          )}
          {communityBuildings.premium.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <SectionHeader title={`Premium Buildings · ${communityBuildings.premium.length} found`} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {communityBuildings.premium.map((b, i) => <BuildingCard key={i} building={b} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Seller estimate */}
      {sellerEstimate?.success && (
        <div>
          <SectionHeader title="Property Estimate" />
          <SellerEstimateBlock
            estimate={sellerEstimate.estimate}
            comparables={sellerEstimate.comparables || []}
            buildingName={sellerEstimate.buildingName}
            subjectAddress={sellerEstimate.subjectAddress}
            geoLevel={sellerEstimate.geoLevel}
            resolvedAddress={sellerEstimate.resolvedAddress}
            intent={sellerEstimate.intent || 'sale'}
            isLease={sellerEstimate.intent === 'lease'}
          />
        </div>
      )}

      {/* Comparable Sold */}
      {!sellerEstimate && comparables.length > 0 && (
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
          <SectionHeader title={`Competing For Sale · ${(sellerEstimate?.competingListings || []).length} found`} />
          {false && (
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, padding: '12px 0' }}>Searching active listings...</div>
          )}
          {(sellerEstimate?.competingListings || []).length === 0 && (
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, padding: '12px 0' }}>No active competing listings found.</div>
          )}
          {(sellerEstimate?.competingListings || []).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(sellerEstimate?.competingListings || []).map((l: any, i: number) => (
                <ActiveListingCard key={l.id || i} listing={l} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pricing Risk - Concession + DOM */}
      {sellerEstimate?.success && analytics.length > 0 && (
        <div>
          <SectionHeader title="Pricing Strategy & Risk" />
          <PricingRiskBlock
            analytics={analytics[analytics.length-1]}
            estimatedPrice={sellerEstimate.estimate?.estimatedPrice}
            intent={sellerEstimate.intent || 'sale'}
            geoName={geoContext?.geoName}
          />
        </div>
      )}

      {/* Seller Strategy - always show from sellerEstimate, not just AI plan */}
      {sellerEstimate?.success && !plan?.planReady && (
        <div style={{
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16, padding: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #059669, #10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💰</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Your Seller Strategy</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{geoContext?.geoName} · {new Date().toLocaleDateString('en-CA')}</div>
            </div>
          </div>
          {analytics.length > 0 && (() => {
            const cond = marketConditionLabel(analytics[analytics.length-1].sale_to_list_ratio, analytics[analytics.length-1].closed_avg_dom_90)
            return (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: cond.color + '18', border: '1px solid ' + cond.color + '40', borderRadius: 100, padding: '5px 14px', marginBottom: 16 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: cond.color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: cond.color }}>{cond.label}</span>
              </div>
            )
          })()}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 8 }}>Your Property</div>
            {sellerEstimate.estimate?.estimatedPrice && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Estimated Value</span><span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>${sellerEstimate.estimate.priceRange?.low?.toLocaleString()} — ${sellerEstimate.estimate.priceRange?.high?.toLocaleString()}</span></div>}
          </div>
          {analytics.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 8 }}>Market Snapshot</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Avg Days on Market</span><span style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>{fmt(analytics[analytics.length-1].closed_avg_dom_90, '', 'd')}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Sale-to-List Ratio</span><span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>{fmt(analytics[analytics.length-1].sale_to_list_ratio, '', '%')}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Active Competition</span><span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{fmt(analytics[analytics.length-1].active_count, '', ' listings')}</span></div>
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

      {/* VIP Credit Announcement — registered users only */}
      {vipCreditUsed && plan?.planReady && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(29,78,216,0.15), rgba(79,70,229,0.15))',
          border: '1px solid rgba(99,102,241,0.4)',
          borderRadius: 12,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>✦</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#a5b4fc' }}>
              VIP Access Credit Used
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {vipCreditPlansUsed} of {vipCreditTotal} plan{(vipCreditTotal || 1) > 1 ? 's' : ''} used · Request more from your agent
            </div>
          </div>
        </div>
      )}

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
            analytics,
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
      {plan?.planReady && (
        <div style={{ margin: '12px 0', padding: '12px 14px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 10 }}>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
            <span style={{ color: '#fbbf24', fontWeight: 700 }}>&#9888; AI Disclaimer:</span> This plan is generated by artificial intelligence using market data. For informational purposes only. Verify with a licensed real estate agent before making decisions.
          </p>
        </div>
      )}

      {/* Empty state */}
      {analytics.length === 0 && listingGroups.length === 0 && comparables.length === 0 && !sellerEstimate && (
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