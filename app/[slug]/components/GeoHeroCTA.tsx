'use client'

export default function GeoHeroCTA() {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24, marginBottom: 8 }}>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('charlie:open', { detail: { form: 'buyer' } }))}
        style={{ padding: '10px 24px', borderRadius: 100, background: 'linear-gradient(135deg,#1d4ed8,#4f46e5)', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
      >🏠 Get My Buyer Plan</button>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('charlie:open', { detail: { form: 'seller' } }))}
        style={{ padding: '10px 24px', borderRadius: 100, background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
      >💰 Get My Seller Plan</button>
    </div>
  )
}
