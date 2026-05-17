#!/usr/bin/env node
/**
 * real-flow-t4h-contact.js
 *
 * PHASE A: WIPE every synthetic T4-h row I injected directly.
 * PHASE B: REAL FLOW — POST a contact form to /api/walliam/contact.
 *          The route handler runs its real code; the lead is created by
 *          the route, not by us. Verifies Patch A h.2a/h.2b end-to-end.
 * PHASE C: SELECT the lead the route wrote and confirm all 6 entity IDs
 *          were captured.
 *
 * No fictitious URLs. No synthetic rows. No placeholders.
 */

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const TEST_LEAD_ID = '58c85af4-f6d8-4713-99db-2e8ecb029f3e';
const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const DEV_URL = 'http://localhost:3000';

function section(s) { console.log('\n========== ' + s + ' =========='); }

(async () => {
  const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL ||
               process.env.SUPABASE_DB_URL || process.env.POSTGRES_PRISMA_URL;
  const c = new Client({ connectionString: conn });
  await c.connect();

  try {
    // ========== PHASE A: Identify synthetic rows ==========
    section('PHASE A: Identify synthetic T4-h rows for removal');

    const testLeadRow = await c.query('SELECT id, contact_email FROM leads WHERE id = $1', [TEST_LEAD_ID]);
    const sibling = await c.query("SELECT id FROM leads WHERE tenant_id = $1 AND contact_name LIKE 'T4-h Dashboard Test Lead SELLER%'", [WALLIAM_TENANT_ID]);
    const leadIds = [];
    if (testLeadRow.rowCount > 0) leadIds.push(TEST_LEAD_ID);
    for (const r of sibling.rows) leadIds.push(r.id);
    const syntheticEmail = testLeadRow.rowCount > 0 ? testLeadRow.rows[0].contact_email : null;
    console.log('Synthetic lead ids: ' + (leadIds.length === 0 ? '(none)' : leadIds.join(', ')));
    console.log('Synthetic email:    ' + (syntheticEmail || '(none)'));

    // ========== PHASE A2: WIPE in FK-safe order ==========
    section('PHASE A2: Wipe synthetic rows (FK-safe order)');

    await c.query('BEGIN');
    try {
      if (leadIds.length > 0) {
        const order = [
          ['lead_email_recipients_log', 'DELETE FROM lead_email_recipients_log WHERE lead_id = ANY($1::uuid[])'],
          ['lead_email_log',            'DELETE FROM lead_email_log            WHERE lead_id = ANY($1::uuid[])'],
          ['chat_messages',             'DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE lead_id = ANY($1::uuid[]))'],
          ['chat_sessions',             'DELETE FROM chat_sessions             WHERE lead_id = ANY($1::uuid[])'],
          ['vip_requests',              'DELETE FROM vip_requests              WHERE lead_id = ANY($1::uuid[])'],
          ['lead_notes',                'DELETE FROM lead_notes                WHERE lead_id = ANY($1::uuid[])'],
          ['lead_admin_actions',        'DELETE FROM lead_admin_actions        WHERE lead_id = ANY($1::uuid[])'],
          ['lead_ownership_changes',    'DELETE FROM lead_ownership_changes    WHERE lead_id = ANY($1::uuid[])'],
        ];
        for (const [name, sql] of order) {
          try {
            const r = await c.query(sql, [leadIds]);
            console.log('  ' + name.padEnd(28) + ' -' + r.rowCount);
          } catch (e) {
            console.log('  ' + name.padEnd(28) + ' (skipped: ' + e.message.slice(0, 60) + ')');
          }
        }
      }
      if (syntheticEmail) {
        const w = await c.query('DELETE FROM user_activities WHERE contact_email = $1', [syntheticEmail]);
        console.log('  ' + 'user_activities'.padEnd(28) + ' -' + w.rowCount);
      }
      if (leadIds.length > 0) {
        const w = await c.query('DELETE FROM leads WHERE id = ANY($1::uuid[])', [leadIds]);
        console.log('  ' + 'leads'.padEnd(28) + ' -' + w.rowCount);
      }
      await c.query('COMMIT');
      console.log('WIPE COMMITTED.');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }

    // ========== PHASE B: REAL FLOW — POST /api/walliam/contact ==========
    section('PHASE B: REAL FLOW — POST /api/walliam/contact');

    const entities = (await c.query(`
      SELECT
        (SELECT id FROM buildings      WHERE building_name IS NOT NULL                                                    LIMIT 1) AS building_id,
        (SELECT id FROM mls_listings   WHERE available_in_vow = true AND unparsed_address IS NOT NULL                     LIMIT 1) AS listing_id,
        (SELECT id FROM treb_areas     WHERE name IS NOT NULL                                                             LIMIT 1) AS area_id,
        (SELECT id FROM municipalities WHERE name IS NOT NULL                                                             LIMIT 1) AS municipality_id,
        (SELECT id FROM communities    WHERE name IS NOT NULL                                                             LIMIT 1) AS community_id,
        (SELECT id FROM neighbourhoods WHERE name IS NOT NULL                                                             LIMIT 1) AS neighbourhood_id
    `)).rows[0];
    console.log('Real entity IDs from DB:');
    for (const k of Object.keys(entities)) console.log('  ' + k.padEnd(20) + entities[k]);

    const tag = 'rft-' + Date.now();
    const payload = {
      name:    'Real Flow Test ' + new Date().toISOString().slice(0, 19),
      email:   tag + '@walliam.test',
      phone:   '+14165550100',
      message: 'Real flow test submitted via POST to /api/walliam/contact. Row created by the route handler. Verifies Patch A h.2a (destructure includes neighbourhood_id) and h.2b (INSERT writes all 6 entity IDs) end-to-end.',
      source:  'site_header',
      ...entities,
      geo_name: 'Real flow test',
      tenant_id: WALLIAM_TENANT_ID,
    };
    console.log('POST -> ' + DEV_URL + '/api/walliam/contact');

    let res;
    try {
      res = await fetch(DEV_URL + '/api/walliam/contact', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    } catch (e) {
      console.error('');
      console.error('FETCH FAILED: ' + e.message);
      console.error('Is `npm run dev` running on ' + DEV_URL + '?');
      console.error('Synthetic data is already wiped. Re-run after starting dev server.');
      process.exit(1);
    }

    const responseText = await res.text();
    console.log('Response status: ' + res.status);
    console.log('Response body:   ' + responseText.slice(0, 500));
    if (!res.ok) {
      console.error('REAL FLOW POST FAILED.');
      process.exit(1);
    }

    // ========== PHASE C: Verify the route wrote a real lead ==========
    section('PHASE C: Verify the route-created lead');

    const r = await c.query(`
      SELECT id, tenant_id, agent_id, contact_name, contact_email, source, source_url,
             intent, geo_name, lead_origin_route,
             building_id, listing_id, area_id, municipality_id, community_id, neighbourhood_id,
             created_at
      FROM leads
      WHERE contact_email = $1
      ORDER BY created_at DESC LIMIT 1
    `, [tag + '@walliam.test']);

    if (r.rowCount === 0) {
      console.error('NO LEAD FOUND for ' + tag + '@walliam.test. Route returned ok but no row written?');
      process.exit(1);
    }

    const lead = r.rows[0];
    console.log('Lead created by the real route handler:');
    for (const k of Object.keys(lead).sort()) {
      const v = lead[k];
      console.log('  ' + k.padEnd(28) + ' ' + (v === null ? '(null)' : v));
    }

    const sixIds = ['building_id', 'listing_id', 'area_id', 'municipality_id', 'community_id', 'neighbourhood_id'];
    const captured = sixIds.filter(k => lead[k] !== null);
    console.log('\nEntity-ID capture: ' + captured.length + '/6');
    for (const k of sixIds) console.log('  ' + (lead[k] !== null ? 'YES ' : 'NO  ') + k);

    console.log('');
    console.log('========================================================');
    console.log('  Dashboard: ' + DEV_URL + '/admin-homes/leads/' + lead.id);
    console.log('========================================================');
    if (captured.length === 6) console.log('  Patch A h.2 verified end-to-end through the real route.');
    else                       console.log('  Some entity IDs missing — investigate route handler.');

  } catch (e) {
    console.error('ERROR: ' + e.message);
    if (e.detail)     console.error('  detail: '     + e.detail);
    if (e.constraint) console.error('  constraint: ' + e.constraint);
    process.exit(1);
  } finally {
    await c.end();
  }
})();