#!/usr/bin/env node
// scripts/smoke-cv-est.js
// CV-EST real-key smoke against LIVE WALLiam.
// SAFETY: lead writes in BEGIN/ROLLBACK; vip-request email goes to delivered@resend.dev.
// FRUGAL: 1 real Anthropic call (Sonnet 4 -- model the prod path uses).

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const WALLIAM_TENANT = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const NEO_SMITH      = 'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f';
const SAFE_RECIPIENT = 'delivered@resend.dev';

const results = [];
function record(group, name, passed, expected, got) {
  results.push({ group, name, passed, expected: String(expected), got: String(got) });
  console.log('  [' + (passed ? 'PASS' : 'FAIL') + '] ' + group + ' / ' + name);
  if (!passed) console.log('         expected: ' + expected + '\n         got:      ' + got);
}
let anthropicCalls = 0, anthropicInputTokens = 0, anthropicOutputTokens = 0;
let resendCalls = 0, resendMessageId = null;
let outOfCredits = false;

async function walkHierarchy(client, agentId) {
  const chain = { manager_id: null, area_manager_id: null, tenant_admin_id: null, ancestors: [] };
  const selfR = await client.query(`SELECT id, role, parent_id FROM agents WHERE id=$1`, [agentId]);
  if (selfR.rows.length === 0) return chain;
  let cursor = selfR.rows[0].parent_id || null;
  const seen = new Set([agentId]);
  for (let hop = 0; hop < 6 && cursor; hop++) {
    if (seen.has(cursor)) break; seen.add(cursor);
    const r = await client.query(`SELECT id, role, parent_id FROM agents WHERE id=$1`, [cursor]);
    if (r.rows.length === 0) break;
    const row = r.rows[0]; const role = row.role || 'agent';
    chain.ancestors.push({ id: row.id, role });
    if (chain.manager_id === null && role === 'manager')           chain.manager_id = row.id;
    if (chain.area_manager_id === null && role === 'area_manager') chain.area_manager_id = row.id;
    if (role === 'tenant_admin') { chain.tenant_admin_id = row.id; break; }
    cursor = row.parent_id;
  }
  return chain;
}

