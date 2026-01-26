import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAgentFromHost, isCustomDomain } from '@/lib/utils/agent-detection';
import { HomePage } from '@/components/HomePage';
import LandingHeader from '@/components/landing/LandingHeader'
import HeroSection from '@/components/landing/HeroSection'
import EstimatorDemo from '@/components/landing/EstimatorDemo'
import PipelineFlow from '@/components/landing/PipelineFlow'
import BeforeAfter from '@/components/landing/BeforeAfter'
import PreviewGenerator from '@/components/landing/PreviewGenerator'
import FeatureCards from '@/components/landing/FeatureCards'
import DemoEmbed from '@/components/landing/DemoEmbed'
import CommunityApplication from '@/components/landing/CommunityApplication'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function RootPage() {
  const headersList = headers();
  const host = headersList.get('host') || '';
  
  // Check custom domain first
  let agent = null;
  if (isCustomDomain(host)) {
    agent = await getAgentFromHost(host);
    console.log('?? DEBUG - Custom domain check:', host, 'Agent:', agent?.full_name);
  }
  
  const subdomain = extractSubdomain(host);
  console.log('?? DEBUG - Host:', host, 'Subdomain:', subdomain);
  
  // If no subdomain AND no custom domain agent, show new landing page
  if (!subdomain && !agent) {
    return (
      <>
        <LandingHeader />
        <main className="pt-16">
          <HeroSection />
          <EstimatorDemo />
          <PipelineFlow />
          <BeforeAfter />
          <PreviewGenerator />
          <FeatureCards />
          <DemoEmbed />
          <CommunityApplication />
        </main>
      </>
    );
  }
  
  const supabase = createClient();
  
  console.log(' DEBUG: Subdomain extracted:', subdomain);

  // Fetch agent by subdomain (if not already found via custom domain)
  if (!agent && subdomain) {
    const { data: subdomainAgent, error: agentError } = await supabase
      .from('agents')
      .select('*')
      .eq('subdomain', subdomain)
      .eq('is_active', true)
      .single();
    
    console.log(' DEBUG: Agent query result:', { agent: subdomainAgent, agentError });
    agent = subdomainAgent;
  }
  
  if (!agent) notFound();

  // Check if this is a manager site (team site)
  const isTeamSite = agent.can_create_children === true;
  let teamAgents: any[] = [];
  let allAgentIds: string[] = [agent.id];

  if (isTeamSite) {
    // Get all agents under this manager
    const { data: childAgents } = await supabase
      .from('agents')
      .select('id, full_name, slug, email, cell_phone, profile_photo_url, bio, title')
      .eq('parent_id', agent.id)
      .eq('is_active', true);
    
    teamAgents = childAgents || [];
    allAgentIds = [agent.id, ...teamAgents.map(a => a.id)];
    console.log(' DEBUG: Team site detected, agents:', allAgentIds.length);
  }

  // Fetch buildings for all relevant agents (team or solo)
  const { data: agentBuildings } = await supabase
    .from('agent_buildings')
    .select(`
      is_featured,
      agent_id,
      buildings (
          id,
          building_name,
          slug,
          canonical_address,
          street_number,
          street_name,
          city_district,
          development_id,
          cover_photo_url,
          gallery_photos
        ),
      agents (
        id,
        full_name,
        slug,
        profile_photo_url
      )
    `)
    .in('agent_id', allAgentIds)
    .order('is_featured', { ascending: false });

  // Fetch agent's assigned developments
  const { data: agentDevelopments } = await supabase
    .from('development_agents')
    .select(`
      agent_id,
      developments (
          id,
          name,
          slug,
          cover_photo_url,
          gallery_photos
        ),
        agents (
        id,
        full_name,
        slug,
        profile_photo_url
      )
    `)
    .in('agent_id', allAgentIds);

  // Get buildings from assigned developments
  const developmentIds = (agentDevelopments || [])
    .map((ad: any) => ad.developments?.id)
    .filter(Boolean);

  let developmentBuildings: any[] = [];
  if (developmentIds.length > 0) {
    const { data: devBuildings } = await supabase
        .from('buildings')
        .select('id, building_name, slug, canonical_address, street_number, street_name, city_district, development_id, cover_photo_url, gallery_photos')
        .in('development_id', developmentIds);
    developmentBuildings = devBuildings || [];
  }

  // Combine direct and development buildings, avoiding duplicates
  const directBuildingIds = new Set((agentBuildings || []).map((ab: any) => ab.buildings?.id));
  const combinedBuildings = [
    ...(agentBuildings || []).map((ab: any) => ({ 
      ...ab.buildings, 
      is_featured: ab.is_featured, 
      fromDevelopment: false,
      assigned_agent: ab.agents || null
    })),
    ...developmentBuildings
      .filter((b: any) => !directBuildingIds.has(b.id))
      .map((b: any) => ({ ...b, is_featured: false, fromDevelopment: true }))
  ];

  console.log(' DEBUG: Found buildings:', combinedBuildings.length);

  // ============================================
  // OPTIMIZED: Batch all queries instead of N+1
  // ============================================
  
  // Get ALL building IDs for batch queries
  const allBuildingIds = combinedBuildings.map(b => b.id).filter(Boolean);
  
  console.log('🏢 DEBUG: Total buildings to process:', allBuildingIds.length);

// Query 1: Get ALL listings for ALL buildings in ONE query (with higher limit)
  const { data: allListings } = await supabase
    .from('mls_listings')
    .select('id, building_id, transaction_type, standard_status')
    .in('building_id', allBuildingIds)
    .limit(5000);

  console.log('📊 DEBUG: Fetched', allListings?.length || 0, 'listings');

  // ============================================
  // Process data in memory (no more DB queries!)
  // ============================================

  // Group listings by building_id
  const listingsByBuilding = new Map<string, any[]>();
  (allListings || []).forEach(listing => {
    const existing = listingsByBuilding.get(listing.building_id) || [];
    existing.push(listing);
    listingsByBuilding.set(listing.building_id, existing);
  });

  
  // Build final buildings array with counts and photos
  const buildingsWithCounts = combinedBuildings.map((building) => {
    const buildingListings = listingsByBuilding.get(building.id) || [];
    
    const forSale = buildingListings.filter(
      l => l.transaction_type === 'For Sale' && l.standard_status === 'Active'
    ).length;
    
    const forLease = buildingListings.filter(
      l => l.transaction_type === 'For Lease' && l.standard_status === 'Active'
    ).length;

// Use admin-set cover photo
    const photoUrl = building.cover_photo_url;

    return {
      ...building,
      forSale,
      forLease,
      isFeatured: building.is_featured,
      fromDevelopment: building.fromDevelopment,
      photoUrl: photoUrl || null,
      galleryPhotos: building.gallery_photos || [],
      assigned_agent: building.assigned_agent || null
    };
  });

  console.log(' DEBUG: Buildings with counts:', buildingsWithCounts.length);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.__AGENT_DATA__ = ${JSON.stringify({
            full_name: agent.full_name,
            email: agent.email,
            phone: agent.cell_phone,
            brokerage_name: agent.brokerage_name,
            brokerage_address: agent.brokerage_address,
            title: agent.title,
            siteName: agent.site_title || (agent.custom_domain 
              ? agent.custom_domain.replace(/\.(ca|com|net|org)$/, '').split('.').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
              : agent.subdomain.charAt(0).toUpperCase() + agent.subdomain.slice(1)),
            siteTagline: agent.site_tagline || 'Toronto Condo Specialist',
            ogImageUrl: agent.og_image_url
          })};`
        }}
      />
      <HomePage
        agent={agent}
        buildings={buildingsWithCounts.filter((b: any) => !b.fromDevelopment)}
        isTeamSite={isTeamSite}
        teamAgents={teamAgents}
        developments={(agentDevelopments || []).map((ad: any) => {
          const devBuildings = developmentBuildings.filter((b: any) => b.development_id === ad.developments?.id);
          const devBuildingsWithCounts = buildingsWithCounts.filter((b: any) => b.development_id === ad.developments?.id);
          const buildingWithPhoto = devBuildingsWithCounts.find((b: any) => b.photoUrl);
          const addresses = devBuildings.map((b: any) => b.canonical_address).join(' & ');
          const forSale = devBuildingsWithCounts.reduce((sum: number, b: any) => sum + (b.forSale || 0), 0);
          const forLease = devBuildingsWithCounts.reduce((sum: number, b: any) => sum + (b.forLease || 0), 0);
          return {
              id: ad.developments?.id,
              name: ad.developments?.name,
              slug: ad.developments?.slug,
              buildingCount: devBuildings.length,
              photoUrl: ad.developments?.cover_photo_url || buildingWithPhoto?.photoUrl || null,
              galleryPhotos: ad.developments?.gallery_photos || [],
              addresses: addresses,
              forSale: forSale,
              forLease: forLease,
              assigned_agent: ad.agents || null
            };
        }).filter((d: any) => d.id)}
      />
    </>
  );
}

function extractSubdomain(host: string) {
  // Production: extract subdomain from condoleads.ca
  if (host.endsWith('.condoleads.ca') || host === 'condoleads.ca') {
    const parts = host.split('.');
    // condoleads.ca = no subdomain (2 parts)
    // mary.condoleads.ca = subdomain 'mary' (3 parts)
    if (parts.length === 2) {
      return null; // Root domain, no subdomain
    }
    if (parts.length >= 3 && parts[1] === 'condoleads') {
        const potentialSubdomain = parts[0];
        // Filter out 'www' - it's not a real subdomain
        if (potentialSubdomain === 'www') {
          return null;
        }
        return potentialSubdomain; // Return subdomain
      }
  }

  // Development: use DEV_SUBDOMAIN environment variable
  if (host.includes('localhost') || host.includes('vercel.app')) {
    return process.env.DEV_SUBDOMAIN || null;
  }

  return null;
}

// Generate metadata dynamically based on agent
export async function generateMetadata() {
  const headersList = headers();
  const host = headersList.get('host') || '';
  
  // Check custom domain first
  let agent = null;
  const supabase = createClient();
  
  if (isCustomDomain(host)) {
    const cleanDomain = host.replace(/^www\./, '');
    const { data } = await supabase
      .from('agents')
      .select('full_name, bio, site_title, site_tagline, og_image_url, custom_domain')
      .eq('custom_domain', cleanDomain)
      .eq('is_active', true)
      .single();
    agent = data;
  }
  
  const subdomain = extractSubdomain(host);
  
  if (!subdomain && !agent) {
    return {
      title: 'CondoLeads - Get Your AI-Powered Condo Leads Funnel Today',
      description: 'Stop sharing leads with competitors. Get your branded website with AI estimates that turn curious buyers into exclusive clients.'
    };
  }
  
  // Fetch by subdomain if not found via custom domain
  if (!agent && subdomain) {
    const { data } = await supabase
      .from('agents')
      .select('full_name, bio, site_title, site_tagline, og_image_url, custom_domain')
      .eq('subdomain', subdomain)
      .eq('is_active', true)
      .single();
    agent = data;
  }
  
  if (!agent) {
    return { title: 'Agent Not Found' };
  }
  
  const siteTitle = agent.site_title || agent.full_name;
  const tagline = agent.site_tagline || 'Toronto Condo Specialist';
  const description = agent.bio || `Find luxury Toronto condos with ${agent.full_name}. Exclusive access to premium buildings.`;
  
  return {
    title: `${siteTitle} - ${tagline}`,
    description: description,
    openGraph: {
      title: `${siteTitle} - ${tagline}`,
      description: description,
      type: 'website',
      images: agent.og_image_url ? [{ url: agent.og_image_url, width: 1200, height: 630 }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${siteTitle} - ${tagline}`,
      description: description,
      images: agent.og_image_url ? [agent.og_image_url] : [],
    },
  };
}