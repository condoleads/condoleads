import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// C7/D12 -- OG image is now tenant-aware. Reads host from request header
// and renders the tenant brand/domain in the image.
async function fetchTenantBrand(host: string | null): Promise<{ name: string, domain: string } | null> {
  if (!host) return null
  const cleanHost = host.replace(/^www\./, '')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) return null
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/tenants?domain=eq.${encodeURIComponent(cleanHost)}&is_active=eq.true&select=name,brand_name,domain`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json',
        },
      }
    )
    if (!resp.ok) return null
    const rows = await resp.json() as Array<{ name: string | null, brand_name: string | null, domain: string | null }>
    const row = rows[0]
    if (!row || !row.domain) return null
    const name = row.brand_name || row.name
    if (!name) return null
    return { name, domain: row.domain }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const host = req.headers.get('host')
  const tenant = await fetchTenantBrand(host)
  const brandName = tenant?.name || 'AI Real Estate'
  const displayDomain = tenant?.domain || ''

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
          <span style={{ fontSize: '32px', fontWeight: 800, color: '#fff' }}>{brandName}</span>
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

        {/* URL -- C7/D12 tenant-derived */}
        <div style={{ position: 'absolute', bottom: '60px', left: '80px', fontSize: '22px', color: 'rgba(59,130,246,0.7)', display: 'flex' }}>
          {displayDomain}
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