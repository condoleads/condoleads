// scripts/sync-report.ts
// Ops report emailed after each Geo Daily Sync run.
//
// Scope (per operator's explicit constraint): DO NOT touch any lead-email
// file. This script imports the Resend SDK directly (same npm package the
// codebase already depends on) and uses the PLATFORM ops sender + key. It
// does NOT import lib/email/resend.ts, sendTenantEmail.ts, or
// sendActivityEmail.ts — those stay untouched.
//
// Every number in the report comes from a SQL query executed at report time.
// No fake data, no placeholders. If a stat is unavailable, it is labeled
// "not recorded".
//
// Env vars:
//   RESEND_API_KEY         (required) platform Resend key
//   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (required)
//   REPORT_TO              (optional) comma-separated override; defaults to
//                          condoleads.ca@gmail.com,kingshahone@gmail.com
//   REPORT_FROM            (optional) override; defaults to
//                          'condoleads ops <noreply@condoleads.ca>'
//   REPORT_SYNC_STATUS     (optional) 'success' | 'failure' | 'cancelled' —
//                          passed by the workflow via job status. When absent
//                          the report infers from sync_history rows.
//   REPORT_TRIGGERED_BY    (optional) filter, defaults 'github-geo-daily';
//                          set to 'manual-geo-daily' when testing locally.
//   REPORT_RUN_WINDOW_MIN  (optional, default 120) minutes to look back from
//                          max(started_at) to bound "this run".

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const DEFAULT_RECIPIENTS = ['condoleads.ca@gmail.com', 'kingshahone@gmail.com'];
const DEFAULT_FROM = 'condoleads ops <noreply@condoleads.ca>';

const TO = (process.env.REPORT_TO || DEFAULT_RECIPIENTS.join(','))
  .split(',').map(s => s.trim()).filter(Boolean);
const FROM = process.env.REPORT_FROM || DEFAULT_FROM;
const TRIGGERED_BY = process.env.REPORT_TRIGGERED_BY || 'github-geo-daily';
const WINDOW_MIN = parseInt(process.env.REPORT_RUN_WINDOW_MIN || '120', 10);
const WORKFLOW_STATUS = process.env.REPORT_SYNC_STATUS || 'unknown';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

interface RunStats {
  runStart: Date | null;
  runEnd: Date | null;
  wallSeconds: number | null;
  munisProcessed: number;
  totalMunisTargeted: number;
  pulled: number;
  saved: number;
  skipped: number;
  failedMunis: number;
  flippedEstimate: number | null;
  rowCountAfter: number | null;
  rowCountBefore: number | null;
  rowCountDelta: number | null;
  buildingsAfter: number | null;
  sampleSkipMunis: string[];
  sampleFailedMunis: string[];
}

