import { createClient } from '@/lib/supabase/server'

interface Agent {
  id: string
  full_name: string
  email: string
  cell_phone: string | null
  office_phone?: string | null
  whatsapp_number?: string | null
  profile_photo_url: string | null
  bio: string | null
  brokerage_name: string | null
  brokerage_address: string | null
  title: string | null
  subdomain: string
  custom_domain?: string | null
  branding?: {
    primary_color?: string
    secondary_color?: string
    logo_url?: string
  } | null
}

export function extractSubdomain(host: string): string | null {
  if (host.includes('localhost') || host.includes('vercel.app')) {
    const subdomain = process.env.DEV_SUBDOMAIN || null
    console.log(' extractSubdomain (dev):', { host, subdomain })
    return subdomain
  }

  const parts = host.split('.')
  if (parts.length >= 3 && parts[1] === 'condoleads') {
    console.log(' extractSubdomain (prod):', { host, subdomain: parts[0] })
    return parts[0]
  }

  console.log(' extractSubdomain (no match):', { host })
  return null
}

/**
 * Check if host is a custom domain (not a subdomain of condoleads.ca)
 */
export function isCustomDomain(host: string): boolean {
  if (host.includes('localhost') || host.includes('vercel.app')) {
    return false
  }
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'condoleads.ca'
  return !host.endsWith(rootDomain)
}

/**
 * Get agent by custom domain
 */
export async function getAgentByCustomDomain(domain: string): Promise<Agent | null> {
  const supabase = createClient()
  const cleanDomain = domain.replace(/^www\./, '')

  const { data: agent, error } = await supabase
    .from('agents')
    .select('*')
    .eq('custom_domain', cleanDomain)
    .eq('is_active', true)
    .single()

  console.log(' getAgentByCustomDomain:', { domain: cleanDomain, agent: agent?.full_name, error: error?.message })
  return agent
}

export async function getAgentFromSubdomain(subdomain: string): Promise<Agent | null> {
  const supabase = createClient()

  const { data: agent, error } = await supabase
    .from('agents')
    .select('*')
    .eq('subdomain', subdomain)
    .eq('is_active', true)
    .single()

  console.log(' getAgentFromSubdomain:', { subdomain, agent: agent?.full_name, error: error?.message })
  return agent
}

/**
 * Resolve agent from hostname - checks custom domain first, then subdomain
 */
export async function getAgentFromHost(host: string): Promise<Agent | null> {
  console.log(' getAgentFromHost:', { host })

  // Check custom domain first
  if (isCustomDomain(host)) {
    const agent = await getAgentByCustomDomain(host)
    if (agent) {
      console.log(' Found agent via custom domain:', agent.full_name)
      return agent
    }
  }

  // Fall back to subdomain
  const subdomain = extractSubdomain(host)
  if (subdomain) {
    const agent = await getAgentFromSubdomain(subdomain)
    if (agent) {
      console.log(' Found agent via subdomain:', agent.full_name)
      return agent
    }
  }

  console.log(' No agent found for host:', host)
  return null
}

export async function verifyAgentBuildingAccess(
  agentId: string,
  buildingId: string
): Promise<boolean> {
  const supabase = createClient()

  // Check direct assignment via building_agents table
  const { data: directAssignment } = await supabase
    .from('building_agents')
    .select('id')
    .eq('agent_id', agentId)
    .eq('building_id', buildingId)
    .single()

  if (directAssignment) {
    console.log(' verifyAgentBuildingAccess: Direct access granted')
    return true
  }

  // Also check agent_buildings table (legacy)
  const { data: legacyAssignment } = await supabase
    .from('agent_buildings')
    .select('id')
    .eq('agent_id', agentId)
    .eq('building_id', buildingId)
    .single()

  if (legacyAssignment) {
    console.log(' verifyAgentBuildingAccess: Legacy access granted')
    return true
  }

  // Check via development assignment
  const { data: building } = await supabase
    .from('buildings')
    .select('development_id')
    .eq('id', buildingId)
    .single()

  if (building?.development_id) {
    const { data: devAssignment } = await supabase
      .from('development_agents')
      .select('id')
      .eq('agent_id', agentId)
      .eq('development_id', building.development_id)
      .single()

    if (devAssignment) {
      console.log(' verifyAgentBuildingAccess: Access granted via development')
      return true
    }
  }

  console.log(' verifyAgentBuildingAccess: No access', { agentId, buildingId })
  return false
}

export async function getAgentForBuilding(
  host: string,
  buildingId: string
): Promise<Agent | null> {
  console.log(' getAgentForBuilding START:', { host, buildingId })

  // Use the unified host resolver
  const agent = await getAgentFromHost(host)

  if (!agent) {
    console.log(' No agent found for host:', host)
    return null
  }

  const hasAccess = await verifyAgentBuildingAccess(agent.id, buildingId)

  if (!hasAccess) {
    console.log(' Agent has no access to building:', { agentName: agent.full_name, buildingId })
    return null
  }

  console.log(' Agent access verified:', { agentName: agent.full_name, buildingId })
  return agent
}

/**
 * Get branding for an agent's site
 */
export function getAgentBranding(agent: Agent) {
  const branding = agent.branding || {}
  return {
    primaryColor: branding.primary_color || '#2563eb',
    secondaryColor: branding.secondary_color || '#1e40af',
    logoUrl: branding.logo_url || agent.profile_photo_url,
    siteName: agent.brokerage_name || agent.full_name
  }
}