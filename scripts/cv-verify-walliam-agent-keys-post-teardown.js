#!/usr/bin/env node
// Read-only post-teardown verification: the 3 WALLiam agents' AI estimator
// wiring is persistent launch config and must survive fixture teardown.
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const AGENTS = [
  { spec: 'King Shah',    id: 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe' },
  { spec: 'Neo Smith',    id: 'f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f' },
  { spec: 'WALLiam seed', id: 'cf002201-9b11-4c0f-a1b3-65ed702c9976' },
];

function fp(s) {
  if (!s) return '(NULL)';
  if (s.length < 12) return '(short)';
  return s.slice(0, 6) + '...' + s.slice(-4) + '  (len ' + s.length + ')';
}

(async () => {
  const expectedKey = process.env.ANTHROPIC_API_KEY;
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query('BEGIN READ ONLY');
  let rows;
  try {
    const r = await c.query(
      `SELECT id, full_name, ai_estimator_enabled, anthropic_api_key, updated_at
         FROM agents WHERE id = ANY($1) ORDER BY full_name`,
      [AGENTS.map(a => a.id)]);
    rows = r.rows;
  } finally {
    await c.query('ROLLBACK').catch(()=>{});
    await c.end().catch(()=>{});
  }

  console.log('=== Post-teardown verification: 3 WALLiam agents ===');
  let allOK = true;
  for (const p of rows) {
    const flagOK = p.ai_estimator_enabled === true;
    const keyOK = p.anthropic_api_key === expectedKey;
    if (!flagOK || !keyOK) allOK = false;
    console.log('  ' + p.full_name);
    console.log('    ai_estimator_enabled : ' + p.ai_estimator_enabled + (flagOK ? '  OK' : '  CHANGED'));
    console.log('    anthropic_api_key fp : ' + fp(p.anthropic_api_key));
    console.log('    matches .env key     : ' + (keyOK ? 'YES' : 'NO'));
    console.log('    updated_at           : ' + p.updated_at);
  }
  console.log('');
  console.log(allOK
    ? 'PASS -- all 3 WALLiam agents still have ai_estimator_enabled=TRUE + matching real key (launch config survived teardown).'
    : 'FAIL -- one or more WALLiam agents lost their AI estimator wiring during teardown.');
  process.exit(allOK ? 0 : 1);
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
