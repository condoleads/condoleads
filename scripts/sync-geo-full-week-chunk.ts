import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// scripts/sync-geo-full-week-chunk.ts
// Weekly chunk driver — computes which munis still need processing in the
// current week's github-geo-full cycle, sets GEO_FULL_MUNI_FILTER to that
// remaining set, and invokes scripts/sync-geo-full.ts as a child process.
//
// PURPOSE
// -------
// A single full-sync run of all 506 munis exceeds GH Actions' 6-hour job
// ceiling on the ubuntu-latest runner (observed 2026-07-19: cancelled at
// exactly 6h with 437/506 completed). This wrapper enables the workflow
// to run multiple sequential chunks on Sunday; each chunk resumes from
// where the previous left off by reading sync_history.
//
// RESUME LOGIC (why this is safe)
// --------------------------------
// The underlying scripts/sync-geo-full.ts writes one sync_history row per
// muni via writeHomesSyncHistory as soon as that muni is fully upserted.
// Diagnosis of the 2026-07-19 cancellation confirmed: all 437 completed
// munis had completed_at NOT NULL, zero rows with completed_at NULL, no
// mid-muni interrupted state.
//
// This wrapper defines "already processed this cycle" as any sync_history
// row where triggered_by='github-geo-full' AND started_at >= NOW() - 24h.
// The 24h window is:
//   - Loose enough that any Sunday chunk sees prior same-day chunks.
//   - Tight enough that a run finishing Monday 04:00 UTC still sees all
//     Sunday's rows (max span ~18h from Sunday 10:00 UTC).
//   - Automatically resets between weeks (last week's rows drop out of
//     the window by the following Sunday).
//
// FILTER OVERRIDE
// ---------------
// If GEO_FULL_MUNI_FILTER is already set by the caller (e.g. manual
// workflow_dispatch), this wrapper honours it verbatim — no chunk logic.
// Chunking is opt-in via letting the env var be empty/unset.
//
// This file does NOT modify scripts/sync-geo-full.ts. It only reads
// sync_history + spawns sync-geo-full.ts with the derived filter.

import { spawn } from 'child_process';
import { supabase } from './lib/supabase-client';

const TAG = 'WEEK-CHUNK';
const LOOKBACK_HOURS = parseInt(process.env.WEEK_CHUNK_LOOKBACK_HOURS || '24', 10);
// Optional cap on how many pending munis this single chunk processes.
// Empty/0 = no cap (default = process everything pending in the cycle).
// Used for local verification runs (prove the resume logic works without
// committing 5h of wall time to processing every remaining muni). In CI
// the cap is unset and the timeout-minutes bounds the run instead.
const MAX_MUNIS = parseInt(process.env.WEEK_CHUNK_MAX_MUNIS || '0', 10);

