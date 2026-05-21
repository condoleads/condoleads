// scripts/p3-analytics-section.js
// P3: add Analytics section to AddTenantModal.
// 4 visible fields: google_analytics_id, google_ads_id,
// google_conversion_label, facebook_pixel_id. All optional, all NULL on
// WALLiam (per AY.3) so empty defaults match production parity.

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

// E1: add 4 fields to formData state (after email_from_domain: '',)
tryApply(
  'E1 state fields',
  "    email_from_domain: '',\r\n  })",
  "    email_from_domain: '',\r\n    // Analytics & tracking (all optional)\r\n    google_analytics_id: '',\r\n    google_ads_id: '',\r\n    google_conversion_label: '',\r\n    facebook_pixel_id: '',\r\n  })",
  "google_analytics_id: ''"
);

// E2: add 4 fields to POST body (after email_from_domain: formData.email_from_domain || null,)
tryApply(
  'E2 POST body fields',
  '          email_from_domain: formData.email_from_domain || null,\r\n        }),',
  '          email_from_domain: formData.email_from_domain || null,\r\n          google_analytics_id: formData.google_analytics_id || null,\r\n          google_ads_id: formData.google_ads_id || null,\r\n          google_conversion_label: formData.google_conversion_label || null,\r\n          facebook_pixel_id: formData.facebook_pixel_id || null,\r\n        }),',
  'google_analytics_id: formData.google_analytics_id'
);

// E3: insert Analytics section JSX between Resend close and AI Config open
const e3Old =
  '          </div>\r\n' +
  '\r\n' +
  '          {/* AI Configuration — Charlie chat */}';

const e3New =
  '          </div>\r\n' +
  '\r\n' +
  '          {/* Analytics & Tracking — all optional */}\r\n' +
  '          <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">\r\n' +
  '            <h3 className="font-semibold text-cyan-900 mb-1">⊿ Analytics &amp; Tracking</h3>\r\n' +
  '            <p className="text-xs text-cyan-700 mb-3">All optional. Configure for production marketing measurement.</p>\r\n' +
  '            <div className="grid grid-cols-2 gap-3">\r\n' +
  '              <div>\r\n' +
  '                <label className="block text-sm font-medium text-gray-700 mb-1">Google Analytics ID</label>\r\n' +
  '                <input type="text" value={formData.google_analytics_id} onChange={e => setFormData({ ...formData, google_analytics_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="G-XXXXXXXXXX" />\r\n' +
  '              </div>\r\n' +
  '              <div>\r\n' +
  '                <label className="block text-sm font-medium text-gray-700 mb-1">Google Ads ID</label>\r\n' +
  '                <input type="text" value={formData.google_ads_id} onChange={e => setFormData({ ...formData, google_ads_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="AW-XXXXXXXXX" />\r\n' +
  '              </div>\r\n' +
  '              <div>\r\n' +
  '                <label className="block text-sm font-medium text-gray-700 mb-1">Google Conversion Label</label>\r\n' +
  '                <input type="text" value={formData.google_conversion_label} onChange={e => setFormData({ ...formData, google_conversion_label: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="AbCdEfGhIj-1234567890" />\r\n' +
  '              </div>\r\n' +
  '              <div>\r\n' +
  '                <label className="block text-sm font-medium text-gray-700 mb-1">Facebook Pixel ID</label>\r\n' +
  '                <input type="text" value={formData.facebook_pixel_id} onChange={e => setFormData({ ...formData, facebook_pixel_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="123456789012345" />\r\n' +
  '              </div>\r\n' +
  '            </div>\r\n' +
  '          </div>\r\n' +
  '\r\n' +
  '          {/* AI Configuration — Charlie chat */}';

tryApply(
  'E3 Analytics section JSX',
  e3Old,
  e3New,
  '⊿ Analytics'
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