// scripts/probe-t4a-files.js
// Dumps the content of files identified as territory-touching, plus their
// imports' targets, so T4a planning rests on actual code shape.

const fs = require('fs');
const path = require('path');

const PRIMARY = [
  'app/admin-homes/agents/page.tsx',
  'app/admin-homes/agents/[id]/page.tsx',
  'app/api/admin-homes/agents/[id]/geo/route.ts',
  'app/admin-homes/tenants/[id]/page.tsx'
];

function dump(filePath) {
  const full = path.join(process.cwd(), filePath);
  if (!fs.existsSync(full)) {
    console.log('=== ' + filePath + ' ===');
    console.log('  NOT FOUND');
    console.log('');
    return null;
  }
  const txt = fs.readFileSync(full, 'utf8');
  console.log('=== ' + filePath + ' (' + txt.length + ' chars, ' + txt.split('\n').length + ' lines) ===');
  console.log(txt);
  console.log('');
  console.log('=== END ' + filePath + ' ===');
  console.log('');
  console.log('');
  return txt;
}

const dumped = {};
for (const f of PRIMARY) {
  dumped[f] = dump(f);
}

// Find local imports from the dumped files and surface their paths
console.log('=== Local imports referenced by dumped files ===');
const importRegex = /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
const localImports = new Set();
for (const f of PRIMARY) {
  if (!dumped[f]) continue;
  let m;
  importRegex.lastIndex = 0;
  while ((m = importRegex.exec(dumped[f])) !== null) {
    const spec = m[1];
    if (spec.startsWith('.') || spec.startsWith('@/')) {
      localImports.add(spec + '   <- in ' + f);
    }
  }
}
[...localImports].sort().forEach(s => console.log('  ' + s));

// Look for any AgentGeo / TerritorySection / AgentTerritory component file
console.log('\n=== Searching components/ for territory-related files ===');
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.next', '.git', 'dist', 'build'].includes(e.name)) continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}
const componentDirs = ['components', 'lib'];
for (const d of componentDirs) {
  const files = walk(path.join(process.cwd(), d));
  for (const f of files) {
    const txt = fs.readFileSync(f, 'utf8');
    if (/agent_property_access|AgentGeo|TerritorySection|AgentTerritory|GeoAssignment/i.test(txt)) {
      const rel = path.relative(process.cwd(), f).split(path.sep).join('/');
      console.log('  ' + rel + '  (' + txt.split('\n').length + ' lines)');
    }
  }
}