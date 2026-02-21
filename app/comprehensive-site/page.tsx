import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getAgentFromHost } from '@/lib/utils/agent-detection'
import { HomePageComprehensive } from '@/components/HomePageComprehensive'
import { extractSubdomain } from '@/lib/utils/agent-detection'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ComprehensiveHomePage() {
  const headersList = headers()
  const host = headersList.get('host') || ''

  const agent = await getAgentFromHost(host)
  if (!agent) notFound()

  return <HomePageComprehensive agent={{...agent, is_active: true}} />
}