import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// scripts/nightly-sync.ts
// Main orchestrator for GitHub Actions nightly MLS sync
// Runs: 1) Homes incremental â†’ 2) Buildings incremental
// Safety: Pre-flight checks, baseline verification, post-run verification
// Usage: npx tsx scripts/nightly-sync.ts

import { testConnection } from './lib/supabase-client';
import { testConnection as testPropTx, validateConfig } from './lib/proptx-client';
import { log, warn, error, getBaselineCounts, writeNightlySummary } from './lib/sync-logger';
import { runHomesIncremental } from './sync-homes-incremental';
import { runBuildingsIncremental } from './sync-buildings-incremental';

const TAG = 'NIGHTLY';

async function main() {
  const startedAt = new Date();
  const triggeredBy = process.env.GITHUB_ACTIONS ? 'github-nightly' : 'github-manual';
  const skipHomes = process.env.SKIP_HOMES === 'true';
  const skipBuildings = process.env.SKIP_BUILDINGS === 'true';

  log(TAG, '========================================');
  log(TAG, 'Starting nightly MLS sync');
  log(TAG, `Triggered by: ${triggeredBy}`);
  log(TAG, `Skip homes: ${skipHomes} | Skip buildings: ${skipBuildings}`);
  log(TAG, '========================================');

  // ===== STEP 1: PRE-FLIGHT CHECKS =====
  log(TAG, 'Running pre-flight checks...');

  try {
    validateConfig();
  } catch (err: any) {
    error(TAG, `Config validation failed: ${err.message}`);
    process.exit(1);
  }

  const supabaseOk = await testConnection();
  if (!supabaseOk) {
    error(TAG, 'Supabase connection failed â€” aborting');
    process.exit(1);
  }

  const proptxOk = await testPropTx();
  if (!proptxOk) {
    error(TAG, 'PropTx API connection failed â€” aborting');
    process.exit(1);
  }

  log(TAG, 'Pre-flight: Supabase âœ… | PropTx âœ…');

  // ===== STEP 2: RECORD BASELINE =====
  const baseline = await getBaselineCounts();
  log(TAG, `Baseline: ${baseline.totalListings} total | ${baseline.linkedListings} linked | ${baseline.buildingCount} buildings`);

  // ===== STEP 3: HOMES INCREMENTAL =====
  let homesResults = { success: 0, failed: 0, skipped: 0 };

  if (!skipHomes) {
    log(TAG, '');
    log(TAG, '=== HOMES INCREMENTAL SYNC ===');
    try {
      homesResults = await runHomesIncremental(triggeredBy);
      log(TAG, `Homes complete: ${homesResults.success} success, ${homesResults.failed} failed, ${homesResults.skipped} no changes`);
    } catch (err: any) {
      error(TAG, `Homes sync fatal error: ${err.message}`);
      homesResults.failed = 999; // Signal total failure
    }
  } else {
    log(TAG, 'Homes sync: SKIPPED (flag set)');
  }

  // ===== STEP 4: BUILDINGS INCREMENTAL =====
  let buildingsResults = { success: 0, failed: 0, skipped: 0 };

  if (!skipBuildings) {
    log(TAG, '');
    log(TAG, '=== BUILDINGS INCREMENTAL SYNC ===');
    try {
      buildingsResults = await runBuildingsIncremental(triggeredBy);
      log(TAG, `Buildings complete: ${buildingsResults.success} success, ${buildingsResults.failed} failed`);
    } catch (err: any) {
      error(TAG, `Buildings sync fatal error: ${err.message}`);
      buildingsResults.failed = 999; // Signal total failure
    }
  } else {
    log(TAG, 'Buildings sync: SKIPPED (flag set)');
  }

  // ===== STEP 5: POST-RUN VERIFICATION =====
  log(TAG, '');
  log(TAG, '=== POST-RUN VERIFICATION ===');
  const postRun = await getBaselineCounts();
  log(TAG, `Post-run: ${postRun.totalListings} total | ${postRun.linkedListings} linked | ${postRun.buildingCount} buildings`);

  const linkedDelta = postRun.linkedListings - baseline.linkedListings;
  const buildingDelta = postRun.buildingCount - baseline.buildingCount;

  if (linkedDelta < 0) {
    error(TAG, `âš ï¸ BUILDING-LINKED LISTINGS DECREASED by ${Math.abs(linkedDelta)}! Was ${baseline.linkedListings}, now ${postRun.linkedListings}`);
  } else {
    log(TAG, `Building-linked delta: ${linkedDelta >= 0 ? '+' : ''}${linkedDelta} (SAFE âœ…)`);
  }

  if (buildingDelta < 0) {
    error(TAG, `âš ï¸ BUILDING COUNT DECREASED by ${Math.abs(buildingDelta)}! Was ${baseline.buildingCount}, now ${postRun.buildingCount}`);
  } else {
    log(TAG, `Building count delta: ${buildingDelta >= 0 ? '+' : ''}${buildingDelta} (SAFE âœ…)`);
  }

  // ===== STEP 6: WRITE SUMMARY =====
  await writeNightlySummary({
    startedAt,
    homes: homesResults,
    buildings: buildingsResults,
    baseline,
    postRun,
    triggeredBy,
  });

  // ===== STEP 7: FINAL REPORT =====
  const duration = Math.round((Date.now() - startedAt.getTime()) / 1000);
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  log(TAG, '');
  log(TAG, '========================================');
  log(TAG, `NIGHTLY SYNC COMPLETE in ${minutes}m ${seconds}s`);
  log(TAG, `Homes:     ${homesResults.success} ok / ${homesResults.failed} fail / ${homesResults.skipped} skip`);
  log(TAG, `Buildings: ${buildingsResults.success} ok / ${buildingsResults.failed} fail`);
  log(TAG, `Listings:  ${baseline.totalListings} â†’ ${postRun.totalListings} (${postRun.totalListings - baseline.totalListings >= 0 ? '+' : ''}${postRun.totalListings - baseline.totalListings})`);
  log(TAG, `Linked:    ${baseline.linkedListings} â†’ ${postRun.linkedListings} (${linkedDelta >= 0 ? '+' : ''}${linkedDelta})`);
  log(TAG, '========================================');

  // Exit code: 0 = success or partial, 1 = total failure
  const totalFailures = homesResults.failed + buildingsResults.failed;
  const totalSuccess = homesResults.success + buildingsResults.success;
  if (totalSuccess === 0 && totalFailures > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main();

