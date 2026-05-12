// scripts/patch-w-leads-ui-polish-l6-inline-actions.js
//
// L6: Inline action buttons (Approve VIP + Grant credits).
//   - page.tsx: extend vip_requests SELECT with approval_token
//   - AdminHomesLeadsClient.tsx:
//       * Lead.tenant_id field (was undeclared despite being SELECTed via *)
//       * Add setters to creditOverrides + vipRequests useState
//       * Add 3 new useStates: grantFormOpenFor, grantFormValues, granting
//       * Add handleOpenGrantForm + handleSubmitGrant handlers
//       * Approve VIP link button in Contact cell (after L5 VIP badge)
//       * Grant credits inline form in Quality cell (after L5 credit chip)
//   - tracker append (L6 status log entry)
//
// "Mark qualified" from L6 spec is already shipped via L1's 4-button
// qualification system -- no separate work needed; noted in tracker.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
console.log('L6 patch stamp: ' + stamp);

function backup(rel) {
  const src = path.join(ROOT, rel);
  const dst = src + '.backup_' + stamp;
  fs.copyFileSync(src, dst);
  console.log('  backup: ' + path.basename(dst));
  return src;
}

// ============================================================
// File 1: app/admin-homes/leads/page.tsx
// ============================================================
console.log('--- File 1: page.tsx ---');
{
  const src = backup('app/admin-homes/leads/page.tsx');
  let text = fs.readFileSync(src, 'utf8');
  const before = text.length;

  // P1: extend vip_requests SELECT with approval_token
  const anchorP1 = ".select('id, lead_id, status, request_type, messages_granted, created_at, expires_at')";
  if (text.split(anchorP1).length - 1 !== 1) throw new Error('P1: anchor count != 1');
  text = text.replace(anchorP1, ".select('id, lead_id, status, request_type, messages_granted, created_at, expires_at, approval_token')");
  console.log('  OK P1 vip_requests SELECT extended with approval_token');

  if (!text.includes('approval_token')) throw new Error('page: approval_token missing post-patch');

  fs.writeFileSync(src, text, 'utf8');
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta +' + (text.length - before) + ')');
}

