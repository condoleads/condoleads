#!/usr/bin/env node
/**
 * scripts/patch-w-leads-workbench-w3a.js
 *
 * W3a: Strip L1/L5/L6/L7 noise from leads dashboard.
 *
 * 3 files, 18 transforms, atomic (all validate before any write):
 *   1. app/admin-homes/leads/page.tsx              — 2 patches (P1, P2)
 *   2. components/admin-homes/AdminHomesLeadsClient.tsx — 12 patches (C1..C8 incl. C7a-d)
 *   3. docs/W-LEADS-WORKBENCH-TRACKER.md           — 4 patches (T1..T4)
 *
 * Per-file backup .backup_<yyyyMMdd_HHmmss>. Per-file LE + BOM preserved.
 * Pre-flight: HEAD = 471671e879737ce328261afcf09cf2656d632f54
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();

// ===== HEAD pre-flight =====
const head = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
if (!head.startsWith('471671e')) {
  throw new Error(`HEAD pre-flight failed: expected 471671e..., got ${head}`);
}
console.log(`HEAD pre-flight OK: ${head}`);

// ===== timestamp for backups =====
const TS = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
})();

// ===== helpers =====

function readFile(absPath) {
  let raw = fs.readFileSync(absPath, 'utf8');
  const hadBOM = raw.charCodeAt(0) === 0xFEFF;
  if (hadBOM) raw = raw.slice(1);
  const usesCRLF = /\r\n/.test(raw);
  const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw;
  return { content, usesCRLF, hadBOM };
}

function writeFile(absPath, content, usesCRLF, hadBOM) {
  let out = usesCRLF ? content.replace(/\n/g, '\r\n') : content;
  if (hadBOM) out = '\uFEFF' + out;
  fs.writeFileSync(absPath, out, 'utf8');
}

function countOcc(text, needle) {
  if (!needle) return 0;
  let count = 0, idx = 0;
  while ((idx = text.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

function uniqReplace(content, oldStr, newStr, label) {
  const c = countOcc(content, oldStr);
  if (c === 0) throw new Error(`[${label}] OLD anchor not found in file`);
  if (c > 1) throw new Error(`[${label}] OLD anchor not unique (${c} occurrences)`);
  return content.replace(oldStr, newStr);
}

function backup(absPath) {
  const bak = `${absPath}.backup_${TS}`;
  fs.copyFileSync(absPath, bak);
  return bak;
}

// ===== file paths =====

const F_PAGE = path.join(ROOT, 'app', 'admin-homes', 'leads', 'page.tsx');
const F_CLIENT = path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx');
const F_TRACKER = path.join(ROOT, 'docs', 'W-LEADS-WORKBENCH-TRACKER.md');

for (const f of [F_PAGE, F_CLIENT, F_TRACKER]) {
  if (!fs.existsSync(f)) throw new Error(`Missing file: ${f}`);
}

// ====================================================================
// PAGE.TSX  P1 — strip L5 + L7 prefetch blocks  (L103-L186, 84 lines)
// ====================================================================

const P1_OLD = [
  '  }',
  '',
  '  // L5: pre-fetch user_credit_overrides + vip_requests for credit posture chip.',
  '  // Multi-tenant safety: both tables have tenant_id NOT NULL. Scope by scopedTenantId when !seeAll.',
  '  // user_credit_overrides keyed by (user_id, tenant_id) -- 1 row per user per tenant. Join by lead.user_id.',
  '  // vip_requests has direct FK lead_id to leads. Join by lead.id (semantically equivalent to "by lead.user_id" since lead.id is keyed under lead.user_id).',
  '  const leadUserIds = Array.from(',
  '    new Set((leads || []).map((l: any) => l.user_id).filter(Boolean))',
  '  ) as string[];',
  '  const leadIds = (leads || []).map((l: any) => l.id) as string[];',
  '',
  '  const creditByUserId: Record<string, any> = {};',
  '  if (leadUserIds.length > 0) {',
  '    let credQuery = supabase',
  "      .from('user_credit_overrides')",
  "      .select('user_id, ai_chat_limit, buyer_plan_limit, seller_plan_limit, estimator_limit, granted_at, granted_by_tier')",
  "      .in('user_id', leadUserIds);",
  '    if (!seeAll && scopedTenantId) {',
  "      credQuery = credQuery.eq('tenant_id', scopedTenantId);",
  '    }',
  '    const { data: creditRows } = await credQuery;',
  '    for (const c of (creditRows || [])) {',
  '      const uid = (c as any).user_id;',
  '      if (uid) creditByUserId[uid] = c;',
  '    }',
  '  }',
  '',
  '  const vipByLeadId: Record<string, any[]> = {};',
  '  if (leadIds.length > 0) {',
  '    let vipQuery = supabase',
  "      .from('vip_requests')",
  "      .select('id, lead_id, status, request_type, messages_granted, created_at, expires_at, approval_token')",
  "      .in('lead_id', leadIds);",
  '    if (!seeAll && scopedTenantId) {',
  "      vipQuery = vipQuery.eq('tenant_id', scopedTenantId);",
  '    }',
  '    const { data: vipRows } = await vipQuery;',
  '    for (const v of (vipRows || [])) {',
  '      const lid = (v as any).lead_id;',
  '      if (lid) {',
  '        if (!vipByLeadId[lid]) vipByLeadId[lid] = [];',
  '        vipByLeadId[lid].push(v);',
  '      }',
  '    }',
  '  }',
  '',
  '  // L7: pre-fetch lead_email_recipients_log + lead_notes for the lead detail drawer.',
  '  // Multi-tenant safety:',
  '  //   - lead_email_recipients_log has tenant_id NOT NULL -> direct scope by scopedTenantId when !seeAll.',
  '  //   - lead_notes has NO tenant_id column -> tenant scoping IMPLICIT via lead_id IN leadIds',
  '  //     (leadIds was already filtered through the tenant-scoped leads query upstream).',
  '  const emailLogByLeadId: Record<string, any[]> = {};',
  '  if (leadIds.length > 0) {',
  '    let emailQuery = supabase',
  "      .from('lead_email_recipients_log')",
  "      .select('id, lead_id, recipient_email, recipient_layer, direction, subject, template_key, status, sent_at, delivered_at, bounced_at, created_at')",
  "      .in('lead_id', leadIds)",
  "      .order('sent_at', { ascending: false, nullsFirst: false });",
  '    if (!seeAll && scopedTenantId) {',
  "      emailQuery = emailQuery.eq('tenant_id', scopedTenantId);",
  '    }',
  '    const { data: emailRows } = await emailQuery;',
  '    for (const e of (emailRows || [])) {',
  '      const lid = (e as any).lead_id;',
  '      if (lid) {',
  '        if (!emailLogByLeadId[lid]) emailLogByLeadId[lid] = [];',
  '        emailLogByLeadId[lid].push(e);',
  '      }',
  '    }',
  '  }',
  '',
  '  const notesByLeadId: Record<string, any[]> = {};',
  '  if (leadIds.length > 0) {',
  '    const { data: noteRows } = await supabase',
  "      .from('lead_notes')",
  "      .select('id, lead_id, agent_id, note, created_at, updated_at')",
  "      .in('lead_id', leadIds)",
  "      .order('created_at', { ascending: false });",
  '    for (const n of (noteRows || [])) {',
  '      const lid = (n as any).lead_id;',
  '      if (lid) {',
  '        if (!notesByLeadId[lid]) notesByLeadId[lid] = [];',
  '        notesByLeadId[lid].push(n);',
  '      }',
  '    }',
  '  }',
].join('\n') + '\n';

const P1_NEW = '  }\n';

// ====================================================================
// PAGE.TSX  P2 — strip 4 render props (L212-L215)
// ====================================================================

const P2_OLD = [
  '      initialActivities={activitiesByLeadId}',
  '      initialCreditOverrides={creditByUserId}',
  '      initialVipRequests={vipByLeadId}',
  '      initialEmailLog={emailLogByLeadId}',
  '      initialNotes={notesByLeadId}',
  '      agents={agents || []}',
].join('\n');

const P2_NEW = [
  '      initialActivities={activitiesByLeadId}',
  '      agents={agents || []}',
].join('\n');

// ====================================================================
// CLIENT.TSX  C1 — Props interface trim (L37-L47)
// ====================================================================

const C1_OLD = [
  'interface Props {',
  '  initialLeads: Lead[]',
  '  initialActivities: Record<string, any[]>',
  '  initialCreditOverrides: Record<string, any>',
  '  initialVipRequests: Record<string, any[]>',
  '  initialEmailLog: Record<string, any[]>',
  '  initialNotes: Record<string, any[]>',
  '  agents: Agent[]',
  "  currentRole: 'admin' | 'manager' | 'agent'",
  '  currentAgentId: string | null',
  '}',
].join('\n');

const C1_NEW = [
  'interface Props {',
  '  initialLeads: Lead[]',
  '  initialActivities: Record<string, any[]>',
  '  agents: Agent[]',
  "  currentRole: 'admin' | 'manager' | 'agent'",
  '  currentAgentId: string | null',
  '}',
].join('\n');

// ====================================================================
// CLIENT.TSX  C2 — function destructure trim (L104)
// ====================================================================

const C2_OLD = 'export default function AdminHomesLeadsClient({ initialLeads, initialActivities, initialCreditOverrides, initialVipRequests, initialEmailLog, initialNotes, agents, currentRole, currentAgentId }: Props) {';
const C2_NEW = 'export default function AdminHomesLeadsClient({ initialLeads, initialActivities, agents, currentRole, currentAgentId }: Props) {';

// ====================================================================
// CLIENT.TSX  C3 — 8 state hooks + useEffect Escape handler (L118-L133)
//                 (L117 activities + L134 updatingStatus PRESERVED)
// ====================================================================

const C3_OLD = [
  '  const [activities, setActivities] = useState<Record<string, any[]>>(initialActivities)',
  '  const [creditOverrides, setCreditOverrides] = useState<Record<string, any>>(initialCreditOverrides)',
  '  const [vipRequests, setVipRequests] = useState<Record<string, any[]>>(initialVipRequests)',
  '  const [grantFormOpenFor, setGrantFormOpenFor] = useState<string | null>(null)',
  "  const [grantFormValues, setGrantFormValues] = useState<{ aiChatLimit: string; buyerPlanLimit: string; sellerPlanLimit: string; estimatorLimit: string }>({ aiChatLimit: '', buyerPlanLimit: '', sellerPlanLimit: '', estimatorLimit: '' })",
  '  const [granting, setGranting] = useState<string | null>(null)',
  '  const [drawerOpenForLead, setDrawerOpenForLead] = useState<Lead | null>(null)',
  '  const [emailLog] = useState<Record<string, any[]>>(initialEmailLog)',
  '  const [notes] = useState<Record<string, any[]>>(initialNotes)',
  '',
  '  useEffect(() => {',
  '    const handler = (e: KeyboardEvent) => {',
  "      if (e.key === 'Escape') setDrawerOpenForLead(null)",
  '    }',
  "    window.addEventListener('keydown', handler)",
  "    return () => window.removeEventListener('keydown', handler)",
  '  }, [])',
  '  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)',
].join('\n');

const C3_NEW = [
  '  const [activities, setActivities] = useState<Record<string, any[]>>(initialActivities)',
  '  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)',
].join('\n');

// ====================================================================
// CLIENT.TSX  C4 — handleOpenGrantForm + handleSubmitGrant (L154-L204)
//                 (L152 updateLeadStatus close + L206 filteredLeads PRESERVED)
// ====================================================================

const C4_OLD = [
  '  }',
  '',
  '  const handleOpenGrantForm = (lead: Lead) => {',
  '    if (!lead.user_id) return',
  '    const existing = creditOverrides[lead.user_id as string]',
  '    setGrantFormValues({',
  "      aiChatLimit: existing?.ai_chat_limit != null ? String(existing.ai_chat_limit) : '',",
  "      buyerPlanLimit: existing?.buyer_plan_limit != null ? String(existing.buyer_plan_limit) : '',",
  "      sellerPlanLimit: existing?.seller_plan_limit != null ? String(existing.seller_plan_limit) : '',",
  "      estimatorLimit: existing?.estimator_limit != null ? String(existing.estimator_limit) : '',",
  '    })',
  '    setGrantFormOpenFor(lead.id)',
  '  }',
  '',
  '  const handleSubmitGrant = async (lead: Lead) => {',
  '    if (!lead.user_id) return',
  '    setGranting(lead.id)',
  '    try {',
  '      const parseField = (s: string): number | null => {',
  '        const t = s.trim()',
  "        if (t === '') return null",
  '        const n = parseInt(t, 10)',
  '        return isNaN(n) ? null : n',
  '      }',
  '      const body = {',
  '        userId: lead.user_id,',
  '        tenantId: lead.tenant_id,',
  '        agentId: currentAgentId,',
  '        agentTier: currentRole,',
  "        note: 'Granted from leads page',",
  '        aiChatLimit: parseField(grantFormValues.aiChatLimit),',
  '        buyerPlanLimit: parseField(grantFormValues.buyerPlanLimit),',
  '        sellerPlanLimit: parseField(grantFormValues.sellerPlanLimit),',
  '        estimatorLimit: parseField(grantFormValues.estimatorLimit),',
  '      }',
  "      const res = await fetch('/api/admin-homes/users/override', {",
  "        method: 'POST',",
  "        headers: { 'Content-Type': 'application/json' },",
  '        body: JSON.stringify(body),',
  '      })',
  '      const data = await res.json()',
  '      if (res.ok && data.override) {',
  '        setCreditOverrides(prev => ({ ...prev, [lead.user_id as string]: data.override }))',
  '        setGrantFormOpenFor(null)',
  '      } else {',
  "        alert('Grant failed: ' + (data?.error || res.statusText))",
  '      }',
  '    } catch (err: any) {',
  "      alert('Grant failed: ' + (err?.message || 'network error'))",
  '    } finally {',
  '      setGranting(null)',
  '    }',
  '  }',
  '',
  '  const filteredLeads = useMemo(() => {',
].join('\n');

const C4_NEW = [
  '  }',
  '',
  '  const filteredLeads = useMemo(() => {',
].join('\n');

// ====================================================================
// CLIENT.TSX  C5 — <tr> onClick + cursor-pointer strip (L439)
// ====================================================================

const C5_OLD = "                  <tr key={lead.id} onClick={(e) => { const t = e.target as HTMLElement; if (t.closest('button, input, select, a, label')) return; setDrawerOpenForLead(lead) }} className={`hover:bg-gray-50 cursor-pointer ${updatingStatus === lead.id ? 'opacity-60' : ''}`}>";
const C5_NEW = "                  <tr key={lead.id} className={`hover:bg-gray-50 ${updatingStatus === lead.id ? 'opacity-60' : ''}`}>";

// ====================================================================
// CLIENT.TSX  C6 — VIP badge + Approve VIP IIFE (L466-L483)
// ====================================================================

const C6_OLD = [
  '                        })()}',
  '                        {/* L5: VIP pending badge -- excludes expired-but-not-yet-marked-expired rows */}',
  "                        {(vipRequests[lead.id] || []).some((v: any) => v.status === 'pending' && (!v.expires_at || new Date(v.expires_at) > new Date())) && (",
  '                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 animate-pulse" title="VIP request pending approval">',
  '                            VIP Pending',
  '                          </span>',
  '                        )}',
  '                        {/* L6: Approve VIP link button -- opens existing token-based approve route */}',
  '                        {(() => {',
  "                          const pendingVip = (vipRequests[lead.id] || []).find((v: any) => v.status === 'pending' && (!v.expires_at || new Date(v.expires_at) > new Date()) && v.approval_token)",
  '                          if (!pendingVip) return null',
  "                          const baseRoute = pendingVip.request_type === 'estimator' ? 'estimator/vip-approve' : 'charlie/vip-approve'",
  "                          const url = '/api/walliam/' + baseRoute + '?token=' + pendingVip.approval_token + '&action=approve'",
  '                          return (',
  '                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700" title="Approve VIP request (opens approval page in new tab)">',
  '                              Approve VIP',
  '                            </a>',
  '                          )',
  '                        })()}',
  '                      </div>',
].join('\n');

