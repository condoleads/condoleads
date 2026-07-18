// scripts/analytics-report.ts
// Ops report emailed after each Nightly Analytics run.
//
// Scope: operator explicitly forbade modifying lib/email/resend.ts, the geo
// report (scripts/sync-report.ts), and any lead-email file. This is a NEW
// script that follows the same PATTERN as sync-report.ts but is independent
// so a bug in one cannot bleed into the other.
//
// What it measures: analytics-nightly.ts computes geo_analytics rows for
// buildings / communities / municipalities / areas / neighbourhoods and
// updates psf_* + geo_rankings sibling tables. The script has no dedicated
// sync_history log, so the report derives run-window activity by counting
// rows whose calculated_at falls inside the report window.
//
// Env vars:
//   RESEND_API_KEY          platform Resend key
//   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//   REPORT_TO               override recipients (comma-separated). Default
//                           condoleads.ca@gmail.com,kingshahone@gmail.com
//   REPORT_FROM             override sender. Default
//                           'condoleads ops <noreply@condoleads.ca>'
//   REPORT_SYNC_STATUS      workflow job status passed by GH Actions
//                           ('success' | 'failure' | 'cancelled' | 'unknown')
//   REPORT_WINDOW_HOURS     hours before now to count as "this run's window"
//                           (default 5 — analytics starts 09:00 UTC, spans
//                           at most ~40min; 5h window covers late-fire +
//                           timezone slack).

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const DEFAULT_RECIPIENTS = ['condoleads.ca@gmail.com', 'kingshahone@gmail.com'];
const DEFAULT_FROM = 'condoleads ops <noreply@condoleads.ca>';

const TO = (process.env.REPORT_TO || DEFAULT_RECIPIENTS.join(','))
  .split(',').map(s => s.trim()).filter(Boolean);
const FROM = process.env.REPORT_FROM || DEFAULT_FROM;
const WORKFLOW_STATUS = process.env.REPORT_SYNC_STATUS || 'unknown';
const WINDOW_HOURS = parseInt(process.env.REPORT_WINDOW_HOURS || '5', 10);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

interface AnalyticsStats {
  windowStart: Date;
  totalGeoAnalyticsRows: number | null;
  perGeoTypeUpdated: Array<{ geo_type: string; updated_in_window: number; latest_calculated: string | null }>;
  totalUpdatedInWindow: number;
  siblingTables: Array<{ table: string; total_rows: number | null; latest_ts: string | null }>;
}

async function count(table: string): Promise<number | null> {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
  if (error) { console.warn(`[analytics-report] count(${table}) err: ${error.message}`); return null; }
  return count ?? null;
}

async function latestTs(table: string, col: string): Promise<string | null> {
  const { data, error } = await supabase.from(table).select(col).order(col, { ascending: false }).limit(1);
  if (error) { console.warn(`[analytics-report] latestTs(${table}.${col}) err: ${error.message}`); return null; }
  if (!data || data.length === 0) return null;
  const v = (data[0] as any)[col];
  return v ? new Date(v).toISOString() : null;
}

async function gather(): Promise<AnalyticsStats> {
  const windowStart = new Date(Date.now() - WINDOW_HOURS * 3600_000);
  const windowIso = windowStart.toISOString();

  const totalGeoAnalyticsRows = await count('geo_analytics');

  // Per geo_type breakdown: total rows + rows calculated inside the window
  const geoTypes = ['building', 'community', 'municipality', 'area', 'neighbourhood'];
  const perGeoTypeUpdated: AnalyticsStats['perGeoTypeUpdated'] = [];
  let totalUpdatedInWindow = 0;
  for (const gt of geoTypes) {
    const { count: updated } = await supabase
      .from('geo_analytics')
      .select('id', { count: 'exact', head: true })
      .eq('geo_type', gt)
      .gte('calculated_at', windowIso);
    const { data: latestRow } = await supabase
      .from('geo_analytics')
      .select('calculated_at')
      .eq('geo_type', gt)
      .order('calculated_at', { ascending: false })
      .limit(1);
    const latest = latestRow?.[0]?.calculated_at ? new Date(latestRow[0].calculated_at).toISOString() : null;
    const n = updated ?? 0;
    perGeoTypeUpdated.push({ geo_type: gt, updated_in_window: n, latest_calculated: latest });
    totalUpdatedInWindow += n;
  }

  const siblingTables: AnalyticsStats['siblingTables'] = [];
  for (const t of ['geo_rankings', 'psf_monthly_sale', 'psf_monthly_lease', 'building_psf_summary', 'psf_calculation_log']) {
    const total = await count(t);
    // Different tables use different timestamp column names; try common ones
    let latest: string | null = null;
    for (const col of ['calculated_at', 'updated_at', 'created_at', 'computed_at']) {
      const v = await latestTs(t, col);
      if (v) { latest = v; break; }
    }
    siblingTables.push({ table: t, total_rows: total, latest_ts: latest });
  }

  return { windowStart, totalGeoAnalyticsRows, perGeoTypeUpdated, totalUpdatedInWindow, siblingTables };
}

