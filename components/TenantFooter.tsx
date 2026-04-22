// components/TenantFooter.tsx
// Server component — renders per-tenant legal footer.
// Reads tenant via getTenant() helper (reads x-tenant-id header).
// Gracefully hides any missing legal fields so partial-data tenants still render cleanly.

import { getTenant } from '@/lib/tenant/getTenant'

const currentYear = new Date().getFullYear()

export default async function TenantFooter() {
  const tenant = await getTenant()

  // If no tenant resolved, render nothing (avoids broken footer on misconfigured requests)
  if (!tenant) return null

  const brand = tenant.brand_name || tenant.name
  const primary = tenant.primary_color || '#1d4ed8'
  const secondary = tenant.secondary_color || '#4f46e5'

  return (
    <footer style={{
      background: '#0a0f1f',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      color: 'rgba(255,255,255,0.7)',
      padding: '48px 24px 24px',
      fontSize: 13,
      lineHeight: 1.6,
    }}>
      {/* Accent bar */}
      <div style={{
        height: 2,
        background: `linear-gradient(90deg, ${primary}, ${secondary})`,
        marginBottom: 40,
        maxWidth: 1200,
        margin: '0 auto 40px',
      }} />

      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Main grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 32,
          marginBottom: 40,
        }}>
          {/* Brand + contact column */}
          <div>
            {tenant.logo_url ? (
              <img src={tenant.logo_url} alt={brand} style={{ height: 32, marginBottom: 12 }} />
            ) : (
              <div style={{
                fontSize: 22,
                fontWeight: 900,
                color: '#fff',
                marginBottom: 12,
                letterSpacing: '-0.02em',
              }}>
                {brand}
              </div>
            )}
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 16 }}>
              {tenant.footer_tagline || 'AI-powered real estate for the Greater Toronto Area'}
            </div>

            {tenant.brokerage_address && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>📍</span>
                <span>{tenant.brokerage_address}</span>
              </div>
            )}
            {tenant.brokerage_phone && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>📞</span>
                <a href={`tel:${tenant.brokerage_phone}`} style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>
                  {tenant.brokerage_phone}
                </a>
              </div>
            )}
            {tenant.admin_email && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>✉️</span>
                <a href={`mailto:${tenant.admin_email}`} style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>
                  {tenant.admin_email}
                </a>
              </div>
            )}
          </div>

          {/* Services column */}
          <div>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.4)',
              marginBottom: 16,
            }}>
              SERVICES
            </div>
            <FooterLink href="/#buyer">Get My Buyer Plan</FooterLink>
            <FooterLink href="/#seller">Get My Seller Plan</FooterLink>
            <FooterLink href="/#estimate">Home Valuation</FooterLink>
          </div>

          {/* About column */}
          <div>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.4)',
              marginBottom: 16,
            }}>
              ABOUT
            </div>
            <FooterLink href="/about">About {brand}</FooterLink>
            <FooterLink href="/contact">Contact</FooterLink>
            <FooterLink href="/privacy">Privacy Policy</FooterLink>
            <FooterLink href="/terms">Terms of Use</FooterLink>
          </div>

          {/* Legal column */}
          <div>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.4)',
              marginBottom: 16,
            }}>
              BROKERAGE
            </div>
            {tenant.brokerage_name && (
              <div style={{ marginBottom: 8, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                {tenant.brokerage_name}
              </div>
            )}
            {tenant.broker_of_record && (
              <div style={{ marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>Broker of Record: </span>
                {tenant.broker_of_record}
              </div>
            )}
            {tenant.license_number && (
              <div style={{ fontSize: 12 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>RECO Reg #: </span>
                {tenant.license_number}
              </div>
            )}
          </div>
        </div>

        {/* Separator */}
        <div style={{
          height: 1,
          background: 'rgba(255,255,255,0.08)',
          margin: '0 0 24px',
        }} />

        {/* CREA / MLS trademark disclaimer — required boilerplate */}
        <div style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
          lineHeight: 1.6,
          marginBottom: 16,
        }}>
          The trademarks REALTOR®, REALTORS®, and the REALTOR® logo are controlled
          by The Canadian Real Estate Association (CREA) and identify real estate
          professionals who are members of CREA. The trademarks MLS®, Multiple
          Listing Service® and the associated logos are owned by CREA and identify
          the quality of services provided by real estate professionals who are
          members of CREA. Used under license. Data is deemed reliable but is not
          guaranteed accurate by TRREB.
        </div>

        {/* Copyright line */}
        <div style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.3)',
          textAlign: 'center',
          paddingTop: 16,
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          © {currentYear} {brand}
          {tenant.brokerage_name && tenant.brokerage_name !== brand && (
            <> · {tenant.brokerage_name}</>
          )}
          {' · All rights reserved.'}
        </div>
      </div>
    </footer>
  )
}

// Simple footer link component
function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        display: 'block',
        color: 'rgba(255,255,255,0.7)',
        textDecoration: 'none',
        fontSize: 13,
        marginBottom: 10,
      }}
    >
      {children}
    </a>
  )
}