const C6_NEW = [
  '                        })()}',
  '                      </div>',
].join('\n');

// ====================================================================
// CLIENT.TSX  C7a — 'Quality' removed from header column array (L429)
// ====================================================================

const C7a_OLD = "                {['Date', 'Contact', 'Source', 'Intent', 'Area', 'Agent', 'Hierarchy', 'Status', 'Quality', 'Actions'].map(h => (";
const C7a_NEW = "                {['Date', 'Contact', 'Source', 'Intent', 'Area', 'Agent', 'Hierarchy', 'Status', 'Actions'].map(h => (";

// ====================================================================
// CLIENT.TSX  C7b — Full Quality <td> block + leading L1 comment (L542-L601)
// ====================================================================

const C7b_OLD = [
  '                    </td>',
  '                    {/* Inline quality action buttons -- L1 ships 4 state buttons */}',
  '                    <td className="px-4 py-3">',
  '                      <div className="flex gap-1 flex-wrap">',
  '                        {QUALITY_VALUES.map(q => {',
  '                          const isActive = lead.quality === q',
  '                          return (',
  '                            <button',
  '                              key={q}',
  "                              onClick={() => updateLeadStatus(lead.id, 'quality', q)}",
  '                              disabled={updatingStatus === lead.id}',
  "                              className={`text-xs px-2 py-1 rounded-full font-semibold transition-colors ${isActive ? qualityColor(q) : 'bg-white text-gray-400 border border-gray-200 hover:bg-gray-50'} ${updatingStatus === lead.id ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}",
  '                              title={QUALITY_LABELS[q]}',
  '                            >',
  '                              {QUALITY_LABELS[q]}',
  '                            </button>',
  '                          )',
  '                        })}',
  '                      </div>',
  '                      {/* L5: Credit posture chip -- only renders for leads with user_id */}',
  '                      {lead.user_id && (() => {',
  '                        const o = creditOverrides[lead.user_id as string]',
  '                        if (!o) return <div className="mt-1 text-xs text-gray-400">Default credits</div>',
  '                        const vals = [o.ai_chat_limit, o.buyer_plan_limit, o.seller_plan_limit, o.estimator_limit]',
  '                        const nonNullVals = vals.filter((v: any) => v != null) as number[]',
  '                        const allZero = nonNullVals.length > 0 && nonNullVals.every((v) => v === 0)',
  '                        if (allZero) return <div className="mt-1 text-xs font-semibold text-red-600">Blocked: 0 credits</div>',
  '                        const labels = [',
  "                          o.ai_chat_limit != null ? 'Chat:' + o.ai_chat_limit : null,",
  "                          o.buyer_plan_limit != null ? 'Buyer:' + o.buyer_plan_limit : null,",
  "                          o.seller_plan_limit != null ? 'Seller:' + o.seller_plan_limit : null,",
  "                          o.estimator_limit != null ? 'Est:' + o.estimator_limit : null,",
  '                        ].filter(Boolean) as string[]',
  '                        if (labels.length === 0) return <div className="mt-1 text-xs text-gray-400">Default credits</div>',
  '                        return <div className="mt-1 text-xs text-emerald-700">{labels.join(\' \u00b7 \')}</div>',
  '                      })()}',
  '                      {/* L6: Grant credits inline button + form -- POSTs to /api/admin-homes/users/override */}',
  '                      {lead.user_id && (grantFormOpenFor === lead.id ? (',
  '                        <div className="mt-2 p-2 border border-emerald-200 bg-emerald-50 rounded space-y-1">',
  '                          <div className="text-xs font-semibold text-emerald-700">Grant credits (clamped to tenant hard caps)</div>',
  '                          <div className="grid grid-cols-2 gap-1">',
  '                            <input type="number" placeholder="Chat" value={grantFormValues.aiChatLimit} onChange={e => setGrantFormValues((v: any) => ({...v, aiChatLimit: e.target.value}))} className="text-xs px-2 py-1 rounded border border-gray-200" />',
  '                            <input type="number" placeholder="Buyer Plan" value={grantFormValues.buyerPlanLimit} onChange={e => setGrantFormValues((v: any) => ({...v, buyerPlanLimit: e.target.value}))} className="text-xs px-2 py-1 rounded border border-gray-200" />',
  '                            <input type="number" placeholder="Seller Plan" value={grantFormValues.sellerPlanLimit} onChange={e => setGrantFormValues((v: any) => ({...v, sellerPlanLimit: e.target.value}))} className="text-xs px-2 py-1 rounded border border-gray-200" />',
  '                            <input type="number" placeholder="Estimator" value={grantFormValues.estimatorLimit} onChange={e => setGrantFormValues((v: any) => ({...v, estimatorLimit: e.target.value}))} className="text-xs px-2 py-1 rounded border border-gray-200" />',
  '                          </div>',
  '                          <div className="flex gap-1">',
  '                            <button onClick={() => handleSubmitGrant(lead)} disabled={granting === lead.id} className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">',
  "                              {granting === lead.id ? 'Saving...' : 'Save'}",
  '                            </button>',
  '                            <button onClick={() => setGrantFormOpenFor(null)} disabled={granting === lead.id} className="text-xs px-2 py-1 rounded bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-50">',
  '                              Cancel',
  '                            </button>',
  '                          </div>',
  '                        </div>',
  '                      ) : (',
  '                        <button onClick={() => handleOpenGrantForm(lead)} className="mt-1 text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100">',
  '                          + Grant credits',
  '                        </button>',
  '                      ))}',
  '                    </td>',
  '                    <td className="px-4 py-3 whitespace-nowrap">',
].join('\n');

