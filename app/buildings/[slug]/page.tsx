import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { DatabaseClient } from '../../../lib/supabase/client';
import { BuildingPage } from '../../../components/BuildingPage';

export default async function BuildingPageRoute({ 
  params 
}: { 
  params: { slug: string } 
}) {
  const db = new DatabaseClient();
  
  // Get building data
  const { data: building, error } = await db.supabase
    .from('buildings')
    .select('*')
    .eq('slug', params.slug)
    .single();
  
  if (error || !building) {
    notFound();
  }
  
  // Mock agent data for now
  const agent = {
    name: "Demo Agent",
    subdomain: "demo",
    brand_config: { primaryColor: "#2563eb" }
  };
  
  return <BuildingPage building={building} agent={agent} />;
}

// Generate metadata for SEO
export async function generateMetadata({ 
  params 
}: { 
  params: { slug: string } 
}) {
  const db = new DatabaseClient();
  
  const { data: building } = await db.supabase
    .from('buildings')
    .select('building_name, canonical_address')
    .eq('slug', params.slug)
    .single();
  
  if (!building) {
    return {
      title: 'Building Not Found',
    };
  }
  
  return {
    title: `${building.building_name || 'Toronto Condo'} - ${building.canonical_address}`,
    description: `View current listings, recent sales, and market analytics for ${building.building_name || 'this Toronto condo building'} at ${building.canonical_address}`,
  };
}