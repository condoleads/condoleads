// app/comprehensive-site/about/page.tsx
// walliam.ca/about (and any tenant domain's /about)
// Renders tenant.about_content if set, otherwise getDefaultAbout(tenant).
// Layout wraps with SiteHeader + TenantFooter automatically.

import { notFound } from 'next/navigation'
import { getTenant } from '@/lib/tenant/getTenant'
import { getDefaultAbout } from '@/lib/tenant/default-content'
import { renderMarkdownish } from '@/lib/tenant/render-markdownish'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const tenant = await getTenant()
  const brand = tenant?.brand_name || tenant?.name || 'WALLiam'
  return {
    title: `About ${brand}`,
    description: `Learn about ${brand}, our brokerage, and how our AI-powered real estate platform works.`,
  }
}

export default async function AboutPage() {
  const tenant = await getTenant()
  if (!tenant) notFound()

  const content = tenant.about_content?.trim() || getDefaultAbout(tenant)

  return (
    <div style={{ background: '#060b18', minHeight: '100vh', color: '#fff' }}>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '80px 24px 120px' }}>
        {renderMarkdownish(content)}
      </div>
    </div>
  )
}
