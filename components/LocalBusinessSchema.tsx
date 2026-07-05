// components/LocalBusinessSchema.tsx
//
// W-MARKETING A-UNIT-2 COMPREHENSIVE-CLOSE (2026-07-05):
// LocalBusiness / RealEstateAgent JSON-LD for the tenant homepage.
//
// Gated on isSeoEnabledTenant() (shipped e3d229f). Emits for tenants
// with tenants.seo_enabled=true (aily); returns null for
// seo_enabled=false tenants (walliam) and non-tenant hosts.
//
// Rule Zero — every field maps to a real tenant column verified this
// session. Fields with a null column are OMITTED, never fabricated
// (never a hardcoded name/phone/address). The parent RootPage passes
// only real values from the tenants row via explicit column
// allow-list (never SELECT * — tenants holds anthropic_api_key +
// resend_api_key).
//
// Address parse: brokerage_address is stored as a canonical comma-
// separated string, e.g.
//   "208 Spring Garden Ave, North York, ON M2N 3G8, Canada"
// A deterministic split lifts each component into the PostalAddress
// slots. On parse failure the whole string falls back to
// streetAddress (schema.org accepts single-line street).

import { isSeoEnabledTenant } from '@/lib/utils/seo-scope'

export interface LocalBusinessProps {
  // Real tenant fields — all optional; each is emitted only when non-null
  // and non-empty.
  name?: string | null            // tenants.brand_name || tenants.name
  url: string                     // https://{tenant.domain}/
  telephone?: string | null       // tenants.brokerage_phone
  parentOrganizationName?: string | null // tenants.brokerage_name
  brokerageAddress?: string | null       // tenants.brokerage_address
  logoUrl?: string | null         // tenants.logo_url
}

// Deterministic parse for a canonical "street, locality, region postal, country"
// address string. Returns null when the shape doesn't match — caller falls
// back to the raw string as streetAddress.
function parseBrokerageAddress(addr: string): Record<string, string> | null {
  const parts = addr.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length < 3) return null
  const street = parts[0]
  const locality = parts[1]
  // Region + postal are packed as "ON M2N 3G8" — split on first space run.
  const m = parts[2].match(/^([A-Z]{2})\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i)
  if (!m) return null
  const out: Record<string, string> = {
    '@type': 'PostalAddress',
    streetAddress: street,
    addressLocality: locality,
    addressRegion: m[1],
    postalCode: m[2],
  }
  if (parts[3]) out.addressCountry = parts[3]
  return out
}

export default async function LocalBusinessSchema(props: LocalBusinessProps) {
  if (!(await isSeoEnabledTenant())) return null

  // Every field emitted below is either directly present on the props
  // (from a real tenants column) or omitted. Never a hardcoded fallback.
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    url: props.url,
  }
  if (props.name && props.name.trim().length > 0) {
    schema.name = props.name.trim()
  }
  if (props.telephone && props.telephone.trim().length > 0) {
    schema.telephone = props.telephone.trim()
  }
  if (props.logoUrl && props.logoUrl.trim().length > 0) {
    schema.image = props.logoUrl.trim()
  }
  if (props.brokerageAddress && props.brokerageAddress.trim().length > 0) {
    const parsed = parseBrokerageAddress(props.brokerageAddress.trim())
    schema.address = parsed || {
      '@type': 'PostalAddress',
      streetAddress: props.brokerageAddress.trim(),
    }
  }
  if (props.parentOrganizationName && props.parentOrganizationName.trim().length > 0) {
    schema.parentOrganization = {
      '@type': 'Organization',
      name: props.parentOrganizationName.trim(),
    }
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
