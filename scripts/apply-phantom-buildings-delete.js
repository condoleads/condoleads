// Delete phantom buildings — the 15 marked FABRICATION in the recon.
// Excludes: 3 KEEP (C Line, W Oakland Park, N Muldrew Lake) + 2 HOLD (B Valdez, B Farley).
//
// Safety: FK is SET NULL + trigger has pg_trigger_depth() > 1 guard, both verified
// end-to-end in the same session. Cascade nulls building_id on listings, does not
// destroy them. Row count invariant: mls_listings count MUST remain 1,389,053
// (or grow via concurrent nightly-sync, never decrease from these deletes).
//
// Snapshot lives at docs/snapshots/phantom_delete_20260714_<ts>.json — contains
// every building row + every listing (listing_key, building_id, standard_status)
// before the delete, so a rollback UPDATE can put building_id back if needed.

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// The 15 phantoms marked FABRICATION in the phantom recon. Slug-based lookup so
// even if IDs shift the semantic match holds. IDs resolved at runtime.
const PHANTOM_SLUGS = [
  'rodeo-condos-50-o-neill-road-n-road-n-toronto-c13',            // 0 Active, 0 total  — smallest
  '99-b-farley-road-centre-wellington',                            // EXCLUDED (HOLD)
  'west-harbour-city-condos-618-a-fleet-street-toronto-c01',       // 0 Active, 11 total
  'rodeo-drive-condo-50-o-neill-road-w-toronto-c13',               // 0 Active, 34 total
  '4392-b-valdez-n-a-out-of-area',                                 // EXCLUDED (HOLD)
  'balsam-lake-club-never-lived-in-19-a-west-street-n-kawartha-lakes', // 4 Active, 42 total
  'fontana-condos-99-s-town-centre-boulevard-markham',             // 6 Active, 109 total
  'como-condos-600-n-service-rd-road-n-road-n-hamilton',           // 11 Active, 89 total
  '30-n-park-road-vaughan',                                        // 11 Active, 197 total
  '7-n-park-road-vaughan',                                         // 13 Active, 175 total
  '20-n-park-road-vaughan',                                        // 24 Active, 336 total
  '49-e-liberty-street-toronto-c01',                               // 29 Active, 367 total
  'liberty-market-tower-135-e-liberty-street-toronto-c01',         // 34 Active, 439 total
  '150-e-liberty-street-toronto-c01',                              // 56 Active, 591 total
  '75-e-liberty-street-toronto-c01',                               // 74 Active, 724 total
  '50-o-neil-road-toronto-c13',                                    // 146 Active, 2764 total
  '55-e-liberty-street-toronto-c01',                               // 184 Active, 1848 total — largest
];

// The 2 HOLD slugs are in the array above but explicitly filtered out below.
const HOLD_SLUGS = new Set([
  '99-b-farley-road-centre-wellington',
  '4392-b-valdez-n-a-out-of-area',
]);

// Legitimate protected — must NEVER be in the delete set. Belt-and-suspenders check.
const KEEP_SLUGS = new Set([
  'arbours-of-montgomery-60-c-line-n-a-n-a-orangeville',
  'hawaiian-gardens-5071-w-oakland-park-boulevard-florida-usa',
  '1217-n-muldrew-lake-road-out-of-area',
]);

const SLUGS_TO_DELETE = PHANTOM_SLUGS.filter(s => !HOLD_SLUGS.has(s) && !KEEP_SLUGS.has(s));

const c = new Client({ connectionString: process.env.DATABASE_URL });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const SNAPSHOT_PATH = path.join(__dirname, '..', 'docs', 'snapshots', `phantom_delete_20260714_${stamp}.json`);

