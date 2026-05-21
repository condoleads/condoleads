// scripts/_cleanup-scripts-dir.js
// Atomic cleanup of scripts/ directory.
// KEEP list explicit; everything else in scripts/ deletes.
// Dry-run by default; pass --apply to actually delete.

const fs = require('fs');
const path = require('path');

const KEEP = new Set([
  // Permanent runners (referenced by .github/workflows)
  'scripts/analytics-nightly.ts',
  'scripts/bulk-discover-assign.ts',
  'scripts/bulk-update-sqft.ts',
  'scripts/full-sync-homes.ts',
  'scripts/nightly-sync.ts',
  // Sync chain (imported by nightly-sync)
  'scripts/sync-homes-incremental.ts',
  'scripts/sync-buildings-incremental.ts',
  // lib/ (imported by sync + analytics)
  'scripts/lib/analytics-engine.ts',
  'scripts/lib/homes-save.ts',
  'scripts/lib/proptx-client.ts',
  'scripts/lib/supabase-client.ts',
  'scripts/lib/sync-logger.ts',
  // C12 aggregate regression + 13 per-phase siblings (spawned by C12)
  'scripts/test-c1-multitenant-regression.js',
  'scripts/test-c2-multitenant-regression.js',
  'scripts/test-c3-multitenant-regression.js',
  'scripts/test-c4-multitenant-regression.js',
  'scripts/test-c5-multitenant-regression.js',
  'scripts/test-c6-multitenant-regression.js',
  'scripts/test-c7-multitenant-regression.js',
  'scripts/test-c8a-multitenant-regression.js',
  'scripts/test-c8b-2-multitenant-regression.js',
  'scripts/test-c8f-multitenant-regression.js',
  'scripts/test-c9-multitenant-regression.js',
  'scripts/test-c10-multitenant-regression.js',
  'scripts/test-c11-multitenant-regression.js',
  'scripts/test-c12-multitenant-regression.js',
  // Canonical smoke gates
  'scripts/run-r-territory-t6-smoke.js',
  'scripts/run-w-leads-workbench-smoke.js',
  'scripts/smoke-t3b.js',
  'scripts/smoke-t3c.js',
  'scripts/smoke-w-credit-verify.js',
  'scripts/smoke-w-tenant-auth.js',
  'scripts/smoke-recipients-helper.ts',
  'scripts/r3-3-smoke-permissions.ts',
  'scripts/r4-2-smoke-rpcs.js',
  'scripts/r3-2-2-smoke-king-shah.js',
  // Documented testing procedures
  'scripts/seed-test-data.js',
  // Pre-existing untracked, in-progress per memory
  'scripts/run-r-territory-t6-followup-b-test-1d.js',
  // Self (the cleanup script itself)
  'scripts/_cleanup-scripts-dir.js',
  // Migration rollback SQL — retained as paired contract artifacts
  'scripts/20260510_t2a_leads_geo_columns_rollback.sql',
  'scripts/20260510_t2b_leads_performance_indexes_rollback.sql',
  'scripts/20260510_t2c_lead_origin_route_rollback.sql',
  'scripts/20260510_t2d_leads_check_constraints_rollback.sql',
  'scripts/20260510_t2e_vip_requests_tenant_scope_rollback.sql',
  'scripts/20260510_t2f_lead_email_recipients_log_rollback.sql',
  'scripts/20260510_t2g_resolve_agent_tenant_filter_rollback.sql',
]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const scriptsRoot = path.resolve(__dirname);
const projectRoot = path.dirname(scriptsRoot);

const all = walk(scriptsRoot).map(f =>
  path.relative(projectRoot, f).replace(/\\/g, '/')
);
const toKeep = all.filter(f => KEEP.has(f));
const toDelete = all.filter(f => !KEEP.has(f));

console.log('Total files in scripts/:', all.length);
console.log('Keep:                    ', toKeep.length);
console.log('Delete:                  ', toDelete.length);
console.log('');

// Sanity guards
if (toKeep.length < 35) {
  console.error('REFUSING: keep count', toKeep.length, '< 35. Aborting.');
  process.exit(1);
}
const expectedKeepers = [
  'scripts/test-c12-multitenant-regression.js',
  'scripts/nightly-sync.ts',
  'scripts/lib/supabase-client.ts',
  'scripts/run-r-territory-t6-smoke.js',
];
for (const k of expectedKeepers) {
  if (!toKeep.includes(k)) {
    console.error('REFUSING: expected keeper missing from disk:', k);
    process.exit(1);
  }
}

// Audit log
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const auditPath = path.join(scriptsRoot, '_cleanup-audit-' + ts + '.txt');
const audit = [
  'Cleanup audit ' + ts,
  '',
  'KEEP (' + toKeep.length + '):',
  ...toKeep.sort().map(f => '  ' + f),
  '',
  'DELETE (' + toDelete.length + '):',
  ...toDelete.sort().map(f => '  ' + f),
  '',
].join('\n');
fs.writeFileSync(auditPath, audit, 'utf8');
console.log('Audit written:', path.relative(projectRoot, auditPath));

// Dry-run mode
const APPLY = process.argv.includes('--apply');
if (!APPLY) {
  console.log('');
  console.log('DRY RUN. Re-run with --apply to delete.');
  process.exit(0);
}

// Delete files
let deleted = 0;
for (const f of toDelete) {
  const full = path.resolve(projectRoot, f);
  try {
    fs.unlinkSync(full);
    deleted++;
  } catch (e) {
    console.error('FAILED to delete:', f, '-', e.message);
  }
}

// Remove now-empty directories under scripts/
function removeEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const sub = path.join(dir, entry.name);
      removeEmptyDirs(sub);
      try {
        if (fs.readdirSync(sub).length === 0) fs.rmdirSync(sub);
      } catch {}
    }
  }
}
removeEmptyDirs(scriptsRoot);

console.log('');
console.log('Deleted:', deleted, 'of', toDelete.length, 'files.');
console.log('Done.');