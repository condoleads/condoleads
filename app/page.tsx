import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { DatabaseClient } from '@/lib/supabase/client';
import { extractSubdomain } from '@/lib/utils';
import { HomePage } from '@/components/HomePage';

export default async function RootPage() {
  const headersList = headers();
  const host = headersList.get('host') || '';
  
  const subdomain = extractSubdomain(host);
  
  if (!subdomain) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-700">
        <div className="text-center text-white">
          <h1 className="text-4xl font-bold mb-4">Welcome to CondoLeads</h1>
          <p className="text-xl mb-8">Multi-tenant condo platform for Toronto real estate agents</p>
          <a href="/admin" className="bg-white text-blue-600 px-6 py-3 rounded-lg hover:shadow-lg">
            Admin Dashboard
          </a>
        </div>
      </div>
    );
  }
  
  const db = new DatabaseClient();
  const agentData = await db.getAgentWithBuildings(subdomain);
  
  if (!agentData) {
    notFound();
  }
  
  return <HomePage agent={agentData} />;
}