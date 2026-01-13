// lib/psf/actions.ts

'use server';

import { createClient } from '@/lib/supabase/server';
import { getSqft, calculatePSF } from './extraction';

interface BackfillResult {
  processed: number;
  updated: number;
  errors: number;
  details: {
    exact: number;
    midpoint: number;
    fallback: number;
  };
}

/**
 * Backfill PSF data for all sold listings
 */
export async function backfillPSFData(buildingId?: string): Promise<BackfillResult> {
  const supabase = await createClient();

  const result: BackfillResult = {
    processed: 0,
    updated: 0,
    errors: 0,
    details: { exact: 0, midpoint: 0, fallback: 0 },
  };

  // Query sold listings
  let query = supabase
    .from('mls_listings')
    .select('id, close_price, square_foot_source, living_area_range')
    .eq('standard_status', 'Closed')
    .not('close_price', 'is', null);

  if (buildingId) {
    query = query.eq('building_id', buildingId);
  }

  const { data: listings, error } = await query;

  if (error) {
    console.error('Error fetching listings:', error);
    throw new Error(`Failed to fetch listings: ${error.message}`);
  }

  if (!listings || listings.length === 0) {
    return result;
  }

  // Process each listing
  for (const listing of listings) {
    result.processed++;

    try {
      const sqftResult = getSqft(listing.square_foot_source, listing.living_area_range);
      const psf = calculatePSF(listing.close_price, sqftResult.sqft);

      const { error: updateError } = await supabase
        .from('mls_listings')
        .update({
          calculated_sqft: sqftResult.sqft,
          sqft_method: sqftResult.method,
          price_per_sqft: psf,
        })
        .eq('id', listing.id);

      if (updateError) {
        result.errors++;
        console.error(`Error updating listing ${listing.id}:`, updateError);
      } else {
        result.updated++;
        result.details[sqftResult.method]++;
      }
    } catch (err) {
      result.errors++;
      console.error(`Error processing listing ${listing.id}:`, err);
    }
  }

  return result;
}

/**
 * Get PSF stats for a building
 */
export async function getBuildingPSFStats(buildingId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('mls_listings')
    .select('price_per_sqft, calculated_sqft, sqft_method, close_date, close_price')
    .eq('building_id', buildingId)
    .eq('standard_status', 'Closed')
    .not('price_per_sqft', 'is', null)
    .order('close_date', { ascending: false });

  if (error) {
    console.error('Error fetching PSF stats:', error);
    return null;
  }

  if (!data || data.length === 0) {
    return null;
  }

  const psfValues = data.map((d) => d.price_per_sqft).filter(Boolean) as number[];

  return {
    avg: Math.round(psfValues.reduce((a, b) => a + b, 0) / psfValues.length),
    min: Math.min(...psfValues),
    max: Math.max(...psfValues),
    count: psfValues.length,
    listings: data,
  };
}
