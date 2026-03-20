// app/charlie/components/CharlieOverlay.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { CharlieState } from '../hooks/useCharlie'
import ChatPanel from './ChatPanel'
import BuyerForm from './BuyerForm'
import SellerForm from './SellerForm'
import SellerEstimateRunner from './SellerEstimateRunner'
import ResultsPanel from './ResultsPanel'

interface Props {
  state: CharlieState
  onClose: () => void
  onSend: (msg: string) => void
  onPanelChange: (panel: 'chat' | 'results') => void
  agent?: any
  onSendPlan?: () => void
  onSellerEstimate?: (data: any) => void
  onSetGeoContext?: (geoType: string, geoId: string, geoName: string) => void
}

export default function CharlieOverlay({ state, onClose, onSend, onPanelChange, agent, onSendPlan, onSellerEstimate, onSetGeoContext }: Props) {
  const hasResults = !!state.analytics || (state.listingGroups?.length > 0) || state.comparables.length > 0 || !!state.sellerEstimate
  const [formMode, setFormMode] = useState<'none' | 'buyer' | 'seller'>(
  state.initialForm === 'buyer' ? 'buyer' : state.initialForm === 'seller' ? 'seller' : 'none'
)
  const [resolvedSeller, setResolvedSeller] = useState<any>(null)
  const [communityBuildings, setCommunityBuildings] = useState<{ affordable: any[], premium: any[] }>({ affordable: [], premium: [] })
  const [sellerFormData, setSellerFormData] = useState<any>(null)

  // Fetch community buildings ONLY for condo track
  const prevGeoId = useRef('')
  useEffect(() => {
    console.log('[buildings useEffect] geoContext:', state.geoContext)
    const geo = state.geoContext
    if (!geo) return
    // Gate: only fetch buildings for condo, not homes
    if (state.analytics?.track === 'homes') {
      console.log('[buildings] skipping — homes track')
      setCommunityBuildings({ affordable: [], premium: [] })
      prevGeoId.current = '' // reset so condo queries work if user switches
      return
    }
    if (prevGeoId.current === geo.geoId) return
    prevGeoId.current = geo.geoId
    console.log('[buildings] fetching for geoId:', geo.geoId, 'geoType:', geo.geoType)
    fetch('/api/charlie/community-buildings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communityId: geo.geoId, geoType: geo.geoType }),
    }).then(r => r.json()).then(d => {
      if (d.success) setCommunityBuildings({ affordable: d.affordable, premium: d.premium })
    }).catch(console.error)
  }, [state.geoContext?.geoId, state.analytics?.track])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'stretch',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Main container */}
      <div style={{
        width: '100%',
        maxWidth: 1200,
        display: 'flex',
        flexDirection: 'column',
        background: '#080f1a',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 16 }}>✦</span>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Charlie</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
                AI Real Estate Assistant
              </div>
            </div>
          </div>

          {/* Mobile panel toggle */}
          {hasResults && (
            <div style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 100,
              padding: 3,
              gap: 2,
            }} className="charlie-mobile-toggle">
              {(['chat', 'results'] as const).map(p => (
                <button key={p} onClick={() => onPanelChange(p)} style={{
                  padding: '5px 14px',
                  borderRadius: 100,
                  border: 'none',
                  cursor: 'pointer',
                  background: state.activePanel === p ? '#3b82f6' : 'transparent',
                  color: state.activePanel === p ? '#fff' : 'rgba(255,255,255,0.4)',
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'capitalize',
                }}>
                  {p === 'results' ? 'Results' : 'Chat'}
                </button>
              ))}
            </div>
          )}

          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '6px 12px',
            color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}>
            ✕ Close
          </button>
        </div>

        {/* Body — split panels */}
        <div style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          minHeight: 0,
        }}>
          {/* Chat panel — always visible on desktop, toggled on mobile */}
          <div style={{
            width: hasResults ? '42%' : '100%',
            borderRight: hasResults ? '1px solid rgba(255,255,255,0.07)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}>
            {formMode === 'buyer' ? (
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 6 }}>🏠 Find Your Home</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>Tell us what you are looking for</div>
                <BuyerForm
                  onSubmit={(data) => {
                    setFormMode('none')
                      if (data.geoId && data.geoType) onSetGeoContext?.(data.geoType, data.geoId, data.area)
                    const type = data.propertyType === 'any' ? 'property' : data.propertyType
                    const budget = data.budgetMax ? ' with budget up to ' + data.budgetMax : ''
                    const beds = data.bedrooms ? ', ' + data.bedrooms + ' bedrooms' : ''
                    const msg = 'I want to buy a ' + type + ' in ' + data.area + budget + beds + ', timeline: ' + data.timeline
                    onSend(msg)
                  }}
                  onBack={() => setFormMode('none')}
                />
              </div>
            ) : formMode === 'seller' ? (
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 6 }}>💰 Get Your Home Value</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>Tell us about your property</div>
                <SellerForm
                  onSubmit={async (data) => {
                    try {
                      const res = await fetch('/api/charlie/seller-estimate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data),
                      })
                      const result = await res.json()
                      if (result.success) {
                        setResolvedSeller(result)
                        setSellerFormData(data)
                        setFormMode('none')

                      } else {
                        alert(result.error || 'Could not resolve address')
                      }
                    } catch(e) { console.error(e) }
                  }}
                  onBack={() => setFormMode('none')}
                />
              </div>
            ) : resolvedSeller && sellerFormData && !state.sellerEstimate ? (
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                <SellerEstimateRunner
                  resolvedData={resolvedSeller}
                  formData={sellerFormData}
                  onEstimateReady={(data) => {
                    onSellerEstimate?.({ ...data, subjectAddress: sellerFormData.streetNumber + " " + sellerFormData.streetName + ", " + sellerFormData.city })
                    setResolvedSeller(null)
                    const msg = 'I want to ' + (sellerFormData.intent === 'lease' ? 'lease out' : 'sell') + ' my ' + (sellerFormData.propertyCategory === 'condo' ? 'condo' : sellerFormData.propertySubtype) + ' at ' + sellerFormData.streetNumber + ' ' + sellerFormData.streetName + ' ' + sellerFormData.city + ', ' + sellerFormData.bedrooms + ' bed ' + sellerFormData.bathrooms + ' bath, timeline: ' + sellerFormData.timeline + ', goal: ' + sellerFormData.goal
                    onSend(msg)
                  }}
                />
              </div>
            ) : (
            <ChatPanel
              messages={state.messages}
              isStreaming={state.isStreaming}
              onSend={onSend}
              onBuyClick={() => setFormMode('buyer')}
              onSellClick={() => setFormMode('seller')}
            />
            )}
          </div>

          {/* Results panel */}
          {hasResults && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ResultsPanel
                analytics={state.analytics}
                listingGroups={state.listingGroups || []}
                comparables={state.comparables}
                geoContext={state.geoContext}
                plan={state.plan}
                agent={agent}
                onSendPlan={onSendPlan}
                leadCaptured={state.leadCaptured}
                sellerEstimate={state.sellerEstimate}
                communityBuildings={communityBuildings}
              />
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .charlie-mobile-toggle { display: flex !important; }
        }
      `}</style>
    </div>
  )
}