const C7b_NEW = [
  '                    </td>',
  '                    <td className="px-4 py-3 whitespace-nowrap">',
].join('\n');

// ====================================================================
// CLIENT.TSX  C7c — colSpan 11 -> 10  (empty-state row L436)
// ====================================================================

const C7c_OLD = '                <tr><td colSpan={11} className="px-6 py-12 text-center text-gray-400">No leads found</td></tr>';
const C7c_NEW = '                <tr><td colSpan={10} className="px-6 py-12 text-center text-gray-400">No leads found</td></tr>';

// ====================================================================
// CLIENT.TSX  C7d — colSpan 11 -> 10  (activity preview row L625)
// ====================================================================

const C7d_OLD = '                      <td colSpan={11} className="px-6 py-2 bg-slate-50 border-b">';
const C7d_NEW = '                      <td colSpan={10} className="px-6 py-2 bg-slate-50 border-b">';

// ====================================================================
// CLIENT.TSX  C8 — L7 drawer block (L685-L843, ~159 lines)
//                 (Recon doesn't cover L706-L829 middle, so use
//                  START + TAIL index-slice rather than exact-string match.
//                  START is unique by L7 comment; TAIL is unique because
//                  it's the function close pattern at end-of-file.)
// ====================================================================

function stripDrawer(content) {
  const START = '    {/* L7: Lead detail drawer -- right-side slide-out, click-row triggered */}\n';
  const TAIL = '    )}\n    </div>\n  )\n}';

  const sc = countOcc(content, START);
  if (sc === 0) throw new Error('[C8] drawer START marker not found');
  if (sc > 1) throw new Error(`[C8] drawer START marker not unique (${sc})`);

  const startIdx = content.indexOf(START);
  const tailIdx = content.indexOf(TAIL, startIdx);
  if (tailIdx === -1) throw new Error('[C8] drawer TAIL marker not found after START');

  const tailDup = content.indexOf(TAIL, tailIdx + 1);
  if (tailDup !== -1) throw new Error('[C8] drawer TAIL marker not unique past START');

  // Remove from START through the `    )}\n` portion;
  // keep `    </div>\n  )\n}` (outermost div + return + function close).
  const drawerCloseLen = '    )}\n'.length;
  const endIdx = tailIdx + drawerCloseLen;

  return content.slice(0, startIdx) + content.slice(endIdx);
}

