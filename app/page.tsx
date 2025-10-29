import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { HomePage } from '@/components/HomePage';

export default async function RootPage() {
  const headersList = headers();
  const host = headersList.get('host') || '';
  
  const subdomain = extractSubdomain(host);
  
  // If no subdomain, show main landing page
  if (!subdomain) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-6xl font-bold mb-6">CondoLeads</h1>
          <p className="text-xl mb-8">Toronto Real Estate Agent Platform</p>
          <p className="text-gray-200">Each agent gets their own branded website</p>
        </div>
      </div>
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
  
  // Fetch agent's assigned buildings with listing counts
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
        city_district
      )
    `)
    .eq('agent_id', agent.id)
    .order('is_featured', { ascending: false });
  
  // Get listing counts and photos for each building
  const buildingsWithCounts = await Promise.all(
    (agentBuildings || []).map(async (ab: any) => {
      const building = ab.buildings;
      
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
        isFeatured: ab.is_featured,
        photoUrl: photo?.[0]?.media_url || null
      };
    })
  );
  
  return <HomePage agent={agent} buildings={buildingsWithCounts} />;
}

function extractSubdomain(host: string): string | null {
  // Development: use DEV_SUBDOMAIN environment variable
  if (host.includes('localhost') || host.includes('vercel.app')) {
    return process.env.DEV_SUBDOMAIN || null;
  }
  
  // Production: extract subdomain from condoleads.ca
  const parts = host.split('.');
  if (parts.length >= 3 && parts[1] === 'condoleads') {
    return parts[0];
  }
  
  return null;
}

// Generate metadata dynamically based on agent
export async function generateMetadata() {
  const headersList = headers();
  const host = headersList.get('host') || '';
  const subdomain = extractSubdomain(host);
  
  if (!subdomain) {
    return {
      title: 'CondoLeads - Toronto Real Estate Agent Platform',
      description: 'Professional real estate websites for Toronto condo specialists'
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

