import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getAgentFromHost } from '@/lib/utils/agent-detection'
import { HomePageComprehensive } from '@/components/HomePageComprehensive'
import { extractSubdomain } from '@/lib/utils/agent-detection'
export async function generateMetadata(): Promise<Metadata> {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const cleanHost = host.replace(/^www\./, '')
  
  if (cleanHost === 'walliam.ca') {
    return {
      title: 'WALLiam — AI Real Estate Assistant for the GTA',
      description: 'Browse GTA properties, get a personalized AI buyer or seller plan, and connect with a local expert. Powered by WALLiam AI.',
      openGraph: {
        title: 'WALLiam — AI Real Estate Assistant',
        description: 'Get your personalized real estate plan in minutes. Browse → Get an AI plan → Lead Captured.',
        url: 'https://walliam.ca',
        siteName: 'WALLiam',
        type: 'website',
        images: [{ url: 'https://walliam.ca/og-walliam.png', width: 1200, height: 630, alt: 'WALLiam AI Real Estate' }],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'WALLiam — AI Real Estate Assistant',
        description: 'Get your personalized real estate plan in minutes.',
        images: ['https://walliam.ca/og-walliam.png'],
      },
    }
  }
  return {
    title: 'AI Real Estate Assistant',
    description: 'Your AI-powered real estate platform.',
  }
}


export const dynamic = 'force-dynamic'
export const revalidate = 0

// Known tenant domains resolved via tenant.default_agent_id (matches middleware pattern)
const KNOWN_TENANTS: Record<string, string> = {
  'walliam.ca': 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9',
  'www.walliam.ca': 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9',
}

export default async function ComprehensiveHomePage() {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const cleanHost = host.replace(/^www\./, '')

  // FAST PATH: known tenant domain — resolve via tenant.default_agent_id
  const tenantId = KNOWN_TENANTS[cleanHost] || KNOWN_TENANTS[host]
  if (tenantId) {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = createClient()

    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('default_agent_id')
      .eq('id', tenantId)
      .eq('is_active', true)
      .single()

    if (!tenantErr && tenant?.default_agent_id) {
      const { data: agent } = await supabase
        .from('agents')
        .select('*')
        .eq('id', tenant.default_agent_id)
        .eq('is_active', true)
        .single()

      if (agent) {
        return <HomePageComprehensive agent={{...agent, is_active: true}} />
      }
    }
    // Tenant lookup failed for a known domain — log and fall through to default path
    console.error('[comprehensive-site] Known tenant domain but default_agent_id lookup failed:', { host, tenantId })
  }

  // DEFAULT PATH: subdomain / custom domain resolution via agent-detection utility
  const agent = await getAgentFromHost(host)
  if (!agent) notFound()

  return <HomePageComprehensive agent={{...agent, is_active: true}} />
}