// ====================================================================
// TRACKER  T1 — version line v9 -> v10
// ====================================================================

const T1_OLD = '**Version:** v9 \u2014 W3c-C SHIPPED \u2014 Source URL render row complete across all 11 named email builders (F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED CLOSED)';
const T1_NEW = '**Version:** v10 \u2014 W3a SHIPPED \u2014 L1/L5/L6/L7 inline noise stripped from leads dashboard + W3c phase row backfilled to SHIPPED';

// ====================================================================
// TRACKER  T2 — W3a phase row OPEN -> SHIPPED
// ====================================================================

const T2_OLD = '| W3a | Strip L1/L5/L6/L7 noise from leads-row | OPEN | \u2014 | Remove quality 4-buttons, credit chip, grant pill, drawer JSX from `AdminHomesLeadsClient.tsx` |';
const T2_NEW = '| W3a | Strip L1/L5/L6/L7 noise from leads-row | SHIPPED | 2026-05-13 | Quality column (header + `<td>` + colSpan adjustments) + L5 credit chip + L6 grant pill + L7 drawer all stripped from `AdminHomesLeadsClient.tsx`; L5+L7 prefetch blocks + 4 render props removed from `leads/page.tsx`. 3 files, 18 transforms. |';

// ====================================================================
// TRACKER  T3 — W3c phase row backfill OPEN -> SHIPPED
// ====================================================================