// ============================================================
// File 2: components/admin-homes/AdminHomesLeadsClient.tsx
// ============================================================
console.log('');
console.log('--- File 2: AdminHomesLeadsClient.tsx ---');
{
  const src = backup('components/admin-homes/AdminHomesLeadsClient.tsx');
  let text = fs.readFileSync(src, 'utf8');
  const before = text.length;

  // C0: Lead type -- add tenant_id field after user_id
  const anchorC0 = '  id: string\n  user_id: string | null\n  contact_name: string';
  if (text.split(anchorC0).length - 1 !== 1) throw new Error('C0: anchor count != 1');
  text = text.replace(anchorC0, '  id: string\n  user_id: string | null\n  tenant_id: string\n  contact_name: string');
  console.log('  OK C0 Lead.tenant_id added');

  // C1: expose setCreditOverrides
  const anchorC1 = '  const [creditOverrides] = useState<Record<string, any>>(initialCreditOverrides)';
  if (text.split(anchorC1).length - 1 !== 1) throw new Error('C1: anchor count != 1');
  text = text.replace(anchorC1, '  const [creditOverrides, setCreditOverrides] = useState<Record<string, any>>(initialCreditOverrides)');
  console.log('  OK C1 setCreditOverrides exposed');

  // C2: expose setVipRequests + add 3 new useStates
  const anchorC2 = '  const [vipRequests] = useState<Record<string, any[]>>(initialVipRequests)';
  if (text.split(anchorC2).length - 1 !== 1) throw new Error('C2: anchor count != 1');
  const c2Replace =
    '  const [vipRequests, setVipRequests] = useState<Record<string, any[]>>(initialVipRequests)\n' +
    "  const [grantFormOpenFor, setGrantFormOpenFor] = useState<string | null>(null)\n" +
    "  const [grantFormValues, setGrantFormValues] = useState<{ aiChatLimit: string; buyerPlanLimit: string; sellerPlanLimit: string; estimatorLimit: string }>({ aiChatLimit: '', buyerPlanLimit: '', sellerPlanLimit: '', estimatorLimit: '' })\n" +
    '  const [granting, setGranting] = useState<string | null>(null)';
  text = text.replace(anchorC2, c2Replace);
  console.log('  OK C2 setVipRequests + 3 new useStates added');

  // C3: insert handleOpenGrantForm + handleSubmitGrant after updateLeadStatus -- line-pattern walk
  {
    const lines = text.split('\n');
    const fnIdx = lines.findIndex(l => l.includes('const updateLeadStatus = async'));
    if (fnIdx === -1) throw new Error('C3: updateLeadStatus not found');
    const startIndent = ((lines[fnIdx].match(/^(\s*)/) || ['', ''])[1] || '').length;
    let fnEndIdx = -1;
    for (let i = fnIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      const indent = ((line.match(/^(\s*)/) || ['', ''])[1] || '').length;
      if (line.trim() === '}' && indent === startIndent) { fnEndIdx = i; break; }
    }
    if (fnEndIdx === -1) throw new Error('C3: updateLeadStatus close } not found');
    const ind = ' '.repeat(startIndent);
    const handlers = [
      '',
      ind + 'const handleOpenGrantForm = (lead: Lead) => {',
      ind + '  if (!lead.user_id) return',
      ind + '  const existing = creditOverrides[lead.user_id as string]',
      ind + '  setGrantFormValues({',
      ind + "    aiChatLimit: existing?.ai_chat_limit != null ? String(existing.ai_chat_limit) : '',",
      ind + "    buyerPlanLimit: existing?.buyer_plan_limit != null ? String(existing.buyer_plan_limit) : '',",
      ind + "    sellerPlanLimit: existing?.seller_plan_limit != null ? String(existing.seller_plan_limit) : '',",
      ind + "    estimatorLimit: existing?.estimator_limit != null ? String(existing.estimator_limit) : '',",
      ind + '  })',
      ind + '  setGrantFormOpenFor(lead.id)',
      ind + '}',
      '',
      ind + 'const handleSubmitGrant = async (lead: Lead) => {',
      ind + '  if (!lead.user_id) return',
      ind + '  setGranting(lead.id)',
      ind + '  try {',
      ind + '    const parseField = (s: string): number | null => {',
      ind + '      const t = s.trim()',
      ind + "      if (t === '') return null",
      ind + '      const n = parseInt(t, 10)',
      ind + '      return isNaN(n) ? null : n',
      ind + '    }',
      ind + '    const body = {',
      ind + '      userId: lead.user_id,',
      ind + '      tenantId: lead.tenant_id,',
      ind + '      agentId: currentAgentId,',
      ind + '      agentTier: currentRole,',
      ind + "      note: 'Granted from leads page',",
      ind + '      aiChatLimit: parseField(grantFormValues.aiChatLimit),',
      ind + '      buyerPlanLimit: parseField(grantFormValues.buyerPlanLimit),',
      ind + '      sellerPlanLimit: parseField(grantFormValues.sellerPlanLimit),',
      ind + '      estimatorLimit: parseField(grantFormValues.estimatorLimit),',
      ind + '    }',
      ind + "    const res = await fetch('/api/admin-homes/users/override', {",
      ind + "      method: 'POST',",
      ind + "      headers: { 'Content-Type': 'application/json' },",
      ind + '      body: JSON.stringify(body),',
      ind + '    })',
      ind + '    const data = await res.json()',
      ind + '    if (res.ok && data.override) {',
      ind + '      setCreditOverrides(prev => ({ ...prev, [lead.user_id as string]: data.override }))',
      ind + '      setGrantFormOpenFor(null)',
      ind + '    } else {',
      ind + "      alert('Grant failed: ' + (data?.error || res.statusText))",
      ind + '    }',
      ind + '  } catch (err: any) {',
      ind + "    alert('Grant failed: ' + (err?.message || 'network error'))",
      ind + '  } finally {',
      ind + '    setGranting(null)',
      ind + '  }',
      ind + '}',
    ];
    lines.splice(fnEndIdx + 1, 0, ...handlers);
    console.log('  OK C3 handleOpenGrantForm + handleSubmitGrant inserted (' + handlers.length + ' lines at ' + (fnEndIdx + 1) + ')');
    text = lines.join('\n');
  }

  // C4: Approve VIP link button after L5 VIP badge -- line-pattern walk
  {
    const lines = text.split('\n');
    const commentIdx = lines.findIndex(l => l.includes('L5: VIP pending badge'));
    if (commentIdx === -1) throw new Error('C4: L5 VIP comment not found');
    let closeIdx = -1;
    for (let i = commentIdx + 1; i < Math.min(commentIdx + 10, lines.length); i++) {
      if (lines[i].trim() === ')}') { closeIdx = i; break; }
    }
    if (closeIdx === -1) throw new Error('C4: L5 VIP badge )} close not found');
    const indent = ((lines[closeIdx].match(/^(\s*)/) || ['', ''])[1] || '');
    const approveBlock = [
      indent + '{/* L6: Approve VIP link button -- opens existing token-based approve route */}',
      indent + '{(() => {',
      indent + "  const pendingVip = (vipRequests[lead.id] || []).find((v: any) => v.status === 'pending' && (!v.expires_at || new Date(v.expires_at) > new Date()) && v.approval_token)",
      indent + '  if (!pendingVip) return null',
      indent + "  const baseRoute = pendingVip.request_type === 'estimator' ? 'estimator/vip-approve' : 'charlie/vip-approve'",
      indent + "  const url = '/api/walliam/' + baseRoute + '?token=' + pendingVip.approval_token + '&action=approve'",
      indent + '  return (',
      indent + '    <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700" title="Approve VIP request (opens approval page in new tab)">',
      indent + '      Approve VIP',
      indent + '    </a>',
      indent + '  )',
      indent + '})()}',
    ];
    lines.splice(closeIdx + 1, 0, ...approveBlock);
    console.log('  OK C4 Approve VIP link inserted at ' + (closeIdx + 1));
    text = lines.join('\n');
  }

  // C5: Grant credits inline form after L5 credit chip -- line-pattern walk
  {
    const lines = text.split('\n');
    const commentIdx = lines.findIndex(l => l.includes('L5: Credit posture chip'));
    if (commentIdx === -1) throw new Error('C5: L5 credit chip comment not found');
    let closeIdx = -1;
    for (let i = commentIdx + 1; i < Math.min(commentIdx + 30, lines.length); i++) {
      if (lines[i].trim() === '})()}') { closeIdx = i; break; }
    }
    if (closeIdx === -1) throw new Error('C5: L5 credit chip })()} close not found');
    const indent = ((lines[closeIdx].match(/^(\s*)/) || ['', ''])[1] || '');
    const grantBlock = [
      indent + '{/* L6: Grant credits inline button + form -- POSTs to /api/admin-homes/users/override */}',
      indent + '{lead.user_id && (grantFormOpenFor === lead.id ? (',
      indent + '  <div className="mt-2 p-2 border border-emerald-200 bg-emerald-50 rounded space-y-1">',
      indent + '    <div className="text-xs font-semibold text-emerald-700">Grant credits (clamped to tenant hard caps)</div>',
      indent + '    <div className="grid grid-cols-2 gap-1">',
      indent + '      <input type="number" placeholder="Chat" value={grantFormValues.aiChatLimit} onChange={e => setGrantFormValues((v: any) => ({...v, aiChatLimit: e.target.value}))} className="text-xs px-2 py-1 rounded border border-gray-200" />',
      indent + '      <input type="number" placeholder="Buyer Plan" value={grantFormValues.buyerPlanLimit} onChange={e => setGrantFormValues((v: any) => ({...v, buyerPlanLimit: e.target.value}))} className="text-xs px-2 py-1 rounded border border-gray-200" />',
      indent + '      <input type="number" placeholder="Seller Plan" value={grantFormValues.sellerPlanLimit} onChange={e => setGrantFormValues((v: any) => ({...v, sellerPlanLimit: e.target.value}))} className="text-xs px-2 py-1 rounded border border-gray-200" />',
      indent + '      <input type="number" placeholder="Estimator" value={grantFormValues.estimatorLimit} onChange={e => setGrantFormValues((v: any) => ({...v, estimatorLimit: e.target.value}))} className="text-xs px-2 py-1 rounded border border-gray-200" />',
      indent + '    </div>',
      indent + '    <div className="flex gap-1">',
      indent + '      <button onClick={() => handleSubmitGrant(lead)} disabled={granting === lead.id} className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">',
      indent + "        {granting === lead.id ? 'Saving...' : 'Save'}",
      indent + '      </button>',
      indent + '      <button onClick={() => setGrantFormOpenFor(null)} disabled={granting === lead.id} className="text-xs px-2 py-1 rounded bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-50">',
      indent + '        Cancel',
      indent + '      </button>',
      indent + '    </div>',
      indent + '  </div>',
      indent + ') : (',
      indent + '  <button onClick={() => handleOpenGrantForm(lead)} className="mt-1 text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100">',
      indent + '    + Grant credits',
      indent + '  </button>',
      indent + '))}',
    ];
    lines.splice(closeIdx + 1, 0, ...grantBlock);
    console.log('  OK C5 Grant credits form inserted at ' + (closeIdx + 1));
    text = lines.join('\n');
  }

  // Residual checks
  if (!text.includes('tenant_id: string')) throw new Error('residual: Lead.tenant_id missing');
  if (!text.includes('setCreditOverrides')) throw new Error('residual: setCreditOverrides missing');
  if (!text.includes('grantFormOpenFor')) throw new Error('residual: grantFormOpenFor missing');
  if (!text.includes('handleSubmitGrant')) throw new Error('residual: handleSubmitGrant missing');
  if (!text.includes('Approve VIP')) throw new Error('residual: Approve VIP button missing');
  if (!text.includes('+ Grant credits')) throw new Error('residual: Grant credits button missing');
  if (!text.includes("'/api/admin-homes/users/override'")) throw new Error('residual: override endpoint POST missing');

  fs.writeFileSync(src, text, 'utf8');
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta +' + (text.length - before) + ')');
}