(async () => {
  await c.connect();

  // ===== 0. safety re-verify =====
  console.log('=== STEP 0: SAFETY RE-VERIFY ===');
  const fk = await c.query(`SELECT confdeltype FROM pg_constraint WHERE conname='mls_listings_building_id_fkey'`);
  const trg = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname='protect_building_id'`);
  const rc0 = await c.query('SELECT COUNT(*) AS n FROM mls_listings');
  const bc0 = await c.query('SELECT COUNT(*) AS n FROM buildings');
  console.log('  FK confdeltype:', fk.rows[0].confdeltype, '(need n)');
  const trgHasGuard = /pg_trigger_depth\(\)\s*>\s*1/.test(trg.rows[0]?.def || '');
  console.log('  trigger has pg_trigger_depth() > 1:', trgHasGuard);
  console.log('  mls_listings baseline:', rc0.rows[0].n);
  console.log('  buildings baseline   :', bc0.rows[0].n);
  if (fk.rows[0].confdeltype !== 'n' || !trgHasGuard) {
    console.error('ABORT: safety infrastructure not in place');
    process.exit(2);
  }
  const baselineListings = rc0.rows[0].n;
  const baselineBldgs    = bc0.rows[0].n;

  // ===== 1. resolve slugs to IDs + validate =====
  console.log('\n=== STEP 1: RESOLVE + VALIDATE ===');
  console.log('  requested delete set: ' + SLUGS_TO_DELETE.length + ' slugs');
  console.log('  excluded HOLD       : ' + HOLD_SLUGS.size + ' slugs');
  console.log('  excluded KEEP       : ' + KEEP_SLUGS.size + ' slugs');

  const resolved = await c.query(
    `SELECT id, slug, street_number, street_name, city_district,
       (SELECT COUNT(*) FROM mls_listings l WHERE l.building_id = b.id) AS total_listings,
       (SELECT COUNT(*) FROM mls_listings l WHERE l.building_id = b.id AND l.standard_status='Active') AS active_listings
     FROM buildings b WHERE slug = ANY($1::text[])
     ORDER BY (SELECT COUNT(*) FROM mls_listings l WHERE l.building_id = b.id) ASC`,
    [SLUGS_TO_DELETE]
  );
  console.log('  resolved buildings:', resolved.rows.length);
  for (const r of resolved.rows) {
    console.log(`    ${r.id.slice(0,8)}... | ${r.slug} | active=${r.active_listings} total=${r.total_listings}`);
  }

  // Belt-and-suspenders: verify no KEEP slug ended up in the resolved set
  const keepInSet = resolved.rows.filter(r => KEEP_SLUGS.has(r.slug));
  if (keepInSet.length > 0) {
    console.error('ABORT: KEEP slug in delete set:', keepInSet.map(r => r.slug));
    process.exit(3);
  }
  const holdInSet = resolved.rows.filter(r => HOLD_SLUGS.has(r.slug));
  if (holdInSet.length > 0) {
    console.error('ABORT: HOLD slug in delete set:', holdInSet.map(r => r.slug));
    process.exit(4);
  }

  // Verify LEGITIMATE buildings still exist BEFORE we start
  console.log('\n  verifying LEGITIMATE buildings still exist:');
  const keepCheck = await c.query(`SELECT slug FROM buildings WHERE slug = ANY($1::text[])`, [[...KEEP_SLUGS]]);
  console.log('  legitimate slugs present:', keepCheck.rows.length, '/ 3');
  if (keepCheck.rows.length !== 3) {
    console.error('ABORT: one or more LEGITIMATE building slugs missing:', keepCheck.rows);
    process.exit(5);
  }

  // ===== 2. snapshot =====
  console.log('\n=== STEP 2: SNAPSHOT ===');
  const ids = resolved.rows.map(r => r.id);
  const bldgSnap = await c.query(`SELECT * FROM buildings WHERE id = ANY($1::uuid[])`, [ids]);
  const listingSnap = await c.query(
    `SELECT listing_key, id, building_id, standard_status, street_number, street_name, city
     FROM mls_listings WHERE building_id = ANY($1::uuid[])`, [ids]
  );
  const snapshot = {
    stamp,
    baseline: { mls_listings: baselineListings, buildings: baselineBldgs },
    fk_state: fk.rows[0],
    trigger_state: trg.rows[0],
    buildings: bldgSnap.rows,
    listings: listingSnap.rows,
  };
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
  console.log('  snapshot: ' + SNAPSHOT_PATH);
  console.log('  buildings snapshotted:', bldgSnap.rows.length);
  console.log('  listings snapshotted :', listingSnap.rows.length);

  // ===== 3. delete one-by-one, smallest-first =====
  console.log('\n=== STEP 3: DELETE (smallest first, row-count check between each) ===');
  const results = [];
  for (const b of resolved.rows) {
    const totalBefore = await c.query('SELECT COUNT(*) AS n FROM mls_listings');
    const bldgBefore  = await c.query('SELECT COUNT(*) AS n FROM buildings');

    console.log(`\n  deleting ${b.id.slice(0,8)}... (${b.slug}, active=${b.active_listings}, total=${b.total_listings})`);
    let err = null;
    try {
      const d = await c.query('DELETE FROM buildings WHERE id = $1', [b.id]);
      console.log('    delete rowCount:', d.rowCount);
    } catch (e) {
      err = { code: e.code, msg: e.message };
      console.log('    DELETE ERROR:', JSON.stringify(err));
    }

    // Post-delete row-count check
    const totalAfter = await c.query('SELECT COUNT(*) AS n FROM mls_listings');
    const bldgAfter  = await c.query('SELECT COUNT(*) AS n FROM buildings');
    const listingsDelta = Number(totalAfter.rows[0].n) - Number(totalBefore.rows[0].n);
    const bldgDelta = Number(bldgAfter.rows[0].n) - Number(bldgBefore.rows[0].n);
    console.log('    mls_listings delta:', listingsDelta, '(baseline shift)');
    console.log('    buildings delta   :', bldgDelta);

    if (listingsDelta < 0) {
      console.error('    ✗ ROW-COUNT INVARIANT VIOLATED — LISTING(S) DESTROYED. ABORTING.');
      process.exit(10);
    }

    // Verify listings orphaned (building_id set to NULL)
    const orphCheck = await c.query(
      `SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE building_id IS NULL) AS null_bldg
       FROM mls_listings WHERE listing_key = ANY(
         SELECT listing_key FROM (SELECT unnest($1::text[]) AS listing_key) k
       )`,
      [snapshot.listings.filter(l => l.building_id === b.id).map(l => l.listing_key)]
    );
    console.log('    orphaned listings alive:', orphCheck.rows[0].n, 'null_bldg:', orphCheck.rows[0].null_bldg);

    results.push({
      slug: b.slug, id: b.id, active_before: Number(b.active_listings), total_before: Number(b.total_listings),
      delete_error: err, listings_delta: listingsDelta, bldg_delta: bldgDelta,
    });
  }

  // ===== 4. final invariants =====
  console.log('\n=== STEP 4: FINAL INVARIANTS ===');
  const finalRC = await c.query('SELECT COUNT(*) AS n FROM mls_listings');
  const finalBC = await c.query('SELECT COUNT(*) AS n FROM buildings');
  console.log('  mls_listings:', finalRC.rows[0].n, '(delta from baseline:', Number(finalRC.rows[0].n) - Number(baselineListings) + ')');
  console.log('  buildings   :', finalBC.rows[0].n, '(delta from baseline:', Number(finalBC.rows[0].n) - Number(baselineBldgs) + ' — expected -' + resolved.rows.length + ')');

  // Verify LEGITIMATE buildings still exist AFTER
  const keepAfter = await c.query(`SELECT slug FROM buildings WHERE slug = ANY($1::text[])`, [[...KEEP_SLUGS]]);
  console.log('  legitimate buildings still present:', keepAfter.rows.length, '/ 3');
  if (keepAfter.rows.length !== 3) {
    console.error('  ⚠ LEGITIMATE BUILDING WAS DELETED — INVESTIGATE. missing:', [...KEEP_SLUGS].filter(s => !keepAfter.rows.find(r => r.slug === s)));
  }

  // Verify orphaned listings across the whole delete set
  const orphAll = await c.query(
    `SELECT COUNT(*) AS n FROM mls_listings WHERE building_id IS NULL AND id = ANY($1::uuid[])`,
    [snapshot.listings.map(l => l.id)]
  );
  console.log('  snapshotted listings now orphaned (building_id=NULL):', orphAll.rows[0].n, '/', snapshot.listings.length);

  const survived = await c.query(
    `SELECT COUNT(*) AS n FROM mls_listings WHERE id = ANY($1::uuid[])`,
    [snapshot.listings.map(l => l.id)]
  );
  console.log('  snapshotted listings still exist (alive)          :', survived.rows[0].n, '/', snapshot.listings.length);

  await c.end();

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({
    stamp,
    snapshot_file: SNAPSHOT_PATH,
    baseline: { mls_listings: baselineListings, buildings: baselineBldgs },
    final: { mls_listings: finalRC.rows[0].n, buildings: finalBC.rows[0].n },
    deleted: results.length,
    delete_errors: results.filter(r => r.delete_error).length,
    per_building: results,
  }, null, 2));
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
