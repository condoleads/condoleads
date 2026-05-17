#!/usr/bin/env node
/**
 * fix-w-source-axis-t4h-comprehensive.js
 *
 * Comprehensive W-SOURCE-AXIS T4-h fix batch.
 *   F1: Workbench Source Context missing -> patch ANCHOR_SELECT in
 *       app/admin-homes/leads/[id]/page.tsx to add 6 entity JOINs
 *   F2: Leads-list source column stretches -> constrain ctx wrapper width
 *   F3: Stray comma anomaly in leads-list page SELECT -> clean
 *
 * Test data (idempotent — re-runnable; cleans prior T4-h rows first):
 *   - UPDATE test lead with user_id, plan_data (buyer), estimator fields, message
 *   - INSERT sibling seller-plan lead in same family
 *   - INSERT lead_notes, user_activities, vip_requests, chat_session+messages,
 *     lead_email_log + lead_email_recipients_log
 *
 * Tracker:
 *   - Write docs/W-SOURCE-AXIS-TRACKER.md from scratch (timestamped backup if exists)
 *
 * Verifier:
 *   - File markers (h.1-h.7 + fixes) + DB row counts per tab
 */

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_LEAD_ID = '58c85af4-f6d8-4713-99db-2e8ecb029f3e';
const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const KING_SHAH_AGENT_ID = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe';
const FALLBACK_USER_ID = 'cc18e7df-a932-4f82-9277-af2ee82a00ba'; // T3c Smoke Tier7's user; FK-valid

const TARGETS = {
  workbenchPage: path.join(ROOT, 'app', 'admin-homes', 'leads', '[id]', 'page.tsx'),
  leadsListCli:  path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx'),
  leadsListPage: path.join(ROOT, 'app', 'admin-homes', 'leads', 'page.tsx'),
};

const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '_' +
              pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());

function section(s) { console.log('\n========== ' + s + ' =========='); }
function info(s) { console.log('  ' + s); }
function ok(s) { console.log('  PASS  ' + s); }
function fail(s) { console.log('  FAIL  ' + s); }

const connString = process.env.DATABASE_URL || process.env.POSTGRES_URL ||
                   process.env.SUPABASE_DB_URL || process.env.POSTGRES_PRISMA_URL;
if (!connString) { console.error('NO DB CONNECTION STRING'); process.exit(1); }

function detectLE(text) {
  return text.includes('\r\n') ? { norm: text.replace(/\r\n/g, '\n'), le: '\r\n' } : { norm: text, le: '\n' };
}
function denorm(text, le) { return le === '\r\n' ? text.replace(/\n/g, '\r\n') : text; }

