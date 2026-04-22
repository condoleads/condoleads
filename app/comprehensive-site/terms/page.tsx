// app/comprehensive-site/terms/page.tsx
// walliam.ca/terms (and any tenant domain's /terms)
// Renders tenant.terms_content if set, otherwise getDefaultTerms(tenant).

import { notFound } from 'next/navigation'
import { getTenant } from '@/lib/tenant/getTenant'
import { getDefaultTerms } from '@/lib/tenant/default-content'
import { renderMarkdownish } from '@/lib/tenant/render-markdownish'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const tenant = await getTenant()
  const brand = tenant?.brand_name || tenant?.name || 'WALLiam'
  return {
    title: `Terms of Use - ${brand}`,
    description: `Terms of Use for ${brand}.`,
  }
}

export default async function TermsPage() {
  const tenant = await getTenant()
  if (!tenant) notFound()

  const content = tenant.terms_content?.trim() || getDefaultTerms(tenant)

  return (
    <div style={{ background: '#060b18', minHeight: '100vh', color: '#fff' }}>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '80px 24px 120px' }}>
        {renderMarkdownish(content)}
      </div>
    </div>
  )
}
