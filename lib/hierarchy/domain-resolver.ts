// lib/hierarchy/domain-resolver.ts
import { createClient } from '@supabase/supabase-js'
import { Agent } from './agent-tree'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface Branding {
  logo_url?: string
  primary_color: string
  secondary_color: string
  site_name: string
  tagline?: string
}

export interface DomainResolution {
  agent: Agent
  branding: Branding
  isCustomDomain: boolean
  isSubdomain: boolean
}

const DEFAULT_BRANDING: Branding = {
  primary_color: '#2563eb',
  secondary_color: '#1e40af',
  site_name: 'CondoLeads'
}

/**
 * Get agent by custom domain
 */
export async function getAgentByCustomDomain(domain: string): Promise<Agent | null> {
  // Remove www. prefix if present
  const cleanDomain = domain.replace(/^www\./, '')

  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('custom_domain', cleanDomain)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    return null
  }

  return data
}

/**
 * Get agent by subdomain
 */
export async function getAgentBySubdomain(subdomain: string): Promise<Agent | null> {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('subdomain', subdomain)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    return null
  }

  return data
}

/**
 * Walk up the tree to find the nearest ancestor with custom_domain
 * This determines the "brand owner" for the site
 */
export async function findDomainOwner(agentId: string): Promise<Agent | null> {
  let currentId: string | null = agentId

  while (currentId) {
    const { data: agent }: { data: any } = await supabase
      .from('agents')
      .select('*')
      .eq('id', currentId)
      .single()

    if (!agent) break

    // If this agent has a custom domain, they're the brand owner
    if (agent.custom_domain) {
      return agent
    }

    // Move up the tree
    currentId = agent.parent_id
  }

  // No custom domain found in tree, return the original agent
  const { data } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single()

  return data
}

/**
 * Get branding for an agent (uses their own or inherits from parent)
 */
export async function getBrandingForAgent(agentId: string): Promise<Branding> {
  const domainOwner = await findDomainOwner(agentId)

  if (!domainOwner) {
    return DEFAULT_BRANDING
  }

  const branding: any = domainOwner.branding || {}

  return {
    logo_url: branding.logo_url || domainOwner.profile_photo_url,
    primary_color: branding.primary_color || DEFAULT_BRANDING.primary_color,
    secondary_color: branding.secondary_color || DEFAULT_BRANDING.secondary_color,
    site_name: domainOwner.brokerage_name || domainOwner.full_name,
    tagline: branding.tagline
  }
}

/**
 * Resolve a domain/subdomain to agent and branding
 */
export async function resolveDomain(hostname: string): Promise<DomainResolution | null> {
  // Check for custom domain first
  const customDomainAgent = await getAgentByCustomDomain(hostname)
  if (customDomainAgent) {
    const branding = await getBrandingForAgent(customDomainAgent.id)
    return {
      agent: customDomainAgent,
      branding,
      isCustomDomain: true,
      isSubdomain: false
    }
  }

  // Check for subdomain (e.g., viyacondex.condoleads.ca)
  const subdomain = extractSubdomain(hostname)
  if (subdomain) {
    const subdomainAgent = await getAgentBySubdomain(subdomain)
    if (subdomainAgent) {
      const branding = await getBrandingForAgent(subdomainAgent.id)
      return {
        agent: subdomainAgent,
        branding,
        isCustomDomain: false,
        isSubdomain: true
      }
    }
  }

  return null
}

/**
 * Extract subdomain from hostname
 * e.g., "viyacondex.condoleads.ca" -> "viyacondex"
 */
export function extractSubdomain(hostname: string): string | null {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'condoleads.ca'

  if (!hostname.endsWith(rootDomain)) {
    return null
  }

  const subdomain = hostname.replace(`.${rootDomain}`, '').replace(/^www\./, '')

  // Ignore if it's just the root domain
  if (subdomain === '' || subdomain === 'www' || subdomain === 'admin') {
    return null
  }

  return subdomain
}

/**
 * Get the assigned agent for a building on a specific domain
 * Returns both site owner (for branding) and contact agent (for the building)
 */
export async function getAgentsForBuilding(
  buildingId: string,
  domainAgentId: string
): Promise<{ siteOwner: Agent; contactAgent: Agent } | null> {
  // Get the domain owner (for site branding)
  const siteOwner = await findDomainOwner(domainAgentId)
  if (!siteOwner) return null

  // Get the agent assigned to this building
  const { data: assignment } = await supabase
    .from('building_agents')
    .select('agent_id, agents(*)')
    .eq('building_id', buildingId)
    .single()

  // If no specific assignment, the domain owner is also the contact
  const contactAgent = assignment?.agents || siteOwner

  return {
    siteOwner,
    contactAgent: contactAgent as Agent
  }
}

/**
 * Generate the canonical URL for an agent's site
 */
export function getAgentBaseURL(agent: Agent): string {
  if (agent.custom_domain) {
    return `https://${agent.custom_domain}`
  }
  if (agent.subdomain) {
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'condoleads.ca'
    return `https://${agent.subdomain}.${rootDomain}`
  }
  return `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'condoleads.ca'}`
}