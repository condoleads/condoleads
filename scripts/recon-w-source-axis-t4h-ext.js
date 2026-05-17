#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function pad(n, w) { return n.toString().padStart(w); }

// ---- PROBE 1: full app/ route tree ----
console.log('\n=== PROBE 1: full app/ route tree (all page.tsx) ===');
function listRoutes(dir, relPath, depth, maxDepth, out) {
  if (depth > maxDepth) return;
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir).sort()) {
    if (item.startsWith('.')) continue;
    const full = path.join(dir, item);
    let st; try { st = fs.statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      listRoutes(full, relPath + '/' + item, depth + 1, maxDepth, out);
    } else if (item === 'page.tsx' || item === 'page.ts' || item === 'page.jsx') {
      out.push(relPath || '/');
    }
  }
}
const allRoutes = [];
listRoutes(path.join(ROOT, 'app'), '', 0, 6, allRoutes);
console.log('  Total page routes: ' + allRoutes.length);
for (const r of allRoutes) console.log('    ' + r);

// ---- PROBE 2: (comprehensive) full tree ----
console.log('\n=== PROBE 2: (comprehensive) route group tree ===');
const compDir = path.join(ROOT, 'app', '(comprehensive)');
if (!fs.existsSync(compDir)) {
  console.log('  (comprehensive) directory not present');
} else {
  function tree(dir, indent, depth, maxDepth) {
    if (depth > maxDepth) { console.log(indent + '...'); return; }
    for (const it of fs.readdirSync(dir).sort()) {
      if (it.startsWith('.')) continue;
      const full = path.join(dir, it);
      let st; try { st = fs.statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        console.log(indent + '[' + it + ']/');
        tree(full, indent + '  ', depth + 1, maxDepth);
      } else if (it.endsWith('.tsx') || it.endsWith('.ts')) {
        console.log(indent + it + ' (' + st.size + 'B)');
      }
    }
  }
  tree(compDir, '  ', 0, 5);
}

// ---- PROBE 3: leads list rendering site (admin-homes/leads dir) ----
console.log('\n=== PROBE 3: /admin-homes/leads rendering site ===');
const adminLeadsDir = path.join(ROOT, 'app', 'admin-homes', 'leads');
if (!fs.existsSync(adminLeadsDir)) {
  console.log('  Directory not found');
} else {
  function walk(d, p) {
    for (const it of fs.readdirSync(d).sort()) {
      const full = path.join(d, it);
      let st; try { st = fs.statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full, p + '/' + it);
      else console.log('  ' + p + '/' + it + '  (' + st.size + 'B)');
    }
  }
  walk(adminLeadsDir, '/admin-homes/leads');
}
const leadsPageFile = path.join(adminLeadsDir, 'page.tsx');
if (fs.existsSync(leadsPageFile)) {
  console.log('  --- page.tsx (first 100 lines) ---');
  const lines = fs.readFileSync(leadsPageFile, 'utf8').split('\n');
  for (let i = 0; i < Math.min(100, lines.length); i++) {
    console.log('  L' + pad(i+1, 4) + ': ' + lines[i]);
  }
  // Look for the main leads SELECT
  const text = lines.join('\n');
  console.log('  Entity-table mentions in page.tsx:');
  for (const t of ['buildings','mls_listings','treb_areas','municipalities','communities','neighbourhoods']) {
    const n = (text.match(new RegExp('\\b' + t + '\\b','g')) || []).length;
    console.log('    ' + t.padEnd(18) + ' ' + n);
  }
}

// ---- PROBE 4: 7 lead-write routes — what do they capture? ----
console.log('\n=== PROBE 4: lead-write route INSERT shapes ===');
const writeRoutes = [
  'app/api/walliam/charlie/vip-request/route.ts',
  'app/api/walliam/contact/route.ts',
  'app/api/walliam/estimator/vip-questionnaire/route.ts',
  'app/api/walliam/estimator/vip-request/route.ts',
  'app/api/charlie/appointment/route.ts',
  'app/api/charlie/lead/route.ts',
  'app/api/charlie/plan-email/route.ts',
];
for (const rel of writeRoutes) {
  const full = path.join(ROOT, rel);
  console.log('\n  --- ' + rel + ' ---');
  if (!fs.existsSync(full)) { console.log('    NOT FOUND'); continue; }
  const text = fs.readFileSync(full, 'utf8');
  console.log('    Size: ' + text.length + 'B, ' + text.split('\n').length + ' lines');

  const re = /\.from\(\s*['"`]leads['"`]\s*\)\s*\.insert\(\s*([\s\S]*?)\)\s*[\.;]/g;
  let m, n = 0;
  while ((m = re.exec(text)) !== null) {
    n++;
    console.log('    [insert leads #' + n + ']');
    console.log('    ' + m[1].slice(0, 1800).replace(/\n/g, '\n    '));
  }
  if (!n) console.log('    (no .from(leads).insert(...) literal block matched)');

  const fields = ['building_id','listing_id','area_id','municipality_id','community_id','neighbourhood_id','source_url','geo_name','lead_origin_route','referer','referrer','intent'];
  const found = fields.map(f => ({ f, n: (text.match(new RegExp('\\b'+f+'\\b','g'))||[]).length })).filter(x => x.n > 0);
  console.log('    Provenance-field mentions:');
  for (const x of found) console.log('      ' + x.f.padEnd(20) + ' ' + x.n);
}

// ---- PROBE 5: top-level dynamic slug routes (where listings might live) ----
console.log('\n=== PROBE 5: top-level [slug] / catch-all routes ===');
const appDir = path.join(ROOT, 'app');
const candidates = fs.readdirSync(appDir)
  .filter(d => d.startsWith('[') && d.endsWith(']'));
console.log('  Top-level dynamic segments: ' + candidates.length);
for (const c of candidates) {
  console.log('    ' + c);
  const cdir = path.join(appDir, c);
  for (const it of fs.readdirSync(cdir).sort()) {
    console.log('      ' + it);
  }
}