import { resolveAgentAccess } from '@/lib/comprehensive/access-resolver';
import { fetchMarketStats, fetchTopAreas } from '@/lib/comprehensive/stats-fetcher';
import { getMenuData } from '@/components/navigation/SiteHeader';
import HomePageComprehensiveClientV2 from './HomePageComprehensiveClientV2';
import ChatWidgetWrapper from './chat/ChatWidgetWrapper';
import { getCurrentTenantId, isHeroTenant } from '@/lib/utils/tenant-resolver';
import { getTenantByHost } from '@/lib/utils/tenant-brand';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

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

interface HomePageComprehensiveV2Props {
  agent: Agent;
  // W-AILY-V3-BROWSE-FIRST (2026-06-21): forwarded to the client so
  // tenants on homepage_layout='v3' land first paint in browse mode.
  // Default undefined → client falls to 'ai' → v2 byte-identical.
  defaultHomeMode?: 'ai' | 'browse';
  // W-AILY-V3-PLAN-CTAS (2026-06-21): when true, render prominent
  // "Get AI Buyer/Seller Plan" CTAs above the browse view's search
  // bar. v3 routing sets this true; v2 (WALLiam) omits → default
  // false → no CTAs in v2 browse-toggle, byte-identical to before.
  showBrowsePlanCTAs?: boolean;
}

export async function HomePageComprehensiveV2({ agent, defaultHomeMode, showBrowsePlanCTAs }: HomePageComprehensiveV2Props) {
  // C8a/D13 -- fetch tenant context for prop-drilling assistant name to client
  const host = headers().get('host');
  const supabaseForTenant = createClient();
  const tenantContext = await getTenantByHost(supabaseForTenant, host);
  const assistantName = tenantContext?.name || 'Charlie';

  // Resolve agent's geographic access
  const tenantId = await getCurrentTenantId();
  const isHero = await isHeroTenant();
    const access = await resolveAgentAccess(agent.id);

  if (!access) {
    // Shouldn't happen — routing should have caught this
    return <div>Access configuration error</div>;
  }

  // Fetch all homepage data in parallel
  const [stats, topAreas, neighbourhoods] = await Promise.all([
    fetchMarketStats(access),
    fetchTopAreas(access, 6),
    getMenuData(),
  ]);

  return (
    <>
      {/* C8b-2 -- tenantId + brandName for hero wordmark gating */}
      <HomePageComprehensiveClientV2
        tenantId={tenantContext?.id ?? null}
        brandName={tenantContext?.name ?? null}
        wordmarkStyle={tenantContext?.wordmarkStyle ?? 'standard'}
        assistantName={assistantName}
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
        neighbourhoods={neighbourhoods}
        access={{
          isAllMLS: access.isAllMLS,
          buildings_access: access.buildings_access,
          condo_access: access.condo_access,
          homes_access: access.homes_access,
        }}
        defaultHomeMode={defaultHomeMode}
        showBrowsePlanCTAs={showBrowsePlanCTAs}
      />
      {/* W-FUNNEL §9.2 Step 3: System 2 uses CharlieWidget (global, ConditionalLayout); System 1 keeps ChatWidgetWrapper. */}
      {!isHero && !tenantId && <ChatWidgetWrapper agent={{ id: agent.id, full_name: agent.full_name }} />}
    </>
  );
}