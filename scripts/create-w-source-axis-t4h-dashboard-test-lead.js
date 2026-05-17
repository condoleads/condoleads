#!/usr/bin/env node
/**
 * create-w-source-axis-t4h-dashboard-test-lead.js
 *
 * Creates ONE WALLiam-tenant lead with:
 *   - all 6 entity IDs populated (building/listing + 4 geo)
 *   - source_url populated
 *   - enum-typed fields cloned from an existing WALLiam lead (guaranteed valid)
 *
 * Probes for real entity UUIDs in the DB first; no placeholders, no guesses.
 * Transactional: BEGIN; INSERT; verify; COMMIT — rolls back on any error.
 *
 * Multi-tenant safe: only the lead's tenant_id is tenant-scoped; building /
 * listing / geo tables are shared MLS-derived data (no tenant_id column).
 */

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';

const connString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_PRISMA_URL;

if (!connString) {
  console.error('MISSING DB CONNECTION STRING.');
  console.error('Checked: DATABASE_URL, POSTGRES_URL, SUPABASE_DB_URL, POSTGRES_PRISMA_URL');
  console.error('Add one to .env.local and rerun.');
  process.exit(1);
}

function pad(label) { return label.padEnd(22); }

async function probe(client, sql, params, label) {
  const r = await client.query(sql, params || []);
  if (r.rowCount === 0) throw new Error('Probe returned 0 rows: ' + label);
  return r.rows[0];
}