async function gatherStats(): Promise<RunStats> {
  // Find the most-recent run window for the given triggered_by.
  const { data: latestRow, error: e1 } = await supabase
    .from('sync_history')
    .select('started_at')
    .eq('triggered_by', TRIGGERED_BY)
    .order('started_at', { ascending: false })
    .limit(1);
  if (e1) throw new Error(`sync_history latest fetch: ${e1.message}`);
  const latest = latestRow?.[0]?.started_at ? new Date(latestRow[0].started_at) : null;
  const cutoff = latest ? new Date(latest.getTime() - WINDOW_MIN * 60_000).toISOString() : null;

  const totalMunisTargeted = (await supabase
    .from('municipalities')
    .select('id', { count: 'exact', head: true })
    .not('area_id', 'is', null)).count || 0;

  if (!latest || !cutoff) {
    return {
      runStart: null, runEnd: null, wallSeconds: null,
      munisProcessed: 0, totalMunisTargeted,
      pulled: 0, saved: 0, skipped: 0, failedMunis: 0,
      flippedEstimate: null,
      rowCountAfter: null, rowCountBefore: null, rowCountDelta: null,
      buildingsAfter: null, sampleSkipMunis: [], sampleFailedMunis: [],
    };
  }

  // All rows in the run window
  const { data: rows, error: e2 } = await supabase
    .from('sync_history')
    .select('municipality_name, listings_found, listings_created, listings_skipped, duration_seconds, started_at, completed_at, sync_status')
    .eq('triggered_by', TRIGGERED_BY)
    .gte('started_at', cutoff)
    .order('started_at');
  if (e2) throw new Error(`sync_history rows fetch: ${e2.message}`);

  const uniqueMunis = new Set<string>();
  let pulled = 0, saved = 0, skipped = 0, failedMunis = 0;
  const failedNames: string[] = [];
  const skipNames: string[] = [];
  let runStart: Date | null = null, runEnd: Date | null = null;
  for (const r of rows || []) {
    if (r.municipality_name) uniqueMunis.add(r.municipality_name);
    pulled += r.listings_found || 0;
    saved += r.listings_created || 0;
    skipped += r.listings_skipped || 0;
    const status = r.sync_status || '';
    if (status !== 'completed' && status !== 'no_changes' && status !== '') {
      failedMunis++;
      if (failedNames.length < 5 && r.municipality_name) failedNames.push(r.municipality_name);
    }
    if ((r.listings_skipped || 0) > 0 && r.municipality_name && skipNames.length < 5) {
      skipNames.push(`${r.municipality_name}(${r.listings_skipped})`);
    }
    const s = r.started_at ? new Date(r.started_at) : null;
    const c = r.completed_at ? new Date(r.completed_at) : null;
    if (s && (!runStart || s < runStart)) runStart = s;
    if (c && (!runEnd || c > runEnd)) runEnd = c;
  }
  const wallSeconds = runStart && runEnd ? Math.round((runEnd.getTime() - runStart.getTime()) / 1000) : null;

  // Flipped-to-Expired heuristic (Active→Expired during the run window).
  // Includes both reconciler flips and change-driven UPSERTs that flipped
  // status from Active→Expired based on PropTx data — both are "listings
  // that transitioned to inactive during this run" which is the operationally
  // useful number for the report.
  let flippedEstimate: number | null = null;
  if (runStart && runEnd) {
    const { count } = await supabase
      .from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .eq('standard_status', 'Expired')
      .gte('updated_at', runStart.toISOString())
      .lte('updated_at', runEnd.toISOString());
    flippedEstimate = count ?? null;
  }

  const { count: rowCountAfter } = await supabase
    .from('mls_listings')
    .select('id', { count: 'exact', head: true });
  const { count: buildingsAfter } = await supabase
    .from('buildings')
    .select('id', { count: 'exact', head: true });

  // Prior daily-run row count: look up the most recent sync_report_snapshot
  // row if it exists; otherwise "not recorded". This script does NOT create
  // that table — it just reads. If the operator later wants a persistent
  // delta, we can add a snapshot table separately.
  let rowCountBefore: number | null = null;
  let rowCountDelta: number | null = null;
  const { data: snap } = await supabase
    .from('sync_report_snapshot')
    .select('row_count, taken_at')
    .order('taken_at', { ascending: false })
    .limit(1);
  if (snap && snap.length > 0 && rowCountAfter != null && snap[0].row_count != null) {
    rowCountBefore = snap[0].row_count as number;
    rowCountDelta = rowCountAfter - rowCountBefore;
  }

  return {
    runStart, runEnd, wallSeconds,
    munisProcessed: uniqueMunis.size,
    totalMunisTargeted,
    pulled, saved, skipped, failedMunis,
    flippedEstimate,
    rowCountAfter: rowCountAfter ?? null,
    rowCountBefore, rowCountDelta,
    buildingsAfter: buildingsAfter ?? null,
    sampleSkipMunis: skipNames, sampleFailedMunis: failedNames,
  };
}

