import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// scripts/sync-geo-daily.ts
// PART 2 daily sync — change-driven + stale-active reconciler.
//
// PER MUNICIPALITY (all munis with area_id, or subset via GEO_DAILY_MUNI_FILTER):
//   a. CURSOR = most recent sync_history.completed_at for this muni (any sync
//      type — nightly homes, geo-full, geo-daily). Fallback: NOW - 7 days if
//      no prior sync.
//   b. Pull PropTx listings where ModificationTimestamp > cursor AND City =
//      muni.name, both Residential Freehold and Residential Condo & Other.
//   c. UPSERT via saveHomesListings — inherits batch=150 + split-retry +
//      INT4/decimal clamps from commit 8b38f5a.
//   d. RECONCILE (safety-guarded):
//      - PropTx: all currently-Active listing_keys for this muni (no time
//        filter), $select=ListingKey for efficiency.
//      - SAFETY GUARD: if PropTx query errored OR returned 0 keys → SKIP
//        reconcile, log reason. Prevents whole-muni mass-inactivation on
//        network/API failure.
//      - Diff: DB Active listing_keys in this muni NOT in PropTx set =
//        stale-actives.
//      - UPDATE stale-actives: standard_status='Expired', updated_at=NOW(),
//        last_synced_at=NOW(). Status flip only — building_id, created_at
//        never touched. Never DELETE.
//   e. Write sync_history row (advances cursor for next run).
//
// Env vars:
//   GEO_DAILY_MUNI_FILTER    comma-separated muni names; if set, only those run
//   GEO_DAILY_FALLBACK_DAYS  cursor fallback lookback (default 7 days)
//   GEO_DAILY_RECONCILE      '1' to run reconciler (default), '0' to skip
//
// CONSTRAINTS PRESERVED:
// - VOW token only (via proptx-client)
// - City filter: exact
// - created_at insert-only (preserved by 7eddd71 in homes-save mapping AND
//   by not touching created_at in the reconciler UPDATE)
// - Cancelled/Withdrawn statuses flow through UPSERT (Filter-4 absent)
// - NO DELETE — reconciler only UPDATE standard_status
// - listing_key UNIQUE = onConflict target for UPSERTs
// - Row count NEVER decreases — reconciler updates in place
// - Buildings NOT touched by this sync

import { supabase } from './lib/supabase-client';
import { validateConfig, fetchPaginatedListings, fetchEnhancedDataForHomes, fetchWithRetry, getBaseUrl, getHeaders } from './lib/proptx-client';
import { saveHomesListings } from './lib/homes-save';
import { log, warn, error, writeHomesSyncHistory } from './lib/sync-logger';

const TAG = 'GEO-DAILY';
const MUNI_FILTER = process.env.GEO_DAILY_MUNI_FILTER;
const FALLBACK_DAYS = parseInt(process.env.GEO_DAILY_FALLBACK_DAYS || '7', 10);
const DO_RECONCILE = process.env.GEO_DAILY_RECONCILE !== '0';
const PROP_TYPES = ['Residential Freehold', 'Residential Condo & Other'];
const RECONCILE_STATUS = 'Expired';

interface Muni { id: string; name: string; areaId: string; }
interface MuniResult {
  name: string;
  cursor: string;
  pulled: number;
  saved: number;
  media: number;
  rooms: number;
  reconcileSkipped: boolean;
  reconcileReason?: string;
  reconcileDbActive: number;
  reconcilePtxActive: number;
  reconcileFlipped: number;
  durationSec: number;
  ok: boolean;
  error?: string;
}

async function getMuniCursor(muniId: string): Promise<Date | null> {
  const { data, error: e } = await supabase
    .from('sync_history')
    .select('completed_at')
    .eq('municipality_id', muniId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1);
  if (e) { warn(TAG, `getMuniCursor(${muniId}) error: ${e.message}`); return null; }
  const raw = data?.[0]?.completed_at;
  return raw ? new Date(raw) : null;
}

