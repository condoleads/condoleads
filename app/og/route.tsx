import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div style={{
        width: '1200px', height: '630px',
        background: 'linear-gradient(135deg, #020812 0%, #0d1629 100%)',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '80px',
        fontFamily: 'system-ui, sans-serif',
        position: 'relative',
      }}>
        {/* Grid dots background */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(rgba(59,130,246,0.15) 1px, transparent 1px)',
          backgroundSize: '30px 30px',
          display: 'flex',
        }} />

        {/* Glow */}
        <div style={{
          position: 'absolute', top: '10%', left: '5%',
          width: '500px', height: '500px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)',
          display: 'flex',
        }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '48px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', fontWeight: 800, color: '#fff',
          }}>01</div>
          <span style={{ fontSize: '32px', fontWeight: 800, color: '#fff' }}>leads</span>
        </div>

        {/* Headline line 1 */}
        <div style={{ fontSize: '64px', fontWeight: 900, color: '#fff', lineHeight: 1.1, marginBottom: '8px', display: 'flex' }}>
          Browse → Get an AI plan →
        </div>

        {/* Headline line 2 - gradient */}
        <div style={{ display: 'flex', marginBottom: '32px' }}>
          <span style={{ fontSize: '64px', fontWeight: 900, background: 'linear-gradient(135deg, #10b981, #06b6d4)', backgroundClip: 'text', color: 'transparent', lineHeight: 1.1 }}>
            Lead Captured.
          </span>
        </div>

        {/* Subline - gradient */}
        <div style={{ display: 'flex' }}>
          <span style={{ fontSize: '48px', fontWeight: 900, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6, #06b6d4)', backgroundClip: 'text', color: 'transparent' }}>
            Your AI works 24/7.
          </span>
        </div>

        {/* URL */}
        <div style={{ position: 'absolute', bottom: '60px', left: '80px', fontSize: '22px', color: 'rgba(59,130,246,0.7)', display: 'flex' }}>
          walliam.ca
        </div>

        {/* Binary decoration */}
        <div style={{ position: 'absolute', right: '80px', top: '80px', display: 'flex', flexDirection: 'column', gap: '8px', opacity: 0.3 }}>
          {['01001100','01000101','01000001','01000100','01010011'].map((b, i) => (
            <span key={i} style={{ fontSize: '14px', color: '#3b82f6', fontFamily: 'monospace', display: 'flex' }}>{b}</span>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}