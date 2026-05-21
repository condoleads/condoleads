// scripts/p1-remove-sourcekey-ui.js
// P1: remove visible Source Key UI field from AddTenantModal.
// Server still derives invisibly via lib/admin-homes/tenant-source-key.ts
// State (source_key, source_key_overridden) + useEffect derivation REMAIN —
// the admin just doesn't see it. Field cannot be tampered with via UI.
// The POST body still sends formData.source_key (auto-derived by useEffect).

const fs = require('fs');
const path = require('path');

const MODAL = path.join(process.cwd(), 'components', 'admin-homes', 'AddTenantModal.tsx');
let src = fs.readFileSync(MODAL, 'utf8');

const uiBlock =
  '              <div className="col-span-2">\r\n' +
  '                <label className="block text-sm font-medium text-gray-700 mb-1">\r\n' +
  '                  Source Key {!formData.source_key_overridden && <span className="text-xs font-normal text-gray-400">(auto-derived from domain &mdash; click to override)</span>}\r\n' +
  '                </label>\r\n' +
  '                <input\r\n' +
  '                  type="text"\r\n' +
  '                  value={formData.source_key}\r\n' +
  '                  readOnly={!formData.source_key_overridden}\r\n' +
  '                  onClick={() => { if (!formData.source_key_overridden) setFormData({ ...formData, source_key_overridden: true }) }}\r\n' +
  '                  onChange={e => setFormData({ ...formData, source_key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, \'\') })}\r\n' +
  '                  className={`w-full px-3 py-2 border rounded-lg text-sm font-mono ${formData.source_key_overridden ? \'bg-white\' : \'bg-gray-50 cursor-pointer\'}`}\r\n' +
  '                  placeholder="walliam"\r\n' +
  '                />\r\n' +
  '                <p className="text-xs text-gray-500 mt-1">Used as prefix in lead source strings. Must be unique across tenants. Lowercase letters / digits / hyphens / underscores only.</p>\r\n' +
  '              </div>\r\n';

if (!src.includes('Source Key {!formData.source_key_overridden')) {
  console.log('SKIP -- Source Key UI already absent (idempotent)');
  process.exit(0);
}
if (!src.includes(uiBlock)) {
  console.error('FAIL -- Source Key UI block anchor not found (file may have been edited since AZ.6b)');
  process.exit(1);
}

src = src.replace(uiBlock, '');
fs.writeFileSync(MODAL, src, 'utf8');
console.log('PASS -- Source Key UI field removed');
console.log('Modal size: ' + fs.statSync(MODAL).size + ' bytes (was 32645)');