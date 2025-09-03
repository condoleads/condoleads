import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export class DatabaseClient {
  async createAgent(data: {
    name: string;
    email: string;
    subdomain: string;
    phone?: string;
    plan?: string;
    brand_config?: any;
  }) {
    const { data: agent, error } = await supabase
      .from('agents')
      .insert(data)
      .select()
      .single();
    
    if (error) throw new Error(`Database error: ${error.message}`);
    return agent;
  }
  
  async getAgentWithBuildings(subdomain: string) {
    const { data, error } = await supabase
      .from('agents')
      .select(`
        *,
        agent_buildings!inner(
          buildings(*)
        )
      `)
      .eq('subdomain', subdomain)
      .eq('status', 'active')
      .single();
    
    if (error) return null;
    return data;
  }
  
  async getBuildingListings(buildingId: string) {
    const { data, error } = await supabase
      .from('mls_listings')
      .select('*')
      .eq('building_id', buildingId)
      .eq('status', 'A')
      .order('price', { ascending: true });
    
    if (error) throw new Error(`Database error: ${error.message}`);
    return data || [];
  }
  
  async getAllAgents() {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(`Database error: ${error.message}`);
    return data || [];
  }
}