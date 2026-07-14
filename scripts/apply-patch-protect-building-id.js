// Apply the pg_trigger_depth() patch to protect_building_id().
// Pre/post verify + row-count invariant + trigger-interaction test in one flow.
// Rolls back the scratch test at the end — no permanent test data.

require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });

const NEW_BODY = `CREATE OR REPLACE FUNCTION public.protect_building_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF OLD.building_id IS NOT NULL AND NEW.building_id IS NULL THEN
    NEW.building_id = OLD.building_id;
  END IF;
  RETURN NEW;
END;
$function$`;

(async () => {
  await c.connect();

  // ===== 1. baseline =====
  console.log('=== 1. BASELINE ===');
  const before  = await c.query('SELECT COUNT(*) AS n FROM mls_listings');
  const beforeB = await c.query('SELECT COUNT(*) AS n FROM buildings');
  const beforeFn = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname='protect_building_id'`);
  console.log('  mls_listings:', before.rows[0].n);
  console.log('  buildings   :', beforeB.rows[0].n);
  console.log('  trigger contains pg_trigger_depth() BEFORE:', /pg_trigger_depth/i.test(beforeFn.rows[0]?.def || ''));

  // ===== 2. apply the CREATE OR REPLACE FUNCTION =====
  console.log('\n=== 2. APPLYING PATCH ===');
  await c.query('BEGIN');
  try {
    await c.query(NEW_BODY);
    // Immediate verify: function body contains the guard
    const midFn = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname='protect_building_id'`);
    if (!/pg_trigger_depth/i.test(midFn.rows[0]?.def || '')) {
      throw new Error('post-apply function body still lacks pg_trigger_depth()');
    }
    // Row count unchanged
    const midRC = await c.query('SELECT COUNT(*) AS n FROM mls_listings');
    if (midRC.rows[0].n !== before.rows[0].n) {
      throw new Error(`row count changed during patch: ${before.rows[0].n} → ${midRC.rows[0].n}`);
    }
    await c.query('COMMIT');
    console.log('  COMMIT OK');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('PATCH FAILED:', e.message);
    process.exit(3);
  }

  // ===== 3. post-verify =====
  console.log('\n=== 3. POST-VERIFY ===');
  const after   = await c.query('SELECT COUNT(*) AS n FROM mls_listings');
  const afterB  = await c.query('SELECT COUNT(*) AS n FROM buildings');
  const afterFn = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname='protect_building_id'`);
  console.log('  mls_listings:', after.rows[0].n, '(delta:', Number(after.rows[0].n) - Number(before.rows[0].n) + ')');
  console.log('  buildings   :', afterB.rows[0].n);
  console.log('  trigger contains pg_trigger_depth() AFTER:', /pg_trigger_depth/i.test(afterFn.rows[0]?.def || ''));
  console.log('  ---- new function body ----');
  console.log(afterFn.rows[0].def);
  console.log('  ---- /new function body ----');

  if (after.rows[0].n !== before.rows[0].n)   { console.error('ROW COUNT MISMATCH'); process.exit(4); }
  if (afterB.rows[0].n !== beforeB.rows[0].n) { console.error('BLDG COUNT MISMATCH'); process.exit(5); }
  if (!/pg_trigger_depth/i.test(afterFn.rows[0].def)) { console.error('TRIGGER NOT PATCHED'); process.exit(6); }

  // ===== 4. cascade-through test — the one that failed last time =====
  console.log('\n=== 4. CASCADE-THROUGH TEST (scratch building + listing, ROLLBACK) ===');
  const stamp = Math.floor(Math.random() * 1e9);
  const testSlug        = 'trigger-patch-test-' + stamp;
  const testAddress     = '9999 TriggerPatchTest Road, Test City';
  const testListingKey  = 'TRIG_PATCH_' + stamp;

  await c.query('BEGIN');
  try {
    const b = await c.query(
      `INSERT INTO buildings (slug, canonical_address, street_number, street_name, city_district)
       VALUES ($1, $2, '9999', 'TriggerPatchTest Road', 'Test City') RETURNING id`,
      [testSlug, testAddress]
    );
    const bid = b.rows[0].id;
    console.log('  scratch building.id =', bid);

    const l = await c.query(
      `INSERT INTO mls_listings (listing_key, building_id) VALUES ($1, $2) RETURNING id`,
      [testListingKey, bid]
    );
    const lid = l.rows[0].id;
    console.log('  scratch listing.id  =', lid);

    // Test A: direct user UPDATE to NULL — should be REVERTED (accident protection intact)
    console.log('\n  Test A: direct UPDATE listing SET building_id=NULL (should be reverted)');
    await c.query('UPDATE mls_listings SET building_id=NULL WHERE id=$1', [lid]);
    const afterUpd = await c.query('SELECT building_id FROM mls_listings WHERE id=$1', [lid]);
    if (afterUpd.rows[0].building_id === bid) {
      console.log('    ✓ direct null was reverted (building_id still =', bid.slice(0,8), '...)');
    } else if (afterUpd.rows[0].building_id === null) {
      console.log('    ✗ direct null went through — accident protection is BROKEN');
    } else {
      console.log('    ?? unexpected building_id:', afterUpd.rows[0].building_id);
    }

    // Test B: DELETE building — should cascade SET NULL through (the key test)
    console.log('\n  Test B: DELETE building — SET NULL cascade must pass through');
    let deleteError = null;
    try {
      const d = await c.query('DELETE FROM buildings WHERE id=$1', [bid]);
      console.log('    DELETE result: rowCount =', d.rowCount);
    } catch (e) {
      deleteError = { msg: e.message, code: e.code };
      console.log('    DELETE ERROR :', JSON.stringify(deleteError));
    }

    if (!deleteError) {
      const post = await c.query('SELECT id, building_id FROM mls_listings WHERE id=$1', [lid]);
      if (post.rows.length === 0) {
        console.log('    ✗ LISTING DESTROYED — should have been SET NULL, not deleted');
      } else if (post.rows[0].building_id === null) {
        console.log('    ✓ SET NULL cascade worked — listing.building_id = NULL, listing survives');
      } else if (post.rows[0].building_id === bid) {
        console.log('    ✗ trigger STILL reverting the cascade — building_id points to deleted parent');
      } else {
        console.log('    ?? listing.building_id =', post.rows[0].building_id);
      }
      const bPost = await c.query('SELECT COUNT(*) AS n FROM buildings WHERE id=$1', [bid]);
      console.log('    scratch building still exists?', bPost.rows[0].n, '(0 = deleted OK, 1 = still there)');
    }

    await c.query('ROLLBACK');
    console.log('\n  test data ROLLBACK complete');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('  scratch-test error (rolled back):', e.message);
  }

  console.log('\n=== 5. FINAL INVARIANT CHECK ===');
  const finalRC = await c.query('SELECT COUNT(*) AS n FROM mls_listings');
  const finalBC = await c.query('SELECT COUNT(*) AS n FROM buildings');
  console.log('  mls_listings:', finalRC.rows[0].n, '(delta from baseline:', Number(finalRC.rows[0].n) - Number(before.rows[0].n) + ')');
  console.log('  buildings   :', finalBC.rows[0].n, '(delta from baseline:', Number(finalBC.rows[0].n) - Number(beforeB.rows[0].n) + ')');

  await c.end();
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