async function fetchActiveKeysFromPropTx(muniName: string): Promise<{ ok: boolean; keys: Set<string>; error?: string; pages: number }> {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();
  const filter = `(PropertyType eq 'Residential Freehold' or PropertyType eq 'Residential Condo & Other') and StandardStatus eq 'Active' and City eq '${muniName.replace(/'/g, "''")}'`;
  const keys = new Set<string>();
  const pageSize = 5000;
  let skip = 0;
  let pages = 0;
  try {
    while (true) {
      const url = `${baseUrl}Property?$filter=${encodeURIComponent(filter)}&$select=ListingKey&$top=${pageSize}&$skip=${skip}`;
      const resp = await fetchWithRetry(url, { headers }, 3, `Active-keys(${muniName}) skip=${skip}`);
      const data = await resp.json() as { value?: Array<{ ListingKey?: string }> };
      const results = data.value || [];
      pages++;
      for (const r of results) if (r.ListingKey) keys.add(r.ListingKey);
      if (results.length < pageSize) break;
      skip += pageSize;
    }
    return { ok: true, keys, pages };
  } catch (e: any) {
    return { ok: false, keys: new Set(), error: e.message, pages };
  }
}

async function reconcileMuni(muni: Muni, ptxActive: { ok: boolean; keys: Set<string>; error?: string }): Promise<{ skipped: boolean; reason?: string; dbActive: number; ptxActive: number; flipped: number }> {
  // SAFETY GUARD 1: PropTx errored
  if (!ptxActive.ok) {
    return { skipped: true, reason: `PropTx fetch failed: ${ptxActive.error}`, dbActive: 0, ptxActive: 0, flipped: 0 };
  }
  // SAFETY GUARD 2: PropTx returned 0 keys — never mass-inactivate on this
  if (ptxActive.keys.size === 0) {
    return { skipped: true, reason: 'PropTx returned 0 Active keys for this muni — safety guard', dbActive: 0, ptxActive: 0, flipped: 0 };
  }

  // Pull DB Active listings for this muni. Paginate defensively — big munis
  // like Toronto W districts have thousands of Active rows.
  const dbKeys: { id: string; listing_key: string }[] = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error: e } = await supabase
      .from('mls_listings')
      .select('id, listing_key')
      .eq('municipality_id', muni.id)
      .eq('standard_status', 'Active')
      .in('property_type', PROP_TYPES)
      .not('listing_key', 'is', null)
      .range(offset, offset + pageSize - 1);
    if (e) throw new Error(`DB fetch Active failed: ${e.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) if (r.listing_key) dbKeys.push({ id: r.id, listing_key: r.listing_key });
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  const stale = dbKeys.filter(r => !ptxActive.keys.has(r.listing_key));
  const dbActive = dbKeys.length;
  const ptxActiveCount = ptxActive.keys.size;
  if (stale.length === 0) {
    return { skipped: false, dbActive, ptxActive: ptxActiveCount, flipped: 0 };
  }

  // SAFETY GUARD 3: sanity ratio. If we're about to flip >50% of DB actives
  // for a non-tiny muni, something is wrong (bad PropTx response, wrong muni
  // name match, etc.) — skip and log for operator inspection.
  if (dbActive > 20 && stale.length > dbActive * 0.5) {
    return {
      skipped: true,
      reason: `sanity: would flip ${stale.length}/${dbActive} (${Math.round(100*stale.length/dbActive)}%) — safety guard`,
      dbActive, ptxActive: ptxActiveCount, flipped: 0,
    };
  }

  // Flip status in batches of 100 IDs per UPDATE. Only touches
  // standard_status, updated_at, last_synced_at. NEVER building_id.
  // NEVER created_at (absent from payload → DB preserves existing).
  const now = new Date().toISOString();
  let flipped = 0;
  const idBatchSize = 100;
  for (let i = 0; i < stale.length; i += idBatchSize) {
    const idBatch = stale.slice(i, i + idBatchSize).map(r => r.id);
    const { error: e } = await supabase
      .from('mls_listings')
      .update({ standard_status: RECONCILE_STATUS, updated_at: now, last_synced_at: now })
      .in('id', idBatch);
    if (e) { warn(TAG, `reconcile UPDATE batch ${i}/${stale.length} err: ${e.message}`); continue; }
    flipped += idBatch.length;
  }
  return { skipped: false, dbActive, ptxActive: ptxActiveCount, flipped };
}

async function runOneMunicipality(muni: Muni, triggeredBy: string): Promise<MuniResult> {
  const started = new Date();

  // ---- Cursor ----
  const dbCursor = await getMuniCursor(muni.id);
  const fallbackCursor = new Date(Date.now() - FALLBACK_DAYS * 86400_000);
  const cursor = dbCursor && dbCursor.getTime() > fallbackCursor.getTime() ? dbCursor : fallbackCursor;
  const cursorISO = cursor.toISOString();
  const cursorSource = dbCursor ? 'sync_history' : `fallback ${FALLBACK_DAYS}d`;

  // ---- Change-driven pull ----
  const cityFilter = `City eq '${muni.name.replace(/'/g, "''")}'`;
  const timeFilter = `ModificationTimestamp gt ${cursorISO}`;
  let allListings: any[] = [];
  for (const pt of PROP_TYPES) {
    const filter = `PropertyType eq '${pt}' and ${cityFilter} and ${timeFilter}`;
    try {
      const listings = await fetchPaginatedListings(filter);
      log(TAG, `  ${muni.name}: ${pt} since ${cursorISO} (${cursorSource}) → ${listings.length}`);
      allListings.push(...listings);
    } catch (e: any) {
      if (e.message?.startsWith('AUTH_FAILURE')) throw e;
      warn(TAG, `  ${muni.name}: ${pt} fetch failed — ${e.message}`);
    }
  }
  const seen = new Set<string>();
  const unique = allListings.filter(l => { const k = l.ListingKey; if (!k) return true; if (seen.has(k)) return false; seen.add(k); return true; });

  // ---- UPSERT changed listings ----
  let saveResult: any = { success: true, stats: { listings: 0, media: 0, rooms: 0, openHouses: 0, skipped: 0 } };
  if (unique.length > 0) {
    await fetchEnhancedDataForHomes(unique);
    saveResult = await saveHomesListings(unique, muni.id, muni.areaId);
  }

  // ---- Reconcile (safety-guarded) ----
  let reconcile = { skipped: true, reason: 'disabled', dbActive: 0, ptxActive: 0, flipped: 0 } as any;
  if (DO_RECONCILE) {
    log(TAG, `  ${muni.name}: reconcile — fetching all currently-Active listing_keys from PropTx`);
    const ptxActive = await fetchActiveKeysFromPropTx(muni.name);
    log(TAG, `  ${muni.name}: PropTx returned ${ptxActive.keys.size} Active keys (${ptxActive.pages} pages, ok=${ptxActive.ok}${ptxActive.error ? ' err=' + ptxActive.error : ''})`);
    reconcile = await reconcileMuni(muni, ptxActive);
    if (reconcile.skipped) warn(TAG, `  ${muni.name}: reconcile SKIPPED — ${reconcile.reason}`);
    else log(TAG, `  ${muni.name}: reconcile db_active=${reconcile.dbActive} ptx_active=${reconcile.ptxActive} flipped=${reconcile.flipped}`);
  }

  const durationSec = (Date.now() - started.getTime()) / 1000;

  await writeHomesSyncHistory({
    municipalityId: muni.id,
    municipalityName: muni.name,
    propertyType: 'All Residential (geo-daily)',
    startedAt: started,
    listingsFound: unique.length,
    listingsCreated: saveResult.stats?.listings || 0,
    listingsSkipped: saveResult.stats?.skipped || 0,
    mediaSaved: saveResult.stats?.media || 0,
    roomsSaved: saveResult.stats?.rooms || 0,
    openHousesSaved: saveResult.stats?.openHouses || 0,
    triggeredBy,
    status: saveResult.success ? 'completed' : 'failed',
    errorDetails: saveResult.error,
  });

  return {
    name: muni.name,
    cursor: cursorISO,
    pulled: unique.length,
    saved: saveResult.stats?.listings || 0,
    media: saveResult.stats?.media || 0,
    rooms: saveResult.stats?.rooms || 0,
    reconcileSkipped: reconcile.skipped,
    reconcileReason: reconcile.reason,
    reconcileDbActive: reconcile.dbActive,
    reconcilePtxActive: reconcile.ptxActive,
    reconcileFlipped: reconcile.flipped,
    durationSec,
    ok: !!saveResult.success,
    error: saveResult.error,
  };
}

