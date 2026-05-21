// scripts/p5-seller-plan-completeness.js
// P5: complete the seller plan config in AddTenantModal by adding the
// missing seller_plan_auto_approve_limit + seller_plan_manual_approve_limit
// fields. Existing Auto/Manual labels become mode-aware:
//   shared mode: "Auto-Approve Limit" / "Manual Approve Limit" (uses plan_*)
//   split mode:  "Buyer Auto-Approve" / "Buyer Manual Approve" (uses plan_*)
//                + new Seller Auto-Approve / Seller Manual Approve (uses seller_plan_*)

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

// E1: extend state line 36 with auto + manual seller limits
tryApply(
  'E1 state fields',
  '    seller_plan_free_attempts: 1, seller_plan_hard_cap: 10,',
  '    seller_plan_free_attempts: 1, seller_plan_hard_cap: 10, seller_plan_auto_approve_limit: 0, seller_plan_manual_approve_limit: 3,',
  'seller_plan_auto_approve_limit:'
);

// E2: add fields to POST body after seller_plan_hard_cap
tryApply(
  'E2 POST body fields',
  '          seller_plan_hard_cap: formData.seller_plan_hard_cap,\r\n',
  '          seller_plan_hard_cap: formData.seller_plan_hard_cap,\r\n          seller_plan_auto_approve_limit: formData.seller_plan_auto_approve_limit,\r\n          seller_plan_manual_approve_limit: formData.seller_plan_manual_approve_limit,\r\n',
  'seller_plan_auto_approve_limit: formData.seller_plan_auto_approve_limit'
);

// E3: rewrite the Auto/Manual JSX block to be mode-aware + add seller-only block in split mode
const e3Old =
  '              <div><label className="block text-sm font-medium text-gray-700 mb-1">Auto-Approve Limit</label>\r\n' +
  '                <input type="number" min={0} value={formData.plan_auto_approve_limit} onChange={e => setFormData({...formData, plan_auto_approve_limit: parseInt(e.target.value)||0})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>\r\n' +
  '              <div><label className="block text-sm font-medium text-gray-700 mb-1">Manual Approve Limit</label>\r\n' +
  '                <input type="number" min={0} value={formData.plan_manual_approve_limit} onChange={e => setFormData({...formData, plan_manual_approve_limit: parseInt(e.target.value)||3})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>';

const e3New =
  '              <div><label className="block text-sm font-medium text-gray-700 mb-1">{formData.plan_mode === \'shared\' ? \'Auto-Approve Limit\' : \'Buyer Auto-Approve\'}</label>\r\n' +
  '                <input type="number" min={0} value={formData.plan_auto_approve_limit} onChange={e => setFormData({...formData, plan_auto_approve_limit: parseInt(e.target.value)||0})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>\r\n' +
  '              <div><label className="block text-sm font-medium text-gray-700 mb-1">{formData.plan_mode === \'shared\' ? \'Manual Approve Limit\' : \'Buyer Manual Approve\'}</label>\r\n' +
  '                <input type="number" min={0} value={formData.plan_manual_approve_limit} onChange={e => setFormData({...formData, plan_manual_approve_limit: parseInt(e.target.value)||3})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>\r\n' +
  '              {formData.plan_mode === \'split\' && <>\r\n' +
  '                <div><label className="block text-sm font-medium text-gray-700 mb-1">Seller Auto-Approve</label>\r\n' +
  '                  <input type="number" min={0} value={formData.seller_plan_auto_approve_limit} onChange={e => setFormData({...formData, seller_plan_auto_approve_limit: parseInt(e.target.value)||0})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>\r\n' +
  '                <div><label className="block text-sm font-medium text-gray-700 mb-1">Seller Manual Approve</label>\r\n' +
  '                  <input type="number" min={0} value={formData.seller_plan_manual_approve_limit} onChange={e => setFormData({...formData, seller_plan_manual_approve_limit: parseInt(e.target.value)||3})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>\r\n' +
  '              </>}';

tryApply(
  'E3 mode-aware Auto/Manual labels + seller fields',
  e3Old,
  e3New,
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
console.log('Modal size: ' + fs.statSync(MODAL).size + ' bytes');