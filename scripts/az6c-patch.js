// scripts/az6c-patch.js
// AZ.6c: AddTenantModal.tsx -- wrap <form> in ternary so the post-create
// onboarding checklist renders when createdTenant is set.
// Idempotent: skips if "createdTenant ?" already present.

const fs = require('fs');
const path = require('path');

const MODAL = path.join(process.cwd(), 'components', 'admin-homes', 'AddTenantModal.tsx');
let src = fs.readFileSync(MODAL, 'utf8');

if (src.includes('{createdTenant ? (')) {
  console.log('SKIP -- checklist ternary already present (idempotent)');
  process.exit(0);
}

// === Edit A: open the ternary -- BEFORE <form> ===
const openOld =
  '        </div>\r\n' +
  '        <form onSubmit={handleSubmit} className="p-6 space-y-6">';

const openNew =
  '        </div>\r\n' +
  '        {createdTenant ? (\r\n' +
  '        <div className="p-6 space-y-4">\r\n' +
  '          <div className="bg-green-50 border border-green-200 rounded-lg p-4">\r\n' +
  '            <div className="flex items-start gap-3">\r\n' +
  '              <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />\r\n' +
  '              <div>\r\n' +
  '                <h3 className="font-semibold text-green-900">Tenant Created: {createdTenant.name}</h3>\r\n' +
  '                <p className="text-xs text-green-700 mt-1">\r\n' +
  '                  domain: <span className="font-mono">{createdTenant.domain}</span>\r\n' +
  '                  {\' \'}&middot;{\' \'}\r\n' +
  '                  source_key: <span className="font-mono">{createdTenant.source_key}</span>\r\n' +
  '                  {\' \'}&middot;{\' \'}\r\n' +
  '                  id: <span className="font-mono text-[10px]">{createdTenant.id}</span>\r\n' +
  '                </p>\r\n' +
  '              </div>\r\n' +
  '            </div>\r\n' +
  '          </div>\r\n' +
  '          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">\r\n' +
  '            <h3 className="font-semibold text-amber-900 mb-2">Required next steps to make this tenant fully operational</h3>\r\n' +
  '            <ol className="space-y-3 text-sm text-amber-900 list-decimal list-inside">\r\n' +
  '              <li>\r\n' +
  '                <strong>Verify Resend domain.</strong> Tenant cannot send emails (lead notifications, VIP requests) until <code className="text-xs bg-amber-100 px-1 rounded">resend_api_key</code> + <code className="text-xs bg-amber-100 px-1 rounded">email_from_domain</code> are configured and verified.\r\n' +
  '              </li>\r\n' +
  '              <li>\r\n' +
  '                <strong>Anthropic API key.</strong> Charlie AI requires a per-tenant key (or platform fallback). Configure in tenant Settings.\r\n' +
  '              </li>\r\n' +
  '              <li>\r\n' +
  '                <strong>Create at least one agent + set as default.</strong> Go to Agents &rarr; Add Agent for <strong>{createdTenant.name}</strong>, then set that agent as <code className="text-xs bg-amber-100 px-1 rounded">default_agent_id</code> in tenant settings. Without a default agent, leads have no fallback owner when the territory resolver returns null.\r\n' +
  '              </li>\r\n' +
  '              <li>\r\n' +
  '                <strong>Territory assignments.</strong> Assign at least one geo level (area / municipality / community / neighbourhood) to agents via the Agents page so the resolver has a real cascade.\r\n' +
  '              </li>\r\n' +
  '            </ol>\r\n' +
  '          </div>\r\n' +
  '          <div className="flex gap-3 pt-2">\r\n' +
  '            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800">Done</button>\r\n' +
  '          </div>\r\n' +
  '        </div>\r\n' +
  '        ) : (\r\n' +
  '        <form onSubmit={handleSubmit} className="p-6 space-y-6">';

if (!src.includes(openOld)) {
  console.error('FAIL -- form open anchor not found');
  process.exit(1);
}
src = src.replace(openOld, openNew);
console.log('PASS -- form open wrapped with checklist ternary');

// === Edit B: close the ternary -- AFTER </form> ===
const closeOld =
  '        </form>\r\n' +
  '      </div>\r\n' +
  '    </div>\r\n' +
  '  )\r\n' +
  '}\r\n';

const closeNew =
  '        </form>\r\n' +
  '        )}\r\n' +
  '      </div>\r\n' +
  '    </div>\r\n' +
  '  )\r\n' +
  '}\r\n';

if (!src.includes(closeOld)) {
  console.error('FAIL -- form close anchor not found');
  process.exit(1);
}
src = src.replace(closeOld, closeNew);
console.log('PASS -- ternary closed after </form>');

fs.writeFileSync(MODAL, src, 'utf8');
console.log('');
console.log('Modal size: ' + fs.statSync(MODAL).size + ' bytes');