function classify(s: AnalyticsStats): { header: string; attention: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (WORKFLOW_STATUS === 'failure' || WORKFLOW_STATUS === 'cancelled') {
    reasons.push(`workflow job status = ${WORKFLOW_STATUS}`);
  }
  if (s.totalUpdatedInWindow === 0 && WORKFLOW_STATUS === 'success') {
    reasons.push(`workflow succeeded but 0 geo_analytics rows calculated in the last ${WINDOW_HOURS}h — check whether analytics-nightly.ts is silently no-op'ing`);
  }
  const attention = reasons.length > 0;
  return {
    header: attention ? 'ATTENTION — Nightly Analytics' : 'PASS — Nightly Analytics',
    attention, reasons,
  };
}

function fmt(v: number | null | undefined): string { return v == null ? 'not recorded' : v.toLocaleString(); }

function renderText(s: AnalyticsStats, c: ReturnType<typeof classify>): string {
  const lines: string[] = [];
  lines.push(c.header);
  lines.push('='.repeat(c.header.length));
  lines.push('');
  if (c.attention) {
    lines.push('Reasons flagged:');
    c.reasons.forEach(r => lines.push('  - ' + r));
    lines.push('');
  }
  lines.push(`Workflow status : ${WORKFLOW_STATUS}`);
  lines.push(`Window start    : ${s.windowStart.toISOString()}  (last ${WINDOW_HOURS}h)`);
  lines.push(`Report generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('geo_analytics — rows calculated during this run\'s window:');
  s.perGeoTypeUpdated.forEach(g => {
    lines.push(`  ${g.geo_type.padEnd(15)}: ${String(g.updated_in_window).padStart(6)} calculated | latest overall = ${g.latest_calculated ?? 'never'}`);
  });
  lines.push(`  ${'TOTAL'.padEnd(15)}: ${String(s.totalUpdatedInWindow).padStart(6)} calculated in window`);
  lines.push('');
  lines.push(`geo_analytics total rows: ${fmt(s.totalGeoAnalyticsRows)}`);
  lines.push('');
  lines.push('Sibling analytics tables:');
  s.siblingTables.forEach(t => {
    lines.push(`  ${t.table.padEnd(24)}: rows=${fmt(t.total_rows)}   latest_ts=${t.latest_ts ?? 'no timestamp column found'}`);
  });
  lines.push('');
  lines.push('---');
  lines.push('Generated by scripts/analytics-report.ts, sent by Nightly Analytics');
  lines.push('workflow with if: always() so an ATTENTION report fires on failure/');
  lines.push('cancellation too. All numbers derived from live queries at report');
  lines.push('time; unavailable stats labeled "not recorded".');
  return lines.join('\n');
}

function renderHtml(s: AnalyticsStats, c: ReturnType<typeof classify>): string {
  const bg = c.attention ? '#fef2f2' : '#f0fdf4';
  const fg = c.attention ? '#991b1b' : '#166534';
  const reasonBlock = c.attention
    ? `<div style="margin:16px 0;padding:12px;background:#fee2e2;border-left:4px solid ${fg};border-radius:6px;"><strong>Reasons flagged:</strong><ul style="margin:8px 0 0 20px;">${c.reasons.map(r => `<li>${r}</li>`).join('')}</ul></div>`
    : '';
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
  <div style="background:${bg};border-left:4px solid ${fg};padding:20px;border-radius:10px;">
    <div style="font-size:22px;font-weight:800;color:${fg};">${c.header}</div>
    <div style="font-size:13px;color:#6b7280;margin-top:6px;">window start ${s.windowStart.toISOString()} (last ${WINDOW_HOURS}h) &middot; workflow_status=${WORKFLOW_STATUS}</div>
  </div>
  ${reasonBlock}
  <table style="width:100%;margin-top:20px;border-collapse:collapse;font-size:14px;">
    <thead><tr><th colspan="3" style="text-align:left;padding:8px 0;border-bottom:2px solid #e5e7eb;">geo_analytics — rows calculated in run window</th></tr></thead>
    <tbody>
      ${s.perGeoTypeUpdated.map(g => `<tr>
        <td style="padding:6px 0;">${g.geo_type}</td>
        <td style="text-align:right;">${g.updated_in_window.toLocaleString()}</td>
        <td style="text-align:right;color:#6b7280;font-size:12px;">latest overall ${g.latest_calculated ?? 'never'}</td>
      </tr>`).join('')}
      <tr style="border-top:1px solid #e5e7eb;font-weight:700;">
        <td style="padding:8px 0;">TOTAL</td>
        <td style="text-align:right;">${s.totalUpdatedInWindow.toLocaleString()}</td>
        <td style="text-align:right;color:#6b7280;font-size:12px;">geo_analytics table total ${fmt(s.totalGeoAnalyticsRows)}</td>
      </tr>
    </tbody>
    <thead><tr><th colspan="3" style="text-align:left;padding:8px 0;border-bottom:2px solid #e5e7eb;">Sibling analytics tables</th></tr></thead>
    <tbody>
      ${s.siblingTables.map(t => `<tr>
        <td style="padding:6px 0;">${t.table}</td>
        <td style="text-align:right;">${fmt(t.total_rows)}</td>
        <td style="text-align:right;color:#6b7280;font-size:12px;">latest ${t.latest_ts ?? 'no timestamp column'}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div style="margin-top:24px;font-size:12px;color:#6b7280;">
    Sent by scripts/analytics-report.ts from the Nightly Analytics workflow (if: always()).
    All numbers derived from live queries against geo_analytics + sibling tables at report time.
    No fake data; unavailable stats are labeled "not recorded".
  </div>
</div>`;
}

async function main() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
  const stats = await gather();
  const cls = classify(stats);
  const text = renderText(stats, cls);
  const html = renderHtml(stats, cls);
  console.log('---- REPORT TEXT ----');
  console.log(text);
  console.log('---- /REPORT TEXT ----');
  const subject = `${cls.header} — ${new Date().toISOString().slice(0, 10)} — ${stats.totalUpdatedInWindow} geo rows in ${WINDOW_HOURS}h window`;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const results: Array<{ to: string; ok: boolean; id?: string; err?: string }> = [];
  for (const to of TO) {
    try {
      const { data, error } = await resend.emails.send({ from: FROM, to, subject, html, text });
      if (error) {
        console.error(`[analytics-report] send FAILED to ${to}:`, error);
        results.push({ to, ok: false, err: JSON.stringify(error) });
      } else if (!data?.id) {
        results.push({ to, ok: false, err: 'no id returned' });
      } else {
        console.log(`[analytics-report] sent to ${to} id=${data.id}`);
        results.push({ to, ok: true, id: data.id });
      }
    } catch (e: any) {
      console.error(`[analytics-report] threw for ${to}:`, e);
      results.push({ to, ok: false, err: e?.message || String(e) });
    }
  }
  console.log('---- SEND RESULTS ----');
  console.log(JSON.stringify(results, null, 2));
  console.log('---- /SEND RESULTS ----');
  process.exit(results.some(r => !r.ok) ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(2); });
