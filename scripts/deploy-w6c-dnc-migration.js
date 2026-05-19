// scripts/deploy-w6c-dnc-migration.js
// W6c-DNC migration runner with:
//   - idempotency (no-op if already migrated)
//   - lead_admin_actions.action_type CHECK probe (clean abort if it exists and needs extension)
//   - pre-migration snapshot for rollback
//   - transactional apply with rollback on error
//   - post-migration verification

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const MIGRATION_PATH = path.join(__dirname, '..', 'supabase', 'migrations', '20260518_w6c_a_dnc_status_check.sql');

async function main() {
  const connStr = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connStr) {
    console.error('ABORT: neither DIRECT_URL nor DATABASE_URL set in .env.local');
    process.exit(1);
  }
  const client = new Client({ connectionString: connStr });
  await client.connect();

  try {
    console.log('[1/5] Snapshotting current leads_status_check definition...');
    const before = await client.query(
      `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint
       WHERE conrelid='public.leads'::regclass AND conname='leads_status_check'`
    );
    if (before.rows.length === 0) {
      throw new Error('leads_status_check not found - refusing to proceed (unexpected schema state)');
    }
    const beforeDef = before.rows[0].def;
    console.log('  before: ' + beforeDef);
    if (beforeDef.includes("'do_not_contact'")) {
      console.log('  ALREADY MIGRATED. do_not_contact already in CHECK. Exiting clean.');
      return;
    }

    console.log('[2/5] Probing lead_admin_actions for CHECK on action_type...');
    const aaCheck = await client.query(
      `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
       WHERE conrelid='public.lead_admin_actions'::regclass AND contype='c'`
    );
    const actionTypeCheck = aaCheck.rows.find((r) => r.def.includes('action_type'));
    if (actionTypeCheck) {
      console.log('  Found CHECK: ' + actionTypeCheck.def);
      if (!actionTypeCheck.def.includes("'email_blocked_dnc'")) {
        console.error('');
        console.error('ABORT: lead_admin_actions.' + actionTypeCheck.conname);
        console.error('       has a CHECK on action_type that does NOT include email_blocked_dnc.');
        console.error('       Migration must be extended. Paste this output back and request');
        console.error('       an updated migration that also adds email_blocked_dnc to this CHECK.');
        process.exit(2);
      }
      console.log('  email_blocked_dnc already permitted. Proceeding.');
    } else {
      console.log('  No CHECK on action_type. Free-text column. Proceeding.');
    }

    console.log('[3/5] Applying migration in transaction...');
    await client.query('BEGIN');
    try {
      const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
      await client.query(sql);
      const after = await client.query(
        `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint
         WHERE conrelid='public.leads'::regclass AND conname='leads_status_check'`
      );
      const afterDef = after.rows[0].def;
      console.log('  after:  ' + afterDef);
      if (!afterDef.includes("'do_not_contact'")) {
        throw new Error('Post-migration verification failed: do_not_contact not in new CHECK');
      }
      await client.query('COMMIT');
      console.log('[4/5] Committed.');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('[4/5] ROLLED BACK: ' + e.message);
      throw e;
    }

    console.log('');
    console.log('[5/5] Rollback snapshot (save this if you ever need to revert):');
    console.log('  ALTER TABLE public.leads DROP CONSTRAINT leads_status_check;');
    console.log('  ALTER TABLE public.leads ADD CONSTRAINT leads_status_check ' + beforeDef + ';');
    console.log('');
    console.log('DONE.');
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });