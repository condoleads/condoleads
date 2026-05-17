#!/usr/bin/env node
/**
 * test-w-source-axis-h3-extract-entity-ids.js
 *
 * Unit tests for lib/admin-homes/extract-entity-ids.ts (T4-h h.3).
 * Compiles via tsc to temp dir, requires compiled JS, runs tests,
 * cleans up, exits non-zero on any failure. No DB, no server.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const HELPER_TS = path.join(ROOT, 'lib', 'admin-homes', 'extract-entity-ids.ts');
const TMP_DIR = path.join(ROOT, 'scripts', 'tmp-h3-test');
const COMPILED = path.join(TMP_DIR, 'extract-entity-ids.js');

if (!fs.existsSync(HELPER_TS)) {
  console.error('MISSING: ' + path.relative(ROOT, HELPER_TS));
  process.exit(1);
}

if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

console.log('Compiling helper via tsc...');
try {
  execSync(
    'npx tsc --target ES2020 --module commonjs --esModuleInterop --strict ' +
    '--outDir "' + TMP_DIR + '" "' + HELPER_TS + '"',
    { cwd: ROOT, stdio: 'pipe' }
  );
} catch (e) {
  console.error('TSC COMPILE FAILED:');
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  process.exit(1);
}
if (!fs.existsSync(COMPILED)) {
  console.error('COMPILED OUTPUT MISSING: ' + path.relative(ROOT, COMPILED));
  process.exit(1);
}
console.log('Compiled OK: ' + path.relative(ROOT, COMPILED));
console.log('');

const { entityIdsFromBody, entityIdsFromSession, entityIdsFromBodyAndSession } = require(COMPILED);

const NULL_IDS = {
  building_id: null, listing_id: null, area_id: null,
  municipality_id: null, community_id: null, neighbourhood_id: null,
};

let total = 0, failed = 0;
const failures = [];

function test(name, fn) {
  total++;
  try { fn(); console.log('  PASS  ' + name); }
  catch (e) {
    failed++;
    failures.push({ name, err: e.message });
    console.log('  FAIL  ' + name);
    const firstLine = String(e.message).split('\n')[0];
    console.log('        ' + firstLine);
  }
}

console.log('[ entityIdsFromBody ]');
test('null body -> all nulls', () => {
  assert.deepStrictEqual(entityIdsFromBody(null), NULL_IDS);
});
test('undefined body -> all nulls', () => {
  assert.deepStrictEqual(entityIdsFromBody(undefined), NULL_IDS);
});
test('non-object body (string) -> all nulls', () => {
  assert.deepStrictEqual(entityIdsFromBody('not-an-object'), NULL_IDS);
});
test('empty object -> all nulls', () => {
  assert.deepStrictEqual(entityIdsFromBody({}), NULL_IDS);
});
test('all 6 ID strings map correctly', () => {
  const body = {
    building_id: 'B1', listing_id: 'L1', area_id: 'A1',
    municipality_id: 'M1', community_id: 'C1', neighbourhood_id: 'N1',
  };
  assert.deepStrictEqual(entityIdsFromBody(body), body);
});
test('empty strings become null', () => {
  const r = entityIdsFromBody({ building_id: '', listing_id: 'L1' });
  assert.deepStrictEqual(r, { ...NULL_IDS, listing_id: 'L1' });
});
test('number values become null (string-only)', () => {
  assert.deepStrictEqual(entityIdsFromBody({ building_id: 123 }), NULL_IDS);
});
test('partial body — only one field present', () => {
  assert.deepStrictEqual(entityIdsFromBody({ neighbourhood_id: 'N1' }), { ...NULL_IDS, neighbourhood_id: 'N1' });
});

console.log('');
console.log('[ entityIdsFromSession ]');
test('null session -> all nulls', () => {
  assert.deepStrictEqual(entityIdsFromSession(null), NULL_IDS);
});
test('session without current_page_id -> all nulls', () => {
  assert.deepStrictEqual(entityIdsFromSession({ current_page_type: 'building' }), NULL_IDS);
});
test('session without current_page_type -> all nulls', () => {
  assert.deepStrictEqual(entityIdsFromSession({ current_page_id: 'X' }), NULL_IDS);
});
test('current_page_type=building -> building_id', () => {
  const r = entityIdsFromSession({ current_page_type: 'building', current_page_id: 'B1' });
  assert.deepStrictEqual(r, { ...NULL_IDS, building_id: 'B1' });
});
test('current_page_type=listing -> listing_id', () => {
  const r = entityIdsFromSession({ current_page_type: 'listing', current_page_id: 'L1' });
  assert.deepStrictEqual(r, { ...NULL_IDS, listing_id: 'L1' });
});
test('current_page_type=property -> listing_id (synonym)', () => {
  const r = entityIdsFromSession({ current_page_type: 'property', current_page_id: 'L1' });
  assert.deepStrictEqual(r, { ...NULL_IDS, listing_id: 'L1' });
});
test('current_page_type=area -> area_id', () => {
  const r = entityIdsFromSession({ current_page_type: 'area', current_page_id: 'A1' });
  assert.deepStrictEqual(r, { ...NULL_IDS, area_id: 'A1' });
});
test('current_page_type=municipality -> municipality_id', () => {
  const r = entityIdsFromSession({ current_page_type: 'municipality', current_page_id: 'M1' });
  assert.deepStrictEqual(r, { ...NULL_IDS, municipality_id: 'M1' });
});
test('current_page_type=community -> community_id', () => {
  const r = entityIdsFromSession({ current_page_type: 'community', current_page_id: 'C1' });
  assert.deepStrictEqual(r, { ...NULL_IDS, community_id: 'C1' });
});
test('current_page_type=neighbourhood -> neighbourhood_id', () => {
  const r = entityIdsFromSession({ current_page_type: 'neighbourhood', current_page_id: 'N1' });
  assert.deepStrictEqual(r, { ...NULL_IDS, neighbourhood_id: 'N1' });
});
test('unknown current_page_type -> all nulls', () => {
  const r = entityIdsFromSession({ current_page_type: 'agent', current_page_id: 'X' });
  assert.deepStrictEqual(r, NULL_IDS);
});
test('empty current_page_id -> all nulls', () => {
  const r = entityIdsFromSession({ current_page_type: 'building', current_page_id: '' });
  assert.deepStrictEqual(r, NULL_IDS);
});

console.log('');
console.log('[ entityIdsFromBodyAndSession ]');
test('both null -> all nulls', () => {
  assert.deepStrictEqual(entityIdsFromBodyAndSession(null, null), NULL_IDS);
});
test('body wins when both provide same field', () => {
  const r = entityIdsFromBodyAndSession(
    { building_id: 'BODY' },
    { current_page_type: 'building', current_page_id: 'SESSION' }
  );
  assert.strictEqual(r.building_id, 'BODY');
});
test('session fills when body has no value', () => {
  const r = entityIdsFromBodyAndSession(
    {},
    { current_page_type: 'listing', current_page_id: 'L1' }
  );
  assert.strictEqual(r.listing_id, 'L1');
});
test('body fills when session is null', () => {
  const r = entityIdsFromBodyAndSession({ area_id: 'A1' }, null);
  assert.strictEqual(r.area_id, 'A1');
});
test('mixed sources populate different fields', () => {
  const r = entityIdsFromBodyAndSession(
    { building_id: 'B1' },
    { current_page_type: 'listing', current_page_id: 'L1' }
  );
  assert.strictEqual(r.building_id, 'B1');
  assert.strictEqual(r.listing_id, 'L1');
});

console.log('');
console.log('========================================');
console.log('Total: ' + total + ' tests, ' + (total - failed) + ' PASS, ' + failed + ' FAIL');
if (failed > 0) {
  console.log('');
  console.log('Failure detail:');
  for (const f of failures) {
    console.log('  - ' + f.name);
    console.log('    ' + f.err);
  }
}

try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); }
catch (e) { /* best effort */ }

if (failed > 0) process.exit(1);
process.exit(0);