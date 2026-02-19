import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: areas } = await sb.from('treb_areas').select('id, name');
  console.log('Areas:', areas?.length);
  areas?.forEach((a: any) => console.log('  ', a.name));
  const { data: munis } = await sb.from('municipalities').select('id, name, area_id');
  console.log('Municipalities:', munis?.length);
}

main().catch(console.error);
