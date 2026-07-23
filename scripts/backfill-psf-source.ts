// scripts/backfill-psf-source.ts
// One-off backfill for SQFT-FIX 2026-07-23.
//
// The prior populatePSF() in analytics-engine ignored building_area_total (the
// actual integer sqft column) and instead regex-parsed square_foot_source (a
// text label). This left two classes of rows in a bad state:
//
//   Case (b) rows have a REAL exact sqft in building_area_total, but their
//            calculated_sqft/sqft_method/price_per_sqft were derived from range
//            midpoint (or fake "exact" label parse). Fix: use the real number.
//
//   Case (c) rows had calculated_sqft populated (by bulk-update-sqft.ts) but
//            price_per_sqft was never filled -- so downstream medianPsf misses
//            them (filter: price_per_sqft > 200 && < 10000). Fix: compute PPS
//            from the calculated_sqft that's already there.
//
// Case (a) -- rows with no calc_sqft at all -- is left to the ongoing
// populatePSF() path in the nightly analytics run.
//
// Two guarded UPDATE statements via pg-direct; each prints before/after counts.

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const { Client } = require('pg');

async function main() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  await pg.query(`SET statement_timeout = '600s'`);

  console.log('=== BEFORE STATE ===');
  const before = await pg.query(`
    SELECT
      COUNT(*) FILTER (WHERE calculated_sqft IS NOT NULL)                                       AS calc_pop,
      COUNT(*) FILTER (WHERE price_per_sqft IS NOT NULL)                                        AS pps_pop,
      COUNT(*) FILTER (WHERE building_area_total > 0)                                           AS exact_pop,
      COUNT(*) FILTER (WHERE building_area_total > 0 AND sqft_method = 'exact')                 AS exact_correctly_labeled,
      COUNT(*) FILTER (WHERE building_area_total > 0 AND sqft_method IS DISTINCT FROM 'exact')  AS case_b,
      COUNT(*) FILTER (WHERE calculated_sqft > 0 AND price_per_sqft IS NULL
                        AND standard_status='Closed' AND close_price > 0)                       AS case_c,
      COUNT(*) AS total
    FROM mls_listings
  `);
  console.log('  ', before.rows[0]);

  console.log('\n=== SAMPLE 10 case (b) rows BEFORE (had exact ignored) ===');
  const sampleBefore = await pg.query(`
    SELECT id::text, building_area_total AS exact, living_area_range AS rng,
           calculated_sqft AS calc, sqft_method AS mth, price_per_sqft AS pps,
           standard_status AS st, close_price AS cp
    FROM mls_listings
    WHERE building_area_total > 0
      AND building_area_total BETWEEN 100 AND 20000
      AND sqft_method IS DISTINCT FROM 'exact'
    ORDER BY id
    LIMIT 10
  `);
  const sampleIds = sampleBefore.rows.map((r: any) => r.id);
  sampleBefore.rows.forEach((r: any) => console.log(`  id=${r.id.slice(0,8)} exact=${r.exact} rng="${r.rng}" calc=${r.calc} mth=${r.mth} pps=${r.pps} st=${r.st} cp=${r.cp}`));

  console.log('\n=== CASE (b) UPDATE: prefer exact building_area_total ===');
  const b = await pg.query(`
    UPDATE mls_listings
    SET
      calculated_sqft = building_area_total,
      sqft_method = 'exact',
      price_per_sqft = CASE
        WHEN standard_status = 'Closed' AND close_price > 0
        THEN ROUND((close_price::numeric / building_area_total) * 100) / 100
        ELSE price_per_sqft
      END
    WHERE building_area_total > 0
      AND building_area_total BETWEEN 100 AND 20000
      AND (
        sqft_method IS DISTINCT FROM 'exact'
        OR calculated_sqft IS DISTINCT FROM building_area_total
      )
  `);
  console.log(`  case_b rows updated: ${b.rowCount}`);

  console.log('\n=== SAMPLE 10 case (b) rows AFTER ===');
  const sampleAfter = await pg.query(`
    SELECT id::text, building_area_total AS exact, living_area_range AS rng,
           calculated_sqft AS calc, sqft_method AS mth, price_per_sqft AS pps
    FROM mls_listings
    WHERE id::text = ANY($1)
    ORDER BY id
  `, [sampleIds]);
  sampleAfter.rows.forEach((r: any) => console.log(`  id=${r.id.slice(0,8)} exact=${r.exact} rng="${r.rng}" calc=${r.calc} mth=${r.mth} pps=${r.pps}`));

  console.log('\n=== CASE (c) UPDATE: fill price_per_sqft where calc_sqft exists but PPS null (Closed only) ===');
  const c = await pg.query(`
    UPDATE mls_listings
    SET price_per_sqft = ROUND((close_price::numeric / calculated_sqft) * 100) / 100
    WHERE price_per_sqft IS NULL
      AND calculated_sqft > 0
      AND standard_status = 'Closed'
      AND close_price > 0
  `);
  console.log(`  case_c rows updated: ${c.rowCount}`);

  console.log('\n=== AFTER STATE ===');
  const after = await pg.query(`
    SELECT
      COUNT(*) FILTER (WHERE calculated_sqft IS NOT NULL)                                       AS calc_pop,
      COUNT(*) FILTER (WHERE price_per_sqft IS NOT NULL)                                        AS pps_pop,
      COUNT(*) FILTER (WHERE building_area_total > 0)                                           AS exact_pop,
      COUNT(*) FILTER (WHERE building_area_total > 0 AND sqft_method = 'exact')                 AS exact_correctly_labeled,
      COUNT(*) FILTER (WHERE building_area_total > 0 AND sqft_method IS DISTINCT FROM 'exact')  AS case_b_remaining,
      COUNT(*) FILTER (WHERE calculated_sqft > 0 AND price_per_sqft IS NULL
                        AND standard_status='Closed' AND close_price > 0)                       AS case_c_remaining
    FROM mls_listings
  `);
  console.log('  ', after.rows[0]);

  console.log('\n=== SANITY: absurd PSF check (< 200 or > 10000) — should be filtered by the 200<psf<10000 bound in analytics ===');
  const absurd = await pg.query(`
    SELECT
      COUNT(*) FILTER (WHERE price_per_sqft > 0 AND price_per_sqft < 200)      AS pps_lt_200,
      COUNT(*) FILTER (WHERE price_per_sqft > 10000)                            AS pps_gt_10k,
      COUNT(*) FILTER (WHERE price_per_sqft > 0)                                AS pps_populated
    FROM mls_listings
    WHERE standard_status = 'Closed'
  `);
  console.log('  ', absurd.rows[0]);

  await pg.end();
  console.log('\n=== DONE ===');
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