(async () => {
  console.log('=== CV-EST real-key smoke ===\n');

  // Pre-flight: load tenant config (Anthropic + Resend creds).
  const c0 = new Client({ connectionString: process.env.DATABASE_URL });
  await c0.connect(); await c0.query('BEGIN READ ONLY');
  let tenant;
  try {
    const r = await c0.query(
      `SELECT resend_api_key, anthropic_api_key, send_from, email_from_domain,
              resend_verification_status, brand_name, name, source_key
         FROM tenants WHERE id=$1`, [WALLIAM_TENANT]);
    tenant = r.rows[0];
  } finally { await c0.query('ROLLBACK').catch(()=>{}); await c0.end().catch(()=>{}); }
  if (!tenant.anthropic_api_key || !tenant.anthropic_api_key.startsWith('sk-ant-')) {
    console.error('FATAL: WALLiam tenant.anthropic_api_key invalid.'); process.exit(2);
  }

  // Confirm Neo Smith has ai_estimator_enabled + agent-level key (CV-EST gate).
  const c1 = new Client({ connectionString: process.env.DATABASE_URL });
  await c1.connect(); await c1.query('BEGIN READ ONLY');
  let neo;
  try {
    const r = await c1.query(
      `SELECT id, full_name, ai_estimator_enabled, anthropic_api_key
         FROM agents WHERE id=$1`, [NEO_SMITH]);
    neo = r.rows[0];
  } finally { await c1.query('ROLLBACK').catch(()=>{}); await c1.end().catch(()=>{}); }
  record('pre-flight', 'Neo Smith has ai_estimator_enabled=TRUE',
    neo.ai_estimator_enabled === true, 'true', '' + neo.ai_estimator_enabled);
  record('pre-flight', 'Neo Smith has real anthropic_api_key',
    !!neo.anthropic_api_key && neo.anthropic_api_key.startsWith('sk-ant-'),
    'sk-ant-... shape', 'fp=' + (neo.anthropic_api_key ? neo.anthropic_api_key.slice(0,6)+'...'+neo.anthropic_api_key.slice(-4) : 'NULL'));

  // ── Phase A: Find a comparable-rich listing for BINGO-tier ─────────────
  console.log('\n=== Phase A: discover BINGO-tier-eligible listing ===');
  const cp = new Client({ connectionString: process.env.DATABASE_URL });
  await cp.connect(); await cp.query('BEGIN READ ONLY'); await cp.query('SET LOCAL statement_timeout = 0');
  let testListing = null, comparables = [];
  try {
    // Find an active condo listing in a Whitby community (WALLiam-carved geo) whose
    // building has >= 5 closed sales in the last 12 months at the same bedroom count.
    const r = await cp.query(`
      WITH whitby AS (
        SELECT id FROM municipalities WHERE name='Whitby' LIMIT 1
      ),
      active_in_whitby AS (
        SELECT ml.id, ml.building_id, ml.community_id, ml.municipality_id, ml.area_id,
               ml.bedrooms_total, ml.bathrooms_total_integer, ml.list_price,
               ml.living_area_range, ml.unparsed_address, ml.unit_number
          FROM mls_listings ml
          JOIN whitby w ON w.id = ml.municipality_id
         WHERE ml.standard_status = 'Active'
           AND ml.property_type = 'Residential Condo & Other'
           AND ml.building_id IS NOT NULL
           AND ml.bedrooms_total IS NOT NULL
      )
      SELECT a.*,
             (SELECT COUNT(*)::int FROM mls_listings ml2
               WHERE ml2.building_id = a.building_id
                 AND ml2.bedrooms_total = a.bedrooms_total
                 AND ml2.close_date IS NOT NULL
                 AND ml2.close_date > NOW() - INTERVAL '12 months'
                 AND ml2.transaction_type = 'For Sale'
                 AND ml2.close_price > 100000) AS recent_comparable_solds
        FROM active_in_whitby a
       ORDER BY recent_comparable_solds DESC
       LIMIT 1`);
    if (r.rows.length > 0 && r.rows[0].recent_comparable_solds >= 5) {
      testListing = r.rows[0];
      // Fetch the comparable solds.
      const cc = await cp.query(`
        SELECT id, unit_number, bedrooms_total, bathrooms_total_integer, living_area_range,
               close_price, list_price, close_date,
               (close_date::date - on_market_date::date) AS days_on_market
          FROM mls_listings
         WHERE building_id = $1
           AND bedrooms_total = $2
           AND close_date IS NOT NULL
           AND close_date > NOW() - INTERVAL '12 months'
           AND transaction_type = 'For Sale'
           AND close_price > 100000
         ORDER BY close_date DESC LIMIT 5`, [testListing.building_id, testListing.bedrooms_total]);
      comparables = cc.rows;
    }
  } finally { await cp.query('ROLLBACK').catch(()=>{}); await cp.end().catch(()=>{}); }

  if (!testListing) {
    record('A discovery', 'BINGO-tier listing found', false,
      '>=5 comparable solds in same building+bedrooms (12mo)', 'no listing met threshold');
    // Honest CONTACT-tier fallback path: assert the no-data behavior.
    record('A discovery', 'CONTACT-tier fallback acknowledged honestly', true,
      'report no-data instead of faking comparables', 'OK -- no synthetic comparables created');
  } else {
    record('A discovery', 'BINGO-tier listing found',
      testListing.recent_comparable_solds >= 5,
      '>=5 comparable solds', 'solds=' + testListing.recent_comparable_solds + ' building=' + testListing.building_id);
    console.log('  test listing  : id=' + testListing.id + ' ' + testListing.unit_number + ' / ' + testListing.unparsed_address);
    console.log('  bedrooms      : ' + testListing.bedrooms_total + 'BR  baths=' + testListing.bathrooms_total_integer);
    console.log('  list_price    : $' + testListing.list_price);
    console.log('  comparable solds (last 12mo, same building+bedrooms): ' + testListing.recent_comparable_solds);
    console.log('  using top 5 for valuation:');
    for (const c of comparables) {
      console.log('    unit ' + (c.unit_number||'?').padEnd(6) + ' ' + c.bedrooms_total + 'BR  $' + c.close_price + '  closed ' + (c.close_date ? c.close_date.toISOString().slice(0,10) : '?') + '  DOM=' + (c.days_on_market||'?'));
    }
  }

  // ── Phase B: Compute estimate (avg close price of comparables) ─────────
  console.log('\n=== Phase B: compute estimate (statistical, no AI) ===');
  let estimatedPrice = 0, priceRange = { low: 0, high: 0 }, confidence = 'None', matchTier = 'CONTACT';
  if (testListing && comparables.length >= 5) {
    const prices = comparables.map(c => Number(c.close_price)).filter(p => p > 0);
    const sum = prices.reduce((a,b) => a+b, 0);
    estimatedPrice = Math.round(sum / prices.length);
    priceRange = {
      low: Math.round(Math.min(...prices)),
      high: Math.round(Math.max(...prices)),
    };
    confidence = 'High';
    matchTier = 'BINGO';
  }
  record('B estimate', 'numeric estimatedPrice computed (BINGO tier)',
    estimatedPrice > 0,
    'estimatedPrice > 0 (BINGO if comparables else CONTACT)',
    'estimatedPrice=$' + estimatedPrice + ' tier=' + matchTier);
  record('B estimate', 'priceRange present and sensible',
    priceRange.low > 0 && priceRange.high >= priceRange.low,
    'low<=high, both > 0',
    'low=$' + priceRange.low + ' high=$' + priceRange.high);
  console.log('  estimate: $' + estimatedPrice + '  range: $' + priceRange.low + '-$' + priceRange.high + '  tier: ' + matchTier);

  // ── Phase C: Real Anthropic AI insights (matches lib/estimator/ai-insights.ts pattern) ──
  console.log('\n=== Phase C: real Anthropic AI insights call (Sonnet 4) ===');
  let aiInsights = null;
  if (matchTier === 'BINGO') {
    const prompt = `You are a Toronto real estate market analyst. Analyze this condo price estimate and provide insights.

Unit Details:
- Bedrooms: ${testListing.bedrooms_total}
- Bathrooms: ${testListing.bathrooms_total_integer}
- Estimated Price: $${estimatedPrice.toLocaleString()}

Recent Comparable Sales (${comparables.length} found):
${comparables.map(c => '- Unit ' + (c.unit_number || 'N/A') + ': ' + c.bedrooms_total + 'BR sold $' + c.close_price + ', closed ' + (c.close_date ? c.close_date.toISOString().slice(0,7) : 'N/A')).join('\n')}

Respond ONLY with valid JSON in this exact format, no other text:
{
  "summary": "2-3 sentences citing specific units",
  "keyFactors": ["factor1", "factor2", "factor3", "factor4"],
  "marketTrend": "1 sentence on negotiation position"
}`;

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': neo.anthropic_api_key,  // AGENT-level key per estimate-sale.ts:46
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',   // matches lib/estimator/ai-insights.ts:52
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      anthropicCalls++;
      if (r.ok) {
        const j = await r.json();
        const text = j.content && j.content[0] && j.content[0].text;
        if (j.usage) {
          anthropicInputTokens += j.usage.input_tokens || 0;
          anthropicOutputTokens += j.usage.output_tokens || 0;
        }
        try {
          aiInsights = JSON.parse(text);
        } catch (parseErr) {
          // Try to extract JSON if wrapped in markdown fences
          const m = text && text.match(/\{[\s\S]*\}/);
          if (m) try { aiInsights = JSON.parse(m[0]); } catch {}
        }
      } else {
        const body = await r.text();
        if (r.status === 429 || /credit|balance|insufficient/i.test(body)) outOfCredits = true;
        console.log('  Anthropic ' + r.status + ': ' + body.slice(0, 200));
      }
    } catch (e) { console.log('  fetch error: ' + e.message); }
  } else {
    console.log('  skipped: no BINGO-tier comparables');
  }

  const aiOK = aiInsights
    && typeof aiInsights.summary === 'string' && aiInsights.summary.length > 0
    && Array.isArray(aiInsights.keyFactors) && aiInsights.keyFactors.length > 0
    && typeof aiInsights.marketTrend === 'string' && aiInsights.marketTrend.length > 0;
  if (outOfCredits) {
    record('C AI insights', 'real Sonnet 4 call returns valid JSON', false,
      'aiInsights {summary,keyFactors,marketTrend}', 'OUT-OF-CREDITS (not a logic failure)');
  } else if (matchTier !== 'BINGO') {
    record('C AI insights', 'AI call skipped (no BINGO comparables to commentate)', true,
      'CONTACT-tier honest skip', 'no AI call made');
  } else {
    record('C AI insights', 'real Sonnet 4 call returns valid JSON', aiOK,
      'aiInsights {summary,keyFactors,marketTrend}',
      aiInsights ? 'summary.len=' + aiInsights.summary?.length + ' keyFactors=' + aiInsights.keyFactors?.length + ' trend.len=' + aiInsights.marketTrend?.length : 'NULL');
    if (aiInsights) {
      console.log('  aiInsights.summary    : ' + (aiInsights.summary || '').slice(0,200));
      console.log('  aiInsights.keyFactors : ' + JSON.stringify(aiInsights.keyFactors));
      console.log('  aiInsights.marketTrend: ' + (aiInsights.marketTrend || '').slice(0,200));
    }
  }

  // ── Phase D: vip-request flow (lead INSERT + real email to delivered@resend.dev) ──
  console.log('\n=== Phase D: vip-request flow (BEGIN/ROLLBACK + real email) ===');
  const c2 = new Client({ connectionString: process.env.DATABASE_URL });
  await c2.connect(); await c2.query('BEGIN'); await c2.query('SET LOCAL statement_timeout = 0');
  try {
    const chain = await walkHierarchy(c2, NEO_SMITH);
    const leadR = await c2.query(
      `INSERT INTO leads (agent_id, manager_id, area_manager_id, tenant_admin_id,
                          contact_name, contact_email, contact_phone, source, lead_origin_route,
                          assignment_source, tenant_id, status, message)
       VALUES ($1, $2, $3, $4,
               'CV Smoke EST VIP', 'cv-est-vip-smoke@example.invalid', '+10000000000',
               'walliam_estimator_vip_request', 'estimator_vip_request',
               'geo', $5, 'new', 'WALLiam Estimator VIP Request (smoke)')
       RETURNING id, agent_id, manager_id, area_manager_id, tenant_admin_id`,
      [NEO_SMITH, chain.manager_id, chain.area_manager_id, chain.tenant_admin_id, WALLIAM_TENANT]);
    const lead = leadR.rows[0];
    record('D vip-request', 'lead INSERTed with full chain',
      !!lead.id && lead.tenant_admin_id !== null,
      'lead id + chain stamped', 'id=' + lead.id + ' tenant_admin=' + lead.tenant_admin_id);

    // Real email to delivered@resend.dev mirroring vip-request chain notification.
    const subject = '[CV-EST smoke] WALLiam Estimator VIP Request ' + new Date().toISOString();
    const html = '<p>CV-EST smoke -- WALLiam estimator VIP-request flow.</p>'
      + '<p>Lead id (rolled back): ' + lead.id + '</p>'
      + '<p>estimatedPrice: $' + estimatedPrice + '</p>'
      + '<p>Recipient redirected to ' + SAFE_RECIPIENT + ' for safety.</p>';
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tenant.resend_api_key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: tenant.send_from, to: [SAFE_RECIPIENT], subject, html }),
      });
      resendCalls++;
      if (r.ok) {
        const j = await r.json();
        resendMessageId = j.id || null;
      } else {
        const body = await r.text();
        console.log('  Resend failed: ' + r.status + ' ' + body.slice(0, 200));
      }
    } catch (e) { console.log('  Resend network error: ' + e.message); }
    record('D vip-request', 'real Resend send returns 200 + message id', !!resendMessageId,
      'non-null message id', 'message_id=' + resendMessageId);
  } catch (e) {
    record('D vip-request', 'lead INSERT + email completes', false, 'no exception', e.message);
  } finally {
    await c2.query('ROLLBACK').catch(()=>{});
    await c2.end().catch(()=>{});
  }

  // ── Cost calc + output ─────────────────────────────────────────────────
  // Sonnet 4 pricing: $3/M input + $15/M output
  const cost = (anthropicInputTokens * 0.000003) + (anthropicOutputTokens * 0.000015);
  const lines = [];
  lines.push('='.repeat(120));
  lines.push('CV-EST smoke results -- ' + new Date().toISOString());
  lines.push('  WALLiam tenant   = ' + WALLIAM_TENANT);
  lines.push('  agent under test = Neo Smith (' + NEO_SMITH + ')');
  lines.push('  test listing     = ' + (testListing ? testListing.id + ' (' + (testListing.unparsed_address||'?') + ')' : '(none found)'));
  lines.push('  estimatedPrice   = $' + estimatedPrice + '  tier=' + matchTier + '  range=$' + priceRange.low + '-$' + priceRange.high);
  lines.push('  Anthropic calls  : ' + anthropicCalls + '  input_tokens: ' + anthropicInputTokens + '  output_tokens: ' + anthropicOutputTokens);
  lines.push('  Anthropic cost   : $' + cost.toFixed(6) + ' (Sonnet 4 @ $3/M input + $15/M output)');
  lines.push('  Resend calls     : ' + resendCalls + '  last message_id: ' + resendMessageId);
  if (outOfCredits) lines.push('  !! OUT-OF-CREDITS encountered (Phase C distinct from logic failure)');
  lines.push('='.repeat(120));
  for (const r of results) {
    lines.push('  [' + (r.passed ? 'PASS' : 'FAIL') + '] ' + r.group + ' / ' + r.name);
    lines.push('     ' + r.expected + ' -> ' + r.got);
  }
  const passed = results.filter(r => r.passed).length;
  lines.push('');
  lines.push('TOTAL: ' + results.length + '  PASS: ' + passed + '  FAIL: ' + (results.length - passed));
  lines.push('='.repeat(120));
  const text = lines.join('\n') + '\n';
  console.log('\n' + text);
  fs.writeFileSync(path.join(__dirname, '..', 'cv-est-smoke-output.txt'), text);
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
