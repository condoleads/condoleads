// scripts/lib/sync-logger.ts
// Structured logging for GitHub Actions (no SSE, console + sync_history)

import { supabase } from './supabase-client';

export function log(tag: string, message: string): void {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${timestamp}] [${tag}] ${message}`);
}

export function warn(tag: string, message: string): void {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.warn(`[${timestamp}] [${tag}]  ${message}`);
}

export function error(tag: string, message: string): void {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.error(`[${timestamp}] [${tag}]  ${message}`);
}

// Write homes incremental sync_history record (per municipality)
export async function writeHomesSyncHistory(params: {
  municipalityId: string;
  municipalityName: string;
  propertyType: string;
  startedAt: Date;
  listingsFound: number;
  listingsCreated: number;
  listingsSkipped: number;
  mediaSaved: number;
  roomsSaved: number;
  openHousesSaved: number;
  triggeredBy: string;
  status: 'completed' | 'partial' | 'failed';
  errorDetails?: string | null;
}): Promise<void> {
  try {
    await supabase.from('sync_history').insert({
      municipality_id: params.municipalityId,
      municipality_name: params.municipalityName,
      property_type: params.propertyType,
      sync_type: 'incremental',
      sync_status: params.status,
      started_at: params.startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      duration_seconds: Math.round((Date.now() - params.startedAt.getTime()) / 1000),
      listings_found: params.listingsFound,
      listings_created: params.listingsCreated,
      listings_skipped: params.listingsSkipped,
      media_saved: params.mediaSaved,
      rooms_saved: params.roomsSaved,
      open_houses_saved: params.openHousesSaved,
      triggered_by: params.triggeredBy,
      error_details: params.errorDetails || null,
    });
  } catch (err: any) {
    error('SYNC_HISTORY', `Failed to write homes record: ${err.message}`);
  }
}

// Write buildings incremental sync_history record (per building)
export async function writeBuildingSyncHistory(params: {
  buildingId: string;
  listingsFound: number;
  listingsCreated: number;
  listingsUpdated: number;
  listingsUnchanged: number;
  mediaCount: number;
  roomCount: number;
  openHouseCount: number;
  duration: number;
  triggeredBy: string;
  errorDetails?: string | null;
}): Promise<void> {
  try {
    await supabase.from('sync_history').insert({
      building_id: params.buildingId,
      sync_type: 'incremental',
      feed_type: 'dla',
      listings_found: params.listingsFound,
      listings_created: params.listingsCreated,
      listings_updated: params.listingsUpdated,
      listings_unchanged: params.listingsUnchanged,
      media_records_created: params.mediaCount,
      room_records_created: params.roomCount,
      open_house_records_created: params.openHouseCount,
      sync_status: params.errorDetails ? 'partial' : 'success',
      started_at: new Date(Date.now() - params.duration * 1000).toISOString(),
      completed_at: new Date().toISOString(),
      duration_seconds: params.duration,
      triggered_by: params.triggeredBy,
      error_details: params.errorDetails || null,
      created_at: new Date().toISOString(),
    });
  } catch (err: any) {
    error('SYNC_HISTORY', `Failed to write building record: ${err.message}`);
  }
}

// Write nightly summary record
export async function writeNightlySummary(params: {
  startedAt: Date;
  homes: { success: number; failed: number; skipped: number };
  buildings: { success: number; failed: number; skipped: number };
  baseline: { totalListings: number; linkedListings: number; buildingCount: number };
  postRun: { totalListings: number; linkedListings: number; buildingCount: number };
  triggeredBy: string;
}): Promise<void> {
  const status = (params.homes.failed === 0 && params.buildings.failed === 0)
    ? 'completed'
    : (params.homes.success > 0 || params.buildings.success > 0) ? 'partial' : 'failed';

  try {
    await supabase.from('sync_history').insert({
      building_id: null,
      sync_type: 'nightly-summary',
      feed_type: 'dla',
      sync_status: status,
      started_at: params.startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      duration_seconds: Math.round((Date.now() - params.startedAt.getTime()) / 1000),
      triggered_by: params.triggeredBy,
      error_details: JSON.stringify({
        homes: params.homes,
        buildings: params.buildings,
        baseline: params.baseline,
        postRun: params.postRun,
      }),
      created_at: new Date().toISOString(),
    });
  } catch (err: any) {
    error('SYNC_HISTORY', `Failed to write nightly summary: ${err.message}`);
  }
}

// Get baseline counts for pre/post verification
export async function getBaselineCounts(): Promise<{
  totalListings: number;
  linkedListings: number;
  buildingCount: number;
}> {
  const [total, linked, buildings] = await Promise.all([
    supabase.from('mls_listings').select('*', { count: 'exact', head: true }),
    supabase.from('mls_listings').select('*', { count: 'exact', head: true }).not('building_id', 'is', null),
    supabase.from('mls_listings').select('building_id', { count: 'exact', head: true }).not('building_id', 'is', null),
  ]);

  // For unique building count, query buildings table directly
  const { count: bldgCount } = await supabase
    .from('buildings')
    .select('*', { count: 'exact', head: true });

  return {
    totalListings: total.count || 0,
    linkedListings: linked.count || 0,
    buildingCount: bldgCount || 0,
  };
}
