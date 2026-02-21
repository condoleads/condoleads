import { resolveAgentAccess } from '@/lib/comprehensive/access-resolver';
import { fetchMarketStats, fetchTopAreas } from '@/lib/comprehensive/stats-fetcher';
import HomePageComprehensiveClient from './HomePageComprehensiveClient';
import ChatWidgetWrapper from './chat/ChatWidgetWrapper';
import MobileContactBar from './MobileContactBar';

interface Agent {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  cell_phone?: string | null;
  subdomain: string;
  profile_photo_url?: string | null;
  bio?: string | null;
  is_active: boolean;
  title?: string | null;
  brokerage_name?: string | null;
  site_title?: string | null;
  site_tagline?: string | null;
}

interface HomePageComprehensiveProps {
  agent: Agent;
}

export async function HomePageComprehensive({ agent }: HomePageComprehensiveProps) {
  // Resolve agent's geographic access
  const access = await resolveAgentAccess(agent.id);

  if (!access) {
    // Shouldn't happen  routing should have caught this
    return <div>Access configuration error</div>;
  }

  // Fetch all homepage data in parallel
  const [stats, topAreas] = await Promise.all([
    fetchMarketStats(access),
    fetchTopAreas(access, 6),
  ]);

  return (
    <>
      <HomePageComprehensiveClient
        agent={{
          id: agent.id,
          full_name: agent.full_name,
          email: agent.email,
          phone: agent.cell_phone || agent.phone || null,
          profile_photo_url: agent.profile_photo_url || null,
          bio: agent.bio || null,
          title: agent.title || null,
          brokerage_name: agent.brokerage_name || null,
          site_title: agent.site_title || null,
          site_tagline: agent.site_tagline || null,
        }}
        stats={stats}
        topAreas={topAreas}
        access={{
          isAllMLS: access.isAllMLS,
          buildings_access: access.buildings_access,
          condo_access: access.condo_access,
          homes_access: access.homes_access,
        }}
      />
      <ChatWidgetWrapper agent={{ id: agent.id, full_name: agent.full_name }} />
      <MobileContactBar agent={agent as any} />
    </>
  );
}
