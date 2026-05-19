// scripts/run-w6c-dnc-smoke.js
// W6c + DNC schema-level smoke. Transactional - ROLLBACKs all writes.
// Verifies:
//   1. leads_status_check contains do_not_contact
//   2. UPDATE leads SET status='do_not_contact' succeeds for a real test lead
//   3. INSERT lead_admin_actions with action_type='email_blocked_dnc' succeeds
//   4. ROLLBACK leaves the database unchanged

const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9';
const SMOKE_LEAD_ID    = '5477a25f-31c3-48ed-a428-eabbf585171f';
const KING_SHAH_AGENT  = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe';

async function main() {
  const connStr = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connStr) { console.error('ABORT: no DB URL in .env.local'); process.exit(1); }
  const client = new Client({ connectionString: connStr });
  await client.connect();

  const results = [];
  function assert(label, cond, detail) {
    results.push({ label, ok: !!cond, detail });
    console.log((cond ? 'PASS' : 'FAIL') + ' - ' + label + (detail ? ' [' + detail + ']' : ''));
  }

  try {
    await client.query('BEGIN');

    // 1. CHECK constraint includes do_not_contact
    const cdef = await client.query(
      `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint
       WHERE conrelid='public.leads'::regclass AND conname='leads_status_check'`
    );
    const def = cdef.rows[0]?.def || '';
    assert('leads_status_check contains do_not_contact', def.includes("'do_not_contact'"), def);

    // 2. UPDATE the smoke lead to do_not_contact
    const beforeRow = await client.query('SELECT id, tenant_id, status FROM leads WHERE id=$1', [SMOKE_LEAD_ID]);
    assert('smoke lead exists', beforeRow.rows.length === 1, JSON.stringify(beforeRow.rows[0] || null));
    assert('smoke lead in WALLiam tenant', beforeRow.rows[0]?.tenant_id === WALLIAM_TENANT_ID);
    const originalStatus = beforeRow.rows[0]?.status;

    const upd = await client.query(
      `UPDATE leads SET status='do_not_contact' WHERE id=$1 RETURNING status`,
      [SMOKE_LEAD_ID]
    );
    assert('UPDATE to do_not_contact succeeds', upd.rows[0]?.status === 'do_not_contact');

    // 3. INSERT a lead_admin_actions row simulating the email-blocked-dnc audit write
    const ins = await client.query(
      `INSERT INTO lead_admin_actions
        (tenant_id, lead_id, actor_agent_id, actor_role, action_type, target_field, before_value, after_value, notes)
       VALUES ($1, $2, $3, 'platform_admin', 'email_blocked_dnc', NULL, NULL,
               $4::jsonb,
               'smoke test - outbound email blocked by DNC status')
       RETURNING id, action_type`,
      [
        WALLIAM_TENANT_ID,
        SMOKE_LEAD_ID,
        KING_SHAH_AGENT,
        JSON.stringify({ attempted_to: 'smoke@example.invalid', reason: 'lead status is do_not_contact' }),
      ]
    );
    assert('INSERT lead_admin_actions with action_type=email_blocked_dnc succeeds',
      ins.rows[0]?.action_type === 'email_blocked_dnc',
      'inserted row id=' + (ins.rows[0]?.id || 'null'));

    // 4. SELECT back to confirm
    const back = await client.query(
      `SELECT id, action_type, after_value FROM lead_admin_actions WHERE id=$1`,
      [ins.rows[0]?.id]
    );
    assert('audit row readable + JSONB after_value present',
      back.rows[0]?.after_value?.reason === 'lead status is do_not_contact',
      JSON.stringify(back.rows[0]?.after_value || null));

    // Document the pre-rollback state we'll be reverting
    console.log('');
    console.log('Original smoke-lead status (will be restored by ROLLBACK): ' + originalStatus);

    await client.query('ROLLBACK');
    console.log('ROLLBACK complete.');

    // Verify the rollback actually reverted
    const afterRollback = await client.query('SELECT status FROM leads WHERE id=$1', [SMOKE_LEAD_ID]);
    assert('post-ROLLBACK lead.status reverted to original',
      afterRollback.rows[0]?.status === originalStatus,
      'now: ' + afterRollback.rows[0]?.status);

    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    console.log('');
    console.log('Summary: ' + passed + ' PASS / ' + failed + ' FAIL of ' + results.length + ' assertions');
    if (failed > 0) process.exit(1);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('SMOKE ERROR: ' + e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();