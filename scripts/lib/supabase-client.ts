import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// scripts/lib/supabase-client.ts
// Standalone Supabase client for GitHub Actions scripts
// Uses service_role key  full admin access

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables:');
  if (!supabaseUrl) console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseKey) console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  throw new Error('Supabase configuration missing. Check GitHub Secrets.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Preflight check  verify connection works
export async function testConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('municipalities')
      .select('id').limit(1);
    if (error) throw error;
    console.log('[SUPABASE] Connected. Test query OK.');
    return true;
  } catch (err: any) {
    console.error(`[SUPABASE] Connection failed: ${err.message}`);
    return false;
  }
}

