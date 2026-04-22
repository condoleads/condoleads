// app/comprehensive-site/privacy/page.tsx
// walliam.ca/privacy (and any tenant domain's /privacy)
// Renders tenant.privacy_content if set, otherwise getDefaultPrivacy(tenant).

import { notFound } from 'next/navigation'
import { getTenant } from '@/lib/tenant/getTenant'
import { getDefaultPrivacy } from '@/lib/tenant/default-content'
import { renderMarkdownish } from '@/lib/tenant/render-markdownish'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const tenant = await getTenant()
  const brand = tenant?.brand_name || tenant?.name || 'WALLiam'
  return {
    title: `Privacy Policy - ${brand}`,
    description: `Privacy Policy for ${brand}.`,
  }
}

export default async function PrivacyPage() {
  const tenant = await getTenant()
  if (!tenant) notFound()

  const content = tenant.privacy_content?.trim() || getDefaultPrivacy(tenant)

  return (
    <div style={{ background: '#060b18', minHeight: '100vh', color: '#fff' }}>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '80px 24px 120px' }}>
        {renderMarkdownish(content)}
      </div>
    </div>
  )
}
