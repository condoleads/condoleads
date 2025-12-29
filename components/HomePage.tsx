import { HeroSection } from './home/HeroSection';
import { StatsSection } from './home/StatsSection';
import { HowItWorks } from './home/HowItWorks';
import { BuildingsGrid } from './home/BuildingsGrid';
import { EstimatorBanner } from './home/EstimatorBanner';
import ChatWidgetWrapper from './chat/ChatWidgetWrapper';
import MobileContactBar from './MobileContactBar';

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
    team_name?: string | null;
    team_tagline?: string | null;
    team_logo_url?: string | null;
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
    assigned_agent?: {
      id: string;
      full_name: string;
      slug: string;
      profile_photo_url: string | null;
    } | null;
    }>;
  isTeamSite?: boolean;
  teamAgents?: Array<{
    id: string;
    full_name: string;
    slug: string;
    email: string;
    cell_phone: string | null;
    profile_photo_url: string | null;
    bio: string | null;
    title: string | null;
  }>;
    developments?: Array<{
      id: string;
      name: string;
      slug: string;
      buildingCount: number;
      photoUrl?: string | null;
      addresses?: string;
      forSale: number;
      forLease: number;
    }>;
  }

export function HomePage({ agent, buildings, developments = [], isTeamSite = false, teamAgents = [] }: HomePageProps) {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <HeroSection agent={agent as any} isTeamSite={isTeamSite} />
      
      {/* Stats Section */}
      <StatsSection 
        buildingsCount={buildings.length}
        developmentsCount={developments.length}
        totalForSale={buildings.reduce((sum, b) => sum + (b.forSale || 0), 0) + developments.reduce((sum, d) => sum + (d.forSale || 0), 0)}
        totalForLease={buildings.reduce((sum, b) => sum + (b.forLease || 0), 0) + developments.reduce((sum, d) => sum + (d.forLease || 0), 0)}
      />
      {/* How It Works */}
      <HowItWorks />
      {/* Buildings Grid */}
      <BuildingsGrid buildings={buildings} developments={developments} agentName={agent.full_name} isTeamSite={isTeamSite} />
      {/* Team Section - Only for manager sites */}
      {isTeamSite && teamAgents.length > 0 && (
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Our Team</h2>
              <p className="text-lg text-gray-600">{agent.team_tagline || 'Meet our expert real estate professionals'}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {teamAgents.map((member) => (
                <a key={member.id} href={`/team/${member.slug}`} className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-6 text-center group">
                  <div className="w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden bg-blue-100">
                    {member.profile_photo_url ? (
                      <img src={member.profile_photo_url} alt={member.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-blue-600">
                        {member.full_name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{member.full_name}</h3>
                  <p className="text-sm text-gray-500 mb-2">{member.title || 'Real Estate Agent'}</p>
                  {member.bio && <p className="text-sm text-gray-600 line-clamp-2">{member.bio}</p>}
                </a>
              ))}
            </div>
          </div>
        </section>
      )}
      {/* Estimator CTA Banner */}
      <EstimatorBanner buildings={buildings} />
      {/* AI Chat Widget */}
      <ChatWidgetWrapper agent={{ id: agent.id, full_name: agent.full_name }} />
      
      {/* Mobile Contact Bar */}
      <MobileContactBar 
        agent={{
          id: agent.id,
          full_name: agent.full_name,
          email: agent.email,
          cell_phone: agent.phone,
          profile_photo_url: agent.profile_photo_url
        }}
      />
    </div>
  );
}

export default HomePage;

