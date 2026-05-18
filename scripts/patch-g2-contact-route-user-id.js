const fs = require('fs');
const path = require('path');

const routePath  = path.join('app', 'api', 'walliam', 'contact', 'route.ts');
const helperPath = path.join('lib', 'auth', 'get-or-create-by-email.ts');

const routeContent = fs.readFileSync(routePath, 'utf8');
const originalBytes = Buffer.byteLength(routeContent, 'utf8');
console.log('Read ' + routePath + ': ' + originalBytes + ' bytes');

const hasCrlf = routeContent.includes('\r\n');
const eol = hasCrlf ? '\r\n' : '\n';
console.log('Line ending: ' + (hasCrlf ? 'CRLF' : 'LF'));

// === 1. Create helper file ===
if (fs.existsSync(helperPath)) {
  throw new Error('Helper exists: ' + helperPath + ' (refusing to overwrite)');
}

const helperLines = [
  '// lib/auth/get-or-create-by-email.ts',
  '//',
  '// G2 helper: resolve an auth.users row by email, creating one if absent.',
  '// Supabase Admin has no getUserByEmail, so we use a create-then-list',
  '// fallback: try createUser first (cheap, common path), fall back to',
  '// paginating listUsers on conflict (rare path).',
  '//',
  '// Used by W-LEAD-FLOW G2: every System 2 lead-write route must produce a',
  '// lead with non-NULL user_id so the workbench Credits & Usage tab is',
  '// functional. The public contact form has no session context; it calls',
  '// this helper to resolve user_id from the submitted email.',
  '',
  "import type { SupabaseClient } from '@supabase/supabase-js'",
  '',
  'export interface GetOrCreateAuthUserResult {',
  '  userId: string',
  '  created: boolean',
  '}',
  '',
  '/**',
  ' * Resolve an auth.users row by email; create one if it doesn\'t exist.',
  ' *',
  ' * @param supabase  service-role Supabase client (auth.admin requires it)',
  ' * @param email     email to resolve (will be lowercased + trimmed)',
  ' * @param metadata  optional user_metadata stamped on creation only',
  ' * @throws on non-conflict create error, or conflict-without-find data',
  ' *         integrity violation',
  ' */',
  'export async function getOrCreateAuthUserByEmail(',
  '  supabase: SupabaseClient,',
  '  email: string,',
  '  metadata?: Record<string, any>',
  '): Promise<GetOrCreateAuthUserResult> {',
  "  const normalizedEmail = (email || '').trim().toLowerCase()",
  "  if (!normalizedEmail || !normalizedEmail.includes('@')) {",
  '    throw new Error(',
  "      'getOrCreateAuthUserByEmail: invalid email ' + JSON.stringify(email)",
  '    )',
  '  }',
  '',
  '  // Step 1: try create. Common path -- most contacts are new emails.',
  '  const createResp = await supabase.auth.admin.createUser({',
  '    email: normalizedEmail,',
  '    email_confirm: true,',
  '    user_metadata: metadata || {},',
  '  })',
  '',
  '  if (createResp.data?.user?.id && !createResp.error) {',
  '    return { userId: createResp.data.user.id, created: true }',
  '  }',
  '',
  '  // Step 2: classify the error. Conflict -> fall through. Else -> throw.',
  "  const errMsg = (createResp.error?.message || '').toLowerCase()",
  '  const errStatus = (createResp.error as any)?.status',
  '  const isConflict =',
  "    errMsg.includes('already') ||",
  "    errMsg.includes('registered') ||",
  "    errMsg.includes('exists') ||",
  '    errStatus === 422',
  '',
  '  if (!isConflict) {',
  '    throw new Error(',
  "      'getOrCreateAuthUserByEmail: createUser failed for ' +",
  '        normalizedEmail +',
  "        ': ' +",
  "        (createResp.error?.message || 'unknown error') +",
  "        ' (status=' +",
  "        (errStatus !== undefined ? errStatus : 'n/a') +",
  "        ')'",
  '    )',
  '  }',
  '',
  '  // Step 3: paginate listUsers to find the existing row.',
  '  const perPage = 200',
  '  const maxPages = 50',
  '',
  '  for (let page = 1; page <= maxPages; page++) {',
  '    const listResp = await supabase.auth.admin.listUsers({ page, perPage })',
  '    if (listResp.error) {',
  '      throw new Error(',
  "        'getOrCreateAuthUserByEmail: listUsers failed while resolving ' +",
  '          normalizedEmail +',
  "          ': ' +",
  '          listResp.error.message',
  '      )',
  '    }',
  '    const users = listResp.data?.users || []',
  '    const found = users.find(',
  '      (u: { email?: string | null }) =>',
  "        (u.email || '').toLowerCase() === normalizedEmail",
  '    )',
  '    if (found && found.id) {',
  '      return { userId: found.id, created: false }',
  '    }',
  '    if (users.length < perPage) {',
  '      break // last page',
  '    }',
  '  }',
  '',
  '  throw new Error(',
  "    'getOrCreateAuthUserByEmail: ' +",
  '      normalizedEmail +',
  "      ' reported as already registered but not found in listUsers (scanned ' +",
  '      maxPages +',
  "      ' pages of ' +",
  '      perPage +',
  "      ')'",
  '  )',
  '}',
  ''
];
const helperContent = helperLines.join(eol);
fs.writeFileSync(helperPath, helperContent, 'utf8');
console.log('Created: ' + helperPath + ' (' + Buffer.byteLength(helperContent, 'utf8') + ' bytes)');

