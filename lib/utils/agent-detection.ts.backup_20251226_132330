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
  can_create_children?: boolean
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
   * Get the agent to display for a building on a team site
   * For manager sites: returns assigned agent if building is assigned to team member
   * For solo sites: returns site owner
   */
  export async function getDisplayAgentForBuilding(
    host: string,
    buildingId: string
  ): Promise<{ siteOwner: Agent | null; displayAgent: Agent | null; isTeamSite: boolean }> {
    const supabase = createClient()
    // Get site owner from host
    const siteOwner = await getAgentFromHost(host)
    if (!siteOwner) {
      return { siteOwner: null, displayAgent: null, isTeamSite: false }
    }
    const isTeamSite = siteOwner.can_create_children === true

    // Get building's development_id if it belongs to one
    const { data: building } = await supabase
      .from('buildings')
      .select('development_id')
      .eq('id', buildingId)
      .single()

    // If not a team site, just verify access and return site owner
    if (!isTeamSite) {
      const hasAccess = await verifyAgentBuildingAccess(siteOwner.id, buildingId)
      if (hasAccess) {
        return { siteOwner, displayAgent: siteOwner, isTeamSite: false }
      }
      // Check development access if building is part of a development
      if (building?.development_id) {
        const { data: devAssignment } = await supabase
          .from('development_agents')
          .select('id')
          .eq('agent_id', siteOwner.id)
          .eq('development_id', building.development_id)
          .single()
        if (devAssignment) {
          return { siteOwner, displayAgent: siteOwner, isTeamSite: false }
        }
      }
      return { siteOwner, displayAgent: null, isTeamSite: false }
    }

    // For team sites, get all team member IDs
    const { data: teamAgents } = await supabase
      .from('agents')
      .select('id')
      .eq('parent_id', siteOwner.id)
      .eq('is_active', true)
    const allAgentIds = [siteOwner.id, ...(teamAgents || []).map(a => a.id)]

    // Check if building is directly assigned to any team member
    const { data: assignment } = await supabase
      .from('agent_buildings')
      .select(`
        agent_id,
        agents (
          id, full_name, email, cell_phone, office_phone, whatsapp_number,
          profile_photo_url, bio, brokerage_name, brokerage_address, title,
          subdomain, custom_domain, branding, can_create_children
        )
      `)
      .eq('building_id', buildingId)
      .in('agent_id', allAgentIds)
      .limit(1)
      .single()

    if (assignment?.agents) {
      const displayAgent = assignment.agents as unknown as Agent
      console.log(' Display agent for building:', { buildingId, displayAgent: displayAgent.full_name, siteOwner: siteOwner.full_name })
      return { siteOwner, displayAgent, isTeamSite: true }
    }

    // Check if building's development is assigned to any team member
    if (building?.development_id) {
      const { data: devAssignment } = await supabase
        .from('development_agents')
        .select(`
          agent_id,
          agents (
            id, full_name, email, cell_phone, office_phone, whatsapp_number,
            profile_photo_url, bio, brokerage_name, brokerage_address, title,
            subdomain, custom_domain, branding, can_create_children
          )
        `)
        .eq('development_id', building.development_id)
        .in('agent_id', allAgentIds)
        .limit(1)
        .single()

      if (devAssignment?.agents) {
        const displayAgent = devAssignment.agents as unknown as Agent
        console.log(' Display agent for building (via development):', { buildingId, displayAgent: displayAgent.full_name, siteOwner: siteOwner.full_name })
        return { siteOwner, displayAgent, isTeamSite: true }
      }
    }

    // Building not assigned to team - no access
    console.log(' Building not assigned to team:', { buildingId, siteOwner: siteOwner.full_name })
    return { siteOwner, displayAgent: null, isTeamSite: true }
  }
/**
   * Get the agent to display for a development on a team site
   */
  export async function getDisplayAgentForDevelopment(
    host: string,
    developmentId: string
  ): Promise<{ siteOwner: Agent | null; displayAgent: Agent | null; isTeamSite: boolean }> {
    const supabase = createClient()
    
    const siteOwner = await getAgentFromHost(host)
    if (!siteOwner) {
      return { siteOwner: null, displayAgent: null, isTeamSite: false }
    }

    const isTeamSite = siteOwner.can_create_children === true

    if (!isTeamSite) {
      const { data: devAssignment } = await supabase
        .from('development_agents')
        .select('id')
        .eq('agent_id', siteOwner.id)
        .eq('development_id', developmentId)
        .single()
      
      if (!devAssignment) {
        return { siteOwner, displayAgent: null, isTeamSite: false }
      }
      return { siteOwner, displayAgent: siteOwner, isTeamSite: false }
    }

    const { data: teamAgents } = await supabase
      .from('agents')
      .select('id')
      .eq('parent_id', siteOwner.id)
      .eq('is_active', true)

    const allAgentIds = [siteOwner.id, ...(teamAgents || []).map(a => a.id)]

    const { data: assignment } = await supabase
      .from('development_agents')
      .select(`
        agent_id,
        agents (
          id, full_name, email, cell_phone, office_phone, whatsapp_number,
          profile_photo_url, bio, brokerage_name, brokerage_address, title,
          subdomain, custom_domain, branding, can_create_children
        )
      `)
      .eq('development_id', developmentId)
      .in('agent_id', allAgentIds)
      .limit(1)
      .single()

    if (!assignment || !assignment.agents) {
      console.log(' Development not assigned to team:', { developmentId, siteOwner: siteOwner.full_name })
      return { siteOwner, displayAgent: null, isTeamSite: true }
    }

    const displayAgent = assignment.agents as unknown as Agent
    console.log(' Display agent for development:', { developmentId, displayAgent: displayAgent.full_name, siteOwner: siteOwner.full_name })
    return { siteOwner, displayAgent, isTeamSite: true }
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