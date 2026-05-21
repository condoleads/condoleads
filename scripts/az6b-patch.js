// scripts/az6b-patch.js
// AZ.6b: AddTenantModal.tsx -- inject Source Key UI field in Brand section.
// Anchors between Admin Email block close and Primary Color block open.
// Idempotent: skips if "Source Key" label already present.

const fs = require('fs');
const path = require('path');

const MODAL = path.join(process.cwd(), 'components', 'admin-homes', 'AddTenantModal.tsx');
let src = fs.readFileSync(MODAL, 'utf8');

const oldAnchor =
  '                <input required type="email" value={formData.admin_email} onChange={e => setFormData({ ...formData, admin_email: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="admin@walliam.ca" />\r\n' +
  '              </div>\r\n' +
  '              <div>\r\n' +
  '                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>';

const newAnchor =
  '                <input required type="email" value={formData.admin_email} onChange={e => setFormData({ ...formData, admin_email: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="admin@walliam.ca" />\r\n' +
  '              </div>\r\n' +
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
  '              </div>\r\n' +
  '              <div>\r\n' +
  '                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>';

if (src.includes('Source Key {!formData.source_key_overridden')) {
  console.log('SKIP -- Source Key field already present (idempotent)');
  process.exit(0);
}
if (!src.includes(oldAnchor)) {
  console.error('FAIL -- anchor not found between Admin Email and Primary Color');
  process.exit(1);
}

src = src.replace(oldAnchor, newAnchor);
fs.writeFileSync(MODAL, src, 'utf8');
console.log('PASS -- Source Key field injected');
console.log('Modal size: ' + fs.statSync(MODAL).size + ' bytes');