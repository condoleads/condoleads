const fs = require('fs');
const pad = n => String(n).padStart(2, '0');
const now = new Date();
const stamp = now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
const raw = fs.readFileSync('package.json', 'utf8');
fs.writeFileSync('package.json.backup_' + stamp, raw);
console.log('Backup: package.json.backup_' + stamp);
const pkg = JSON.parse(raw);
const changes = [];
if (pkg.devDependencies && pkg.devDependencies.pg) {
  delete pkg.devDependencies.pg;
  changes.push('removed pg from devDependencies');
}
if (!pkg.dependencies) pkg.dependencies = {};
if (!pkg.dependencies.pg) {
  pkg.dependencies.pg = '^8.20.0';
  changes.push('added pg ^8.20.0 to dependencies');
} else {
  changes.push('pg ' + pkg.dependencies.pg + ' already in dependencies (kept)');
}
pkg.dependencies = Object.fromEntries(Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)));
if (pkg.devDependencies) {
  pkg.devDependencies = Object.fromEntries(Object.entries(pkg.devDependencies).sort(([a], [b]) => a.localeCompare(b)));
}
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
for (const c of changes) console.log('  - ' + c);