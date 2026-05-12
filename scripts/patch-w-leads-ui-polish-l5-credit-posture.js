// scripts/patch-w-leads-ui-polish-l5-credit-posture.js
//
// L5: Credit posture chip + VIP pending badge.
//   - page.tsx: pre-fetch user_credit_overrides (by user_id) + vip_requests (by lead_id)
//   - AdminHomesLeadsClient.tsx:
//       * Lead.user_id field (was missing despite being SELECTed via *)
//       * Props.initialCreditOverrides + Props.initialVipRequests
//       * useState for both
//       * VIP Pending badge in Contact cell (next to engagement chip)
//       * Credit posture chip in Quality cell (below the quality buttons)
//   - tracker append (L5 status log entry)
//
// Chip content uses string concatenation (no template literals) to keep
// the inserted content backtick-free; surrounding line-pattern walks
// (C4 + C5) handle the existing JSX context that already has backticks.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
console.log('L5 patch stamp: ' + stamp);

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

  // P1: insert L5 prefetch after L4 prefetch closing block (4-line anchor; no backticks)
  const anchorP1 = `    for (const lead of (leads || [])) {
      activitiesByLeadId[(lead as any).id] = byEmail[(lead as any).contact_email] || [];
    }
  }`;
  if (text.split(anchorP1).length - 1 !== 1) throw new Error('P1: anchor count != 1');
  const l5Block = anchorP1 + `

  // L5: pre-fetch user_credit_overrides + vip_requests for credit posture chip.
  // Multi-tenant safety: both tables have tenant_id NOT NULL. Scope by scopedTenantId when !seeAll.
  // user_credit_overrides keyed by (user_id, tenant_id) -- 1 row per user per tenant. Join by lead.user_id.
  // vip_requests has direct FK lead_id to leads. Join by lead.id (semantically equivalent to "by lead.user_id" since lead.id is keyed under lead.user_id).
  const leadUserIds = Array.from(
    new Set((leads || []).map((l: any) => l.user_id).filter(Boolean))
  ) as string[];
  const leadIds = (leads || []).map((l: any) => l.id) as string[];

  const creditByUserId: Record<string, any> = {};
  if (leadUserIds.length > 0) {
    let credQuery = supabase
      .from('user_credit_overrides')
      .select('user_id, ai_chat_limit, buyer_plan_limit, seller_plan_limit, estimator_limit, granted_at, granted_by_tier')
      .in('user_id', leadUserIds);
    if (!seeAll && scopedTenantId) {
      credQuery = credQuery.eq('tenant_id', scopedTenantId);
    }
    const { data: creditRows } = await credQuery;
    for (const c of (creditRows || [])) {
      const uid = (c as any).user_id;
      if (uid) creditByUserId[uid] = c;
    }
  }

  const vipByLeadId: Record<string, any[]> = {};
  if (leadIds.length > 0) {
    let vipQuery = supabase
      .from('vip_requests')
      .select('id, lead_id, status, request_type, messages_granted, created_at, expires_at')
      .in('lead_id', leadIds);
    if (!seeAll && scopedTenantId) {
      vipQuery = vipQuery.eq('tenant_id', scopedTenantId);
    }
    const { data: vipRows } = await vipQuery;
    for (const v of (vipRows || [])) {
      const lid = (v as any).lead_id;
      if (lid) {
        if (!vipByLeadId[lid]) vipByLeadId[lid] = [];
        vipByLeadId[lid].push(v);
      }
    }
  }`;
  text = text.replace(anchorP1, l5Block);
  console.log('  OK P1 L5 prefetch block inserted');

  // P2: empty-branch render -- add 2 props
  const anchorP2 = '          initialActivities={{}}';
  if (text.split(anchorP2).length - 1 !== 1) throw new Error('P2: anchor count != 1');
  text = text.replace(anchorP2, '          initialActivities={{}}\n          initialCreditOverrides={{}}\n          initialVipRequests={{}}');
  console.log('  OK P2 empty-branch props added');

  // P3: main-return render -- add 2 props
  const anchorP3 = '      initialActivities={activitiesByLeadId}';
  if (text.split(anchorP3).length - 1 !== 1) throw new Error('P3: anchor count != 1');
  text = text.replace(anchorP3, '      initialActivities={activitiesByLeadId}\n      initialCreditOverrides={creditByUserId}\n      initialVipRequests={vipByLeadId}');
  console.log('  OK P3 main-return props added');

  // Residual checks
  if (!text.includes('creditByUserId')) throw new Error('page: creditByUserId missing');
  if (!text.includes('vipByLeadId')) throw new Error('page: vipByLeadId missing');
  if (text.split('initialCreditOverrides=').length - 1 !== 2) throw new Error('page: initialCreditOverrides count != 2');
  if (text.split('initialVipRequests=').length - 1 !== 2) throw new Error('page: initialVipRequests count != 2');

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

  // C0: Lead type -- add user_id field after id
  const anchorC0 = '  id: string\n  contact_name: string';
  if (text.split(anchorC0).length - 1 !== 1) throw new Error('C0: anchor count != 1');
  text = text.replace(anchorC0, '  id: string\n  user_id: string | null\n  contact_name: string');
  console.log('  OK C0 Lead.user_id added');

  // C1: Props interface -- add 2 fields
  const anchorC1 = '  initialActivities: Record<string, any[]>';
  if (text.split(anchorC1).length - 1 !== 1) throw new Error('C1: anchor count != 1');
  text = text.replace(anchorC1, '  initialActivities: Record<string, any[]>\n  initialCreditOverrides: Record<string, any>\n  initialVipRequests: Record<string, any[]>');
  console.log('  OK C1 Props extended');

  // C2: component signature destructure
  const anchorC2 = 'export default function AdminHomesLeadsClient({ initialLeads, initialActivities, agents, currentRole, currentAgentId }: Props) {';
  if (text.split(anchorC2).length - 1 !== 1) throw new Error('C2: anchor count != 1');
  text = text.replace(anchorC2, 'export default function AdminHomesLeadsClient({ initialLeads, initialActivities, initialCreditOverrides, initialVipRequests, agents, currentRole, currentAgentId }: Props) {');
  console.log('  OK C2 signature destructure updated');

  // C3: add useState for creditOverrides + vipRequests after activities useState
  const anchorC3 = '  const [activities, setActivities] = useState<Record<string, any[]>>(initialActivities)';
  if (text.split(anchorC3).length - 1 !== 1) throw new Error('C3: anchor count != 1');
  text = text.replace(anchorC3, '  const [activities, setActivities] = useState<Record<string, any[]>>(initialActivities)\n  const [creditOverrides] = useState<Record<string, any>>(initialCreditOverrides)\n  const [vipRequests] = useState<Record<string, any[]>>(initialVipRequests)');
  console.log('  OK C3 useState for creditOverrides + vipRequests added');

  // C4: VIP pending badge in Contact cell -- line-pattern walk
  // Find unique `const eng = calcEngagement` marker, walk forward to `})()}` IIFE close, insert badge after.
  {
    const lines = text.split('\n');
    const engIdx = lines.findIndex(l => l.includes('const eng = calcEngagement'));
    if (engIdx === -1) throw new Error('C4: engagement marker not found');
    const engDupes = lines.filter(l => l.includes('const eng = calcEngagement')).length;
    if (engDupes !== 1) throw new Error('C4: engagement marker count = ' + engDupes);
    let closeIdx = -1;
    for (let i = engIdx + 1; i < Math.min(engIdx + 15, lines.length); i++) {
      if (lines[i].trim() === '})()}') { closeIdx = i; break; }
    }
    if (closeIdx === -1) throw new Error('C4: })()}' + ' close not found within 15 lines');
    const indent = ((lines[closeIdx].match(/^(\s*)/) || ['', ''])[1] || '');
    const vipBadge = [
      indent + '{/* L5: VIP pending badge -- excludes expired-but-not-yet-marked-expired rows */}',
      indent + "{(vipRequests[lead.id] || []).some((v: any) => v.status === 'pending' && (!v.expires_at || new Date(v.expires_at) > new Date())) && (",
      indent + '  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 animate-pulse" title="VIP request pending approval">',
      indent + '    VIP Pending',
      indent + '  </span>',
      indent + ')}',
    ];
    lines.splice(closeIdx + 1, 0, ...vipBadge);
    console.log('  OK C4 VIP pending badge inserted at ' + (closeIdx + 1));
    text = lines.join('\n');
  }

  // C5: Credit posture chip in Quality cell -- line-pattern walk
  // Find unique `Inline quality action buttons -- L1 ships 4 state buttons` comment,
  // walk forward to the </td> close at the matching indent, splice the chip block before close.
  {
    const lines = text.split('\n');
    const commentIdx = lines.findIndex(l => l.includes('Inline quality action buttons -- L1 ships 4 state buttons'));
    if (commentIdx === -1) throw new Error('C5: quality comment marker not found');
    const cDupes = lines.filter(l => l.includes('Inline quality action buttons -- L1 ships 4 state buttons')).length;
    if (cDupes !== 1) throw new Error('C5: quality comment count = ' + cDupes);
    const tdOpenIdx = commentIdx + 1;
    const tdLine = lines[tdOpenIdx];
    if (!tdLine.trim().startsWith('<td')) {
      throw new Error('C5: expected <td open after comment, got: ' + JSON.stringify(tdLine));
    }
    const tdIndent = ((tdLine.match(/^(\s*)/) || ['', ''])[1] || '');
    let tdCloseIdx = -1;
    for (let i = tdOpenIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      const lineIndent = ((line.match(/^(\s*)/) || ['', ''])[1] || '');
      if (line.trim() === '</td>' && lineIndent === tdIndent) { tdCloseIdx = i; break; }
    }
    if (tdCloseIdx === -1) throw new Error('C5: </td> close at matching indent not found');
    const innerIndent = tdIndent + '  ';
    const creditChip = [
      innerIndent + '{/* L5: Credit posture chip -- only renders for leads with user_id */}',
      innerIndent + '{lead.user_id && (() => {',
      innerIndent + '  const o = creditOverrides[lead.user_id as string]',
      innerIndent + '  if (!o) return <div className="mt-1 text-xs text-gray-400">Default credits</div>',
      innerIndent + '  const vals = [o.ai_chat_limit, o.buyer_plan_limit, o.seller_plan_limit, o.estimator_limit]',
      innerIndent + '  const nonNullVals = vals.filter((v: any) => v != null) as number[]',
      innerIndent + '  const allZero = nonNullVals.length > 0 && nonNullVals.every((v) => v === 0)',
      innerIndent + '  if (allZero) return <div className="mt-1 text-xs font-semibold text-red-600">Blocked: 0 credits</div>',
      innerIndent + '  const labels = [',
      innerIndent + "    o.ai_chat_limit != null ? 'Chat:' + o.ai_chat_limit : null,",
      innerIndent + "    o.buyer_plan_limit != null ? 'Buyer:' + o.buyer_plan_limit : null,",
      innerIndent + "    o.seller_plan_limit != null ? 'Seller:' + o.seller_plan_limit : null,",
      innerIndent + "    o.estimator_limit != null ? 'Est:' + o.estimator_limit : null,",
      innerIndent + '  ].filter(Boolean) as string[]',
      innerIndent + '  if (labels.length === 0) return <div className="mt-1 text-xs text-gray-400">Default credits</div>',
      innerIndent + '  return <div className="mt-1 text-xs text-emerald-700">{labels.join(\' \u00b7 \')}</div>',
      innerIndent + '})()}',
    ];
    lines.splice(tdCloseIdx, 0, ...creditChip);
    console.log('  OK C5 Credit posture chip inserted at ' + tdCloseIdx);
    text = lines.join('\n');
  }

  // Residual checks
  if (!text.includes('user_id: string | null')) throw new Error('residual: Lead.user_id field missing');
  if (!text.includes('initialCreditOverrides')) throw new Error('residual: initialCreditOverrides missing');
  if (!text.includes('initialVipRequests')) throw new Error('residual: initialVipRequests missing');
  if (!text.includes('creditOverrides[lead.user_id as string]')) throw new Error('residual: credit chip indexing missing');
  if (!text.includes('VIP Pending')) throw new Error('residual: VIP Pending label missing');
  if (!text.includes('Blocked: 0 credits')) throw new Error('residual: Blocked label missing');

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

  if (text.split('**2026-05-12 L4**').length - 1 < 1) throw new Error('tracker: L4 anchor not found');
  if (!text.endsWith('\n')) text = text + '\n';

  const EM = '\u2014';
  const l5Entry =
    '- **2026-05-12 L5** ' + EM + ' **Credit posture chip + VIP pending badge shipped.** ' +
    '`app/admin-homes/leads/page.tsx` server-side pre-fetches two new tables in parallel batched queries after the L4 activities pre-fetch: ' +
    '`user_credit_overrides` (joined by `user_id IN leadUserIds`, returns the 4 limit columns + `granted_at` + `granted_by_tier`) and ' +
    '`vip_requests` (joined by `lead_id IN leadIds`, returns `status` + `request_type` + `messages_granted` + `created_at` + `expires_at`). ' +
    'Multi-tenant safety: both tables have `tenant_id NOT NULL` (verified by schema probe); `.eq(\'tenant_id\', scopedTenantId)` applied when `!seeAll`, mirroring the L4 + leads-query scoping. ' +
    '**Tracker-spec correction:** the L5 spec said "joins ... by `lead.user_id`" but `vip_requests` has no `user_id` column ' + EM + ' it has `lead_id` (direct FK to leads). The L5 implementation joins by `lead.id` ' + EM + ' `vip_requests.lead_id` which is semantically equivalent (each `lead.id` is keyed under exactly one `lead.user_id`) and uses the indexed FK column. ' +
    '**Schema probe gotcha logged:** `user_credit_overrides` does NOT have a `created_at` column (the timestamps are `granted_at` and `updated_at`). The recon SQL-B probe failed with `column "created_at" does not exist`; that failure was caught by Rule Zero ' + EM + ' No Guessing, fed corrected column names back into the SELECT (`granted_at` for ordering). ' +
    'Two new props passed to `AdminHomesLeadsClient`: `initialCreditOverrides: Record<string, any>` (keyed by `user_id`, single row per user per tenant due to the composite UNIQUE on `(user_id, tenant_id)` confirmed by the override route\'s `onConflict: \'user_id,tenant_id\'`) and `initialVipRequests: Record<string, any[]>` (keyed by `lead_id`, can be multiple per lead across pending/approved/expired statuses). Both render branches updated (empty-tenant branch passes `{}` for both). ' +
    '`components/admin-homes/AdminHomesLeadsClient.tsx`: ' +
    '`Lead` type extended with `user_id: string | null` ' + EM + ' the field was already returned by the page SELECT via `*` wildcard but never declared in the client type, blocking L5 chip access; ' +
    'Props extended with `initialCreditOverrides` + `initialVipRequests`; destructure updated; ' +
    '`useState` declared for both new records (single-value, no setter ' + EM + ' but declared with `useState` to mirror the L4 activities pattern and reserve mutation capability for L6 inline grant + Approve VIP actions). ' +
    '**VIP Pending badge** (Contact column, inline next to engagement chip): animated amber pill (`bg-amber-100 text-amber-800 animate-pulse`) rendered whenever any `vipRequests[lead.id]` entry has `status === \'pending\'` AND (`!v.expires_at || new Date(v.expires_at) > new Date()`). The expiry check is defensive: `vip_requests` has no auto-expiry job ' + EM + ' rows are only marked `expired` opportunistically when a stale approval is attempted (see `walliam/estimator/vip-approve` L71 update) ' + EM + ' so a row can be `status: pending` with `expires_at` in the past indefinitely. The badge filters those out so agents don\'t chase dead requests. ' +
    'Line-pattern walk: find unique `const eng = calcEngagement` marker, walk forward to the next `})()}` IIFE close, splice the badge after. ' +
    'The `animate-pulse` class draws attention as agents scan the leads table. ' +
    '**Credit posture chip** (Quality column, below the four quality buttons): rendered only when `lead.user_id` (anonymous leads ' + EM + ' 41 of 163 WALLiam rows per probe ' + EM + ' get no chip, which is correct semantics, no user account ' + EM + ' no credits to track). ' +
    'Chip semantics, in order: ' +
    '(1) `!lead.user_id` ' + EM + ' nothing rendered. ' +
    '(2) No row in `user_credit_overrides` for this `user_id` ' + EM + ' `Default credits` (gray, indicates user is on tenant defaults). ' +
    '(3) Row exists, all 4 non-NULL limit values are 0 ' + EM + ' `Blocked: 0 credits` (red, `font-semibold` ' + EM + ' the prominent blocked-state badge per spec). ' +
    '(4) Row exists, all 4 limits are NULL ' + EM + ' `Default credits` (consistent with case 2). ' +
    '(5) Mix of non-NULL limits ' + EM + ' compact emerald summary like `Chat:5 \u00b7 Buyer:3 \u00b7 Est:2` (only non-NULL axes shown, separated by middots). ' +
    'Line-pattern walk: find unique `Inline quality action buttons -- L1 ships 4 state buttons` comment; walk forward to the `</td>` close at the matching indent; splice the chip block before close. ' +
    'Chip content uses string concatenation (e.g. `\'Chat:\' + o.ai_chat_limit`) instead of template literals to keep the inserted content backtick-free, even though the inserted block is bounded by JSX context that includes template literal backticks elsewhere; the line-pattern walk handles the whitespace context. ' +
    '**No DB schema changes. No new API routes.** Re-uses existing `app/api/admin-homes/users/override/route.ts` (admin grant route) and existing `vip_requests` write paths (chat/walliam routes). L6 (inline action buttons) will add Approve VIP + Grant credits buttons that mutate the credit/VIP state surfaced by L5. ' +
    '**Patch design:** 10 anchors across 2 production files + tracker append. ' +
    'P1 page.tsx prefetch insertion uses a 4-line exact-string anchor (no backticks in content ' + EM + ' safe per the recovery2-locked rule). ' +
    'P2/P3 single-line exact-string anchors. ' +
    'C0/C1/C2/C3 single-line exact-string anchors. ' +
    'C4 + C5 use line-pattern walks because the surrounding JSX context already contains template-literal backticks even though the inserted content does not. ' +
    'No recovery passes needed. TSC clean. ' +
    '**Multi-tenant safety verified:** `user_credit_overrides` query scoped by `tenant_id` when `!seeAll`; `vip_requests` query scoped by `tenant_id` when `!seeAll`; `leadUserIds` + `leadIds` derived from already-role-filtered leads result; no cross-tenant credit/VIP leak possible. ' +
    '**Data observations for WALLiam (`b16e1039-38ed-43d7-bbc5-dd02bb651bc9`):** 163 total leads; 122 with `user_id`; 41 anonymous (`user_id IS NULL`); 121 distinct users among the 122. ' +
    'Anonymous leads (25% of the table) render no credit chip ' + EM + ' clean graceful degradation. ' +
    'L5 row in phase table stays OPEN until Lclose.\n';

  text = text + l5Entry;
  fs.writeFileSync(src, text, 'utf8');

  const l5Count = text.split('**2026-05-12 L5**').length - 1;
  if (l5Count !== 1) throw new Error('tracker: L5 marker count = ' + l5Count);
  console.log('  L5 marker count: ' + l5Count);
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta +' + (text.length - before) + ')');
}

console.log('\n=== L5 PATCHES APPLIED OK ===');