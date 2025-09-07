// lib/supabase/client.ts - Enhanced version with all methods

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Database operations
export class DatabaseClient {
  // Agent methods
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
          buildings(
            id, slug, building_name, canonical_address, static_content
          )
        )
      `)
      .eq('subdomain', subdomain)
      .eq('status', 'active')
      .single();
    
    if (error) return null;
    return data;
  }
  
  async getAllAgents() {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(`Database error: ${error.message}`);
    return data || [];
  }
  
  // Building methods
  async getBuildingBySlug(slug: string) {
    const { data, error } = await supabase
      .from('buildings')
      .select('*')
      .eq('slug', slug)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching building:', error);
    }
    
    return data;
  }
  
  async createBuilding(data: {
    slug: string;
    canonical_address: string;
    building_name?: string;
    static_content?: any;
    latitude?: number;
    longitude?: number;
  }) {
    const { data: building, error } = await supabase
      .from('buildings')
      .insert(data)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create building: ${error.message}`);
    return building;
  }
  
  async updateBuilding(id: string, updates: any) {
    const { data, error } = await supabase
      .from('buildings')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to update building: ${error.message}`);
    return data;
  }
  
  // Listing methods
  async upsertListing(data: any) {
    // Ensure required fields
    const listingData = {
      mls_number: data.mls_number,
      building_id: data.building_id,
      price: data.price || 0,
      beds: data.beds,
      baths: data.baths,
      sqft: data.sqft,
      unit_number: data.unit_number,
      status: data.status || 'A',
      photos: data.photos || [],
      description: data.description,
      listing_date: data.listing_date,
      sold_date: data.sold_date,
      days_on_market: data.days_on_market,
      updated_at: new Date().toISOString()
    };
    
    const { data: listing, error } = await supabase
      .from('mls_listings')
      .upsert(listingData, {
        onConflict: 'mls_number'
      })
      .select()
      .single();
    
    if (error) {
      console.error('Upsert listing error:', error);
      throw new Error(`Failed to upsert listing: ${error.message}`);
    }
    
    return listing;
  }
  
  async getListingsForBuilding(buildingId: string, status?: string) {
    let query = supabase
      .from('mls_listings')
      .select('*')
      .eq('building_id', buildingId);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data, error } = await query
      .order('listing_date', { ascending: false });
    
    if (error) throw new Error(`Failed to fetch listings: ${error.message}`);
    return data || [];
  }
  
  // Analytics methods
  async getBuildingAnalytics(buildingId: string) {
    // Get all listings for analytics
    const { data: listings, error } = await supabase
      .from('mls_listings')
      .select('*')
      .eq('building_id', buildingId);
    
    if (error) throw new Error(`Failed to fetch analytics: ${error.message}`);
    
    const active = listings?.filter(l => l.status === 'A') || [];
    const sold = listings?.filter(l => l.status === 'S') || [];
    const leased = listings?.filter(l => l.status === 'L') || [];
    
    // Calculate analytics
    const avgSalePrice = sold.length > 0
      ? sold.reduce((sum, l) => sum + l.price, 0) / sold.length
      : 0;
    
    const avgLeasePrice = leased.length > 0
      ? leased.reduce((sum, l) => sum + l.price, 0) / leased.length
      : 0;
    
    return {
      active_count: active.length,
      sold_count: sold.length,
      leased_count: leased.length,
      avg_sale_price: Math.round(avgSalePrice),
      avg_lease_price: Math.round(avgLeasePrice),
      total_listings: listings?.length || 0
    };
  }
  
  // Search method
  async searchBuildings(query: string) {
    const { data, error } = await supabase
      .from('buildings')
      .select('*')
      .or(`canonical_address.ilike.%${query}%,building_name.ilike.%${query}%`)
      .limit(10);
    
    if (error) throw new Error(`Search failed: ${error.message}`);
    return data || [];
  }
}