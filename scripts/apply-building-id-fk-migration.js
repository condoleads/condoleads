// Apply mls_listings.building_id FK migration: CASCADE → SET NULL.
// Includes: pre-state snapshot, transactional apply, post-verify, scratch-building trigger-interaction test.
// Row-count invariant enforced at every step. All test data ROLLBACKed at end.

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const c = new Client({ connectionString: process.env.DATABASE_URL });

(async () => {
  await c.connect();

  // ===== 1. baseline =====
  console.log('=== 1. BASELINE ===');
  const before   = await c.query('SELECT COUNT(*) AS n FROM mls_listings');
  const beforeB  = await c.query('SELECT COUNT(*) AS n FROM buildings');
  const beforeFK = await c.query(`SELECT conname, confdeltype, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='mls_listings_building_id_fkey'`);
  console.log('  mls_listings count:', before.rows[0].n);
  console.log('  buildings count   :', beforeB.rows[0].n);
  console.log('  FK current        :', JSON.stringify(beforeFK.rows[0]));

  if (beforeFK.rows[0].confdeltype !== 'c') {
    console.log('ABORT: FK is not CASCADE. Refusing to migrate an already-changed state.');
    console.log('  confdeltype found:', beforeFK.rows[0].confdeltype);
    process.exit(2);
  }

  // ===== 2. migration (transactional) =====
  console.log('\n=== 2. MIGRATION ===');
  await c.query('BEGIN');
  try {
    console.log('  running: ALTER TABLE mls_listings DROP CONSTRAINT mls_listings_building_id_fkey');
    await c.query('ALTER TABLE public.mls_listings DROP CONSTRAINT mls_listings_building_id_fkey');

    console.log('  running: ALTER TABLE mls_listings ADD CONSTRAINT ... ON DELETE SET NULL');
    await c.query(`ALTER TABLE public.mls_listings
      ADD CONSTRAINT mls_listings_building_id_fkey
        FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE SET NULL`);

    // pre-commit verification
    const midFK = await c.query(`SELECT confdeltype, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='mls_listings_building_id_fkey'`);
    console.log('  pre-commit confdeltype:', midFK.rows[0].confdeltype);
    if (midFK.rows[0].confdeltype !== 'n') {
      throw new Error('confdeltype after ADD is not n: ' + midFK.rows[0].confdeltype);
    }
    const midRC = await c.query('SELECT COUNT(*) AS n FROM mls_listings');
    if (midRC.rows[0].n !== before.rows[0].n) {
      throw new Error(`Row count changed during migration: ${before.rows[0].n} → ${midRC.rows[0].n}`);
    }
    await c.query('COMMIT');
    console.log('  COMMIT OK');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('MIGRATION FAILED:', e.message);
    process.exit(3);
  }

  // ===== 3–5. post-verify =====
  console.log('\n=== 3-5. POST-VERIFY ===');
  const after   = await c.query('SELECT COUNT(*) AS n FROM mls_listings');
  const afterB  = await c.query('SELECT COUNT(*) AS n FROM buildings');
  const afterFK = await c.query(`SELECT conname, confdeltype, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='mls_listings_building_id_fkey'`);
  console.log('  mls_listings count:', after.rows[0].n, '(delta:', Number(after.rows[0].n) - Number(before.rows[0].n) + ')');
  console.log('  buildings count   :', afterB.rows[0].n);
  console.log('  FK new            :', JSON.stringify(afterFK.rows[0]));

  if (after.rows[0].n !== before.rows[0].n)   { console.error('ROW COUNT MISMATCH — INVESTIGATE'); process.exit(4); }
  if (afterB.rows[0].n !== beforeB.rows[0].n) { console.error('BUILDING COUNT MISMATCH — INVESTIGATE'); process.exit(5); }
  if (afterFK.rows[0].confdeltype !== 'n')    { console.error('FK NOT SET NULL — INVESTIGATE'); process.exit(6); }

  // ===== 6. trigger-interaction test =====
  console.log('\n=== 6. TRIGGER INTERACTION TEST (scratch building + listing, ROLLBACK) ===');
  const stamp = Math.floor(Math.random() * 1e9);
  const testSlug        = 'fk-migration-test-' + stamp;
  const testListingKey  = 'FK_MIG_TEST_' + stamp;
  await c.query('BEGIN');
  try {
    const b = await c.query(
      `INSERT INTO buildings (slug, street_number, street_name, city_district)
       VALUES ($1, '9999', 'FKTest Road', 'Test City') RETURNING id`,
      [testSlug]
    );
    const bid = b.rows[0].id;
    console.log('  scratch building.id =', bid);

    const l = await c.query(
      `INSERT INTO mls_listings (listing_key, building_id) VALUES ($1, $2) RETURNING id`,
      [testListingKey, bid]
    );
    const lid = l.rows[0].id;
    console.log('  scratch listing.id  =', lid);

    const pre = await c.query('SELECT building_id FROM mls_listings WHERE id=$1', [lid]);
    console.log('  pre-delete: listing.building_id =', pre.rows[0].building_id);

    // Attempt the DELETE — key test point
    let deleteResult = null;
    let deleteError = null;
    try {
      deleteResult = await c.query('DELETE FROM buildings WHERE id=$1', [bid]);
      console.log('  DELETE result: rowCount =', deleteResult.rowCount);
    } catch (e) {
      deleteError = { msg: e.message, code: e.code, detail: e.detail };
      console.log('  DELETE ERROR :', JSON.stringify(deleteError));
    }

    if (!deleteError) {
      // Check the listing survived and what its building_id looks like
      const post = await c.query('SELECT id, building_id FROM mls_listings WHERE id=$1', [lid]);
      if (post.rows.length === 0) {
        console.log('  RESULT: LISTING DESTROYED — cascade fell through to DELETE (unexpected)');
      } else {
        const bidAfter = post.rows[0].building_id;
        if (bidAfter === null) {
          console.log('  RESULT: ✓ listing.building_id = NULL — SET NULL cascade worked, trigger did NOT interfere');
        } else if (bidAfter === bid) {
          console.log('  RESULT: ✗ listing.building_id STILL = deleted id — trigger reverted the cascade (dangling reference!)');
        } else {
          console.log('  RESULT: ?? listing.building_id =', bidAfter, '— unexpected value');
        }
      }
    }

    await c.query('ROLLBACK');
    console.log('  scratch data ROLLBACK — no permanent changes');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('  scratch-test error (rolled back):', e.message);
  }

  console.log('\n=== DONE ===');
  await c.end();
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