(async () => {
  const client = new Client({ connectionString: connString });
  await client.connect();

  try {
    console.log('=== Probes (read-only) ===');

    const t = await probe(client,
      'SELECT id, name FROM tenants WHERE id = $1',
      [WALLIAM_TENANT_ID], 'WALLiam tenant');
    console.log('  ' + pad('Tenant:') + t.name + ' (' + t.id + ')');

    const tpl = await probe(client, `
      SELECT agent_id, status, quality, temperature, source, lead_origin_route, intent
      FROM leads WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1
    `, [WALLIAM_TENANT_ID], 'template WALLiam lead');
    console.log('  ' + pad('Template status:') + tpl.status);
    console.log('  ' + pad('Template quality:') + tpl.quality);
    console.log('  ' + pad('Template temperature:') + tpl.temperature);
    console.log('  ' + pad('Template source:') + tpl.source);
    console.log('  ' + pad('Template route:') + tpl.lead_origin_route);
    console.log('  ' + pad('Template intent:') + (tpl.intent || '(null)'));
    console.log('  ' + pad('Template agent_id:') + (tpl.agent_id || '(null)'));

    const b = await probe(client,
      "SELECT id, building_name FROM buildings WHERE building_name IS NOT NULL LIMIT 1",
      null, 'a building');
    console.log('  ' + pad('Building:') + b.building_name);

    const l = await probe(client, `
      SELECT id, unparsed_address FROM mls_listings
      WHERE available_in_vow = true AND unparsed_address IS NOT NULL
      LIMIT 1
    `, null, 'a VOW listing');
    console.log('  ' + pad('Listing:') + l.unparsed_address);

    const a = await probe(client,
      'SELECT id, name FROM treb_areas WHERE name IS NOT NULL LIMIT 1',
      null, 'a TREB area');
    console.log('  ' + pad('Area:') + a.name);

    const m = await probe(client,
      'SELECT id, name FROM municipalities WHERE name IS NOT NULL LIMIT 1',
      null, 'a municipality');
    console.log('  ' + pad('Municipality:') + m.name);

    const c = await probe(client,
      'SELECT id, name FROM communities WHERE name IS NOT NULL LIMIT 1',
      null, 'a community');
    console.log('  ' + pad('Community:') + c.name);

    const n = await probe(client,
      'SELECT id, name FROM neighbourhoods WHERE name IS NOT NULL LIMIT 1',
      null, 'a neighbourhood');
    console.log('  ' + pad('Neighbourhood:') + n.name);

    console.log('');
    console.log('=== Transaction ===');
    await client.query('BEGIN');

    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const name = 'T4-h Dashboard Test Lead ' + stamp;
    const email = 'test-t4h-' + Date.now() + '@walliam.test';
    const phone = '+14165550199';
    const sourceUrl = 'https://walliam.ca/test/source-context-demo';
    const geoName = c.name + ', ' + m.name + ' (T4-h test)';
    const message = 'T4-h dashboard verification \u2014 all 6 entity IDs + source_url populated to exercise the SourceContextSection breadcrumb on the workbench (Overview / Estimator / Estimator Q tabs) and the row-level context strip on the leads list.';

    const ins = await client.query(`
      INSERT INTO leads (
        tenant_id, agent_id, contact_name, contact_email, contact_phone,
        status, quality, temperature, source, source_url,
        intent, geo_name, lead_origin_route,
        building_id, listing_id,
        area_id, municipality_id, community_id, neighbourhood_id,
        message, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13,
        $14, $15,
        $16, $17, $18, $19,
        $20, NOW(), NOW()
      )
      RETURNING id, created_at
    `, [
      WALLIAM_TENANT_ID, tpl.agent_id, name, email, phone,
      tpl.status, tpl.quality, tpl.temperature, tpl.source, sourceUrl,
      tpl.intent, geoName, tpl.lead_origin_route,
      b.id, l.id, a.id, m.id, c.id, n.id,
      message,
    ]);

    const leadId = ins.rows[0].id;

    // Verify all 6 entity IDs + source_url landed
    const v = (await client.query(`
      SELECT building_id, listing_id, area_id, municipality_id, community_id, neighbourhood_id, source_url
      FROM leads WHERE id = $1
    `, [leadId])).rows[0];

    const ok = v.building_id && v.listing_id && v.area_id &&
               v.municipality_id && v.community_id && v.neighbourhood_id && v.source_url;
    if (!ok) throw new Error('Post-insert verify FAILED. Row: ' + JSON.stringify(v));

    await client.query('COMMIT');
    console.log('COMMITTED.');
    console.log('');
    console.log('=== Created ===');
    console.log('  ' + pad('Lead ID:') + leadId);
    console.log('  ' + pad('Contact:') + name);
    console.log('  ' + pad('Email:') + email);
    console.log('  ' + pad('Phone:') + phone);
    console.log('  ' + pad('Source URL:') + sourceUrl);
    console.log('');
    console.log('=== Dashboard URLs ===');
    console.log('  Leads list (local):  http://localhost:3000/admin-homes/leads');
    console.log('  Leads list (prod):   https://walliam.ca/admin-homes/leads');
    console.log('  Workbench  (local):  http://localhost:3000/admin-homes/leads/' + leadId);
    console.log('  Workbench  (prod):   https://walliam.ca/admin-homes/leads/' + leadId);
    console.log('');
    console.log('=== What to verify in the UI ===');
    console.log('');
    console.log('Leads list row (find by contact name "' + name + '"):');
    console.log('  [T4-a/b] Source pill renders from lead_origin_route, not raw source');
    console.log('  [T4-c]   Source pill is clickable \u2192 opens ' + sourceUrl + ' in new tab');
    console.log('  [T4-g.4] Pill shows trailing \u2197 arrow');
    console.log('  [T4-h.6] Below the pill: 6-item context strip separated by \u00b7');
    console.log('           Order: Building \u00b7 Listing \u00b7 Neighbourhood \u00b7 Community \u00b7 Municipality \u00b7 Area');
    console.log('  [T4-h.6] Each geo item is itself linkable (opens /{slug} in new tab)');
    console.log('');
    console.log('Workbench Overview tab:');
    console.log('  [T4-g.a] "Source URL" field with clickable link + \u2197 arrow');
    console.log('  [T4-h.7] "Source Context" section listing all 6 entities');
    console.log('');
    console.log('Workbench Estimator tab:');
    console.log('  [T4-h.7] "Source Context" section above the "Estimator Submission" heading');
    console.log('           (estimator body itself will be sparse \u2014 test lead has no estimator data)');
    console.log('');
    console.log('Workbench Estimator Questionnaire tab:');
    console.log('  [T4-h.7] "Source Context" section above the "Estimator Questionnaire" heading');
    console.log('           (questionnaire body itself will be sparse \u2014 test lead has no questionnaire data)');
    console.log('');
    console.log('Not exercised by this test lead (separate setup needed):');
    console.log('  [T4-d]   Estimator tab BODY content (needs estimated_value_min/max/property_details)');
    console.log('  [T4-e]   Estimator Q tab BODY content (needs questionnaire-shaped message)');
    console.log('  [T4-f]   Activity tab (needs lead.user_id linked to user_activities rows)');

  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('');
    console.error('ROLLED BACK. Error: ' + e.message);
    if (e.detail) console.error('Detail: ' + e.detail);
    if (e.hint)   console.error('Hint: ' + e.hint);
    if (e.column) console.error('Column: ' + e.column);
    if (e.constraint) console.error('Constraint: ' + e.constraint);
    process.exit(1);
  } finally {
    await client.end();
  }
})();