const T3_OLD = '| W3c | Source URL wiring across all CTAs | OPEN | \u2014 | Every lead-capture endpoint receives + stores `source_url`; every email template renders as clickable link |';
const T3_NEW = '| W3c | Source URL wiring across all CTAs | SHIPPED | 2026-05-13 | All 11 named email builders thread + render source URL via W3c-A canonical `buildLeadEmail` + W3c-B 5-route plumbing + W3c-B2 8-builder render rows + W3c-C 3-estimator routes. F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED CLOSED. |';

// ====================================================================
// TRACKER  T4 — append W3a-SHIPPED status log entry (after W3c-C-SHIPPED)
// ====================================================================

const T4_OLD = 'F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED CLOSED. All 11 named email builders touched by W3c-A/B/B2/C now thread + render source URL. W3c phase complete.';
const T4_NEW = T4_OLD + '\n- **2026-05-13 W3a-SHIPPED** \u2014 W3a stripped L1/L5/L6/L7 inline noise from leads dashboard across 3 files, 18 transforms. `app/admin-homes/leads/page.tsx` (2 transforms): L5 user_credit_overrides + vip_requests prefetch block (43 lines L103-L145) + L7 lead_email_recipients_log + lead_notes prefetch block (40 lines L147-L186) removed; 4 render props (`initialCreditOverrides`, `initialVipRequests`, `initialEmailLog`, `initialNotes`) dropped from `<AdminHomesLeadsClient>` invocation. `components/admin-homes/AdminHomesLeadsClient.tsx` (12 transforms): `Props` interface trimmed (4 fields); function signature destructure trimmed (4 fields); 8 state hooks removed (`creditOverrides`, `vipRequests`, `grantFormOpenFor`, `grantFormValues`, `granting`, `drawerOpenForLead`, `emailLog`, `notes`); `useEffect` Escape-key drawer-close handler removed (7 lines); `handleOpenGrantForm` + `handleSubmitGrant` handlers removed (51 lines); row `<tr>` `onClick` + `cursor-pointer` class stripped (row click becomes no-op until W3d); VIP pending badge + Approve VIP IIFE removed (18 lines); entire Quality column `<td>` block + leading L1 comment removed (60 lines); `\'Quality\'` removed from header column-array at L429; both `colSpan={11}` \u2192 `colSpan={10}` (empty-state row + activity-preview row); entire L7 drawer block removed (\u2248159 lines L685-L843) via START+TAIL index-slice (drawer middle L706-L829 not in recon but boundaries uniquely identifiable). Per-file backup `.backup_<timestamp>` created before any write. Per-file LE + BOM preserved (detected at read). All 18 anchors validated as unique exact-string matches before any write \u2014 zero partial-apply risk. No regressions: L4 user_activities prefetch + engagement badge + 2-event activity preview unchanged; Status column inline `<select>` unchanged; agents prefetch + filter dropdown unchanged; Plan toggle button + Delete button unchanged; tenant-scoping in all surviving queries unchanged. Quality column removed entirely (header + body + colSpans) per comprehensive read of phase-row scope \u2014 leaving empty `<td>` would have been a half-fix per Rule Zero; W6c (default Hot-sort + active-status filter) will re-introduce Quality surfacing in list view when that phase lands. Row click is no-op as planned intermediate state \u2014 W3d ships `router.push` navigation when W4a workbench page exists. `QUALITY_VALUES` + `QUALITY_LABELS` + `QualityValue` type left at module scope (top-level consts, not flagged by default `noUnusedLocals`); if tsc errors, follow-up trim. `useEffect` import preserved (L226-L424 unverified for other useEffect calls). TypeScript clean expected; local smoke verifies. NEXT: W3b Home property `Book a Visit` parity CTA, then W4a workbench page shell `/admin-homes/leads/[id]`, then W3d click-row navigation (after W4a route exists), then W4b-g workbench tabs, W5/W6 enhancements, W7 smoke matrix, W8 close.';

