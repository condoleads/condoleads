const fs = require('fs');
const p = 'docs/W-LEADS-WORKBENCH-TRACKER.md';
let raw = fs.readFileSync(p, 'utf8');
const hadBOM = raw.charCodeAt(0) === 0xFEFF;
if (hadBOM) raw = raw.slice(1);
const usesCRLF = /\r\n/.test(raw);
let content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw;

// Append fix-in-flight note + recon lesson immediately after the page.tsx
// section's "dropped from `<AdminHomesLeadsClient>` invocation." sentence.
const ANCHOR = 'dropped from `<AdminHomesLeadsClient>` invocation.';
const ADDENDUM = ' Post-patch TSC + 12-pattern residue grep surfaced a 2nd `<AdminHomesLeadsClient>` invocation at the early-return render (no-tenant-context branch, L43-L58) passing the same 4 props with `{{}}` placeholders \u2014 site missed by initial L75-L220 recon (focused on main render only). Fixed via indent-agnostic regex with backreference + single-match validation (`scripts/patch-w-leads-workbench-w3a-fix.js`). TSC re-run exit 0 + 12-pattern residue PASS post-fix. **Lesson:** multi-render server components require file-wide recon, not just the main-render region \u2014 second invocations in loading / error / empty-state branches commonly mirror the main render`s prop shape and break the same way when the Props interface narrows.';

const occ = content.split(ANCHOR).length - 1;
if (occ === 0) { console.error('FAIL: anchor not found'); process.exit(1); }
if (occ > 1) { console.error('FAIL: anchor not unique (' + occ + ')'); process.exit(1); }

content = content.replace(ANCHOR, ANCHOR + ADDENDUM);

const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
const bakPath = p + '.backup_' + ts;
fs.copyFileSync(p, bakPath);

let out = usesCRLF ? content.replace(/\n/g, '\r\n') : content;
if (hadBOM) out = '\uFEFF' + out;
fs.writeFileSync(p, out, 'utf8');

console.log('PATCHED tracker: addendum appended to W3a-SHIPPED page.tsx section');
console.log('Backup: ' + bakPath);
