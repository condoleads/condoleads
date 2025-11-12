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
      <HeroSection agent={agent as any} />
      
      {/* How It Works */}
      <HowItWorks />
      
      {/* Buildings Grid */}
      <BuildingsGrid buildings={buildings} agentName={agent.full_name} />
      
      {/* Estimator CTA Banner */}
      <EstimatorBanner buildings={buildings} />
    </div>
  );
}

export default HomePage;

