// scripts/p6-edit-modal-completeness.js
// P6: mirror all P2/P3/P4/P5 fields to EditTenantModal.
// Adds 11 missing fields (D18 regression — Edit currently has zero of them):
//   Resend (3):    send_from, resend_api_key, email_from_domain
//   Analytics (4): google_analytics_id, google_ads_id, google_conversion_label, facebook_pixel_id
//   CC routing (2): manager_cc, admin_bcc
//   Seller plan (2): seller_plan_auto_approve_limit, seller_plan_manual_approve_limit
//
// Touches 4 surfaces in the modal:
//   - state initializer line 30-ish (default values)
//   - initial-load setFormData line 55-95 (fetched-row fallbacks)
//   - PUT body line 109-148 (send to API)
//   - JSX: 3 new sections between Brokerage close and AI Config; seller plan mode-aware in Plan Config

const fs = require('fs');
const path = require('path');

const MODAL = path.join(process.cwd(), 'components', 'admin-homes', 'EditTenantModal.tsx');
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

// =====================================================================
// E0: useState initial defaults -- add 11 fields BEFORE E1
// Edit modal's TypeScript type for formData is inferred from this initial
// useState({...}) call. The setFormData() in E1 (fetched-data hydration)
// and PUT body in E2 and JSX in E3/E4 all rely on these fields existing
// in the type. So this MUST be applied first.
// =====================================================================
const e0Old =
  "    terms_content: '',\r\n" +
  '  })';

const e0New =
  "    terms_content: '',\r\n" +
  "    // Resend email stack\r\n" +
  "    send_from: '',\r\n" +
  "    resend_api_key: '',\r\n" +
  "    email_from_domain: '',\r\n" +
  "    // Analytics & tracking\r\n" +
  "    google_analytics_id: '',\r\n" +
  "    google_ads_id: '',\r\n" +
  "    google_conversion_label: '',\r\n" +
  "    facebook_pixel_id: '',\r\n" +
  "    // CC routing\r\n" +
  "    manager_cc: '',\r\n" +
  "    admin_bcc: '',\r\n" +
  "    // Seller plan completeness\r\n" +
  "    seller_plan_auto_approve_limit: 0,\r\n" +
  "    seller_plan_manual_approve_limit: 3,\r\n" +
  '  })';

tryApply(
  'E0 useState initial defaults',
  e0Old,
  e0New,
  'seller_plan_auto_approve_limit: 0'
);

// =====================================================================
// E1: initial-load setFormData -- add 11 fields after terms_content
// =====================================================================
const e1Old =
  "          terms_content: data.terms_content || '',\r\n" +
  '        })';

const e1New =
  "          terms_content: data.terms_content || '',\r\n" +
  "          // Resend email stack\r\n" +
  "          send_from: data.send_from || '',\r\n" +
  "          resend_api_key: data.resend_api_key || '',\r\n" +
  "          email_from_domain: data.email_from_domain || '',\r\n" +
  "          // Analytics & tracking\r\n" +
  "          google_analytics_id: data.google_analytics_id || '',\r\n" +
  "          google_ads_id: data.google_ads_id || '',\r\n" +
  "          google_conversion_label: data.google_conversion_label || '',\r\n" +
  "          facebook_pixel_id: data.facebook_pixel_id || '',\r\n" +
  "          // CC routing\r\n" +
  "          manager_cc: data.manager_cc || '',\r\n" +
  "          admin_bcc: data.admin_bcc || '',\r\n" +
  "          // Seller plan completeness\r\n" +
  "          seller_plan_auto_approve_limit: data.seller_plan_auto_approve_limit ?? 0,\r\n" +
  "          seller_plan_manual_approve_limit: data.seller_plan_manual_approve_limit ?? 3,\r\n" +
  '        })';

tryApply(
  'E1 initial-load fields',
  e1Old,
  e1New,
  'send_from: data.send_from'
);

// =====================================================================
// E2: PUT body -- add 11 fields after terms_content
// =====================================================================
const e2Old =
  '          terms_content: formData.terms_content || null,\r\n' +
  '        })';

