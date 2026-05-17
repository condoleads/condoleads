#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const ROOT = path.join(__dirname, '..');

function readEnv() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return {};
  const o = {};
  for (const ln of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = ln.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) o[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return o;
}

// === A. Frontend entity pages — lead-write call hookups ===
console.log('\n=== A. Entity page lead-write hookups ===');
{
  const pages = [
    'app/[slug]/BuildingPage.tsx',
    'app/[slug]/BuildingPageContent.tsx',
    'app/[slug]/AreaPage.tsx',
    'app/[slug]/CommunityPage.tsx',
    'app/[slug]/MunicipalityPage.tsx',
    'app/[slug]/PropertyPageContent.tsx',
    'app/[slug]/DevelopmentPage.tsx',
    'app/comprehensive-site/toronto/[neighbourhood]/page.tsx',
  ];
  const endpoints = [
    '/api/walliam/contact',
    '/api/walliam/charlie/vip-request',
    '/api/walliam/estimator/vip-request',
    '/api/walliam/estimator/vip-questionnaire',
    '/api/charlie/lead',
    '/api/charlie/appointment',
    '/api/charlie/plan-email',
  ];
  const idFields = ['building_id','listing_id','area_id','municipality_id','community_id','neighbourhood_id'];
  for (const rel of pages) {
    const full = path.join(ROOT, rel);
    console.log('\n  ' + rel);
    if (!fs.existsSync(full)) { console.log('    NOT FOUND'); continue; }
    const text = fs.readFileSync(full, 'utf8');
    console.log('    size: ' + text.length + 'B');
    for (const ep of endpoints) {
      const n = (text.match(new RegExp(ep.replace(/\//g,'\\/'), 'g'))||[]).length;
      if (n>0) console.log('    POST -> ' + ep + ' (' + n + ')');
    }
    for (const f of idFields) {
      const n = (text.match(new RegExp('\\b' + f + '\\b','g'))||[]).length;
      if (n>0) console.log('    field: ' + f.padEnd(20) + ' ' + n);
    }
    // Look for an "id" prop or destructuring from page params
    for (const pat of ['building\\?\\.id','area\\?\\.id','community\\?\\.id','municipality\\?\\.id','neighbourhood\\?\\.id','listing\\?\\.id','\\bbuilding\\.id','\\barea\\.id','\\bcommunity\\.id','\\bmunicipality\\.id','\\blisting\\.id']) {
      const n = (text.match(new RegExp(pat,'g'))||[]).length;
      if (n>0) console.log('    ref:   ' + pat.replace(/\\\\/g,'\\').padEnd(20) + ' ' + n);
    }
  }
}

// === B. Charlie chat session state ===
console.log('\n=== B. Charlie chat session state — entity tracking ===');
{
  const candidates = [
    'app/api/walliam/charlie/session/route.ts',
    'app/api/charlie/session/route.ts',
  ];
  for (const rel of candidates) {
    const full = path.join(ROOT, rel);
    console.log('\n  ' + rel);
    if (!fs.existsSync(full)) { console.log('    NOT FOUND'); continue; }
    const text = fs.readFileSync(full, 'utf8');
    console.log('    size: ' + text.length + 'B');
    for (const f of ['current_page_type','current_page_id','building','area','community','municipality','neighbourhood','listing']) {
      const n = (text.match(new RegExp('\\b' + f + '\\b','g'))||[]).length;
      if (n>0) console.log('    ' + f.padEnd(20) + ' ' + n);
    }
  }
}

(async () => {
  const env = readEnv();
  const tries = ['DATABASE_URL','POSTGRES_URL','SUPABASE_DB_URL','POSTGRES_PRISMA_URL'];
  let dbUrl = null;
  for (const v of tries) if (env[v]) { dbUrl = env[v]; break; }
  if (!dbUrl) { console.log('\n  No DB connection — DB probes skipped'); return; }
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  // === C. Entity table schemas — id, name-ish, slug-ish ===
  console.log('\n=== C. Entity table schemas (id / name-ish / slug-ish columns) ===');
  const tables = ['buildings','mls_listings','treb_areas','municipalities','communities','neighbourhoods'];
  for (const t of tables) {
    const exists = await client.query(`SELECT to_regclass($1) AS rel`, ['public.' + t]);
    if (!exists.rows[0].rel) { console.log('  ' + t + ': TABLE DOES NOT EXIST'); continue; }
    const r = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1
        AND (column_name='id'
             OR column_name ILIKE '%name%'
             OR column_name ILIKE '%title%'
             OR column_name ILIKE '%slug%'
             OR column_name ILIKE '%address%'
             OR column_name ILIKE '%unparsedaddress%')
      ORDER BY ordinal_position
    `, [t]);
    console.log('  ' + t + ' (' + r.rows.length + ' relevant cols):');
    for (const x of r.rows) console.log('    ' + x.column_name.padEnd(35) + ' ' + x.data_type);
  }

  // === D. FK constraints from leads ===
  console.log('\n=== D. FK constraints from leads ===');
  const fk = await client.query(`
    SELECT tc.constraint_name, kcu.column_name AS leads_col,
           ccu.table_name AS target_tbl, ccu.column_name AS target_col
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name
    WHERE tc.table_schema='public' AND tc.table_name='leads' AND tc.constraint_type='FOREIGN KEY'
    ORDER BY kcu.column_name
  `);
  console.log('  Total FKs on leads: ' + fk.rows.length);
  for (const x of fk.rows) {
    console.log('    ' + x.leads_col.padEnd(22) + ' -> ' + (x.target_tbl + '.' + x.target_col).padEnd(40) + '  [' + x.constraint_name + ']');
  }

  await client.end();
})();