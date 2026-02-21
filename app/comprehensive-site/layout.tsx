import { headers } from 'next/headers'
import { getAgentFromHost } from '@/lib/utils/agent-detection'

export default async function ComprehensiveLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}