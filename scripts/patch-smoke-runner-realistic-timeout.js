// scripts/patch-smoke-runner-realistic-timeout.js
// W-TERRITORY/F-AREA-REROLL — make statement_timeout disable opt-in via env var.
//
// Why: after the F-AREA-REROLL set-based fix, the smoke should run with
// Supabase's default statement_timeout to actually verify the fix is real.
// Forcibly disabling timeout would mask any regression. The env var
// DISABLE_STATEMENT_TIMEOUT=1 keeps a safety net for future tests where a
// long timeout is genuinely required (e.g., race-safety harness).
//
// Pre-flight: timestamped backup. Fail-fast on anchor miss. Restore command
// printed if verification fails.
//
// USAGE: node scripts\patch-smoke-runner-realistic-timeout.js

const fs = require('fs');
const path = require('path');

const RUNNER = path.resolve('scripts/run-r-territory-t6-smoke.js');

if (!fs.existsSync(RUNNER)) {
  console.error('FAIL: runner not found at', RUNNER);
  process.exit(1);
}

const ts = (() => {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
})();
const backupPath = `${RUNNER}.backup_${ts}`;
fs.copyFileSync(RUNNER, backupPath);
console.log(`Backup written: ${path.basename(backupPath)} (${fs.statSync(backupPath).size} bytes)`);

const original = fs.readFileSync(RUNNER, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
console.log(`Detected line ending: ${eol === '\r\n' ? 'CRLF' : 'LF'}`);
console.log(`Original size: ${original.length} chars`);

// ─── Patch: turn forced timeout-disable into env-gated opt-in ────────────────
const oldLines = [
  "    // Disable statement_timeout for this session. Area-scope reroll in Test 4",
  "    // touches every mls_listings row in the area, which exceeds Supabase's",
  "    // default timeout. Session-scoped: cleared when client.end() runs.",
  "    // (Production behavior unaffected — this only applies to this runner.)",
  "    await client.query('SET statement_timeout = 0;');",
  "    console.log('statement_timeout disabled for this session.');",
];
const old_str = oldLines.join(eol);

const newLines = [
  "    // F-AREA-REROLL fix (2026-05-06): set-based reroll/distribute now",
  "    // completes within Supabase's default statement_timeout. Disable only",
  "    // when DISABLE_STATEMENT_TIMEOUT=1 in env (safety net for future tests",
  "    // like race-safety harness that need long-running operations).",
  "    if (process.env.DISABLE_STATEMENT_TIMEOUT === '1') {",
  "      await client.query('SET statement_timeout = 0;');",
  "      console.log('statement_timeout DISABLED (DISABLE_STATEMENT_TIMEOUT=1).');",
  "    } else {",
  "      console.log('statement_timeout at Supabase default — verifies F-AREA-REROLL fix.');",
  "    }",
];
const new_str = newLines.join(eol);

if (!original.includes(old_str)) {
  console.error('');
  console.error('FAIL: anchor not found. The runner may have already been patched, or');
  console.error('the file content differs from what was expected. Aborting without write.');
  console.error('');
  console.error('Restore: Copy-Item -LiteralPath "' + backupPath + '" -Destination "' + RUNNER + '" -Force');
  process.exit(1);
}

const working = original.replace(old_str, new_str);
fs.writeFileSync(RUNNER, working, 'utf8');
console.log(`Wrote ${RUNNER} (${working.length} chars, delta ${working.length - original.length >= 0 ? '+' : ''}${working.length - original.length})`);

// ─── Verification ────────────────────────────────────────────────────────────
const verify = fs.readFileSync(RUNNER, 'utf8');
const checks = [
  { label: 'env-var gate present',                     test: verify.includes("process.env.DISABLE_STATEMENT_TIMEOUT === '1'") },
  { label: 'realistic-timeout console message present',test: verify.includes('verifies F-AREA-REROLL fix') },
  { label: 'forced-disable-only block removed',        test: !verify.includes("    await client.query('SET statement_timeout = 0;');" + eol + "    console.log('statement_timeout disabled for this session.');") },
  { label: 'F-AREA-REROLL marker present',             test: verify.includes('F-AREA-REROLL fix') },
];

let allPass = true;
console.log('');
console.log('Verification:');
for (const c of checks) {
  const status = c.test ? '  PASS' : '  FAIL';
  console.log(`${status}  ${c.label}`);
  if (!c.test) allPass = false;
}

if (!allPass) {
  console.error('');
  console.error('VERIFICATION FAILED — restore from backup with:');
  console.error(`  Copy-Item -LiteralPath "${backupPath}" -Destination "${RUNNER}" -Force`);
  process.exit(1);
}

console.log('');
console.log('───────────────────────────────────────────────────────────────────────');
console.log('DONE. Smoke runner now uses default statement_timeout.');
console.log('');
console.log('NEXT: run the smoke under realistic timeout to verify F-AREA-REROLL fix:');
console.log('  node scripts\\run-r-territory-t6-smoke.js');
console.log('');
console.log('Expected: connection line, "statement_timeout at Supabase default —');
console.log('verifies F-AREA-REROLL fix.", body executes WITHOUT timeout, all 6 tests');
console.log('PASS. Test 4 (the one that timed out before the fix) should now complete');
console.log('in single-digit seconds via the set-based UPDATE.');
console.log('');
console.log('If Test 4 STILL times out: the set-based UPDATE itself is hitting the');
console.log('default timeout. Probable cause: missing index on mls_listings.area_id');
console.log('(or municipality_id / community_id) forcing a Seq Scan over 1.25M rows.');
console.log('Diagnostic: in Supabase SQL editor, run:');
console.log('  EXPLAIN ANALYZE SELECT reroll_listings_at_geo(');
console.log("    'area',");
console.log("    '03d4e133-d9f9-4a7e-ba9a-83e57269c1d4'::uuid,");
console.log("    'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'::uuid);");
console.log('───────────────────────────────────────────────────────────────────────');