// ====================================================================
// VALIDATION PHASE — all transforms in memory, no writes yet
// ====================================================================

console.log('\nReading files...');
const pageRead = readFile(F_PAGE);
const clientRead = readFile(F_CLIENT);
const trackerRead = readFile(F_TRACKER);
console.log(`  page.tsx    (${pageRead.usesCRLF ? 'CRLF' : 'LF'}, BOM=${pageRead.hadBOM}, ${pageRead.content.length} chars)`);
console.log(`  client.tsx  (${clientRead.usesCRLF ? 'CRLF' : 'LF'}, BOM=${clientRead.hadBOM}, ${clientRead.content.length} chars)`);
console.log(`  tracker.md  (${trackerRead.usesCRLF ? 'CRLF' : 'LF'}, BOM=${trackerRead.hadBOM}, ${trackerRead.content.length} chars)`);

console.log('\nApplying transforms (validation, no writes yet)...');

let pageContent = pageRead.content;
pageContent = uniqReplace(pageContent, P1_OLD, P1_NEW, 'P1'); console.log('  P1  OK  page.tsx   L5+L7 prefetch block stripped');
pageContent = uniqReplace(pageContent, P2_OLD, P2_NEW, 'P2'); console.log('  P2  OK  page.tsx   4 render props stripped');

