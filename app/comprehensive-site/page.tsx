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

export default async function ComprehensiveHomePage() {
  const headersList = headers()
  const host = headersList.get('host') || ''

  const agent = await getAgentFromHost(host)
  if (!agent) notFound()

  return <HomePageComprehensive agent={{...agent, is_active: true}} />
}