// === 2. Backup the contact route ===
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = routePath + '.backup_' + ts;
fs.writeFileSync(backupPath, routeContent, 'utf8');
console.log('Backup: ' + backupPath);

// === 3. Patch the contact route ===
function assertSingle(haystack, needle, label) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) throw new Error(label + ': anchor must appear exactly once, found ' + count);
}
let patched = routeContent;

// CHANGE 1: import line
const a1 = "import { getTenantContext } from '@/lib/utils/tenant-brand'";
const r1 = a1 + eol + "import { getOrCreateAuthUserByEmail } from '@/lib/auth/get-or-create-by-email'";
assertSingle(patched, a1, 'Anchor 1 (import)');
patched = patched.replace(a1, r1);
console.log('CHANGE 1: import added');

// CHANGE 2: user_id derivation block before lead insert
const a2 = [
  '    // W3c: capture source URL from referer for both leads.source_url + email render',
  "    const pageUrl = headers().get('referer') || null",
  '',
  '    // Save lead with full hierarchy chain (per Lead+Email contract)',
  "    const { data: lead } = await supabase.from('leads').insert({"
].join(eol);
const r2 = [
  '    // W3c: capture source URL from referer for both leads.source_url + email render',
  "    const pageUrl = headers().get('referer') || null",
  '',
  '    // G2: derive auth user_id for credit-management surfaces. The contact',
  '    // form has no session context, so resolve user_id by email via get-or-',
  '    // create against auth.users. If resolution fails for any reason, fall',
  '    // through with user_id=null -- the lead is still saved (graceful',
  '    // degradation, no regression on existing behavior).',
  '    let userIdForLead: string | null = null',
  '    try {',
  '      const result = await getOrCreateAuthUserByEmail(supabase, email, {',
  "        source: 'walliam_contact_form',",
  '        initial_contact_name: name,',
  '        initial_tenant_id: tenant_id,',
  '      })',
  '      userIdForLead = result.userId',
  '    } catch (err) {',
  "      console.error('[walliam/contact] get-or-create auth user failed (continuing with user_id=null):', err)",
  '    }',
  '',
  '    // Save lead with full hierarchy chain (per Lead+Email contract)',
  "    const { data: lead } = await supabase.from('leads').insert({"
].join(eol);
assertSingle(patched, a2, 'Anchor 2 (pre-insert block)');
patched = patched.replace(a2, r2);
console.log('CHANGE 2: user_id derivation block inserted');

// CHANGE 3: user_id into insert payload
const a3 = [
  "    const { data: lead } = await supabase.from('leads').insert({",
  '      agent_id: agent?.id || null,',
  '      manager_id: chainManagerId,'
].join(eol);
const r3 = [
  "    const { data: lead } = await supabase.from('leads').insert({",
  '      agent_id: agent?.id || null,',
  '      user_id: userIdForLead,',
  '      manager_id: chainManagerId,'
].join(eol);
assertSingle(patched, a3, 'Anchor 3 (insert payload)');
patched = patched.replace(a3, r3);
console.log('CHANGE 3: user_id field added to insert payload');

// Write
fs.writeFileSync(routePath, patched, 'utf8');
const newBytes = Buffer.byteLength(patched, 'utf8');
console.log('Wrote ' + routePath + ': ' + newBytes + ' bytes (delta: +' + (newBytes - originalBytes) + ')');

// Verifications
const checks = {
  'Import added':                    patched.includes("import { getOrCreateAuthUserByEmail } from '@/lib/auth/get-or-create-by-email'"),
  'Derivation block present':        patched.includes('let userIdForLead: string | null = null'),
  'Helper call present':             patched.includes('await getOrCreateAuthUserByEmail(supabase, email,'),
  'user_id in insert payload':       patched.includes('user_id: userIdForLead,'),
  'graceful fallback logged':        patched.includes('[walliam/contact] get-or-create auth user failed'),
  'helper file written':             fs.existsSync(helperPath)
};
console.log('');
console.log('Verifications:');
let allPass = true;
for (const k of Object.keys(checks)) {
  const v = checks[k];
  console.log('  ' + (v ? 'OK  ' : 'FAIL') + '  ' + k);
  if (!v) allPass = false;
}
if (!allPass) throw new Error('Post-patch verification failed -- rollback route from ' + backupPath + ' and delete ' + helperPath);
console.log('');
console.log('All verifications passed.');
console.log('Files:');
console.log('  + ' + helperPath + ' (' + Buffer.byteLength(helperContent, 'utf8') + ' bytes, new)');
console.log('  M ' + routePath + ' (' + originalBytes + ' -> ' + newBytes + ', delta +' + (newBytes - originalBytes) + ')');
console.log('Backup: ' + backupPath);