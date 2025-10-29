import { HeroSection } from './home/HeroSection';
import { HowItWorks } from './home/HowItWorks';
import { BuildingsGrid } from './home/BuildingsGrid';
import { EstimatorBanner } from './home/EstimatorBanner';

interface HomePageProps {
  agent: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    subdomain: string;
    profile_photo_url: string | null;
    bio: string | null;
    is_active: boolean;
  };
  buildings: Array<{
    id: string;
    building_name: string;
    slug: string;
    canonical_address: string;
    street_number: string;
    street_name: string;
    city_district: string;
    forSale: number;
    forLease: number;
    isFeatured?: boolean;
  }>;
}

export function HomePage({ agent, buildings }: HomePageProps) {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <HeroSection agent={agent} />
      
      {/* How It Works */}
      <HowItWorks />
      
      {/* Buildings Grid */}
      <BuildingsGrid buildings={buildings} agentName={agent.full_name} />
      
      {/* Estimator CTA Banner */}
      <EstimatorBanner buildings={buildings} />
      
      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-xl font-bold mb-4">CondoLeads</h3>
              <p className="text-gray-400">
                Your trusted source for Toronto condo market data, listings, and insights.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-bold mb-4">Quick Links</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#buildings" className="hover:text-white transition-colors">Browse Buildings</a></li>
                <li><a href="/estimator" className="hover:text-white transition-colors">Get Estimate</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-xl font-bold mb-4">Contact</h3>
              <ul className="space-y-2 text-gray-400">
                <li>{agent.full_name}</li>
                <li>{agent.email}</li>
                {agent.phone && <li>{agent.phone}</li>}
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p> 2025 CondoLeads. All rights reserved. Built with  in Toronto</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default HomePage;

