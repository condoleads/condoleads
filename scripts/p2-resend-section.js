// scripts/p2-resend-section.js
// P2: add Resend section to AddTenantModal.
// 3 visible fields: send_from, resend_api_key, email_from_domain.
// NOT resend_verified_at / resend_verification_status — those set by the
// verify-resend route, not manually entered.

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

// E1: add to formData state initializer (after homepage_layout: 'v1',)
tryApply(
  'E1 state fields',
  "    homepage_layout: 'v1',\r\n  })",
  "    homepage_layout: 'v1',\r\n    // Resend email stack (verify_status/verified_at set by verify-resend route)\r\n    send_from: '',\r\n    resend_api_key: '',\r\n    email_from_domain: '',\r\n  })",
  "send_from: ''"
);

// E2: add to POST body (after homepage_layout: formData.homepage_layout,)
tryApply(
  'E2 POST body fields',
  '          homepage_layout: formData.homepage_layout,\r\n        }),',
  '          homepage_layout: formData.homepage_layout,\r\n          send_from: formData.send_from || null,\r\n          resend_api_key: formData.resend_api_key || null,\r\n          email_from_domain: formData.email_from_domain || null,\r\n        }),',
  'send_from: formData.send_from'
);

// E3: insert Resend section JSX between Brokerage close and AI Config open
const e3Old =
  '          </div>\r\n' +
  '\r\n' +
  '          {/* AI Configuration — Charlie chat */}';

const e3New =
  '          </div>\r\n' +
  '\r\n' +
  '          {/* Resend Email — required for lead notifications, VIP requests */}\r\n' +
  '          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">\r\n' +
  '            <h3 className="font-semibold text-orange-900 mb-1">✉ Resend Email</h3>\r\n' +
  '            <p className="text-xs text-orange-700 mb-3">Required for the tenant to send lead notifications, VIP requests, and admin emails. After save, use the Verify Domain action to complete DNS verification.</p>\r\n' +
  '            <div className="space-y-3">\r\n' +
  '              <div>\r\n' +
  '                <label className="block text-sm font-medium text-gray-700 mb-1">Send-From Header</label>\r\n' +
  '                <input type="text" value={formData.send_from} onChange={e => setFormData({ ...formData, send_from: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="Tenant Name <notifications@tenant.ca>" />\r\n' +
  '                <p className="text-xs text-gray-500 mt-1">Full RFC 5322 From header. Example: <code className="text-xs bg-orange-100 px-1 rounded">WALLiam &lt;notifications@condoleads.ca&gt;</code></p>\r\n' +
  '              </div>\r\n' +
  '              <div>\r\n' +
  '                <label className="block text-sm font-medium text-gray-700 mb-1">Resend API Key</label>\r\n' +
  '                <input type="password" value={formData.resend_api_key} onChange={e => setFormData({ ...formData, resend_api_key: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="re_..." />\r\n' +
  '                <p className="text-xs text-gray-500 mt-1">Resend API key with sending permissions for the from-domain.</p>\r\n' +
  '              </div>\r\n' +
  '              <div>\r\n' +
  '                <label className="block text-sm font-medium text-gray-700 mb-1">Email From-Domain</label>\r\n' +
  '                <input type="text" value={formData.email_from_domain} onChange={e => setFormData({ ...formData, email_from_domain: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="tenant.ca" />\r\n' +
  '                <p className="text-xs text-gray-500 mt-1">DNS-verified sender domain registered with Resend. Must match the domain in Send-From.</p>\r\n' +
  '              </div>\r\n' +
  '            </div>\r\n' +
  '          </div>\r\n' +
  '\r\n' +
  '          {/* AI Configuration — Charlie chat */}';

tryApply(
  'E3 Resend section JSX',
  e3Old,
  e3New,
  '✉ Resend Email'
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