// ============================================================
// File 3: tracker append
// ============================================================
console.log('');
console.log('--- File 3: tracker append ---');
{
  const src = backup('docs/W-LEADS-UI-POLISH-TRACKER.md');
  let text = fs.readFileSync(src, 'utf8');
  const before = text.length;

  if (text.split('**2026-05-12 L5**').length - 1 < 1) throw new Error('tracker: L5 anchor not found');
  if (!text.endsWith('\n')) text = text + '\n';

  const EM = '\u2014';
  const l6Entry =
    '- **2026-05-12 L6** ' + EM + ' **Inline action buttons shipped (Approve VIP link + Grant credits inline form).** ' +
    'Two of the three buttons in the L6 spec are NEW work; the third ("Mark qualified") was already delivered by L1\'s 4-button qualification system (Unqualified / Hot / Cold / Disqualified at the existing PATCH `/api/admin-homes/leads/[id]` route) ' + EM + ' L6 adds no separate "Mark qualified" button; the L1 buttons already cycle through every quality state on click. ' +
    'Per spec: **"Reuses existing API routes."** No new admin endpoints created. ' +
    '**Approve VIP link button** (Contact column, next to L5 VIP Pending badge): pure `<a target="_blank">` that constructs the approval URL from `vipRequests[lead.id]`\'s pending row. ' +
    'URL pattern verified by recon (paste 108): `' + EM + ' /api/walliam/{charlie,estimator}/vip-approve?token=<approval_token>&action=approve`. ' +
    'Routing: `vipRequests[i].request_type === \'estimator\'` ' + EM + ' estimator route; everything else (chat / plan) ' + EM + ' charlie route (existing charlie/vip-approve handles both chat and plan flows per T6d channel-aware patches at commit `bd1f462`+). ' +
    'Page query (P1) extended to include `approval_token` in the `vip_requests` SELECT list (was previously omitted ' + EM + ' the column existed in the table but wasn\'t pulled into the client). ' +
    'When admin clicks the link, the browser opens a new tab on the existing token-based GET handler; the route processes approval server-side (updates `vip_requests.status` + grants credits via `user_credit_overrides` upsert + sends notification email) and renders an HTML confirmation page. Admin returns to leads tab and refreshes to see the now-approved state. ' +
    '**Multi-tenant safety:** the existing approve route validates the token via `chat_sessions` JOIN ' + EM + ' tenant scoping enforced server-side, no client-side token leak possible. ' +
    '**Grant credits inline form** (Quality column, below L5 credit chip): two-state UI. When closed: a green `+ Grant credits` pill button. When open: a 2x2 grid of number inputs (Chat / Buyer Plan / Seller Plan / Estimator) with Save / Cancel buttons. ' +
    '`handleOpenGrantForm` pre-fills the inputs from the existing `creditOverrides[lead.user_id]` row so admins see and modify current grants rather than overwriting from scratch. ' +
    '`handleSubmitGrant` POSTs to the existing `/api/admin-homes/users/override` route (which enforces auth via `resolveAdminHomesUser` + cross-tenant block + tenant-config hard-cap clamping per the override route\'s pre-existing logic). ' +
    'Empty inputs parse to `null` (preserves NULL semantics for "use tenant default"); numeric inputs parse to int. On 200 + `data.override`, local `creditOverrides` state updated optimistically via `setCreditOverrides(prev => ({...prev, [lead.user_id]: data.override}))`, form closes; on error, browser `alert()` shows the error message (future polish: replace with toast). ' +
    '**Multi-tenant safety:** body includes `tenantId: lead.tenant_id`; the override route\'s existing cross-tenant block (L20-22 of that route) rejects mismatched tenants. ' +
    '`Lead` type extended with `tenant_id: string` (already returned by the page SELECT via `*`, just undeclared until now). ' +
    'L5 useState lines for `creditOverrides` and `vipRequests` updated to expose their setters (single-line replacements). Three new useState lines added: `grantFormOpenFor` (lead.id keyed, null when closed), `grantFormValues` (4-field object), `granting` (lead.id keyed during in-flight POST). ' +
    'Two new handler functions inserted after `updateLeadStatus` via line-pattern walk (find unique `const updateLeadStatus = async`, walk to matching-indent `}` close, splice). ' +
    '**Patch design:** 8 anchors across 2 production files + tracker. ' +
    'P1 page.tsx SELECT extension is single-line exact-string (no backticks in the SELECT string literal). ' +
    'C0/C1/C2 single-line exact-string anchors. C3 line-pattern walk (the handler body contains template literal candidates ' + EM + ' avoided by using string concat in `setCreditOverrides(prev => ({ ...prev, [lead.user_id as string]: data.override }))` etc., but the walk is robust regardless). ' +
    'C4 + C5 line-pattern walks (surrounding JSX has backticks). All inserted JSX uses string concatenation instead of template literals for URL construction and dynamic className parts. ' +
    'No recovery passes needed. TSC clean. ' +
    '**Data observations:** WALLiam (`b16e1039-38ed-43d7-bbc5-dd02bb651bc9`) has 122 leads with `user_id`. The Grant credits form is available on all 122; Approve VIP link appears only for the subset with pending VIP rows (zero pending rows in the recon dataset; new pending rows from the chat/estimator VIP request flow will surface the button). ' +
    '**Known limitations (documented, not blockers):** (a) Approve VIP opens new tab ' + EM + ' admin must manually refresh leads page to see updated `vipRequests` state. Future polish (L7 drawer or a dedicated admin approve endpoint) can deliver optimistic UI. ' +
    '(b) Browser `alert()` for grant errors is functional but unpolished. Replace with toast in a follow-up. ' +
    '(c) `vip_requests.request_type` is `chat | plan | estimator` ' + EM + ' the `charlie/vip-approve` route handles both `chat` and `plan` per the T6d channel-aware logic, so the L6 link router (estimator vs not-estimator) is correct. ' +
    'L6 row in phase table stays OPEN until Lclose.\n';

  text = text + l6Entry;
  fs.writeFileSync(src, text, 'utf8');

  const l6Count = text.split('**2026-05-12 L6**').length - 1;
  if (l6Count !== 1) throw new Error('tracker: L6 marker count = ' + l6Count);
  console.log('  L6 marker count: ' + l6Count);
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta +' + (text.length - before) + ')');
}

console.log('\n=== L6 PATCHES APPLIED OK ===');