async function main() {
  const overrideFilter = (process.env.GEO_FULL_MUNI_FILTER || '').trim();
  if (overrideFilter) {
    console.log(`[${TAG}] GEO_FULL_MUNI_FILTER override present ("${overrideFilter}") — bypassing chunk resume logic and forwarding to sync-geo-full.ts as-is.`);
    return spawnChild(overrideFilter);
  }

  // Load all munis with area_id (this is the target set the weekly covers).
  const { data: allMunisRows, error: mErr } = await supabase
    .from('municipalities')
    .select('name')
    .not('area_id', 'is', null)
    .order('name')
    .limit(2000);
  if (mErr || !allMunisRows) {
    console.error(`[${TAG}] failed to load municipalities: ${mErr?.message || 'empty'}`);
    process.exit(1);
  }
  const all: string[] = allMunisRows.map(r => (r as any).name).filter(Boolean);

  // Load munis already processed in the last LOOKBACK_HOURS via
  // github-geo-full. This defines "already done this cycle".
  const cutoffISO = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString();
  const { data: doneRows, error: dErr } = await supabase
    .from('sync_history')
    .select('municipality_name')
    .eq('triggered_by', 'github-geo-full')
    .not('completed_at', 'is', null)
    .not('municipality_name', 'is', null)
    .gte('started_at', cutoffISO)
    .limit(5000);
  if (dErr) {
    console.error(`[${TAG}] failed to load sync_history: ${dErr.message}`);
    process.exit(1);
  }
  const doneSet = new Set<string>((doneRows || []).map(r => (r as any).municipality_name).filter(Boolean));

  const pendingAll = all.filter(name => !doneSet.has(name));
  const pending = MAX_MUNIS > 0 ? pendingAll.slice(0, MAX_MUNIS) : pendingAll;

  console.log('----------------------------------------');
  console.log(`[${TAG}] cycle window : since ${cutoffISO} (${LOOKBACK_HOURS}h back)`);
  console.log(`[${TAG}] muni target  : ${all.length}`);
  console.log(`[${TAG}] already done : ${doneSet.size}`);
  console.log(`[${TAG}] pending total: ${pendingAll.length}`);
  if (MAX_MUNIS > 0) console.log(`[${TAG}] MAX_MUNIS cap: ${MAX_MUNIS} → this chunk will process ${pending.length}`);
  else console.log(`[${TAG}] pending      : ${pending.length}  (no cap; bounded by workflow timeout)`);
  console.log('----------------------------------------');

  if (pending.length === 0) {
    console.log(`[${TAG}] nothing to do — all munis already processed in the last ${LOOKBACK_HOURS}h. This chunk is a no-op.`);
    // Set GH Actions output so the workflow can gate the report step.
    writeGithubOutput('cycle_complete', 'true');
    writeGithubOutput('munis_done', String(doneSet.size));
    writeGithubOutput('munis_target', String(all.length));
    writeGithubOutput('munis_processed_this_chunk', '0');
    process.exit(0);
  }

  const filter = pending.join(',');
  console.log(`[${TAG}] first 5 pending: ${pending.slice(0, 5).join(', ')}`);
  console.log(`[${TAG}] last 5 pending : ${pending.slice(-5).join(', ')}`);
  console.log(`[${TAG}] filter length  : ${filter.length} chars`);

  writeGithubOutput('cycle_complete', 'false');
  writeGithubOutput('munis_done', String(doneSet.size));
  writeGithubOutput('munis_target', String(all.length));

  // Spawn sync-geo-full.ts with the pending filter. Inherits all other env.
  const childCode = await spawnChild(filter);

  // After the child exits, re-check state so the workflow's report step
  // (if it runs on this chunk) sees an accurate final tally.
  const { data: doneAfter } = await supabase
    .from('sync_history')
    .select('municipality_name')
    .eq('triggered_by', 'github-geo-full')
    .not('completed_at', 'is', null)
    .not('municipality_name', 'is', null)
    .gte('started_at', cutoffISO)
    .limit(5000);
  const doneAfterCount = new Set<string>((doneAfter || []).map(r => (r as any).municipality_name).filter(Boolean)).size;
  const processedThisChunk = doneAfterCount - doneSet.size;

  console.log('----------------------------------------');
  console.log(`[${TAG}] chunk complete. processed this chunk = ${processedThisChunk}`);
  console.log(`[${TAG}] cumulative done this cycle = ${doneAfterCount}/${all.length}`);
  console.log('----------------------------------------');

  writeGithubOutput('cycle_complete', String(doneAfterCount >= all.length));
  writeGithubOutput('munis_done', String(doneAfterCount));
  writeGithubOutput('munis_processed_this_chunk', String(processedThisChunk));

  process.exit(childCode);
}

function spawnChild(filter: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, GEO_FULL_MUNI_FILTER: filter };
    const child = spawn('npx', ['tsx', 'scripts/sync-geo-full.ts'], {
      env,
      stdio: 'inherit',
      shell: true,
    });
    child.on('exit', code => resolve(code ?? 1));
    child.on('error', err => reject(err));
  });
}

function writeGithubOutput(key: string, value: string) {
  const outFile = process.env.GITHUB_OUTPUT;
  if (!outFile) return;
  try {
    require('fs').appendFileSync(outFile, `${key}=${value}\n`);
  } catch (e: any) {
    console.warn(`[${TAG}] writeGithubOutput(${key}=${value}) failed: ${e?.message}`);
  }
}

main().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
