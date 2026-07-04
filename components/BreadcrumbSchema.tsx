// components/BreadcrumbSchema.tsx
//
// W-MARKETING A-UNIT-2 PHASE 2 (2026-07-04): BreadcrumbList JSON-LD emitter.
//
// Gated on isSeoEnabledTenant() (shipped e3d229f). Emits for tenants with
// tenants.seo_enabled = true (aily); returns null for tenants with
// seo_enabled = false (walliam) and for non-tenant hosts. Multi-tenant
// safe by construction — the gate is a data-plane per-tenant capability,
// not a code-plane brand branch.
//
// Consumers pass an ORDERED array of items { name, url } representing the
// crumb chain from the ROOT (Home) to the CURRENT page. This component
// PREPENDS the Home crumb automatically (matching the visual
// components/Breadcrumb.tsx convention). The last crumb represents the
// current page — its `url` is still emitted (schema.org allows and Google
// prefers self-referential last item).
//
// Every url in `items` MUST be a full, canonical URL (protocol + host +
// path) constructed from a real verified slug / builder — not a bare
// path. This aligns with the sitemap canonical alternate emitted by each
// page's generateMetadata. Callers should reuse resolveCanonicalHost()
// + the appropriate slug pattern.
//
// If a crumb level's slug or name is null, callers should DROP that level
// (shorter valid chain) rather than fabricate a URL or placeholder.

import { isSeoEnabledTenant } from '@/lib/utils/seo-scope'

export interface BreadcrumbItem {
  name: string
  url: string
}

interface Props {
  // Ordered items from root-adjacent to current page. Do NOT include the
  // Home crumb; this component prepends it.
  items: BreadcrumbItem[]
  // Full canonical URL for the Home crumb (protocol + host, no trailing
  // slash needed). Constructed by the caller from resolveCanonicalHost().
  homeUrl: string
}

export default async function BreadcrumbSchema({ items, homeUrl }: Props) {
  // SEO-scope gate. JSON-LD is an SEO surface (per CLAUDE.md line 60).
  if (!(await isSeoEnabledTenant())) return null

  // Prepend Home. Drop any items with missing name or url (defensive —
  // callers should already have dropped null levels).
  const full: BreadcrumbItem[] = [{ name: 'Home', url: homeUrl }]
  for (const it of items) {
    if (it && it.name && it.url) full.push(it)
  }
  if (full.length < 2) return null // No crumbs beyond Home → skip

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: full.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