function classify(s: RunStats): { header: string; attention: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (WORKFLOW_STATUS === 'failure' || WORKFLOW_STATUS === 'cancelled') {
    reasons.push(`workflow job status = ${WORKFLOW_STATUS}`);
  }
  if (s.skipped > 0) reasons.push(`${s.skipped} listings skipped`);
  if (s.failedMunis > 0) reasons.push(`${s.failedMunis} muni(s) failed`);
  if (s.munisProcessed < s.totalMunisTargeted) {
    reasons.push(`only ${s.munisProcessed}/${s.totalMunisTargeted} munis processed`);
  }
  if (s.rowCountDelta != null && s.rowCountDelta < 0) {
    reasons.push(`row count DROPPED by ${Math.abs(s.rowCountDelta)}`);
  }
  const attention = reasons.length > 0;
  return {
    header: attention ? 'ATTENTION — Geo Daily Sync' : 'PASS — Geo Daily Sync',
    attention, reasons,
  };
}

function fmt(v: number | null | undefined, fallback = 'not recorded'): string {
  return v == null ? fallback : v.toLocaleString();
}

function renderText(s: RunStats, c: ReturnType<typeof classify>): string {
  const lines: string[] = [];
  lines.push(c.header);
  lines.push('='.repeat(c.header.length));
  lines.push('');
  if (c.attention) {
    lines.push('Reasons flagged:');
    c.reasons.forEach(r => lines.push('  - ' + r));
    lines.push('');
  }
  lines.push(`Trigger        : ${TRIGGERED_BY}`);
  lines.push(`Workflow status: ${WORKFLOW_STATUS}`);
  lines.push(`Run start (UTC): ${s.runStart ? s.runStart.toISOString() : 'not recorded'}`);
  lines.push(`Run end   (UTC): ${s.runEnd ? s.runEnd.toISOString() : 'not recorded'}`);
  lines.push(`Wall duration  : ${s.wallSeconds != null ? (s.wallSeconds / 60).toFixed(1) + ' min (' + s.wallSeconds + ' s)' : 'not recorded'}`);
  lines.push('');
  lines.push('Sync-local stats (from sync_history):');
  lines.push(`  Municipalities processed  : ${s.munisProcessed} / ${s.totalMunisTargeted}`);
  lines.push(`  Changed listings pulled   : ${fmt(s.pulled)}`);
  lines.push(`  Changed listings upserted : ${fmt(s.saved)}`);
  lines.push(`  Listings SKIPPED (timeout): ${fmt(s.skipped)}` + (s.skipped === 0 ? '   healthy' : ''));
  lines.push(`  Failed municipalities     : ${fmt(s.failedMunis)}` + (s.failedMunis === 0 ? '   healthy' : ''));
  lines.push('');
  lines.push('Reconciler / status transitions:');
  lines.push(`  Listings flipped to Expired in run window : ${s.flippedEstimate == null ? 'not recorded' : s.flippedEstimate.toLocaleString()}`);
  lines.push(`    (Includes both reconciler flips and change-driven Active→Expired.)`);
  lines.push('');
  lines.push('DB invariants:');
  lines.push(`  mls_listings AFTER  : ${fmt(s.rowCountAfter)}`);
  if (s.rowCountBefore != null && s.rowCountDelta != null) {
    lines.push(`  mls_listings BEFORE : ${s.rowCountBefore.toLocaleString()}  (from sync_report_snapshot)`);
    lines.push(`  delta               : ${s.rowCountDelta >= 0 ? '+' : ''}${s.rowCountDelta.toLocaleString()}  ${s.rowCountDelta >= 0 ? 'invariant held (never decreased)' : 'INVARIANT VIOLATED — DROP'}`);
  } else {
    lines.push(`  mls_listings BEFORE : not recorded  (sync_report_snapshot has no prior row — first run of this report)`);
    lines.push(`  delta               : not recorded`);
  }
  lines.push(`  buildings           : ${fmt(s.buildingsAfter)}`);
  lines.push('');
  if (s.sampleSkipMunis.length > 0) {
    lines.push('Sample skipped munis (first 5): ' + s.sampleSkipMunis.join(', '));
  }
  if (s.sampleFailedMunis.length > 0) {
    lines.push('Sample failed munis  (first 5): ' + s.sampleFailedMunis.join(', '));
  }
  lines.push('');
  lines.push('---');
  lines.push('This report is generated by scripts/sync-report.ts and sent by');
  lines.push('the Geo Daily Sync GitHub Actions workflow with if: always(),');
  lines.push('so an ATTENTION report appears even when the sync itself fails.');
  return lines.join('\n');
}

