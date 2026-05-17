#!/usr/bin/env node
/**
 * recon-w-source-axis-t4h.js
 *
 * Recon for the T4-h sub-phase:
 *   1. expandedLead dead-code block extent (file)
 *   2. URL route inventory — entity link targets (file)
 *   3. Leads list + workbench API SELECT coverage (file)
 *   4. DB column population stats + route × entity matrix + recent sample
 *
 * Read-only. Does NOT modify any file or DB row.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const pad = (n, w) => n.toString().padStart(w);

function readEnv() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const ln of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = ln.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

// ---- PROBE 1: expandedLead block extent ----
console.log('\n=== PROBE 1: expandedLead dead-code block extent ===');
{
  const p = path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx');
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const opener = lines.findIndex((l, i) => i > 690 && l.includes('expandedLead === lead.id'));
  if (opener === -1) {
    console.log('  Opener not found — expected near L693');
  } else {
    const commentLn = (opener > 0 && lines[opener - 1].includes('Plan data panel')) ? opener - 1 : opener;
    console.log('  useState at L142 (known)');
    console.log('  Block opener (Plan data panel comment): L' + (commentLn + 1));
    let depth = 0, started = false, endLn = -1;
    for (let i = opener; i < lines.length; i++) {
      for (let c = 0; c < lines[i].length; c++) {
        const ch = lines[i][c];
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') {
          depth--;
          if (started && depth === 0) { endLn = i; break; }
        }
      }
      if (endLn !== -1) break;
    }
    if (endLn === -1) {
      console.log('  Auto-detection failed; dumping 80 lines from opener for manual review:');
      for (let i = opener; i < Math.min(opener + 80, lines.length); i++) {
        console.log('  L' + pad(i + 1, 4) + ': ' + lines[i]);
      }
    } else {
      console.log('  Block close: L' + (endLn + 1));
      console.log('  Block size: ' + (endLn - commentLn + 1) + ' lines');
      console.log('  --- Block dump ---');
      for (let i = commentLn; i <= endLn; i++) {
        console.log('  L' + pad(i + 1, 4) + ': ' + lines[i]);
      }
    }
  }
}

// ---- PROBE 2: URL route inventory ----
console.log('\n=== PROBE 2: URL route inventory (entity link targets) ===');
{
  const appDir = path.join(ROOT, 'app');
  const candidates = [
    'buildings', 'building', 'condos', 'condo',
    'listings', 'listing', 'properties', 'property',
    'areas', 'area', 'municipalities', 'municipality',
    'communities', 'community', 'neighbourhoods', 'neighbourhood',
  ];
  function walkPages(dir, prefix, out) {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      const st = fs.statSync(full);
      if (st.isDirectory()) walkPages(full, prefix + '/' + item, out);
      else if (item === 'page.tsx' || item === 'page.ts' || item === 'page.jsx') {
        out.push(prefix || '/');
      }
    }
  }
  let any = false;
  for (const c of candidates) {
    const p = path.join(appDir, c);
    if (fs.existsSync(p)) {
      any = true;
      const out = [];
      walkPages(p, '/' + c, out);
      console.log('  /' + c + ': ' + out.length + ' route file(s)');
      for (const r of out) console.log('    ' + r);
    }
  }
  // Route groups
  const groups = fs.readdirSync(appDir).filter(d => d.startsWith('(') && d.endsWith(')'));
  if (groups.length) {
    console.log('  Route groups present:');
    for (const g of groups) {
      console.log('    ' + g);
      const gp = path.join(appDir, g);
      for (const sub of fs.readdirSync(gp)) {
        const subp = path.join(gp, sub);
        if (!fs.statSync(subp).isDirectory()) continue;
        if (candidates.includes(sub)) {
          const out = [];
          walkPages(subp, '/' + sub, out);
          console.log('      ' + sub + ' (in ' + g + ') -> ' + out.length + ' route(s)');
          for (const r of out) console.log('        ' + r);
        } else {
          console.log('      ' + sub);
        }
      }
    }
  }
  if (!any && !groups.length) console.log('  No matching route directories found');
}

// ---- PROBE 3: API SELECT coverage ----
console.log('\n=== PROBE 3: Leads list + workbench API SELECT coverage ===');
{
  const targets = [
    ['leads list', path.join(ROOT, 'app', 'api', 'admin-homes', 'leads', 'route.ts')],
    ['workbench',  path.join(ROOT, 'app', 'api', 'admin-homes', 'leads', '[id]', 'route.ts')],
  ];
  for (const [label, p] of targets) {
    console.log('  --- ' + label + ': ' + path.relative(ROOT, p) + ' ---');
    if (!fs.existsSync(p)) { console.log('    NOT FOUND'); continue; }
    const text = fs.readFileSync(p, 'utf8');
    console.log('    Size: ' + text.length + ' bytes, ' + text.split('\n').length + ' lines');

    const selRe = /\.select\(\s*([`'"])([\s\S]*?)\1\s*\)/g;
    let m, n = 0;
    while ((m = selRe.exec(text)) !== null) {
      n++;
      console.log('    [.select() #' + n + ']');
      console.log('    ' + m[2].slice(0, 1500).replace(/\n/g, '\n    '));
      console.log('');
    }
    if (!n) console.log('    No .select() literal blocks found (may use builder pattern)');

    const entityTables = ['buildings', 'mls_listings', 'treb_areas', 'municipalities', 'communities', 'neighbourhoods'];
    console.log('    Entity-table mentions in file:');
    for (const t of entityTables) {
      const c = (text.match(new RegExp('\\b' + t + '\\b', 'g')) || []).length;
      console.log('      ' + t.padEnd(18) + ' ' + c);
    }
  }
}

// ---- PROBE 4: DB stats ----
(async () => {
  console.log('\n=== PROBE 4: DB column population + route × entity matrix ===');
  const env = readEnv();
  const tries = ['DATABASE_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL', 'POSTGRES_PRISMA_URL'];
  let dbUrl = null, used = null;
  for (const v of tries) if (env[v]) { dbUrl = env[v]; used = v; break; }
  if (!dbUrl) { console.log('  No DB connection string in .env.local — skipping'); return; }
  console.log('  Using ' + used);

  const client = new Client({ connectionString: dbUrl });
  try { await client.connect(); }
  catch (e) { console.log('  DB connect failed: ' + e.message); return; }

  try {
    const r = await client.query(`
      SELECT
        COUNT(*)::int                    AS total,
        COUNT(source_url)::int           AS w_source_url,
        COUNT(building_id)::int          AS w_building_id,
        COUNT(listing_id)::int           AS w_listing_id,
        COUNT(area_id)::int              AS w_area_id,
        COUNT(municipality_id)::int      AS w_muni_id,
        COUNT(community_id)::int         AS w_community_id,
        COUNT(neighbourhood_id)::int     AS w_neigh_id,
        COUNT(intent)::int               AS w_intent,
        COUNT(geo_name)::int             AS w_geo_name
      FROM leads
    `);
    const row = r.rows[0];
    const tot = row.total;
    console.log('  Column population (' + tot + ' total leads):');
    for (const k of Object.keys(row)) {
      if (k === 'total') continue;
      const n = row[k];
      const pct = tot > 0 ? ((n / tot) * 100).toFixed(1) + '%' : 'n/a';
      console.log('    ' + k.padEnd(20) + ' ' + pad(n, 5) + '  ' + pct);
    }
  } catch (e) { console.log('  population query failed: ' + e.message); }

  try {
    const r = await client.query(`
      SELECT
        COALESCE(lead_origin_route, '(null)') AS route,
        COUNT(*) FILTER (WHERE building_id      IS NOT NULL)::int AS bldg,
        COUNT(*) FILTER (WHERE listing_id       IS NOT NULL)::int AS list,
        COUNT(*) FILTER (WHERE area_id          IS NOT NULL)::int AS area,
        COUNT(*) FILTER (WHERE municipality_id  IS NOT NULL)::int AS muni,
        COUNT(*) FILTER (WHERE community_id     IS NOT NULL)::int AS comm,
        COUNT(*) FILTER (WHERE neighbourhood_id IS NOT NULL)::int AS neigh,
        COUNT(*) FILTER (WHERE source_url       IS NOT NULL)::int AS w_url,
        COUNT(*)::int                                              AS total
      FROM leads
      GROUP BY lead_origin_route
      ORDER BY total DESC
    `);
    console.log('');
    console.log('  lead_origin_route × entity-ID coverage:');
    console.log('    route                     bldg  list  area  muni  comm  neigh  url  total');
    for (const x of r.rows) {
      console.log('    ' + x.route.padEnd(25) +
        ' ' + pad(x.bldg, 4) +
        '  ' + pad(x.list, 4) +
        '  ' + pad(x.area, 4) +
        '  ' + pad(x.muni, 4) +
        '  ' + pad(x.comm, 4) +
        '  ' + pad(x.neigh, 5) +
        '  ' + pad(x.w_url, 3) +
        '  ' + pad(x.total, 5));
    }
  } catch (e) { console.log('  route × entity matrix failed: ' + e.message); }

  try {
    const r = await client.query(`
      SELECT created_at::text AS ts, lead_origin_route AS route, intent, geo_name,
             building_id IS NOT NULL AS bb,
             listing_id  IS NOT NULL AS ll,
             area_id     IS NOT NULL AS aa,
             municipality_id  IS NOT NULL AS mm,
             community_id    IS NOT NULL AS cc,
             neighbourhood_id IS NOT NULL AS nn,
             LEFT(source_url, 90) AS url
      FROM leads
      ORDER BY created_at DESC
      LIMIT 10
    `);
    console.log('');
    console.log('  10 most recent leads (flags: B/L/A/M/C/N = building/listing/area/muni/community/neighbourhood):');
    for (const x of r.rows) {
      const flags = (x.bb ? 'B' : '-') + (x.ll ? 'L' : '-') + (x.aa ? 'A' : '-') +
                    (x.mm ? 'M' : '-') + (x.cc ? 'C' : '-') + (x.nn ? 'N' : '-');
      console.log('    ' + x.ts.slice(0, 19) +
                  '  route=' + (x.route || '-').padEnd(20) +
                  ' intent=' + (x.intent || '-').padEnd(8) +
                  ' flags=' + flags);
      console.log('      url:      ' + (x.url || '(null)'));
      console.log('      geo_name: ' + (x.geo_name || '(null)'));
    }
  } catch (e) { console.log('  Recent leads query failed: ' + e.message); }

  await client.end();
})();