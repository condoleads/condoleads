import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getTenantByHost } from '@/lib/utils/tenant-brand'
import WalliamCTAClient from './WalliamCTAClient'

// C8a/D13 -- server wrapper: fetches tenant context, passes assistantName to client.
// All callers continue to import WalliamCTA from '@/components/WalliamCTA' with no change.
// The wordmark JSX inside WalliamCTAClient is the WALLiam wordmark and stays untouched
// (per C8b plan: WALLiam-preserved, other tenants get plain-text fallback).

interface Props {
  context?: string
}

export default async function WalliamCTA({ context }: Props) {
  const host = headers().get('host')
  const supabase = createClient()
  const tenant = await getTenantByHost(supabase, host)
  const assistantName = tenant?.name || 'Charlie'

  return <WalliamCTAClient context={context} assistantName={assistantName} />
}
