'use client'

export default function GeoHeroCTA() {
  const openCharlie = (form?: 'buyer' | 'seller', msg?: string) => {
    window.dispatchEvent(new CustomEvent('charlie:open', { detail: { form, message: msg } }))
  }
  return (
    <div style={{ marginTop: 20, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 100, padding: '8px 8px 8px 20px', marginBottom: 14, maxWidth: 560 }}>
        <input
          type='text'
          placeholder='Ask WALLiam about this area...'
          onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) openCharlie(undefined, (e.target as HTMLInputElement).value.trim()) }}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14, fontFamily: 'inherit' }}
        />
        <button
          onClick={e => { const inp = e.currentTarget.previousSibling as HTMLInputElement; if (inp?.value?.trim()) openCharlie(undefined, inp.value.trim()); else openCharlie() }}
          style={{ padding: '7px 18px', borderRadius: 100, border: 'none', background: 'linear-gradient(135deg,#1d4ed8,#4f46e5)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >Ask AI</button>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => openCharlie('buyer')} style={{ padding: '10px 24px', borderRadius: 100, background: 'linear-gradient(135deg,#1d4ed8,#4f46e5)', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Get My Buyer Plan</button>
        <button onClick={() => openCharlie('seller')} style={{ padding: '10px 24px', borderRadius: 100, background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Get My Seller Plan</button>
      </div>
    </div>
  )
}