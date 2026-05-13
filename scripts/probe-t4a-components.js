// scripts/probe-t4a-components.js
const fs = require('fs');
const path = require('path');

const FILES = [
  'components/admin-homes/GeoAssignmentSection.tsx',
  'components/admin-homes/TenantGeoAssignmentSection.tsx',
  'lib/utils/territory.ts',
  'lib/comprehensive/access-resolver.ts',
  'lib/comprehensive/types.ts'
];

for (const f of FILES) {
  const full = path.join(process.cwd(), f);
  if (!fs.existsSync(full)) {
    console.log('=== ' + f + ' === NOT FOUND\n');
    continue;
  }
  const txt = fs.readFileSync(full, 'utf8');
  console.log('=== ' + f + ' (' + txt.length + ' chars, ' + txt.split('\n').length + ' lines) ===');
  console.log(txt);
  console.log('=== END ' + f + ' ===\n\n');
}