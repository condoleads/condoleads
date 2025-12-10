import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
  
  const subdomain = extractSubdomain(host);
  console.log('?? DEBUG - Host:', host, 'Subdomain:', subdomain);
  
  // If no subdomain, show new landing page
  if (!subdomain) {
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

  // Fetch agent by subdomain
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('subdomain', subdomain)
    .eq('is_active', true)
    .single();

  console.log(' DEBUG: Agent query result:', { agent, agentError });

  if (!agent) notFound();

  // Fetch agent's directly assigned buildings
  const { data: agentBuildings } = await supabase
    .from('agent_buildings')
    .select(`
      is_featured,
      buildings (
        id,
        building_name,
        slug,
        canonical_address,
        street_number,
        street_name,
        city_district,
        development_id
      )
    `)
    .eq('agent_id', agent.id)
    .order('is_featured', { ascending: false });

  // Fetch agent's assigned developments
  const { data: agentDevelopments } = await supabase
    .from('development_agents')
    .select(`
      developments (
        id,
        name,
        slug
      )
    `)
    .eq('agent_id', agent.id);

  // Get buildings from assigned developments
  const developmentIds = (agentDevelopments || [])
    .map((ad: any) => ad.developments?.id)
    .filter(Boolean);

  let developmentBuildings: any[] = [];
  if (developmentIds.length > 0) {
    const { data: devBuildings } = await supabase
      .from('buildings')
      .select('id, building_name, slug, canonical_address, street_number, street_name, city_district, development_id')
      .in('development_id', developmentIds);
    developmentBuildings = devBuildings || [];
  }

  // Combine direct and development buildings, avoiding duplicates
  const directBuildingIds = new Set((agentBuildings || []).map((ab: any) => ab.buildings?.id));
  const combinedBuildings = [
    ...(agentBuildings || []).map((ab: any) => ({ ...ab.buildings, is_featured: ab.is_featured, fromDevelopment: false })),
    ...developmentBuildings
      .filter((b: any) => !directBuildingIds.has(b.id))
      .map((b: any) => ({ ...b, is_featured: false, fromDevelopment: true }))
  ];

  console.log(' DEBUG: Found buildings:', combinedBuildings.length);

  // Get listing counts and photos for each building
  const buildingsWithCounts = await Promise.all(
    combinedBuildings.map(async (building) => {

      // Get listings for counts
      const { data: listings } = await supabase
        .from('mls_listings')
        .select('id, transaction_type, standard_status')
        .eq('building_id', building.id);

      const forSale = listings?.filter(
        l => l.transaction_type === 'For Sale' && l.standard_status === 'Active'
      ).length || 0;
      const forLease = listings?.filter(
        l => l.transaction_type === 'For Lease' && l.standard_status === 'Active'
      ).length || 0;

      // Get first photo from building's listings
      const { data: photo } = await supabase
        .from('media')
        .select('media_url')
        .in('listing_id', listings?.map(l => l.id) || [])
        .eq('variant_type', 'large')
        .order('preferred_photo_yn', { ascending: false })
        .order('order_number', { ascending: true })
        .limit(1);

      return {
        ...building,
        forSale,
        forLease,
        isFeatured: building.is_featured,
        fromDevelopment: building.fromDevelopment,
        photoUrl: photo?.[0]?.media_url || null
      };
    })
  );

  console.log(' DEBUG: Buildings with counts:', buildingsWithCounts.length);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.__AGENT_DATA__ = ${JSON.stringify({
            full_name: agent.full_name,
            email: agent.email,
            phone: agent.phone,
            brokerage_name: agent.brokerage_name,
            brokerage_address: agent.brokerage_address,
            title: agent.title
          })};`
        }}
      />
      <HomePage 
        agent={agent} 
        buildings={buildingsWithCounts.filter((b: any) => !b.fromDevelopment)} 
        developments={(agentDevelopments || []).map((ad: any) => {
          const devBuildings = developmentBuildings.filter((b: any) => b.development_id === ad.developments?.id);
          const buildingWithPhoto = buildingsWithCounts.find((b: any) => b.development_id === ad.developments?.id && b.photoUrl);
          const addresses = devBuildings.map((b: any) => b.canonical_address).join(' & ');
          return {
            id: ad.developments?.id,
            name: ad.developments?.name,
            slug: ad.developments?.slug,
            buildingCount: devBuildings.length,
            photoUrl: buildingWithPhoto?.photoUrl || null,
            addresses: addresses
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
  const subdomain = extractSubdomain(host);
  console.log('?? DEBUG - Host:', host, 'Subdomain:', subdomain);

  if (!subdomain) {
    return {
      title: 'CondoLeads - Get Your AI-Powered Condo Leads Funnel Today',
      description: 'Stop sharing leads with competitors. Get your branded website with AI estimates that turn curious buyers into exclusive clients.'
    };
  }

  const supabase = createClient();
  const { data: agent } = await supabase
    .from('agents')
    .select('full_name, bio')
    .eq('subdomain', subdomain)
    .eq('is_active', true)
    .single();

  if (!agent) {
    return { title: 'Agent Not Found' };
  }

  return {
    title: `${agent.full_name} - Toronto Condo Specialist`,
    description: agent.bio || `Find luxury Toronto condos with ${agent.full_name}. Exclusive access to premium buildings.`,
  };
}