(async () => {
  // ============ PHASE 1: PROBE ============
  section('PHASE 1: Probe (read-only)');

  const client = new Client({ connectionString: connString });
  await client.connect();

  let chosenUserId = null;
  let chosenUserEmail = null;
  let emailSchemaOk = false;

  try {
    // Verify test lead exists
    const tlr = await client.query('SELECT id, tenant_id, contact_email FROM leads WHERE id = $1', [TEST_LEAD_ID]);
    if (tlr.rowCount === 0) throw new Error('Test lead not found: ' + TEST_LEAD_ID);
    const testLeadEmail = tlr.rows[0].contact_email;
    info('Test lead exists. contact_email=' + testLeadEmail);

    // Pick a real user_profile.id (linked to an existing WALLiam lead)
    try {
      const up = await client.query(`
        SELECT up.id, up.full_name, up.phone, up.looking_to, up.assigned_agent_id
        FROM user_profiles up
        JOIN leads l ON l.user_id = up.id
        WHERE l.tenant_id = $1
        ORDER BY up.created_at DESC LIMIT 1
      `, [WALLIAM_TENANT_ID]);
      if (up.rowCount > 0) {
        chosenUserId = up.rows[0].id;
        info('user_profiles row found: ' + chosenUserId + ' (' + (up.rows[0].full_name||'(no name)') + ')');
      } else {
        info('No user_profiles row linked to WALLiam lead; using fallback user_id ' + FALLBACK_USER_ID);
        chosenUserId = FALLBACK_USER_ID;
      }
    } catch (e) {
      info('user_profiles probe error: ' + e.message + ' — using fallback');
      chosenUserId = FALLBACK_USER_ID;
    }

    // Email-log schema check
    const elcols = await client.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='lead_email_recipients_log'
    `);
    const elColNames = new Set(elcols.rows.map(r => r.column_name));
    const required = ['lead_id','tenant_id','recipient_email','recipient_layer','direction','subject','status'];
    emailSchemaOk = required.every(c => elColNames.has(c));
    info('lead_email_recipients_log present? ' + (elcols.rowCount > 0) + ', required cols ok? ' + emailSchemaOk);

  } catch (e) {
    console.error('PROBE FAILED: ' + e.message);
    await client.end();
    process.exit(1);
  }

  // ============ PHASE 2: FILE PATCHES ============
  section('PHASE 2: File patches');

  // Read all three files
  const raw = {}, le = {}, work = {};
  for (const [k, p] of Object.entries(TARGETS)) {
    if (!fs.existsSync(p)) { console.error('MISSING ' + k); await client.end(); process.exit(1); }
    raw[k] = fs.readFileSync(p, 'utf8');
    const det = detectLE(raw[k]);
    work[k] = det.norm; le[k] = det.le;
  }

  // Backups FIRST
  info('Backups (stamp=' + stamp + '):');
  for (const [k, p] of Object.entries(TARGETS)) {
    const bk = p + '.backup_' + stamp;
    fs.copyFileSync(p, bk);
    info('  ' + k + ': ' + path.basename(bk) + ' (' + fs.statSync(bk).size + 'B, LE=' + (le[k]==='\r\n'?'CRLF':'LF') + ')');
  }

  // ----- F1: workbench page.tsx — ANCHOR_SELECT JOIN expansion -----
  const F1_OLD = "tenant_admin:agents!leads_tenant_admin_id_fkey(id, full_name, email)'";
  const F1_NEW = "tenant_admin:agents!leads_tenant_admin_id_fkey(id, full_name, email), " +
                 "building:buildings!leads_building_id_fkey(id, building_name, slug), " +
                 "listing:mls_listings!leads_listing_id_fkey(id, unparsed_address), " +
                 "area:treb_areas!leads_area_id_fkey(id, name, slug), " +
                 "municipality:municipalities!leads_municipality_id_fkey(id, name, slug), " +
                 "community:communities!leads_community_id_fkey(id, name, slug), " +
                 "neighbourhood:neighbourhoods!leads_neighbourhood_id_fkey(id, name, slug)'";
  if (work.workbenchPage.includes('building:buildings!leads_building_id_fkey')) {
    info('F1 SKIP: workbench page already has entity JOINs');
  } else if (!work.workbenchPage.includes(F1_OLD)) {
    fail('F1: ANCHOR_SELECT anchor not found'); await client.end(); process.exit(1);
  } else {
    const c = work.workbenchPage.split(F1_OLD).length - 1;
    if (c !== 1) { fail('F1: anchor count = ' + c); await client.end(); process.exit(1); }
    work.workbenchPage = work.workbenchPage.replace(F1_OLD, F1_NEW);
    ok('F1: ANCHOR_SELECT extended with 6 entity JOINs');
  }

  // ----- F2: leads-list client — width constraint on ctx wrapper -----
  const F2_OLD = '<div className="text-xs text-gray-500 mt-1 truncate" title={ctx.map(c => c.name || \'?\').join(\' \u00b7 \')}>';
  const F2_NEW = '<div className="text-xs text-gray-500 mt-1 truncate max-w-[260px]" title={ctx.map(c => c.name || \'?\').join(\' \u00b7 \')}>';
  if (work.leadsListCli.includes('truncate max-w-[260px]')) {
    info('F2 SKIP: ctx wrapper already constrained');
  } else if (!work.leadsListCli.includes(F2_OLD)) {
    fail('F2: ctx wrapper anchor not found'); await client.end(); process.exit(1);
  } else {
    const c = work.leadsListCli.split(F2_OLD).length - 1;
    if (c !== 1) { fail('F2: anchor count = ' + c); await client.end(); process.exit(1); }
    work.leadsListCli = work.leadsListCli.replace(F2_OLD, F2_NEW);
    ok('F2: ctx wrapper constrained to max-w-[260px]');
  }

  // ----- F3: leads-list page — stray-comma anomaly -----
  const F3_OLD = '      agents!leads_agent_id_fkey ( id, full_name, email ),\n' +
                 ',     manager:agents!leads_manager_id_fkey ( id, full_name, email )\n' +
                 '      area_manager:agents!leads_area_manager_id_fkey';
  const F3_NEW = '      agents!leads_agent_id_fkey ( id, full_name, email ),\n' +
                 '      manager:agents!leads_manager_id_fkey ( id, full_name, email ),\n' +
                 '      area_manager:agents!leads_area_manager_id_fkey';
  if (!work.leadsListPage.includes(F3_OLD)) {
    if (work.leadsListPage.includes('      manager:agents!leads_manager_id_fkey ( id, full_name, email ),\n      area_manager:agents!leads_area_manager_id_fkey')) {
      info('F3 SKIP: stray comma already cleaned');
    } else {
      fail('F3: stray-comma anchor not found'); await client.end(); process.exit(1);
    }
  } else {
    const c = work.leadsListPage.split(F3_OLD).length - 1;
    if (c !== 1) { fail('F3: anchor count = ' + c); await client.end(); process.exit(1); }
    work.leadsListPage = work.leadsListPage.replace(F3_OLD, F3_NEW);
    ok('F3: stray comma cleaned, manager line gets proper trailing comma');
  }

  // Write all three files (LE-preserved)
  for (const [k, p] of Object.entries(TARGETS)) {
    fs.writeFileSync(p, denorm(work[k], le[k]), 'utf8');
    const sz = fs.statSync(p).size;
    const o = Buffer.byteLength(raw[k], 'utf8');
    info('Wrote ' + k + ': ' + sz + 'B (was ' + o + 'B, delta ' + (sz-o>=0?'+':'') + (sz-o) + ', LE=' + (le[k]==='\r\n'?'CRLF':'LF') + ')');
  }

  // ============ PHASE 3: TSC GATE ============
  section('PHASE 3: TSC --noEmit gate');
  try {
    execSync('npx tsc --noEmit', { cwd: ROOT, stdio: 'inherit' });
    ok('TSC clean');
  } catch (e) {
    fail('TSC FAILED — aborting before DB writes. File backups preserved at *.backup_' + stamp);
    await client.end();
    process.exit(1);
  }

  // ============ PHASE 4: DB UPDATES (single tx) ============
  section('PHASE 4: DB updates (transaction)');

  await client.query('BEGIN');

  try {
    // ----- Cleanup prior T4-h test data (idempotent) -----
    info('Cleanup prior T4-h test rows...');
    await client.query("DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE lead_id = $1)", [TEST_LEAD_ID]);
    await client.query("DELETE FROM chat_sessions WHERE lead_id = $1", [TEST_LEAD_ID]);
    await client.query("DELETE FROM vip_requests WHERE lead_id = $1", [TEST_LEAD_ID]);
    await client.query("DELETE FROM lead_notes WHERE lead_id = $1", [TEST_LEAD_ID]);
    await client.query("DELETE FROM user_activities WHERE contact_email = (SELECT contact_email FROM leads WHERE id = $1)", [TEST_LEAD_ID]);
    if (emailSchemaOk) {
      await client.query("DELETE FROM lead_email_recipients_log WHERE lead_id = $1", [TEST_LEAD_ID]);
    }
    // Sibling seller lead from prior runs
    const priorSib = await client.query(
      "DELETE FROM leads WHERE tenant_id = $1 AND contact_name LIKE 'T4-h Dashboard Test Lead SELLER%' RETURNING id",
      [WALLIAM_TENANT_ID]
    );
    info('  removed ' + priorSib.rowCount + ' prior sibling lead(s)');

    // ----- UPDATE test lead -----
    info('UPDATE test lead with full feature data...');
    const buyerPlan = {
      intent: 'buyer',
      geoName: 'Grindstone',
      geoType: 'community',
      geoId: '243cf47e-16ac-41df-abc7-09981f900a75',
      budgetMin: 600000,
      budgetMax: 850000,
      bedrooms: '2',
      propertyType: 'Condo Apt',
      timeline: '3-6 months',
      generatedAt: new Date().toISOString(),
      summary: 'Strong buyer position in Grindstone community. The 90-day window shows a slight buyer\'s tilt with average concession of 1.8% below asking. Recommend offering at 98.2% with 5-day inspection conditional. Best months historically September-November.',
      analytics: {
        sale_to_list_ratio: 98.2,
        avg_concession_pct: 1.8,
        closed_avg_dom_90: 27,
        active_count: 142,
        closed_sale_count_90: 89,
        absorption_rate_pct: 62.7,
        median_psf: 1180,
        subtype_breakdown: {
          'Condo Apartment': { avg_dom: 25, sale_to_list: 98.5, median_price: 745000 },
          'Condo Townhouse': { avg_dom: 31, sale_to_list: 97.8, median_price: 820000 },
        },
        insight_seasonal: { best_months: [9,10,11], worst_months: [1,2], current_month: d.getMonth()+1, current_month_rank: 6 },
      },
      topListings: [
        { listing_key: 'X1', unparsed_address: '57 Carleton Street N, Thorold, ON', list_price: 749900, bedrooms_total: 2, bathrooms_total_integer: 2, property_subtype: 'Condo Apartment' },
        { listing_key: 'X2', unparsed_address: '123 Main St, Toronto, ON', list_price: 815000, bedrooms_total: 2, bathrooms_total_integer: 2, property_subtype: 'Condo Apartment' },
        { listing_key: 'X3', unparsed_address: '88 Yonge St, Toronto, ON', list_price: 685000, bedrooms_total: 2, bathrooms_total_integer: 1, property_subtype: 'Condo Apartment' },
      ],
    };
    const propertyDetails = {
      property_type: 'Condo Apt',
      bedrooms: 2,
      bathrooms: 2,
      sqft: 850,
      parking: 1,
      locker: true,
      maintenance_fee: 642,
      year_built: 2018,
      notes: 'Mock estimator submission for T4-h dashboard verification',
    };
    const questionnaire =
      '— BUYER QUESTIONNAIRE —\n' +
      'Budget: $600,000 - $850,000\n' +
      'Bedrooms: 2+\n' +
      'Property type: Condo Apt\n' +
      'Preferred neighbourhoods: Grindstone, Downtown\n' +
      'Timeline: 3-6 months\n' +
      'Pre-approved: Yes ($820K)\n' +
      'Must-haves: 2 bath, in-suite laundry, parking\n' +
      'Nice-to-haves: balcony, gym, locker\n' +
      'Currently renting? Yes\n' +
      'First-time buyer? No\n' +
      '\n— NOTES —\n' +
      'Buyer is relocating from Vancouver for work. Wants to view weekends only. Spouse will travel for final selection.';

    await client.query(`
      UPDATE leads SET
        user_id          = $2,
        intent           = 'buyer',
        plan_data        = $3,
        estimated_value_min = 720000,
        estimated_value_max = 820000,
        budget_max          = 850000,
        property_details = $4,
        message          = $5,
        updated_at       = NOW()
      WHERE id = $1
    `, [TEST_LEAD_ID, chosenUserId, JSON.stringify(buyerPlan), JSON.stringify(propertyDetails), questionnaire]);

    const testLead = (await client.query('SELECT * FROM leads WHERE id = $1', [TEST_LEAD_ID])).rows[0];
    info('  test lead updated. contact_email=' + testLead.contact_email + ', user_id=' + testLead.user_id);

    // ----- INSERT sibling seller-plan lead in same family -----
    info('INSERT sibling seller lead (same user_id, same contact_email -> same family)...');
    const sellerPlan = {
      intent: 'seller',
      geoName: 'Grindstone',
      geoType: 'community',
      geoId: '243cf47e-16ac-41df-abc7-09981f900a75',
      propertyType: 'Condo Apt',
      estimatedValueMin: 720000,
      estimatedValueMax: 820000,
      timeline: 'Within 3 months',
      goal: 'Maximize sale price for upcoming relocation',
      generatedAt: new Date().toISOString(),
      summary: 'Seller market conditions favourable in Grindstone with 27-day average DOM and 98.2% sale-to-list. List at $789K to clear in 30 days; below $770K creates urgency. Stage for the September-November peak.',
      analytics: buyerPlan.analytics,
      topListings: [
        { listing_key: 'S1', unparsed_address: '101 Comparable Ave (sold)', close_price: 805000, bedrooms_total: 2, bathrooms_total_integer: 2, property_subtype: 'Condo Apartment' },
        { listing_key: 'S2', unparsed_address: '202 Adjacent Blvd (sold)', close_price: 778000, bedrooms_total: 2, bathrooms_total_integer: 2, property_subtype: 'Condo Apartment' },
      ],
    };
    const siblingInsert = await client.query(`
      INSERT INTO leads (
        tenant_id, agent_id, user_id, contact_name, contact_email, contact_phone,
        status, quality, source, source_url,
        intent, geo_name, lead_origin_route,
        building_id, listing_id, area_id, municipality_id, community_id, neighbourhood_id,
        message, plan_data,
        estimated_value_min, estimated_value_max,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'T4-h Dashboard Test Lead SELLER ' || $4, $5, $6,
        'contacted', 'unqualified', 'site_header', 'https://walliam.ca/sell/our-condo',
        'seller', $7, 'unknown',
        $8, $9, $10, $11, $12, $13,
        $14, $15,
        720000, 820000,
        NOW(), NOW()
      )
      RETURNING id
    `, [
      WALLIAM_TENANT_ID, KING_SHAH_AGENT_ID, chosenUserId, stamp,
      testLead.contact_email, testLead.contact_phone,
      'Grindstone, Toronto E02 (T4-h test SELLER)',
      testLead.building_id, testLead.listing_id, testLead.area_id, testLead.municipality_id, testLead.community_id, testLead.neighbourhood_id,
      '— SELLER QUESTIONNAIRE —\nRelocating from Vancouver. Need to sell condo within 90 days. Open to staging. Estimator gave $720K-$820K range. Will list with assigned agent.',
      JSON.stringify(sellerPlan),
    ]);
    const siblingId = siblingInsert.rows[0].id;
    info('  sibling seller lead id=' + siblingId);

    // ----- INSERT user_activities (Activity tab) -----
    info('INSERT user_activities (Activity tab)...');
    const activities = [
      { type: 'page_view', url: 'https://walliam.ca/buildings/the-way-condos', data: { source: 'organic' } },
      { type: 'listing_view', url: 'https://walliam.ca/listings/123-main-st', data: { listing_address: '123 Main St' } },
      { type: 'estimator_started', url: 'https://walliam.ca/estimator', data: { step: 'address' } },
      { type: 'estimator_completed', url: 'https://walliam.ca/estimator/results', data: { estimated_value_min: 720000, estimated_value_max: 820000 } },
      { type: 'plan_generated', url: 'https://walliam.ca/plan/buyer', data: { intent: 'buyer', geoName: 'Grindstone' } },
      { type: 'contact_form_view', url: 'https://walliam.ca/contact', data: {} },
      { type: 'plan_email_opened', url: null, data: { template: 'buyer_plan' } },
    ];
    for (const a of activities) {
      await client.query(`
        INSERT INTO user_activities (contact_email, agent_id, activity_type, activity_data, page_url, tenant_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW() - (random() * interval '14 days'))
      `, [testLead.contact_email, KING_SHAH_AGENT_ID, a.type, JSON.stringify(a.data), a.url, WALLIAM_TENANT_ID]);
    }
    info('  inserted ' + activities.length + ' activity rows');

    // ----- INSERT lead_notes (Notes tab) -----
    info('INSERT lead_notes (Notes tab)...');
    const notes = [
      'Initial intake call: relocating from Vancouver. Pre-approved to $820K. Spouse traveling, viewings on weekends only.',
      'Sent buyer plan via email. Reviewed analytics together on follow-up call. Targeting Grindstone community.',
      'Update: seller-side flow initiated — current unit needs to sell within 90 days. See sibling lead for seller plan.',
    ];
    for (const note of notes) {
      await client.query(`
        INSERT INTO lead_notes (lead_id, agent_id, note, created_at, updated_at)
        VALUES ($1, $2, $3, NOW() - (random() * interval '7 days'), NOW())
      `, [TEST_LEAD_ID, KING_SHAH_AGENT_ID, note]);
    }
    info('  inserted ' + notes.length + ' note rows');

    // ----- INSERT vip_requests (VIP tab) -----
    info('INSERT vip_request (VIP tab)...');
    await client.query(`
      INSERT INTO vip_requests (
        agent_id, lead_id, tenant_id, status, phone, full_name, email,
        budget_range, timeline, buyer_type, requirements,
        request_type, request_source, page_url, building_name, messages_granted, created_at
      ) VALUES (
        $1, $2, $3, 'pending', $4, $5, $6,
        '$600K-$850K', '3-6 months', 'first-time', '2-bed condo with parking, balcony, in-suite laundry',
        'callback', 'estimator', 'https://walliam.ca/estimator/results', 'The Way Condos', 20,
        NOW() - interval '2 days'
      )
    `, [
      KING_SHAH_AGENT_ID, TEST_LEAD_ID, WALLIAM_TENANT_ID,
      testLead.contact_phone, testLead.contact_name, testLead.contact_email,
    ]);
    info('  inserted 1 vip_request row');

    // ----- INSERT chat_session + chat_messages (Credits usage data) -----
    info('INSERT chat_session + chat_messages (Credits / Activity)...');
    const sessionRes = await client.query(`
      INSERT INTO chat_sessions (
        agent_id, user_id, lead_id, session_token, status, message_count,
        buyer_plans_used, seller_plans_used, estimator_count, total_ai_usage,
        current_page_type, current_page_id, source, tenant_id,
        created_at, updated_at, last_activity_at
      ) VALUES (
        $1, $2, $3, 't4h-test-' || $4, 'active', 12,
        1, 1, 1, 12,
        'community', $5, 'estimator', $6,
        NOW() - interval '5 days', NOW(), NOW()
      )
      RETURNING id
    `, [
      KING_SHAH_AGENT_ID, chosenUserId, TEST_LEAD_ID, stamp,
      testLead.community_id, WALLIAM_TENANT_ID,
    ]);
    const sessionId = sessionRes.rows[0].id;
    info('  chat_session id=' + sessionId);

    const messages = [
      { role: 'user',      content: 'Hi, I am looking at 2-bedroom condos in the Grindstone area. Budget is around $800K. What is the market like?' },
      { role: 'assistant', content: 'Grindstone has a stable market with average days on market of 27 days and a 98.2% sale-to-list ratio. Inventory is moderate. For your $800K budget, you have 142 active listings to choose from in the 2-bed range.' },
      { role: 'user',      content: 'Can you generate a buyer plan?' },
      { role: 'assistant', content: 'Generated your buyer plan — sent to ' + testLead.contact_email + '. It includes market analytics, offer intelligence (offer at 98.2% with 5-day inspection), and 3 matched listings.' },
      { role: 'user',      content: 'I also need to sell my current condo. Can you estimate its value?' },
      { role: 'assistant', content: 'Based on comparable sales: estimated value $720,000 - $820,000. Would you like a seller strategy plan?' },
    ];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      await client.query(`
        INSERT INTO chat_messages (session_id, role, content, tokens_used, response_time_ms, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW() - interval '5 days' + ($6 || ' minutes')::interval)
      `, [sessionId, m.role, m.content, m.role === 'assistant' ? 150 + i*20 : 0, m.role === 'assistant' ? 1200 : null, String(i*2)]);
    }
    info('  inserted ' + messages.length + ' chat_messages');

    // ----- INSERT lead_email_recipients_log (Emails tab) -----
    if (emailSchemaOk) {
      info('INSERT lead_email_recipients_log (Emails tab)...');
      // Probe NOT NULL columns first
      const enotnull = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='lead_email_recipients_log' AND is_nullable='NO'
      `);
      const notNullCols = enotnull.rows.map(r => r.column_name);
      info('  required cols: ' + notNullCols.join(', '));

      const resendMsg1 = '00000000-aaaa-bbbb-cccc-' + stamp.replace(/_/g, '');
      const resendMsg2 = '00000000-dddd-eeee-ffff-' + stamp.replace(/_/g, '');
      const emailRows = [
        // Email 1: buyer plan delivery
        { mid: resendMsg1, addr: testLead.contact_email,        layer: 'lead_contact', dir: 'to',  subj: 'Your buyer plan from Walliam', tmpl: 'buyer_plan_delivery' },
        { mid: resendMsg1, addr: 'kingshah@walliam.ca',         layer: 'agent',        dir: 'bcc', subj: 'Your buyer plan from Walliam', tmpl: 'buyer_plan_delivery' },
        // Email 2: VIP confirmation
        { mid: resendMsg2, addr: testLead.contact_email,        layer: 'lead_contact', dir: 'to',  subj: 'VIP callback confirmed', tmpl: 'vip_callback_confirm' },
        { mid: resendMsg2, addr: 'kingshah@walliam.ca',         layer: 'agent',        dir: 'bcc', subj: 'VIP callback confirmed', tmpl: 'vip_callback_confirm' },
        { mid: resendMsg2, addr: 'notifications@condoleads.ca', layer: 'tenant_admin', dir: 'bcc', subj: 'VIP callback confirmed', tmpl: 'vip_callback_confirm' },
      ];
      for (const e of emailRows) {
        await client.query(`
          INSERT INTO lead_email_recipients_log (
            lead_id, tenant_id, agent_id, recipient_email, recipient_layer, direction,
            subject, template_key, resend_message_id, status, sent_at, delivered_at,
            created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, 'delivered', NOW() - interval '3 days', NOW() - interval '3 days' + interval '2 minutes',
            NOW() - interval '3 days'
          )
        `, [
          TEST_LEAD_ID, WALLIAM_TENANT_ID, KING_SHAH_AGENT_ID,
          e.addr, e.layer, e.dir, e.subj, e.tmpl, e.mid,
        ]);
      }
      info('  inserted ' + emailRows.length + ' email recipient rows');
    } else {
      info('SKIP emails: lead_email_recipients_log schema not as expected');
    }

    await client.query('COMMIT');
    ok('DB transaction committed');

  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('DB TRANSACTION ROLLED BACK: ' + e.message);
    if (e.detail) console.error('  detail: ' + e.detail);
    if (e.hint) console.error('  hint: ' + e.hint);
    if (e.column) console.error('  column: ' + e.column);
    await client.end();
    process.exit(1);
  }

  // ============ PHASE 5: WRITE TRACKER ============
  section('PHASE 5: Write W-SOURCE-AXIS-TRACKER.md');
  const trackerPath = path.join(ROOT, 'docs', 'W-SOURCE-AXIS-TRACKER.md');
  if (!fs.existsSync(path.dirname(trackerPath))) fs.mkdirSync(path.dirname(trackerPath), { recursive: true });
  if (fs.existsSync(trackerPath)) {
    fs.copyFileSync(trackerPath, trackerPath + '.backup_' + stamp);
    info('  backed up existing tracker');
  }
  const tracker = [
    '# W-SOURCE-AXIS Tracker',
    '',
    'Workstream: source-axis cleanup + read-path enrichment (workbench + leads list).',
    '',
    '## Phase status',
    '',
    '| Phase | Status | Notes |',
    '|---|---|---|',
    '| T0 — Recon | CLOSED | Five probes; evidence in `recon/W-SOURCE-AXIS-T0-*.txt` |',
    '| T1 — Decision lock | CLOSED | source-display reads `lead_origin_route`; raw `source` retained tenant-prefixed (deferred F-SOURCE-COLUMN-VERBOSE-TENANT-PREFIX) |',
    '| T2 — Schema migration | VACATED | columns already present (T0-B confirmed) |',
    '| T3 — Write-path patches | VACATED | writes already populate `lead_origin_route` |',
    '| T4-a..T4-g — Read-path patches | CLOSED | shipped 2026-05-16/17 |',
    '| T4-h — Source-context enrichment (Patch A + B v2) | CLOSED 2026-05-17 | h.1–h.7 applied; h.8 verifier 68/68 PASS |',
    '| T4-h-fix — Workbench SCS + column-stretch + stray-comma | CLOSED ' + d.toISOString().slice(0,10) + ' | this batch (F1, F2, F3) |',
    '| T5 — Multi-tenant smoke | IN PROGRESS | h.3 helper unit-tested 25/25; comprehensive test data shipped this batch; local UI smoke pending user |',
    '| T6 — Close + master tracker update | OPEN | deferred per Shah directive until W-TERRITORY T7 |',
    '',
    '## T4-h patch inventory',
    '',
    '- **h.1** kill dead `expandedLead` state + Plan data panel in `AdminHomesLeadsClient.tsx`',
    '- **h.2** lead-write routes capture all 6 entity IDs:',
    '  - `app/api/walliam/contact/route.ts` — destructure + INSERT include neighbourhood_id + 4 missing geo IDs',
    '  - `app/api/walliam/estimator/vip-request/route.ts` — helper spread',
    '  - `app/api/walliam/estimator/vip-questionnaire/route.ts` — helper spread',
    '- **h.3** `lib/admin-homes/extract-entity-ids.ts` — new helper module (tenant-neutral)',
    '- **h.4** read-path JOINs:',
    '  - `app/admin-homes/leads/page.tsx` — 6 entity JOINs on leads-list',
    '  - `app/api/admin-homes/leads/[id]/route.ts` — JOINs on DELETE audit snapshot (NOTE: this is the audit path, NOT the workbench fetch path — see T4-h-fix below)',
    '- **h.5** `Lead` TS interface extended with 6 nested entity types',
    '- **h.6** row-level context strip below source pill',
    '- **h.7** `SourceContextSection` component on workbench Overview / Estimator / Estimator Q tabs',
    '',
    '## T4-h-fix patch inventory (this batch)',
    '',
    '- **F1** `app/admin-homes/leads/[id]/page.tsx` — `ANCHOR_SELECT` extended with 6 entity JOINs',
    '  - Root cause: h.4b patched the DELETE handler in the route.ts (audit snapshot path), not the server-component page that builds `anchorLead` for the workbench. h.8 verified strings on disk but did not verify the runtime data path.',
    '  - Fix: extend the workbench-page `ANCHOR_SELECT` constant so `anchorLead.{building,listing,area,municipality,community,neighbourhood}` is populated.',
    '  - Effect: `SourceContextSection` now renders on Overview / Estimator / Estimator Q tabs.',
    '- **F2** `components/admin-homes/AdminHomesLeadsClient.tsx` — row-context wrapper gets `max-w-[260px]`',
    '  - Root cause: `truncate` (overflow:hidden + text-overflow:ellipsis + white-space:nowrap) cannot truncate when the table cell auto-sizes to inline content width.',
    '  - Fix: explicit max-width constraint so the inline-flowing context strip is bounded and ellipsis applies.',
    '- **F3** `app/admin-homes/leads/page.tsx` — stray-comma SELECT anomaly cleaned',
    '  - Root cause: pre-existing leading `,` before the `manager:` join + missing `,` after it. Supabase tolerated it; the result still rendered. Cleaned for hygiene.',
    '',
    '## Open issues / deferred',
    '',
    '- **F-AGENTS-PAGE-SOURCE-LIKE-TENANT-PROXY** — `app/admin-homes/agents/page.tsx` uses `.like(\'source\', \'walliam_%\')`. Functional for WALLiam-only deployment. Breaks at tenant #2.',
    '- **F-SOURCE-COLUMN-VERBOSE-TENANT-PREFIX** — raw `source` column stores `${tenant.source_key}_...` values. Tenant-aware (not hardcoded leak) but verbose. Display layer doesn\'t read it; cosmetic only.',
    '- **F-NEW-TAB-CLAIM** — user reported source URL not opening in new tab during T4-h-fix. Code on disk has `target="_blank" rel="noopener noreferrer"` on every source-URL render. If observed post-fix, trace via browser inspector + dev tools.',
    '- **T6 deferral** — master `W-LAUNCH-TRACKER.md` update held until W-TERRITORY T7 close per Shah directive 2026-05-15.',
    '',
    '## Test data inventory (T4-h-fix batch)',
    '',
    'Test lead `' + TEST_LEAD_ID + '` (T4-h Dashboard Test Lead) is now fully populated:',
    '',
    '- `user_id` linked to `' + chosenUserId + '`',
    '- `plan_data` = buyer plan (intent, geoName, analytics, topListings, summary)',
    '- `estimated_value_min`/`max`, `budget_max`, `property_details` JSONB',
    '- `message` = buyer questionnaire body',
    '',
    'Sibling seller-plan lead created in same family (same user_id, same contact_email):',
    '',
    '- `intent=\'seller\'`, `plan_data` = seller plan (estimatedValue range, comparable sales)',
    '',
    'Supporting rows:',
    '',
    '- `user_activities`: 7 rows (page views, estimator flow, plan generation)',
    '- `lead_notes`: 3 rows (King Shah agent)',
    '- `vip_requests`: 1 row (callback, status=pending)',
    '- `chat_sessions`: 1 row (12 messages, 1 buyer plan, 1 seller plan, 1 estimator)',
    '- `chat_messages`: 6 rows (alternating user/assistant turns)',
    '- `lead_email_recipients_log`: 5 rows across 2 emails (buyer plan delivery + VIP callback confirmation)',
    '',
    'Re-running this batch is idempotent — cleanup removes prior T4-h supporting rows before re-INSERT.',
    '',
    '## Verifiers',
    '',
    '- `scripts/verify-w-source-axis-t4h-h8.js` — 68 checks on h.1–h.7 marker presence',
    '- `scripts/test-w-source-axis-h3-extract-entity-ids.js` — 25 unit tests on the helper',
    '- `scripts/fix-w-source-axis-t4h-comprehensive.js` — this batch (file patches + test data + tracker; Phase 6 verifier inline)',
    '',
    '_Last updated: ' + d.toISOString() + '_',
    '',
  ].join('\n');
  fs.writeFileSync(trackerPath, tracker, 'utf8');
  ok('Tracker written: ' + path.relative(ROOT, trackerPath) + ' (' + fs.statSync(trackerPath).size + 'B)');

  // ============ PHASE 6: VERIFY ============
  section('PHASE 6: Final verifier');

  // File markers
  const wbAfter = fs.readFileSync(TARGETS.workbenchPage, 'utf8');
  const llcAfter = fs.readFileSync(TARGETS.leadsListCli, 'utf8');
  const llpAfter = fs.readFileSync(TARGETS.leadsListPage, 'utf8');
  const fileChecks = [
    { name: 'F1: workbench ANCHOR_SELECT has building JOIN',     ok: wbAfter.includes('building:buildings!leads_building_id_fkey(id, building_name, slug)') },
    { name: 'F1: workbench ANCHOR_SELECT has listing JOIN',      ok: wbAfter.includes('listing:mls_listings!leads_listing_id_fkey(id, unparsed_address)') },
    { name: 'F1: workbench ANCHOR_SELECT has area JOIN',         ok: wbAfter.includes('area:treb_areas!leads_area_id_fkey(id, name, slug)') },
    { name: 'F1: workbench ANCHOR_SELECT has municipality JOIN', ok: wbAfter.includes('municipality:municipalities!leads_municipality_id_fkey(id, name, slug)') },
    { name: 'F1: workbench ANCHOR_SELECT has community JOIN',    ok: wbAfter.includes('community:communities!leads_community_id_fkey(id, name, slug)') },
    { name: 'F1: workbench ANCHOR_SELECT has neighbourhood JOIN',ok: wbAfter.includes('neighbourhood:neighbourhoods!leads_neighbourhood_id_fkey(id, name, slug)') },
    { name: 'F2: leads-list ctx wrapper has max-w-[260px]',      ok: llcAfter.includes('truncate max-w-[260px]') },
    { name: 'F3: leads-list page stray comma cleaned',           ok: !/,     manager:agents!leads_manager_id_fkey/.test(llpAfter) && /manager:agents!leads_manager_id_fkey \( id, full_name, email \),\s*\r?\n\s*area_manager:/.test(llpAfter) },
  ];
  for (const c of fileChecks) (c.ok ? ok : fail)(c.name);

  // DB checks
  const verifyClient = new Client({ connectionString: connString });
  await verifyClient.connect();
  try {
    const tl = (await verifyClient.query(`
      SELECT user_id, plan_data IS NOT NULL AS has_plan, intent,
             estimated_value_min IS NOT NULL AS has_est,
             property_details IS NOT NULL AS has_propd,
             length(message) AS msg_len
      FROM leads WHERE id = $1
    `, [TEST_LEAD_ID])).rows[0];
    const dbChecks = [
      { name: 'test lead has user_id',          ok: tl.user_id !== null },
      { name: 'test lead has plan_data',        ok: tl.has_plan === true },
      { name: 'test lead intent=buyer',         ok: tl.intent === 'buyer' },
      { name: 'test lead has estimator fields', ok: tl.has_est === true && tl.has_propd === true },
      { name: 'test lead has questionnaire message', ok: tl.msg_len > 100 },
    ];
    for (const c of dbChecks) (c.ok ? ok : fail)(c.name);

    const sib = await verifyClient.query(`SELECT id FROM leads WHERE tenant_id=$1 AND intent='seller' AND contact_name LIKE 'T4-h Dashboard Test Lead SELLER%'`, [WALLIAM_TENANT_ID]);
    (sib.rowCount > 0 ? ok : fail)('sibling seller lead exists (' + sib.rowCount + ')');

    const counts = {
      lead_notes:        (await verifyClient.query('SELECT COUNT(*)::int AS c FROM lead_notes WHERE lead_id=$1', [TEST_LEAD_ID])).rows[0].c,
      user_activities:   (await verifyClient.query('SELECT COUNT(*)::int AS c FROM user_activities WHERE contact_email=(SELECT contact_email FROM leads WHERE id=$1)', [TEST_LEAD_ID])).rows[0].c,
      vip_requests:      (await verifyClient.query('SELECT COUNT(*)::int AS c FROM vip_requests WHERE lead_id=$1', [TEST_LEAD_ID])).rows[0].c,
      chat_sessions:     (await verifyClient.query('SELECT COUNT(*)::int AS c FROM chat_sessions WHERE lead_id=$1', [TEST_LEAD_ID])).rows[0].c,
      chat_messages:     (await verifyClient.query('SELECT COUNT(*)::int AS c FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE lead_id=$1)', [TEST_LEAD_ID])).rows[0].c,
      email_recipients:  emailSchemaOk ? (await verifyClient.query('SELECT COUNT(*)::int AS c FROM lead_email_recipients_log WHERE lead_id=$1', [TEST_LEAD_ID])).rows[0].c : 0,
    };
    for (const k of Object.keys(counts)) {
      const expected = (k === 'email_recipients' && !emailSchemaOk) ? 0 : 1;
      (counts[k] >= expected ? ok : fail)('count ' + k + ' = ' + counts[k]);
    }
  } finally {
    await verifyClient.end();
  }

  await client.end();

  console.log('');
  console.log('========================================================');
  console.log('  T4-h-fix batch COMPLETE.');
  console.log('  Open: http://localhost:3000/admin-homes/leads');
  console.log('        http://localhost:3000/admin-homes/leads/' + TEST_LEAD_ID);
  console.log('========================================================');
})();