async function main() {
  validateConfig();
  const triggeredBy = process.env.GITHUB_ACTIONS ? 'github-geo-daily' : 'manual-geo-daily';

  log(TAG, '========================================');
  log(TAG, `GEO-DAILY SYNC — FALLBACK_DAYS=${FALLBACK_DAYS} RECONCILE=${DO_RECONCILE}`);
  if (MUNI_FILTER) log(TAG, `MUNI_FILTER=${MUNI_FILTER}`);
  log(TAG, '========================================');

  const { data: allMunis, error: mErr } = await supabase
    .from('municipalities')
    .select('id, name, area_id')
    .not('area_id', 'is', null)
    .order('name')
    .limit(2000);

  if (mErr || !allMunis) {
    error(TAG, `Failed to load municipalities: ${mErr?.message || 'empty'}`);
    process.exit(1);
  }
  let munis: Muni[] = allMunis.map(m => ({ id: m.id, name: m.name, areaId: m.area_id }));
  if (MUNI_FILTER) {
    const allow = new Set(MUNI_FILTER.split(',').map(s => s.trim()).filter(Boolean));
    munis = munis.filter(m => allow.has(m.name));
    log(TAG, `Filtered to ${munis.length} munis: ${munis.map(m => m.name).join(', ')}`);
  }
  log(TAG, `Processing ${munis.length} municipalities`);

  const perMuni: MuniResult[] = [];
  const t0 = Date.now();
  for (let i = 0; i < munis.length; i++) {
    const muni = munis[i];
    log(TAG, `--- ${muni.name} (${i + 1}/${munis.length}) ---`);
    try {
      const r = await runOneMunicipality(muni, triggeredBy);
      perMuni.push(r);
    } catch (e: any) {
      if (e.message?.startsWith('AUTH_FAILURE')) { error(TAG, `Auth failure — aborting: ${e.message}`); throw e; }
      error(TAG, `${muni.name}: ${e.message}`);
      perMuni.push({
        name: muni.name, cursor: '(err)', pulled: 0, saved: 0, media: 0, rooms: 0,
        reconcileSkipped: true, reconcileReason: `muni-loop error: ${e.message}`,
        reconcileDbActive: 0, reconcilePtxActive: 0, reconcileFlipped: 0,
        durationSec: 0, ok: false, error: e.message,
      });
    }
  }

  const totalSec = (Date.now() - t0) / 1000;
  const totalPulled = perMuni.reduce((s, r) => s + r.pulled, 0);
  const totalSaved = perMuni.reduce((s, r) => s + r.saved, 0);
  const totalFlipped = perMuni.reduce((s, r) => s + r.reconcileFlipped, 0);
  const totalReconcileSkipped = perMuni.filter(r => r.reconcileSkipped).length;

  log(TAG, '');
  log(TAG, '========================================');
  log(TAG, `GEO-DAILY COMPLETE in ${(totalSec / 60).toFixed(1)} min`);
  log(TAG, `Munis processed  : ${perMuni.length}`);
  log(TAG, `Change-driven    : pulled=${totalPulled} saved=${totalSaved}`);
  log(TAG, `Reconciler       : flipped=${totalFlipped} skipped_munis=${totalReconcileSkipped}`);
  log(TAG, '========================================');
  console.log(JSON.stringify({ FALLBACK_DAYS, DO_RECONCILE, totalSec, perMuni }, null, 2));
  process.exit(perMuni.some(r => !r.ok) ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
