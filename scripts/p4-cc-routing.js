// scripts/p4-cc-routing.js
// P4: add CC routing section to AddTenantModal.
// 2 visible fields: manager_cc, admin_bcc. Both optional, NULL on WALLiam.
// Used for lead-email recipient routing when manager/admin notification copies
// are configured at the tenant level.

const fs = require('fs');
const path = require('path');

const MODAL = path.join(process.cwd(), 'components', 'admin-homes', 'AddTenantModal.tsx');
let src = fs.readFileSync(MODAL, 'utf8');
const errors = [];
let applied = 0;

function tryApply(label, oldStr, newStr, idempotentMarker) {
  if (idempotentMarker && src.includes(idempotentMarker)) {
    console.log('SKIP ' + label + ' -- already applied');
    return;
  }
  if (!src.includes(oldStr)) {
    errors.push(label + ' -- anchor not found');
    return;
  }
  src = src.replace(oldStr, newStr);
  applied++;
  console.log('PASS ' + label);
}

// E1: add fields to state (after facebook_pixel_id: '',)
tryApply(
  'E1 state fields',
  "    facebook_pixel_id: '',\r\n  })",
  "    facebook_pixel_id: '',\r\n    // CC routing for lead emails (optional)\r\n    manager_cc: '',\r\n    admin_bcc: '',\r\n  })",
  "manager_cc: ''"
);

// E2: add fields to POST body (after facebook_pixel_id: ... line)
tryApply(
  'E2 POST body fields',
  '          facebook_pixel_id: formData.facebook_pixel_id || null,\r\n        }),',
  '          facebook_pixel_id: formData.facebook_pixel_id || null,\r\n          manager_cc: formData.manager_cc || null,\r\n          admin_bcc: formData.admin_bcc || null,\r\n        }),',
  'manager_cc: formData.manager_cc'
);

// E3: insert CC routing section JSX between Analytics close and AI Config open
const e3Old =
  '          </div>\r\n' +
  '\r\n' +
  '          {/* AI Configuration — Charlie chat */}';

const e3New =
  '          </div>\r\n' +
  '\r\n' +
  '          {/* CC Routing — manager/admin email copies on lead notifications */}\r\n' +
  '          <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">\r\n' +
  '            <h3 className="font-semibold text-stone-900 mb-1">⇉ CC Routing</h3>\r\n' +
  '            <p className="text-xs text-stone-700 mb-3">Optional comma-separated email lists copied on lead notifications. Manager CC receives a copy of all lead emails; Admin BCC receives a blind copy for compliance / oversight.</p>\r\n' +
  '            <div className="space-y-3">\r\n' +
  '              <div>\r\n' +
  '                <label className="block text-sm font-medium text-gray-700 mb-1">Manager CC</label>\r\n' +
  '                <input type="text" value={formData.manager_cc} onChange={e => setFormData({ ...formData, manager_cc: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="manager1@tenant.ca, manager2@tenant.ca" />\r\n' +
  '              </div>\r\n' +
  '              <div>\r\n' +
  '                <label className="block text-sm font-medium text-gray-700 mb-1">Admin BCC</label>\r\n' +
  '                <input type="text" value={formData.admin_bcc} onChange={e => setFormData({ ...formData, admin_bcc: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="admin@tenant.ca" />\r\n' +
  '              </div>\r\n' +
  '            </div>\r\n' +
  '          </div>\r\n' +
  '\r\n' +
  '          {/* AI Configuration — Charlie chat */}';

tryApply(
  'E3 CC routing section JSX',
  e3Old,
  e3New,
  '⇉ CC Routing'
);

if (errors.length > 0) {
  console.error('');
  console.error('ABORT -- ' + errors.length + ' anchor failures:');
  for (const e of errors) console.error('  ' + e);
  console.error('No changes written to disk.');
  process.exit(1);
}

fs.writeFileSync(MODAL, src, 'utf8');
console.log('');
console.log('Edits applied: ' + applied);
console.log('Modal size: ' + fs.statSync(MODAL).size + ' bytes');