const e2New =
  '          terms_content: formData.terms_content || null,\r\n' +
  '          send_from: formData.send_from || null,\r\n' +
  '          resend_api_key: formData.resend_api_key || null,\r\n' +
  '          email_from_domain: formData.email_from_domain || null,\r\n' +
  '          google_analytics_id: formData.google_analytics_id || null,\r\n' +
  '          google_ads_id: formData.google_ads_id || null,\r\n' +
  '          google_conversion_label: formData.google_conversion_label || null,\r\n' +
  '          facebook_pixel_id: formData.facebook_pixel_id || null,\r\n' +
  '          manager_cc: formData.manager_cc || null,\r\n' +
  '          admin_bcc: formData.admin_bcc || null,\r\n' +
  '          seller_plan_auto_approve_limit: formData.seller_plan_auto_approve_limit,\r\n' +
  '          seller_plan_manual_approve_limit: formData.seller_plan_manual_approve_limit,\r\n' +
  '        })';

tryApply(
  'E2 PUT body fields',
  e2Old,
  e2New,
  'send_from: formData.send_from'
);

// =====================================================================
// E3: insert 3 new JSX sections between Brokerage close and AI Config
// Indent is 12 spaces (vs 10 in Add).
// =====================================================================
const e3Old =
  '            </div>\r\n' +
  '\r\n' +
  '            {/* AI Configuration */}';

const e3New =
  '            </div>\r\n' +
  '\r\n' +
  '            {/* Resend Email — required for lead notifications, VIP requests */}\r\n' +
  '            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">\r\n' +
  '              <h3 className="font-semibold text-orange-900 mb-1">✉ Resend Email</h3>\r\n' +
  '              <p className="text-xs text-orange-700 mb-3">Required for the tenant to send lead notifications, VIP requests, and admin emails. Use the Verify Domain action to complete DNS verification.</p>\r\n' +
  '              <div className="space-y-3">\r\n' +
  '                <div>\r\n' +
  '                  <label className="block text-sm font-medium text-gray-700 mb-1">Send-From Header</label>\r\n' +
  '                  <input type="text" value={formData.send_from} onChange={e => setFormData({ ...formData, send_from: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="Tenant Name <notifications@tenant.ca>" />\r\n' +
  '                </div>\r\n' +
  '                <div>\r\n' +
  '                  <label className="block text-sm font-medium text-gray-700 mb-1">Resend API Key</label>\r\n' +
  '                  <input type="password" value={formData.resend_api_key} onChange={e => setFormData({ ...formData, resend_api_key: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="re_..." />\r\n' +
  '                </div>\r\n' +
  '                <div>\r\n' +
  '                  <label className="block text-sm font-medium text-gray-700 mb-1">Email From-Domain</label>\r\n' +
  '                  <input type="text" value={formData.email_from_domain} onChange={e => setFormData({ ...formData, email_from_domain: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="tenant.ca" />\r\n' +
  '                </div>\r\n' +
  '              </div>\r\n' +
  '            </div>\r\n' +
  '\r\n' +
  '            {/* Analytics & Tracking */}\r\n' +
  '            <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">\r\n' +
  '              <h3 className="font-semibold text-cyan-900 mb-1">⊿ Analytics &amp; Tracking</h3>\r\n' +
  '              <p className="text-xs text-cyan-700 mb-3">All optional. Configure for production marketing measurement.</p>\r\n' +
  '              <div className="grid grid-cols-2 gap-3">\r\n' +
  '                <div>\r\n' +
  '                  <label className="block text-sm font-medium text-gray-700 mb-1">Google Analytics ID</label>\r\n' +
  '                  <input type="text" value={formData.google_analytics_id} onChange={e => setFormData({ ...formData, google_analytics_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="G-XXXXXXXXXX" />\r\n' +
  '                </div>\r\n' +
  '                <div>\r\n' +
  '                  <label className="block text-sm font-medium text-gray-700 mb-1">Google Ads ID</label>\r\n' +
  '                  <input type="text" value={formData.google_ads_id} onChange={e => setFormData({ ...formData, google_ads_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="AW-XXXXXXXXX" />\r\n' +
  '                </div>\r\n' +
  '                <div>\r\n' +
  '                  <label className="block text-sm font-medium text-gray-700 mb-1">Google Conversion Label</label>\r\n' +
  '                  <input type="text" value={formData.google_conversion_label} onChange={e => setFormData({ ...formData, google_conversion_label: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="AbCdEfGhIj-1234567890" />\r\n' +
  '                </div>\r\n' +
  '                <div>\r\n' +
  '                  <label className="block text-sm font-medium text-gray-700 mb-1">Facebook Pixel ID</label>\r\n' +
  '                  <input type="text" value={formData.facebook_pixel_id} onChange={e => setFormData({ ...formData, facebook_pixel_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="123456789012345" />\r\n' +
  '                </div>\r\n' +
  '              </div>\r\n' +
  '            </div>\r\n' +
  '\r\n' +
  '            {/* CC Routing */}\r\n' +
  '            <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">\r\n' +
  '              <h3 className="font-semibold text-stone-900 mb-1">⇉ CC Routing</h3>\r\n' +
  '              <p className="text-xs text-stone-700 mb-3">Optional comma-separated email lists copied on lead notifications.</p>\r\n' +
  '              <div className="space-y-3">\r\n' +
  '                <div>\r\n' +
  '                  <label className="block text-sm font-medium text-gray-700 mb-1">Manager CC</label>\r\n' +
  '                  <input type="text" value={formData.manager_cc} onChange={e => setFormData({ ...formData, manager_cc: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="manager1@tenant.ca, manager2@tenant.ca" />\r\n' +
  '                </div>\r\n' +
  '                <div>\r\n' +
  '                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin BCC</label>\r\n' +
  '                  <input type="text" value={formData.admin_bcc} onChange={e => setFormData({ ...formData, admin_bcc: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="admin@tenant.ca" />\r\n' +
  '                </div>\r\n' +
  '              </div>\r\n' +
  '            </div>\r\n' +
  '\r\n' +
  '            {/* AI Configuration */}';

