// app/comprehensive-site/contact/page.tsx
// walliam.ca/contact (and any tenant domain's /contact)

import { notFound } from 'next/navigation'
import { getTenant } from '@/lib/tenant/getTenant'
import WalliamContactForm from '@/components/WalliamContactForm'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const tenant = await getTenant()
  const brand = tenant?.brand_name || tenant?.name || 'WALLiam'
  return {
    title: `Contact - ${brand}`,
    description: `Get in touch with ${brand}. A licensed agent will be in touch within one business day.`,
  }
}

export default async function ContactPage() {
  const tenant = await getTenant()
  if (!tenant) notFound()

  const brand = tenant.brand_name || tenant.name || 'WALLiam'
  const brokerage = tenant.brokerage_name
  const address = tenant.brokerage_address
  const phone = tenant.brokerage_phone
  const email = tenant.admin_email
  const broker = tenant.broker_of_record
  const reco = tenant.license_number

  const rowStyle = { display: 'flex', gap: 10, alignItems: 'center' } as const
  const labelStyle = { color: 'rgba(255,255,255,0.35)', flexShrink: 0, fontSize: 14 } as const
  const valueStyle = { color: 'rgba(255,255,255,0.75)', fontSize: 14, textDecoration: 'none' } as const

  return (
    <div style={{ background: '#060b18', minHeight: '100vh', color: '#fff' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '80px 24px 120px' }}>
        <h1 style={{ fontSize: 40, fontWeight: 900, color: '#fff', marginBottom: 16, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          Contact {brand}
        </h1>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: 48, maxWidth: 640 }}>
          Get in touch with one of our licensed real estate agents. We'll respond within one business day.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 48 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 16 }}>
              Brokerage
            </div>
            {brokerage && <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 24 }}>{brokerage}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {address && <div style={rowStyle}><span style={labelStyle}>Address</span><span style={valueStyle}>{address}</span></div>}
              {phone && <div style={rowStyle}><span style={labelStyle}>Phone</span><a href={`tel:${phone}`} style={valueStyle}>{phone}</a></div>}
              {email && <div style={rowStyle}><span style={labelStyle}>Email</span><a href={`mailto:${email}`} style={valueStyle}>{email}</a></div>}
            </div>
            {(broker || reco) && (
              <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.8 }}>
                {broker && <div>Broker of Record: {broker}</div>}
                {reco && <div>RECO #: {reco}</div>}
              </div>
            )}
          </div>
          <div>
            <WalliamContactForm tenantId={tenant.id} source="contact_page" contextLabel="Get in touch" />
          </div>
        </div>
      </div>
    </div>
  )
}