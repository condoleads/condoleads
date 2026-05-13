// scripts/probe-t4a-recon.js
// Read-only recon probe for T4a (Admin UI at /admin-homes/territory).
// No writes. Maps the existing surface area Claude needs to read before
// designing the T4a page.

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

function walk(dir, accept) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Skip noise
      if (['node_modules', '.next', '.git', 'dist', 'build'].includes(e.name)) continue;
      out.push(...walk(full, accept));
    } else if (e.isFile() && accept(full)) {
      out.push(full);
    }
  }
  return out;
}

function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }

function header(title) {
  console.log('\n=== ' + title + ' ===');
}

// 1. /admin-homes structure — find pages and components related to territory
header('1a. All page.tsx / layout.tsx under app/admin-homes/');
const adminHomesPages = walk(path.join(ROOT, 'app', 'admin-homes'),
  f => /\/(page|layout)\.tsx?$/.test(f.split(path.sep).join('/'))
);
adminHomesPages.forEach(f => console.log('  ' + rel(f)));

header('1b. Components under app/admin-homes/ matching territory keywords');
const tsxFiles = walk(path.join(ROOT, 'app', 'admin-homes'), f => /\.tsx?$/.test(f));
const territoryKw = /\b(territory|tenant.?default|manager.?carv|agent.?assign|property.?access|geo.?assign|granular.?override|primary.?agent|apa[_\b])/i;
const territoryComponents = [];
for (const f of tsxFiles) {
  const txt = fs.readFileSync(f, 'utf8');
  if (territoryKw.test(txt) || /agent_property_access/.test(txt)) {
    const lines = txt.split('\n').length;
    territoryComponents.push({ file: rel(f), lines, hasAPA: /agent_property_access/.test(txt) });
  }
}
territoryComponents.forEach(c =>
  console.log('  ' + (c.hasAPA ? '[APA] ' : '      ') + c.file + '  (' + c.lines + ' lines)')
);
console.log('  -> total: ' + territoryComponents.length + ' files mention territory keywords');

// 2. API routes touching territory / apa
header('2a. API routes under app/api/walliam/ and app/api/admin-homes/');
const apiRoutes = [
  ...walk(path.join(ROOT, 'app', 'api', 'walliam'), f => /route\.tsx?$/.test(f)),
  ...walk(path.join(ROOT, 'app', 'api', 'admin-homes'), f => /route\.tsx?$/.test(f))
];
const territoryApiRoutes = [];
for (const f of apiRoutes) {
  const txt = fs.readFileSync(f, 'utf8');
  const writesAPA = /(insert|update|delete|upsert)[\s\S]{0,200}agent_property_access/i.test(txt) ||
                    /agent_property_access[\s\S]{0,200}(insert|update|delete|upsert)/i.test(txt);
  const readsAPA = /\bagent_property_access\b/.test(txt);
  const callsResolver = /resolve_(agent_for_context|geo_primary|display_agent)/.test(txt);
  if (writesAPA || readsAPA || callsResolver) {
    territoryApiRoutes.push({
      file: rel(f),
      writesAPA, readsAPA, callsResolver
    });
  }
}
territoryApiRoutes.forEach(r => {
  const tags = [];
  if (r.writesAPA) tags.push('WRITES-APA');
  if (r.readsAPA && !r.writesAPA) tags.push('READS-APA');
  if (r.callsResolver) tags.push('CALLS-RESOLVER');
  console.log('  [' + tags.join(',') + '] ' + r.file);
});
console.log('  -> total: ' + territoryApiRoutes.length + ' territory-touching API routes');

// 3. tenant_id derivation patterns
header('3. tenant_id derivation in API routes (sample first 3 territory routes)');
for (const r of territoryApiRoutes.slice(0, 3)) {
  const txt = fs.readFileSync(path.join(ROOT, r.file), 'utf8');
  console.log('\n  --- ' + r.file + ' ---');
  const lines = txt.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/tenant.?id|getTenantId|resolveTenant|\.tenant_id/.test(lines[i])) {
      console.log('    L' + (i + 1) + ': ' + lines[i].trim().slice(0, 140));
    }
  }
}

// 4. Audit log viewer patterns
header('4. Existing audit-log-viewer components (territory_assignment_changes / lead_ownership_changes / audit)');
const allTsx = [
  ...walk(path.join(ROOT, 'app'), f => /\.tsx?$/.test(f)),
  ...walk(path.join(ROOT, 'components'), f => /\.tsx?$/.test(f)),
  ...walk(path.join(ROOT, 'lib'), f => /\.tsx?$/.test(f))
];
const auditViewers = [];
for (const f of allTsx) {
  const txt = fs.readFileSync(f, 'utf8');
  if (/territory_assignment_changes|lead_ownership_changes/.test(txt)) {
    auditViewers.push({ file: rel(f), hasViewer: /(<table|<tr|<DataTable|map\(|grid)/i.test(txt) });
  }
}
auditViewers.forEach(v =>
  console.log('  ' + (v.hasViewer ? '[possible-viewer] ' : '                  ') + v.file)
);
if (auditViewers.length === 0) console.log('  (none found — audit-log viewer is greenfield for T4a)');

// 5. Section-component recon (the "4 currently-embedded section components")
header('5. Looking for the "4 embedded section components" referenced in T4a spec');
console.log('  Tracker says: tenant defaults, manager carving, agent assignment, granular overrides');
const candidatePatterns = [
  { pattern: /tenant.?default/i, label: 'tenant defaults' },
  { pattern: /manager.?carv|territory.?carv/i, label: 'manager carving' },
  { pattern: /agent.?assign(ment)?/i, label: 'agent assignment' },
  { pattern: /granular.?override|listing.?pin|building.?pin/i, label: 'granular overrides' }
];
for (const cp of candidatePatterns) {
  const matches = territoryComponents.filter(c => {
    const txt = fs.readFileSync(path.join(ROOT, c.file), 'utf8');
    return cp.pattern.test(txt);
  });
  console.log('  ' + cp.label + ': ' + matches.length + ' match(es)');
  matches.slice(0, 3).forEach(m => console.log('    -> ' + m.file));
}

console.log('\n=== Done. ===');