let clientContent = clientRead.content;
clientContent = uniqReplace(clientContent, C1_OLD,  C1_NEW,  'C1');  console.log('  C1  OK  client.tsx Props interface trimmed');
clientContent = uniqReplace(clientContent, C2_OLD,  C2_NEW,  'C2');  console.log('  C2  OK  client.tsx function destructure trimmed');
clientContent = uniqReplace(clientContent, C3_OLD,  C3_NEW,  'C3');  console.log('  C3  OK  client.tsx 8 state hooks + useEffect removed');
clientContent = uniqReplace(clientContent, C4_OLD,  C4_NEW,  'C4');  console.log('  C4  OK  client.tsx handleOpenGrantForm + handleSubmitGrant removed');
clientContent = uniqReplace(clientContent, C5_OLD,  C5_NEW,  'C5');  console.log('  C5  OK  client.tsx <tr> onClick + cursor-pointer stripped');
clientContent = uniqReplace(clientContent, C6_OLD,  C6_NEW,  'C6');  console.log('  C6  OK  client.tsx VIP badge + Approve VIP IIFE removed');
clientContent = uniqReplace(clientContent, C7a_OLD, C7a_NEW, 'C7a'); console.log('  C7a OK  client.tsx \'Quality\' removed from header array');
clientContent = uniqReplace(clientContent, C7b_OLD, C7b_NEW, 'C7b'); console.log('  C7b OK  client.tsx entire Quality <td> block removed');
clientContent = uniqReplace(clientContent, C7c_OLD, C7c_NEW, 'C7c'); console.log('  C7c OK  client.tsx colSpan 11->10 (empty-state row)');
clientContent = uniqReplace(clientContent, C7d_OLD, C7d_NEW, 'C7d'); console.log('  C7d OK  client.tsx colSpan 11->10 (activity preview row)');
clientContent = stripDrawer(clientContent);                          console.log('  C8  OK  client.tsx L7 drawer block removed (index-slice)');

