const fs = require('fs');
const p = 'app/admin-homes/leads/page.tsx';
let raw = fs.readFileSync(p, 'utf8');
const hadBOM = raw.charCodeAt(0) === 0xFEFF;
if (hadBOM) raw = raw.slice(1);
const usesCRLF = /\r\n/.test(raw);
let content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw;

// Match 4 consecutive lines, identical leading whitespace via backreference.
const rx = /([ \t]+)initialCreditOverrides=\{\{\}\}\n\1initialVipRequests=\{\{\}\}\n\1initialEmailLog=\{\{\}\}\n\1initialNotes=\{\{\}\}\n/g;
const matches = content.match(rx) || [];
if (matches.length === 0) { console.error('FAIL: no regex match'); process.exit(1); }
if (matches.length > 1) { console.error('FAIL: ' + matches.length + ' matches, expected 1'); process.exit(1); }
console.log('Match found, length: ' + matches[0].length + ' chars');

content = content.replace(rx, '');

const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
const bakPath = p + '.backup_' + ts;
fs.copyFileSync(p, bakPath);

let out = usesCRLF ? content.replace(/\n/g, '\r\n') : content;
if (hadBOM) out = '\uFEFF' + out;
fs.writeFileSync(p, out, 'utf8');

console.log('PATCHED: 4 props removed from early-return render');
console.log('Backup: ' + bakPath);
