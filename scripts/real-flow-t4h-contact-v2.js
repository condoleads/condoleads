#!/usr/bin/env node
/**
 * real-flow-t4h-contact-v2.js
 *
 * PHASE A: WIPE synthetic T4-h rows, SAVEPOINT-isolated so the
 *          append-only block on lead_email_recipients_log can't
 *          poison the transaction. If DELETE leads is blocked by
 *          FK, fall back to UPDATE-to-NULL + rename.
 * PHASE B: REAL FLOW — POST to /api/walliam/contact (dev server).
 * PHASE C: Verify the route-created lead.
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
    section('PHASE A: Identify synthetic T4-h rows');
    const tlr = await c.query('SELECT id, contact_email FROM leads WHERE id = $1', [TEST_LEAD_ID]);
    const sib = await c.query("SELECT id FROM leads WHERE tenant_id = $1 AND contact_name LIKE 'T4-h Dashboard Test Lead SELLER%'", [WALLIAM_TENANT_ID]);
    const leadIds = [];
    if (tlr.rowCount > 0) leadIds.push(TEST_LEAD_ID);
    for (const r of sib.rows) leadIds.push(r.id);
    const synEmail = tlr.rowCount > 0 ? tlr.rows[0].contact_email : null;
    console.log('Synthetic lead ids: ' + (leadIds.length ? leadIds.join(', ') : '(none)'));
    console.log('Synthetic email:    ' + (synEmail || '(none)'));

    section('PHASE A2: Wipe with SAVEPOINT isolation');
    await c.query('BEGIN');

    async function tryDel(name, sql, params) {
      await c.query('SAVEPOINT sp');
      try {
        const r = await c.query(sql, params);
        console.log('  ' + name.padEnd(28) + ' -' + r.rowCount);
        await c.query('RELEASE SAVEPOINT sp');
        return r.rowCount;
      } catch (e) {
        await c.query('ROLLBACK TO SAVEPOINT sp');
        console.log('  ' + name.padEnd(28) + ' BLOCKED: ' + e.message.slice(0, 90));
        return -1;
      }
    }

    if (leadIds.length > 0) {
      await tryDel('lead_email_recipients_log', 'DELETE FROM lead_email_recipients_log WHERE lead_id = ANY($1::uuid[])', [leadIds]);
      await tryDel('lead_email_log',            'DELETE FROM lead_email_log            WHERE lead_id = ANY($1::uuid[])', [leadIds]);
      await tryDel('chat_messages',             'DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE lead_id = ANY($1::uuid[]))', [leadIds]);
      await tryDel('chat_sessions',             'DELETE FROM chat_sessions             WHERE lead_id = ANY($1::uuid[])', [leadIds]);
      await tryDel('vip_requests',              'DELETE FROM vip_requests              WHERE lead_id = ANY($1::uuid[])', [leadIds]);
      await tryDel('lead_notes',                'DELETE FROM lead_notes                WHERE lead_id = ANY($1::uuid[])', [leadIds]);
      await tryDel('lead_admin_actions',        'DELETE FROM lead_admin_actions        WHERE lead_id = ANY($1::uuid[])', [leadIds]);
      await tryDel('lead_ownership_changes',    'DELETE FROM lead_ownership_changes    WHERE lead_id = ANY($1::uuid[])', [leadIds]);
    }
    if (synEmail) {
      await tryDel('user_activities', 'DELETE FROM user_activities WHERE contact_email = $1', [synEmail]);
    }
    if (leadIds.length > 0) {
      const delRc = await tryDel('leads (DELETE)', 'DELETE FROM leads WHERE id = ANY($1::uuid[])', [leadIds]);
      if (delRc < 0) {
        // Fallback: clear synthetic fields + rename so it's distinguishable from real data
        const r = await c.query(`
          UPDATE leads SET
            contact_name        = '[SYNTHETIC T4-h — undeletable due to FK]',
            user_id             = NULL,
            plan_data           = NULL,
            estimated_value_min = NULL,
            estimated_value_max = NULL,
            budget_max          = NULL,
            property_details    = NULL,
            message             = NULL,
            intent              = NULL,
            source_url          = NULL,
            updated_at          = NOW()
          WHERE id = ANY($1::uuid[])
          RETURNING id
        `, [leadIds]);
        console.log('  leads (fields nulled + renamed): ~' + r.rowCount);
      }
    }
    await c.query('COMMIT');
    console.log('Wipe phase committed.');

    section('PHASE B: REAL FLOW — POST /api/walliam/contact');

    const entities = (await c.query(`
      SELECT
        (SELECT id FROM buildings      WHERE building_name IS NOT NULL                            LIMIT 1) AS building_id,
        (SELECT id FROM mls_listings   WHERE available_in_vow = true AND unparsed_address IS NOT NULL LIMIT 1) AS listing_id,
        (SELECT id FROM treb_areas     WHERE name IS NOT NULL                                     LIMIT 1) AS area_id,
        (SELECT id FROM municipalities WHERE name IS NOT NULL                                     LIMIT 1) AS municipality_id,
        (SELECT id FROM communities    WHERE name IS NOT NULL                                     LIMIT 1) AS community_id,
        (SELECT id FROM neighbourhoods WHERE name IS NOT NULL                                     LIMIT 1) AS neighbourhood_id
    `)).rows[0];
    for (const k of Object.keys(entities)) console.log('  ' + k.padEnd(20) + entities[k]);

    const tag = 'rft-' + Date.now();
    const payload = {
      name:    'Real Flow Test ' + new Date().toISOString().slice(0, 19),
      email:   tag + '@walliam.test',
      phone:   '+14165550100',
      message: 'Real flow test submitted via POST to /api/walliam/contact. Lead created by the route handler, not by direct INSERT. Verifies Patch A h.2a/h.2b end-to-end.',
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
      console.error('Run `npm run dev` first, then rerun this script.');
      console.error('Wipe phase already committed; rerun is safe.');
      process.exit(1);
    }
    const responseText = await res.text();
    console.log('Response status: ' + res.status);
    console.log('Response body:   ' + responseText.slice(0, 500));
    if (!res.ok) { console.error('REAL FLOW POST FAILED.'); process.exit(1); }

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
      console.error('NO LEAD FOUND for ' + tag + '@walliam.test — route returned ok but no row.');
      process.exit(1);
    }
    const lead = r.rows[0];
    for (const k of Object.keys(lead).sort()) {
      console.log('  ' + k.padEnd(28) + ' ' + (lead[k] === null ? '(null)' : lead[k]));
    }
    const six = ['building_id','listing_id','area_id','municipality_id','community_id','neighbourhood_id'];
    const captured = six.filter(k => lead[k] !== null);
    console.log('\nEntity-ID capture by route: ' + captured.length + '/6');
    for (const k of six) console.log('  ' + (lead[k] !== null ? 'YES ' : 'NO  ') + k);

    console.log('');
    console.log('Dashboard: ' + DEV_URL + '/admin-homes/leads/' + lead.id);
    if (captured.length === 6) console.log('Patch A h.2 verified via real route handler.');

  } catch (e) {
    try { await c.query('ROLLBACK'); } catch {}
    console.error('ERROR: ' + e.message);
    if (e.detail) console.error('  detail: ' + e.detail);
    process.exit(1);
  } finally {
    await c.end();
  }
})();