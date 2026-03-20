'use client'

// WalliamCTA — drop into any page to show Buyer/Seller Plan CTAs
// Fully decoupled: dispatches charlie:open event only, no direct imports

interface Props {
  context?: string // optional geo/building name for display
}

export default function WalliamCTA({ context }: Props) {
  const openCharlie = (form: 'buyer' | 'seller') => {
    window.dispatchEvent(new CustomEvent('charlie:open', { detail: { form } }))
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #060b18 0%, #0d1629 100%)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 20,
      padding: '32px 28px',
      margin: '40px 0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 20,
    }}>
      {/* WALLiam wordmark */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 0, marginBottom: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', fontFamily: 'system-ui,sans-serif' }}>WALL</span>
        <span style={{ position: 'relative', display: 'inline-block' }}>
          <span style={{
            position: 'absolute', top: '-35%', left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 8, color: '#f59e0b',
            animation: 'walliam-cta-heartbeat 3s ease-in-out infinite',
            display: 'block', lineHeight: 1,
          }}>♥</span>
          <span style={{ fontSize: 16, fontWeight: 300, color: 'rgba(255,255,255,0.8)', fontFamily: 'system-ui,sans-serif' }}>ı</span>
        </span>
        <span style={{ fontSize: 16, fontWeight: 300, color: 'rgba(255,255,255,0.8)', fontFamily: 'system-ui,sans-serif' }}>am</span>
      </div>

      {/* Tagline */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
          Get Your AI Real Estate Plan
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', maxWidth: 380 }}>
          {context
            ? `WALLiam will analyse ${context} and build your personalised plan in minutes`
            : 'WALLiam will analyse the market and build your personalised plan in minutes'}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => openCharlie('buyer')}
          style={{
            padding: '12px 28px', borderRadius: 100, border: 'none',
            background: 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
            color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 20px rgba(59,130,246,0.35)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'
            ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 28px rgba(59,130,246,0.5)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
            ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(59,130,246,0.35)'
          }}
        >
          🏠 Get My Buyer Plan
        </button>

        <button
          onClick={() => openCharlie('seller')}
          style={{
            padding: '12px 28px', borderRadius: 100, border: 'none',
            background: 'linear-gradient(135deg, #059669, #10b981)',
            color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 20px rgba(16,185,129,0.35)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'
            ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 28px rgba(16,185,129,0.5)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
            ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(16,185,129,0.35)'
          }}
        >
          💰 Get My Seller Plan
        </button>
      </div>

      <style>{`
        @keyframes walliam-cta-heartbeat {
          0%,45%,100% { transform: translateX(-50%) scale(1); }
          10% { transform: translateX(-50%) scale(1.4); }
          30% { transform: translateX(-50%) scale(1.25); }
        }
      `}</style>
    </div>
  )
}