let trackerContent = trackerRead.content;
trackerContent = uniqReplace(trackerContent, T1_OLD, T1_NEW, 'T1'); console.log('  T1  OK  tracker    version line v9->v10');
trackerContent = uniqReplace(trackerContent, T2_OLD, T2_NEW, 'T2'); console.log('  T2  OK  tracker    W3a phase row SHIPPED');
trackerContent = uniqReplace(trackerContent, T3_OLD, T3_NEW, 'T3'); console.log('  T3  OK  tracker    W3c phase row SHIPPED (backfill)');
trackerContent = uniqReplace(trackerContent, T4_OLD, T4_NEW, 'T4'); console.log('  T4  OK  tracker    W3a-SHIPPED status log entry appended');

// ====================================================================
// COMMIT PHASE — backup + write
// ====================================================================

console.log('\nAll 18 transforms validated. Backing up + writing...');

const bakPage = backup(F_PAGE);
const bakClient = backup(F_CLIENT);
const bakTracker = backup(F_TRACKER);

writeFile(F_PAGE,    pageContent,    pageRead.usesCRLF,    pageRead.hadBOM);
writeFile(F_CLIENT,  clientContent,  clientRead.usesCRLF,  clientRead.hadBOM);
writeFile(F_TRACKER, trackerContent, trackerRead.usesCRLF, trackerRead.hadBOM);

console.log('\nW3a applied successfully.');
console.log('\nBackups created:');
console.log(`  ${bakPage}`);
console.log(`  ${bakClient}`);
console.log(`  ${bakTracker}`);
console.log('\nSmoke verification checklist:');
console.log('  1. npx tsc --noEmit');
console.log('  2. npm run dev  -> http://localhost:3000/admin-homes/leads');
console.log('     (DEV_TENANT_DOMAIN=walliam.ca in .env.local)');
console.log('  3. Browser verify:');
console.log('     - leads list renders, no console errors');
console.log('     - no "Quality" column header');
console.log('     - no 4 quality buttons / no credit chip / no "+ Grant credits" pill');
console.log('     - no VIP Pending badge / no Approve VIP link in Contact column');
console.log('     - row click is no-op (drawer does not open)');
console.log('     - Status inline <select> still works');
console.log('     - engagement badge + activity preview row still render');
console.log('     - Plan toggle + Delete buttons still work');
console.log('  4. git add -A && git commit -m "W3a: strip L1/L5/L6/L7 noise from leads dashboard" && git push origin main');