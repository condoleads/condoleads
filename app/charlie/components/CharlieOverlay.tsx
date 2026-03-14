// app/charlie/components/CharlieOverlay.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { CharlieState } from '../hooks/useCharlie'
import ChatPanel from './ChatPanel'
import ResultsPanel from './ResultsPanel'

interface Props {
  state: CharlieState
  onClose: () => void
  onSend: (msg: string) => void
  onPanelChange: (panel: 'chat' | 'results') => void
}

export default function CharlieOverlay({ state, onClose, onSend, onPanelChange }: Props) {
  const hasResults = !!state.analytics || (state.listingGroups?.length > 0) || state.comparables.length > 0

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
            <ChatPanel
              messages={state.messages}
              isStreaming={state.isStreaming}
              onSend={onSend}
            />
          </div>

          {/* Results panel */}
          {hasResults && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ResultsPanel
                analytics={state.analytics}
                listingGroups={state.listingGroups || []}
                comparables={state.comparables}
                geoContext={state.geoContext}
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