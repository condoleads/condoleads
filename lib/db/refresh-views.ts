import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function refreshMaterializedViews() {
  try {
    await supabase.rpc('refresh_all_mvs');
    console.log('[MV] All materialized views refreshed');
  } catch (err) {
    console.error('[MV] Refresh failed:', err);
  }
}
