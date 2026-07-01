import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getAgentFromHost } from '@/lib/utils/agent-detection'
import { HomePageComprehensive } from '@/components/HomePageComprehensive'
import { HomePageComprehensiveV2 } from '@/components/HomePageComprehensiveV2'
import { extractSubdomain } from '@/lib/utils/agent-detection'
// C7/D11 -- comprehensive-site metadata is now per-tenant.
export async function generateMetadata(): Promise<Metadata> {
  try {
    const host = headers().get('host')
    const { createClient } = await import('@/lib/supabase/server')
    const { getTenantByHost } = await import('@/lib/utils/tenant-brand')
    const supabase = createClient()
    const tenant = await getTenantByHost(supabase, host)

    if (!tenant) {
      return {
        title: 'AI Real Estate Assistant',
        description: 'Your AI-powered real estate platform.',
      }
    }

    const url = `https://${tenant.domain}`
    const ogImageUrl = `${url}/og`
    const title = `${tenant.name} - AI Real Estate Assistant for the GTA`
    const description = `Browse GTA properties, get a personalized AI buyer or seller plan, and connect with a local expert. Powered by ${tenant.name} AI.`
    const ogTitle = `${tenant.name} - AI Real Estate Assistant`
    const ogDescription = 'Get your personalized real estate plan in minutes.'

    // W-MARKETING A-UNIT-1b (2026-07-01): homepage self-canonical.
    // aily.ca and future tenants land here (middleware rewrites `/` to
    // `/comprehensive-site/`). Fallback = raw host (self-canonical).
    const { resolveCanonicalHost } = await import('@/lib/utils/canonical')
    const canonicalDomain = await resolveCanonicalHost()

    return {
      title,
      description,
      openGraph: {
        title: ogTitle,
        description: ogDescription,
        url,
        siteName: tenant.name,
        type: 'website',
        images: [{ url: ogImageUrl, width: 1200, height: 630, alt: `${tenant.name} AI Real Estate` }],
      },
      twitter: {
        card: 'summary_large_image',
        title: ogTitle,
        description: ogDescription,
        images: [ogImageUrl],
      },
      alternates: {
        canonical: `https://${canonicalDomain}/`,
      },
    }
  } catch {
    return {
      title: 'AI Real Estate Assistant',
      description: 'Your AI-powered real estate platform.',
    }
  }
}

// C7/D11 -- stale hardcoded generateMetadata excised
export const dynamic = 'force-dynamic'
export const revalidate = 0

// C7/D11 -- static host-to-uuid map removed; DB lookup via getTenantByHost handles all tenants generically.

export default async function ComprehensiveHomePage() {
  const headersList = headers()
  const host = headersList.get('host') || ''

  // C7/D11 -- resolve tenant by host via single DB-backed helper.
  const { createClient } = await import('@/lib/supabase/server')
  const { getTenantByHost } = await import('@/lib/utils/tenant-brand')
  const supabase = createClient()
  const tenant = await getTenantByHost(supabase, host)

  if (tenant) {
    const { data: tenantDetail, error: tenantErr } = await supabase
      .from('tenants')
      .select('default_agent_id, homepage_layout')
      .eq('id', tenant.id)
      .eq('is_active', true)
      .single()

    if (!tenantErr && tenantDetail?.default_agent_id) {
      const { data: agent } = await supabase
        .from('agents')
        .select('*')
        .eq('id', tenantDetail.default_agent_id)
        .eq('is_active', true)
        .single()

      if (agent) {
        const agentProps = {...agent, is_active: true}
        const layout = tenantDetail?.homepage_layout ?? 'v1'
        // W-AILY-V3-BROWSE-FIRST (2026-06-21): 'v3' renders V2 with
        // defaultHomeMode='browse' (lands on listings first paint;
        // existing AI/Browse toggle still works). v2 path unchanged
        // (defaultHomeMode prop omitted → client falls to 'ai').
        // W-AILY-V3-PLAN-CTAS (2026-06-21): also surface prominent
        // "Get AI Buyer/Seller Plan" CTAs above the browse search bar.
        if (layout === 'v3') return <HomePageComprehensiveV2 agent={agentProps} defaultHomeMode='browse' showBrowsePlanCTAs />
        return layout === 'v2'
          ? <HomePageComprehensiveV2 agent={agentProps} />
          : <HomePageComprehensive agent={agentProps} />
      }
    }
    console.error('[comprehensive-site] tenant by host resolved but default_agent_id lookup failed:', { host, tenantId: tenant.id })
  }

  // DEFAULT PATH: subdomain / custom domain resolution via agent-detection utility
  const agent = await getAgentFromHost(host)
  if (!agent) notFound()

  return <HomePageComprehensive agent={{...agent, is_active: true}} />
}