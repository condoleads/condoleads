// app/page.tsx - Replace entire file
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { DatabaseClient } from '../lib/supabase/client';
import { HomePage } from '../components/HomePage';

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
          <p className="text-xl mb-8">Toronto Real Estate Agent Websites</p>
          <p className="text-gray-200">Each agent gets their own subdomain: agent.condoleads.ca</p>
        </div>
      </div>
    );
  }
  
  const db = new DatabaseClient();
  const agentData = await db.getAgentWithBuildings(subdomain);
  
  if (!agentData) notFound();
  
  return <HomePage agent={agentData} />;
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
      title: 'CondoLeads - Toronto Real Estate Agent Websites',
      description: 'Professional real estate websites for Toronto condo specialists'
    };
  }
  
  const db = new DatabaseClient();
  const agentData = await db.getAgentWithBuildings(subdomain);
  
  if (!agentData) {
    return {
      title: 'Agent Not Found'
    };
  }
  
  return {
    title: `${agentData.name} - Toronto Condo Specialist`,
    description: `Find luxury Toronto condos with ${agentData.name}. Exclusive access to premium buildings and personalized service.`,
  };
}