// app/admin/psf-analytics/page.tsx

import { createClient } from '@/lib/supabase/server';
import PSFDashboard from './psf-dashboard';

export default async function PSFAnalyticsPage() {
  const supabase = await createClient();

  // Get calculation logs
  const { data: logs } = await supabase
    .from('psf_calculation_log')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(5);

  // Get sale stats
  const { data: saleStats } = await supabase
    .from('psf_monthly_sale')
    .select('geo_level, all_sample_size, exact_sqft_count, midpoint_sqft_count, fallback_sqft_count')
    .limit(1000);

  // Get lease stats
  const { data: leaseStats } = await supabase
    .from('psf_monthly_lease')
    .select('geo_level, all_sample_size, exact_sqft_count, midpoint_sqft_count, fallback_sqft_count')
    .limit(1000);

  // Get geography counts
  const { count: areaCount } = await supabase.from('treb_areas').select('*', { count: 'exact', head: true });
  const { count: muniCount } = await supabase.from('municipalities').select('*', { count: 'exact', head: true });
  const { count: commCount } = await supabase.from('communities').select('*', { count: 'exact', head: true });

  const stats = {
    sale: {
      totalRecords: saleStats?.reduce((sum, r) => sum + (r.all_sample_size || 0), 0) || 0,
      exactCount: saleStats?.reduce((sum, r) => sum + (r.exact_sqft_count || 0), 0) || 0,
      midpointCount: saleStats?.reduce((sum, r) => sum + (r.midpoint_sqft_count || 0), 0) || 0,
      fallbackCount: saleStats?.reduce((sum, r) => sum + (r.fallback_sqft_count || 0), 0) || 0,
      periodCount: saleStats?.length || 0,
    },
    lease: {
      totalRecords: leaseStats?.reduce((sum, r) => sum + (r.all_sample_size || 0), 0) || 0,
      exactCount: leaseStats?.reduce((sum, r) => sum + (r.exact_sqft_count || 0), 0) || 0,
      midpointCount: leaseStats?.reduce((sum, r) => sum + (r.midpoint_sqft_count || 0), 0) || 0,
      fallbackCount: leaseStats?.reduce((sum, r) => sum + (r.fallback_sqft_count || 0), 0) || 0,
      periodCount: leaseStats?.length || 0,
    },
    geography: {
      areas: areaCount || 0,
      municipalities: muniCount || 0,
      communities: commCount || 0,
    },
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">PSF Analytics Dashboard</h1>
      <PSFDashboard stats={stats} logs={logs || []} />
    </div>
  );
}