function renderHtml(s: RunStats, c: ReturnType<typeof classify>): string {
  const bg = c.attention ? '#fef2f2' : '#f0fdf4';
  const fg = c.attention ? '#991b1b' : '#166534';
  const reasonBlock = c.attention
    ? `<div style="margin:16px 0;padding:12px;background:#fee2e2;border-left:4px solid ${fg};border-radius:6px;"><strong>Reasons flagged:</strong><ul style="margin:8px 0 0 20px;">${c.reasons.map(r => `<li>${r}</li>`).join('')}</ul></div>`
    : '';
  const rowCountRow = s.rowCountBefore != null && s.rowCountDelta != null
    ? `<tr><td>mls_listings BEFORE (from sync_report_snapshot)</td><td style="text-align:right;">${s.rowCountBefore.toLocaleString()}</td></tr>
       <tr><td>delta</td><td style="text-align:right;color:${s.rowCountDelta < 0 ? '#991b1b' : '#166534'}"><strong>${s.rowCountDelta >= 0 ? '+' : ''}${s.rowCountDelta.toLocaleString()}</strong>${s.rowCountDelta < 0 ? ' <em>INVARIANT VIOLATED — DROP</em>' : ' <em>invariant held</em>'}</td></tr>`
    : `<tr><td>mls_listings BEFORE</td><td style="text-align:right;color:#6b7280;">not recorded (sync_report_snapshot empty — first run)</td></tr>`;
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
  <div style="background:${bg};border-left:4px solid ${fg};padding:20px;border-radius:10px;">
    <div style="font-size:22px;font-weight:800;color:${fg};">${c.header}</div>
    <div style="font-size:13px;color:#6b7280;margin-top:6px;">${s.runStart ? s.runStart.toISOString() : 'run start not recorded'} → ${s.runEnd ? s.runEnd.toISOString() : 'not recorded'}</div>
  </div>
  ${reasonBlock}
  <div style="margin-top:20px;">
    <div style="font-weight:700;font-size:14px;margin-bottom:8px;">Trigger</div>
    <div style="font-size:13px;color:#4b5563;">trigger=${TRIGGERED_BY} · workflow_status=${WORKFLOW_STATUS} · wall_duration=${s.wallSeconds != null ? (s.wallSeconds / 60).toFixed(1) + ' min' : 'not recorded'}</div>
  </div>
  <table style="width:100%;margin-top:20px;border-collapse:collapse;font-size:14px;">
    <thead><tr><th colspan="2" style="text-align:left;padding:8px 0;border-bottom:2px solid #e5e7eb;">Sync-local stats</th></tr></thead>
    <tbody>
      <tr><td style="padding:6px 0;">Municipalities processed</td><td style="text-align:right;">${s.munisProcessed} / ${s.totalMunisTargeted}</td></tr>
      <tr><td>Changed listings pulled</td><td style="text-align:right;">${fmt(s.pulled)}</td></tr>
      <tr><td>Changed listings upserted</td><td style="text-align:right;">${fmt(s.saved)}</td></tr>
      <tr><td>Listings SKIPPED (timeout)</td><td style="text-align:right;color:${s.skipped === 0 ? '#166534' : '#991b1b'};">${fmt(s.skipped)}${s.skipped === 0 ? ' healthy' : ''}</td></tr>
      <tr><td>Failed municipalities</td><td style="text-align:right;color:${s.failedMunis === 0 ? '#166534' : '#991b1b'};">${fmt(s.failedMunis)}${s.failedMunis === 0 ? ' healthy' : ''}</td></tr>
    </tbody>
    <thead><tr><th colspan="2" style="text-align:left;padding:8px 0;border-bottom:2px solid #e5e7eb;">Status transitions</th></tr></thead>
    <tbody>
      <tr><td>Listings flipped to Expired in run window<br><span style="font-size:11px;color:#6b7280;">(reconciler + change-driven Active→Expired)</span></td><td style="text-align:right;">${s.flippedEstimate == null ? 'not recorded' : s.flippedEstimate.toLocaleString()}</td></tr>
    </tbody>
    <thead><tr><th colspan="2" style="text-align:left;padding:8px 0;border-bottom:2px solid #e5e7eb;">DB invariants</th></tr></thead>
    <tbody>
      <tr><td>mls_listings AFTER</td><td style="text-align:right;"><strong>${fmt(s.rowCountAfter)}</strong></td></tr>
      ${rowCountRow}
      <tr><td>buildings</td><td style="text-align:right;">${fmt(s.buildingsAfter)}</td></tr>
    </tbody>
  </table>
  ${s.sampleSkipMunis.length > 0 ? `<div style="margin-top:16px;font-size:13px;"><strong>Sample skipped munis:</strong> ${s.sampleSkipMunis.join(', ')}</div>` : ''}
  ${s.sampleFailedMunis.length > 0 ? `<div style="margin-top:8px;font-size:13px;"><strong>Sample failed munis:</strong> ${s.sampleFailedMunis.join(', ')}</div>` : ''}
  <div style="margin-top:24px;font-size:12px;color:#6b7280;">
    Sent by scripts/sync-report.ts from the Geo Daily Sync workflow (if: always()).
    All numbers derived from live queries against sync_history / mls_listings / buildings at report time.
    No fake data; unavailable stats are labeled "not recorded".
  </div>
</div>`;
}

async function persistSnapshot(rowCount: number, buildings: number) {
  // Best-effort snapshot INSERT so the NEXT report can show a real delta.
  // If the table doesn't exist yet, log and continue — this must never
  // block the report send.
  try {
    const { error } = await supabase.from('sync_report_snapshot').insert({
      taken_at: new Date().toISOString(),
      row_count: rowCount,
      buildings_count: buildings,
      trigger: TRIGGERED_BY,
    });
    if (error) console.warn(`[sync-report] snapshot insert skipped: ${error.message}`);
  } catch (e: any) {
    console.warn(`[sync-report] snapshot insert threw: ${e.message}`);
  }
}

async function main() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
  const stats = await gatherStats();
  const cls = classify(stats);
  const text = renderText(stats, cls);
  const html = renderHtml(stats, cls);
  console.log('---- REPORT TEXT ----');
  console.log(text);
  console.log('---- /REPORT TEXT ----');
  const subject = `${cls.header} — ${stats.runStart ? stats.runStart.toISOString().slice(0, 10) : 'no-run'} — ${stats.munisProcessed}/${stats.totalMunisTargeted} munis, ${stats.saved} saved, ${stats.skipped} skipped, ${stats.flippedEstimate ?? '?'} flipped`;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const results: Array<{ to: string; ok: boolean; id?: string; err?: string }> = [];
  for (const to of TO) {
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to,
        subject,
        html,
        text,
      });
      if (error) {
        console.error(`[sync-report] send FAILED to ${to}:`, error);
        results.push({ to, ok: false, err: JSON.stringify(error) });
      } else if (!data?.id) {
        results.push({ to, ok: false, err: 'no id returned' });
      } else {
        console.log(`[sync-report] sent to ${to} id=${data.id}`);
        results.push({ to, ok: true, id: data.id });
      }
    } catch (e: any) {
      console.error(`[sync-report] threw for ${to}:`, e);
      results.push({ to, ok: false, err: e?.message || String(e) });
    }
  }
  console.log('---- SEND RESULTS ----');
  console.log(JSON.stringify(results, null, 2));
  console.log('---- /SEND RESULTS ----');

  if (stats.rowCountAfter != null && stats.buildingsAfter != null) {
    await persistSnapshot(stats.rowCountAfter, stats.buildingsAfter);
  }
  const anyFailed = results.some(r => !r.ok);
  process.exit(anyFailed ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(2); });