tryApply(
  'E3 three JSX sections (Resend, Analytics, CC)',
  e3Old,
  e3New,
  '✉ Resend Email'
);

// =====================================================================
// E4: seller plan mode-aware in Edit -- relabel + add seller fields
// Edit's existing labels are "Auto-Approve Limit" (line 426) and
// "Credits per Email Approval" (line 428) — different from Add.
// Indent is 16 spaces. Pattern is `<div><label ...>{label}</label>` on
// one line then `<input ...></div>` on next line.
// =====================================================================
const e4Old =
  '                <div><label className="block text-xs font-medium text-gray-700 mb-1">Auto-Approve Limit</label>\r\n' +
  '                  <input type="number" min={0} value={formData.plan_auto_approve_limit} onChange={e => setFormData({...formData, plan_auto_approve_limit: parseInt(e.target.value)||0})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>\r\n' +
  '                <div><label className="block text-xs font-medium text-gray-700 mb-1">Credits per Email Approval</label>\r\n' +
  '                  <p className="text-xs text-gray-500 mb-1">Plans granted when approving a request via email.</p>\r\n' +
  '                  <input type="number" min={0} value={formData.plan_manual_approve_limit} onChange={e => setFormData({...formData, plan_manual_approve_limit: parseInt(e.target.value)||3})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>';

const e4New =
  '                <div><label className="block text-xs font-medium text-gray-700 mb-1">{formData.plan_mode === \'shared\' ? \'Auto-Approve Limit\' : \'Buyer Auto-Approve\'}</label>\r\n' +
  '                  <input type="number" min={0} value={formData.plan_auto_approve_limit} onChange={e => setFormData({...formData, plan_auto_approve_limit: parseInt(e.target.value)||0})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>\r\n' +
  '                <div><label className="block text-xs font-medium text-gray-700 mb-1">{formData.plan_mode === \'shared\' ? \'Credits per Email Approval\' : \'Buyer Manual Approve\'}</label>\r\n' +
  '                  <p className="text-xs text-gray-500 mb-1">Plans granted when approving a request via email.</p>\r\n' +
  '                  <input type="number" min={0} value={formData.plan_manual_approve_limit} onChange={e => setFormData({...formData, plan_manual_approve_limit: parseInt(e.target.value)||3})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>\r\n' +
  '                {formData.plan_mode === \'split\' && <>\r\n' +
  '                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Seller Auto-Approve</label>\r\n' +
  '                    <input type="number" min={0} value={formData.seller_plan_auto_approve_limit} onChange={e => setFormData({...formData, seller_plan_auto_approve_limit: parseInt(e.target.value)||0})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>\r\n' +
  '                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Seller Manual Approve</label>\r\n' +
  '                    <input type="number" min={0} value={formData.seller_plan_manual_approve_limit} onChange={e => setFormData({...formData, seller_plan_manual_approve_limit: parseInt(e.target.value)||3})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>\r\n' +
  '                </>}';

tryApply(
  'E4 seller plan mode-aware (Edit)',
  e4Old,
  e4New,
  'Seller Auto-Approve'
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
console.log('Modal size: ' + fs.statSync(MODAL).size + ' bytes (was 35223)');