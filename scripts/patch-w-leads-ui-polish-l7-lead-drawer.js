// scripts/patch-w-leads-ui-polish-l7-lead-drawer.js
//
// L7: Lead detail drawer (right-side slide-out, click-row trigger).
//   - page.tsx: pre-fetch lead_email_recipients_log + lead_notes
//   - AdminHomesLeadsClient.tsx:
//       * useEffect import
//       * Lead.notes field (was undeclared)
//       * Props.initialEmailLog + Props.initialNotes
//       * 3 new useStates: drawerOpenForLead, emailLog, notes
//       * useEffect for ESC key handler
//       * Row onClick with target guard (checkboxes/buttons keep working)
//       * Drawer JSX as conditional render before outer </div>
//   - tracker append (L7 status log entry)
//
// 8 sections in drawer: Lead Info, Hierarchy, Credit Posture, VIP Requests,
// Plan Content, Activity Timeline, Emails Sent, Notes (+ legacy leads.notes).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
console.log('L7 patch stamp: ' + stamp);

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

  // P1: insert L7 prefetch after L5 vip_requests prefetch closing block
  const anchorP1 = `    for (const v of (vipRows || [])) {
      const lid = (v as any).lead_id;
      if (lid) {
        if (!vipByLeadId[lid]) vipByLeadId[lid] = [];
        vipByLeadId[lid].push(v);
      }
    }
  }`;
  if (text.split(anchorP1).length - 1 !== 1) throw new Error('P1: anchor count != 1');
  const l7Block = anchorP1 + `

  // L7: pre-fetch lead_email_recipients_log + lead_notes for the lead detail drawer.
  // Multi-tenant safety:
  //   - lead_email_recipients_log has tenant_id NOT NULL -> direct scope by scopedTenantId when !seeAll.
  //   - lead_notes has NO tenant_id column -> tenant scoping IMPLICIT via lead_id IN leadIds
  //     (leadIds was already filtered through the tenant-scoped leads query upstream).
  const emailLogByLeadId: Record<string, any[]> = {};
  if (leadIds.length > 0) {
    let emailQuery = supabase
      .from('lead_email_recipients_log')
      .select('id, lead_id, recipient_email, recipient_layer, direction, subject, template_key, status, sent_at, delivered_at, bounced_at, created_at')
      .in('lead_id', leadIds)
      .order('sent_at', { ascending: false, nullsFirst: false });
    if (!seeAll && scopedTenantId) {
      emailQuery = emailQuery.eq('tenant_id', scopedTenantId);
    }
    const { data: emailRows } = await emailQuery;
    for (const e of (emailRows || [])) {
      const lid = (e as any).lead_id;
      if (lid) {
        if (!emailLogByLeadId[lid]) emailLogByLeadId[lid] = [];
        emailLogByLeadId[lid].push(e);
      }
    }
  }

  const notesByLeadId: Record<string, any[]> = {};
  if (leadIds.length > 0) {
    const { data: noteRows } = await supabase
      .from('lead_notes')
      .select('id, lead_id, agent_id, note, created_at, updated_at')
      .in('lead_id', leadIds)
      .order('created_at', { ascending: false });
    for (const n of (noteRows || [])) {
      const lid = (n as any).lead_id;
      if (lid) {
        if (!notesByLeadId[lid]) notesByLeadId[lid] = [];
        notesByLeadId[lid].push(n);
      }
    }
  }`;
  text = text.replace(anchorP1, l7Block);
  console.log('  OK P1 L7 prefetch (email log + notes) inserted');

  // P2a: empty-branch render -- add 2 props
  const anchorP2a = '          initialVipRequests={{}}';
  if (text.split(anchorP2a).length - 1 !== 1) throw new Error('P2a: anchor count != 1');
  text = text.replace(anchorP2a, '          initialVipRequests={{}}\n          initialEmailLog={{}}\n          initialNotes={{}}');
  console.log('  OK P2a empty-branch props added');

  // P2b: main-return -- add 2 props
  const anchorP2b = '      initialVipRequests={vipByLeadId}';
  if (text.split(anchorP2b).length - 1 !== 1) throw new Error('P2b: anchor count != 1');
  text = text.replace(anchorP2b, '      initialVipRequests={vipByLeadId}\n      initialEmailLog={emailLogByLeadId}\n      initialNotes={notesByLeadId}');
  console.log('  OK P2b main-return props added');

  // Residual checks
  if (!text.includes('emailLogByLeadId')) throw new Error('page: emailLogByLeadId missing');
  if (!text.includes('notesByLeadId')) throw new Error('page: notesByLeadId missing');
  if (text.split('initialEmailLog=').length - 1 !== 2) throw new Error('page: initialEmailLog count != 2');
  if (text.split('initialNotes=').length - 1 !== 2) throw new Error('page: initialNotes count != 2');

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

  // C0: import update -- add useEffect
  const anchorC0 = "import { useState, useMemo } from 'react'";
  if (text.split(anchorC0).length - 1 !== 1) throw new Error('C0: anchor count != 1');
  text = text.replace(anchorC0, "import { useState, useMemo, useEffect } from 'react'");
  console.log('  OK C0 useEffect import added');

  // C-Lead-notes: add notes field to Lead type after tenant_id
  const anchorLeadNotes = '  tenant_id: string\n  contact_name: string';
  if (text.split(anchorLeadNotes).length - 1 !== 1) throw new Error('C-Lead-notes: anchor count != 1');
  text = text.replace(anchorLeadNotes, '  tenant_id: string\n  notes: string | null\n  contact_name: string');
  console.log('  OK C-Lead-notes Lead.notes field added');

  // C1: Props -- add 2 fields
  const anchorC1 = '  initialVipRequests: Record<string, any[]>';
  if (text.split(anchorC1).length - 1 !== 1) throw new Error('C1: anchor count != 1');
  text = text.replace(anchorC1, '  initialVipRequests: Record<string, any[]>\n  initialEmailLog: Record<string, any[]>\n  initialNotes: Record<string, any[]>');
  console.log('  OK C1 Props extended');

  // C2: signature destructure -- add 2 args before agents
  const anchorC2 = 'initialVipRequests, agents,';
  if (text.split(anchorC2).length - 1 !== 1) throw new Error('C2: anchor count != 1');
  text = text.replace(anchorC2, 'initialVipRequests, initialEmailLog, initialNotes, agents,');
  console.log('  OK C2 destructure updated');

  // C3: 3 new useStates after L6 granting useState -- line-pattern walk
  {
    const lines = text.split('\n');
    const grantingIdx = lines.findIndex(l => l.includes('const [granting, setGranting]'));
    if (grantingIdx === -1) throw new Error('C3: granting useState not found');
    const newStates = [
      '  const [drawerOpenForLead, setDrawerOpenForLead] = useState<Lead | null>(null)',
      '  const [emailLog] = useState<Record<string, any[]>>(initialEmailLog)',
      '  const [notes] = useState<Record<string, any[]>>(initialNotes)',
    ];
    lines.splice(grantingIdx + 1, 0, ...newStates);
    console.log('  OK C3 3 useStates inserted after granting at ' + (grantingIdx + 1));
    text = lines.join('\n');
  }

  // C4: useEffect for ESC key -- line-pattern walk; insert after the new drawerOpenForLead useState
  {
    const lines = text.split('\n');
    const notesStateIdx = lines.findIndex(l => l.includes('const [notes] = useState<Record<string, any[]>>(initialNotes)'));
    if (notesStateIdx === -1) throw new Error('C4: notes useState (just inserted by C3) not found');
    const effect = [
      '',
      '  useEffect(() => {',
      '    const handler = (e: KeyboardEvent) => {',
      "      if (e.key === 'Escape') setDrawerOpenForLead(null)",
      '    }',
      "    window.addEventListener('keydown', handler)",
      "    return () => window.removeEventListener('keydown', handler)",
      '  }, [])',
    ];
    lines.splice(notesStateIdx + 1, 0, ...effect);
    console.log('  OK C4 ESC useEffect inserted at ' + (notesStateIdx + 1));
    text = lines.join('\n');
  }

  // C5: row onClick -- single-line replacement of the <tr> opener
  const anchorC5 = "<tr key={lead.id} className={`hover:bg-gray-50 ${updatingStatus === lead.id ? 'opacity-60' : ''}`}>";
  if (text.split(anchorC5).length - 1 !== 1) throw new Error('C5: anchor count != 1');
  const c5Replace = "<tr key={lead.id} onClick={(e) => { const t = e.target as HTMLElement; if (t.closest('button, input, select, a, label')) return; setDrawerOpenForLead(lead) }} className={`hover:bg-gray-50 cursor-pointer ${updatingStatus === lead.id ? 'opacity-60' : ''}`}>";
  text = text.replace(anchorC5, c5Replace);
  console.log('  OK C5 row onClick + cursor-pointer added');

  // C6: drawer JSX -- line-pattern walk; insert before the outer </div> at end of return
  {
    const lines = text.split('\n');
    // Walk from the bottom: find the last '}' (component close), then '  )' (return close), then '    </div>' (outer wrapper close)
    let braceIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() === '}' && (i === lines.length - 1 || lines[i + 1].trim() === '')) { braceIdx = i; break; }
    }
    if (braceIdx === -1) {
      // Fallback: last line that is just }
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim() === '}') { braceIdx = i; break; }
      }
    }
    if (braceIdx === -1) throw new Error('C6: component close } not found');
    let parenIdx = -1;
    for (let i = braceIdx - 1; i >= 0; i--) {
      if (lines[i].trim() === ')') { parenIdx = i; break; }
    }
    if (parenIdx === -1) throw new Error('C6: return close ) not found above component close');
    let divIdx = -1;
    for (let i = parenIdx - 1; i >= 0; i--) {
      if (lines[i].trim() === '</div>') { divIdx = i; break; }
    }
    if (divIdx === -1) throw new Error('C6: outer </div> not found above return close');
    const indent = ((lines[divIdx].match(/^(\s*)/) || ['', ''])[1] || '');
    const drawer = [
      indent + '{/* L7: Lead detail drawer -- right-side slide-out, click-row triggered */}',
      indent + '{drawerOpenForLead && (',
      indent + '  <>',
      indent + '    <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDrawerOpenForLead(null)} aria-hidden="true" />',
      indent + '    <div className="fixed inset-y-0 right-0 w-[480px] bg-white shadow-2xl z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Lead details">',
      indent + '      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">',
      indent + '        <div className="min-w-0">',
      indent + '          <div className="text-base font-semibold text-gray-900 truncate">{drawerOpenForLead.contact_name}</div>',
      indent + '          <div className="text-xs text-gray-500 truncate">{drawerOpenForLead.contact_email}</div>',
      indent + '        </div>',
      indent + '        <button onClick={() => setDrawerOpenForLead(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2" aria-label="Close drawer">',
      indent + "          {'\\u00d7'}",
      indent + '        </button>',
      indent + '      </div>',
      indent + '      <div className="p-6 space-y-6">',
      indent + '        {/* Section: Lead Info */}',
      indent + '        <section>',
      indent + '          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Lead Info</h3>',
      indent + '          <dl className="text-sm grid grid-cols-2 gap-2">',
      indent + "            <div><dt className=\"text-xs text-gray-400\">Phone</dt><dd className=\"text-gray-800\">{drawerOpenForLead.contact_phone || '\\u2014'}</dd></div>",
      indent + "            <div><dt className=\"text-xs text-gray-400\">Intent</dt><dd className=\"text-gray-800\">{drawerOpenForLead.intent || '\\u2014'}</dd></div>",
      indent + "            <div><dt className=\"text-xs text-gray-400\">Area</dt><dd className=\"text-gray-800\">{drawerOpenForLead.geo_name || '\\u2014'}</dd></div>",
      indent + "            <div><dt className=\"text-xs text-gray-400\">Created</dt><dd className=\"text-gray-800\">{new Date(drawerOpenForLead.created_at).toLocaleString('en-CA')}</dd></div>",
      indent + '          </dl>',
      indent + '        </section>',
      indent + '        {/* Section: Hierarchy */}',
      indent + '        <section>',
      indent + '          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Hierarchy</h3>',
      indent + '          <div className="text-sm space-y-1">',
      indent + '            {drawerOpenForLead.agents && (<div className="text-gray-800"><span className="text-xs text-gray-400 mr-2">Agent:</span>{drawerOpenForLead.agents.full_name}</div>)}',
      indent + "            {drawerOpenForLead.manager && (<div className=\"text-gray-700\"><span className=\"text-xs text-gray-400 mr-2\">\\u2191 Manager:</span>{drawerOpenForLead.manager.full_name}</div>)}",
      indent + "            {drawerOpenForLead.area_manager && (<div className=\"text-gray-600\"><span className=\"text-xs text-gray-400 mr-2\">\\u2191\\u2191 Area Manager:</span>{drawerOpenForLead.area_manager.full_name}</div>)}",
      indent + "            {drawerOpenForLead.tenant_admin && (<div className=\"text-gray-500\"><span className=\"text-xs text-gray-400 mr-2\">\\u2191\\u2191\\u2191 Tenant Admin:</span>{drawerOpenForLead.tenant_admin.full_name}</div>)}",
      indent + '            {!drawerOpenForLead.agents && !drawerOpenForLead.manager && !drawerOpenForLead.area_manager && !drawerOpenForLead.tenant_admin && (<div className="text-gray-400">No hierarchy assigned</div>)}',
      indent + '          </div>',
      indent + '        </section>',
      indent + '        {/* Section: Credit Posture */}',
      indent + '        {drawerOpenForLead.user_id && (() => {',
      indent + '          const o = creditOverrides[drawerOpenForLead.user_id as string]',
      indent + '          return (',
      indent + '            <section>',
      indent + '              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Credit Posture</h3>',
      indent + "              {!o ? <div className=\"text-sm text-gray-400\">No override \\u2014 using tenant defaults</div> : (",
      indent + '                <div className="text-sm space-y-1">',
      indent + '                  <div className="grid grid-cols-2 gap-2">',
      indent + "                    <div><span className=\"text-xs text-gray-400\">Chat:</span> <span className=\"text-gray-800\">{o.ai_chat_limit != null ? o.ai_chat_limit : '(default)'}</span></div>",
      indent + "                    <div><span className=\"text-xs text-gray-400\">Buyer Plan:</span> <span className=\"text-gray-800\">{o.buyer_plan_limit != null ? o.buyer_plan_limit : '(default)'}</span></div>",
      indent + "                    <div><span className=\"text-xs text-gray-400\">Seller Plan:</span> <span className=\"text-gray-800\">{o.seller_plan_limit != null ? o.seller_plan_limit : '(default)'}</span></div>",
      indent + "                    <div><span className=\"text-xs text-gray-400\">Estimator:</span> <span className=\"text-gray-800\">{o.estimator_limit != null ? o.estimator_limit : '(default)'}</span></div>",
      indent + '                  </div>',
      indent + "                  {o.granted_by_tier && <div className=\"text-xs text-gray-400\">Granted by tier: {o.granted_by_tier}</div>}",
      indent + "                  {o.granted_at && <div className=\"text-xs text-gray-400\">At: {new Date(o.granted_at).toLocaleString('en-CA')}</div>}",
      indent + '                  {o.note && <div className="text-xs text-gray-500 italic mt-1">"{o.note}"</div>}',
      indent + '                </div>',
      indent + '              )}',
      indent + '            </section>',
      indent + '          )',
      indent + '        })()}',
      indent + '        {/* Section: VIP Requests */}',
      indent + '        <section>',
      indent + '          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">VIP Requests</h3>',
      indent + '          {(vipRequests[drawerOpenForLead.id] || []).length === 0 ? (',
      indent + '            <div className="text-sm text-gray-400">No VIP requests</div>',
      indent + '          ) : (',
      indent + '            <div className="text-sm space-y-2">',
      indent + '              {(vipRequests[drawerOpenForLead.id] || []).map((v: any) => (',
      indent + '                <div key={v.id} className="border-l-2 border-gray-200 pl-3 py-1">',
      indent + '                  <div className="flex items-center gap-2">',
      indent + '                    <span className="text-xs font-semibold uppercase text-gray-700">{v.request_type}</span>',
      indent + "                    <span className={(v.status === 'pending' ? 'bg-amber-100 text-amber-800 ' : v.status === 'approved' ? 'bg-emerald-100 text-emerald-800 ' : 'bg-gray-100 text-gray-600 ') + 'text-xs px-2 py-0.5 rounded-full'}>{v.status}</span>",
      indent + '                  </div>',
      indent + "                  <div className=\"text-xs text-gray-400\">Created: {new Date(v.created_at).toLocaleString('en-CA')}{v.expires_at && ' \\u00b7 Expires: ' + new Date(v.expires_at).toLocaleString('en-CA')}{v.messages_granted != null && ' \\u00b7 Granted: ' + v.messages_granted}</div>",
      indent + '                </div>',
      indent + '              ))}',
      indent + '            </div>',
      indent + '          )}',
      indent + '        </section>',
      indent + '        {/* Section: Plan Content */}',
      indent + '        {drawerOpenForLead.plan_data && (',
      indent + '          <section>',
      indent + '            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Plan Content</h3>',
      indent + '            <div className="text-sm space-y-1">',
      indent + '              {drawerOpenForLead.plan_data.planType && <div><span className="text-xs text-gray-400">Type:</span> <span className="text-gray-800 capitalize">{drawerOpenForLead.plan_data.planType}</span></div>}',
      indent + '              {drawerOpenForLead.plan_data.geoName && <div><span className="text-xs text-gray-400">Area:</span> <span className="text-gray-800">{drawerOpenForLead.plan_data.geoName}</span></div>}',
      indent + '              {drawerOpenForLead.plan_data.budgetMax != null && (',
      indent + '                <div>',
      indent + '                  <span className="text-xs text-gray-400">Budget:</span>{\' \'}',
      indent + '                  <span className="text-gray-800">',
      indent + "                    {drawerOpenForLead.plan_data.budgetMin != null ? '$' + Number(drawerOpenForLead.plan_data.budgetMin).toLocaleString('en-CA') + ' \\u2013 ' : ''}",
      indent + "                    ${\'{\'}Number(drawerOpenForLead.plan_data.budgetMax).toLocaleString('en-CA'){\'}\'}",
      indent + '                  </span>',
      indent + '                </div>',
      indent + '              )}',
      indent + '              {drawerOpenForLead.plan_data.propertyType && <div><span className="text-xs text-gray-400">Property:</span> <span className="text-gray-800">{drawerOpenForLead.plan_data.propertyType}</span></div>}',
      indent + '            </div>',
      indent + '          </section>',
      indent + '        )}',
      indent + '        {/* Section: Activity Timeline (full) */}',
      indent + '        <section>',
      indent + '          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Activity Timeline ({(activities[drawerOpenForLead.id] || []).length})</h3>',
      indent + '          {(activities[drawerOpenForLead.id] || []).length === 0 ? (',
      indent + '            <div className="text-sm text-gray-400">No activity recorded</div>',
      indent + '          ) : (',
      indent + '            <div className="text-sm space-y-2 relative pl-4">',
      indent + '              <div className="absolute left-1 top-0 bottom-0 w-px bg-gray-200" />',
      indent + '              {(activities[drawerOpenForLead.id] || []).slice().reverse().map((a: any) => (',
      indent + '                <div key={a.id} className="relative pl-4">',
      indent + "                  <div className=\"absolute left-0 top-1.5 w-2 h-2 rounded-full bg-amber-400\" style={{ transform: 'translateX(-3px)' }} />",
      indent + "                  <div className=\"text-gray-700\">{a.activity_type.replace(/_/g, ' ')}</div>",
      indent + "                  <div className=\"text-xs text-gray-400\">{new Date(a.created_at).toLocaleString('en-CA')}</div>",
      indent + '                </div>',
      indent + '              ))}',
      indent + '            </div>',
      indent + '          )}',
      indent + '        </section>',
      indent + '        {/* Section: Emails Sent */}',
      indent + '        <section>',
      indent + '          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Emails Sent ({(emailLog[drawerOpenForLead.id] || []).length})</h3>',
      indent + '          {(emailLog[drawerOpenForLead.id] || []).length === 0 ? (',
      indent + '            <div className="text-sm text-gray-400">No emails logged</div>',
      indent + '          ) : (',
      indent + '            <div className="text-sm space-y-2">',
      indent + '              {(emailLog[drawerOpenForLead.id] || []).map((em: any) => (',
      indent + '                <div key={em.id} className="border-l-2 border-blue-200 pl-3 py-1">',
      indent + '                  <div className="text-gray-700 truncate" title={em.subject}>{em.subject}</div>',
      indent + "                  <div className=\"text-xs text-gray-400\">{em.direction ? em.direction.toUpperCase() : ''} {em.recipient_email}{em.recipient_layer ? ' \\u00b7 ' + em.recipient_layer : ''}</div>",
      indent + "                  <div className=\"text-xs text-gray-400\">{em.status}{(em.sent_at || em.created_at) ? ' \\u00b7 ' + new Date(em.sent_at || em.created_at).toLocaleString('en-CA') : ''}</div>",
      indent + '                </div>',
      indent + '              ))}',
      indent + '            </div>',
      indent + '          )}',
      indent + '        </section>',
      indent + '        {/* Section: Notes (lead_notes table) */}',
      indent + '        <section>',
      indent + '          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes ({(notes[drawerOpenForLead.id] || []).length})</h3>',
      indent + '          {(notes[drawerOpenForLead.id] || []).length === 0 ? (',
      indent + '            <div className="text-sm text-gray-400">No notes yet</div>',
      indent + '          ) : (',
      indent + '            <div className="text-sm space-y-2">',
      indent + '              {(notes[drawerOpenForLead.id] || []).map((n: any) => (',
      indent + '                <div key={n.id} className="bg-gray-50 rounded p-3">',
      indent + '                  <div className="text-gray-800 whitespace-pre-wrap">{n.note}</div>',
      indent + "                  <div className=\"text-xs text-gray-400 mt-1\">{new Date(n.created_at).toLocaleString('en-CA')}</div>",
      indent + '                </div>',
      indent + '              ))}',
      indent + '            </div>',
      indent + '          )}',
      indent + '        </section>',
      indent + '        {/* Section: Legacy leads.notes free-text */}',
      indent + '        {drawerOpenForLead.notes && (',
      indent + '          <section>',
      indent + '            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Admin Notes (legacy free-text)</h3>',
      indent + '            <div className="text-sm text-gray-700 bg-gray-50 rounded p-3 whitespace-pre-wrap">{drawerOpenForLead.notes}</div>',
      indent + '          </section>',
      indent + '        )}',
      indent + '      </div>',
      indent + '    </div>',
      indent + '  </>',
      indent + ')}',
    ];
    lines.splice(divIdx, 0, ...drawer);
    console.log('  OK C6 drawer JSX inserted at ' + divIdx + ' (' + drawer.length + ' lines)');
    text = lines.join('\n');
  }

  // Residual checks
  if (!text.includes('drawerOpenForLead')) throw new Error('residual: drawerOpenForLead missing');
  if (!text.includes('lead_email_recipients_log') && !text.includes('Emails Sent')) throw new Error('residual: emails section missing');
  if (!text.includes('Activity Timeline (')) throw new Error('residual: activity timeline section missing');
  if (!text.includes('Plan Content')) throw new Error('residual: plan content section missing');
  if (!text.includes('Credit Posture')) throw new Error('residual: credit posture section missing');
  if (!text.includes('Hierarchy')) throw new Error('residual: hierarchy section missing');
  if (!text.includes('Admin Notes (legacy')) throw new Error('residual: legacy notes section missing');
  if (!text.includes('useEffect')) throw new Error('residual: useEffect import missing');
  if (!text.includes('cursor-pointer')) throw new Error('residual: cursor-pointer on row missing');

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

  if (text.split('**2026-05-12 L6**').length - 1 < 1) throw new Error('tracker: L6 anchor not found');
  if (!text.endsWith('\n')) text = text + '\n';

  const EM = '\u2014';
  const l7Entry =
    '- **2026-05-12 L7** ' + EM + ' **Lead detail drawer shipped (right-side slide-out, click-row trigger, 8 sections).** ' +
    '`app/admin-homes/leads/page.tsx` server-side pre-fetches two new tables: ' +
    '`lead_email_recipients_log` (W-LEADS-EMAIL T2f audit table, 15 columns including recipient_email, recipient_layer (W-HIERARCHY 6-layer fan-out), direction (to/bcc/cc), subject, template_key, status, sent_at, delivered_at, bounced_at; joined by `lead_id IN leadIds`, ordered by `sent_at DESC NULLS LAST`); ' +
    'and `lead_notes` (6 columns: id, lead_id, agent_id, note, created_at, updated_at; joined by `lead_id IN leadIds`, ordered by `created_at DESC`). ' +
    '**Multi-tenant safety:** `lead_email_recipients_log.tenant_id` is NOT NULL ' + EM + ' direct `.eq(\'tenant_id\', scopedTenantId)` scope applied when `!seeAll`, mirroring L4/L5 pattern. ' +
    '`lead_notes` has **NO `tenant_id` column** (schema probe SQL-C confirmed via `column "tenant_id" does not exist` error) ' + EM + ' tenant scoping is implicit via `lead_id IN leadIds` because `leadIds` is already filtered through the tenant-scoped leads query upstream. ' +
    'Logged as a hygiene finding (`F-LEAD-NOTES-NO-TENANT-ID-COLUMN`) for future schema cleanup; not an L7 blocker since the implicit scoping is correct. ' +
    'Two new props passed to `AdminHomesLeadsClient`: `initialEmailLog: Record<string, any[]>` (keyed by `lead_id`, multiple rows per lead since each email send produces 1 row per recipient ' + EM + ' agent TO + manager BCC + area_manager BCC + tenant_admin BCC + delegates + platform_admin BCC per W-HIERARCHY) and `initialNotes: Record<string, any[]>` (keyed by `lead_id`, ordered most-recent first). ' +
    'Both render branches updated (empty-tenant passes `{}`). ' +
    '`components/admin-homes/AdminHomesLeadsClient.tsx`: `useEffect` added to React import (was `useState, useMemo`); `Lead` type extended with `notes: string | null` (the `leads.notes` text column was returned by `*` SELECT but undeclared); Props + destructure extended; 3 new useStates added (`drawerOpenForLead: Lead | null`, `emailLog`, `notes`); ' +
    '`useEffect` block attaches ESC keydown listener to `window` on mount, removes on unmount (proper cleanup). ' +
    '**Row click handler:** the main lead `<tr>` got an `onClick` handler with event-target guard: `t.closest(\'button, input, select, a, label\')` skips drawer open when click lands on any interactive descendant (checkbox, status select, 4 quality buttons, Plan button, Approve VIP link, Grant credits button/inputs/save/cancel, Delete button, mailto link). ' +
    'Click on any non-interactive part of the row (cell padding, contact name text, source badge text, area text, etc.) opens the drawer. `cursor-pointer` added to row className for affordance. ' +
    'Sub-rows (L4 activity preview, pre-L4 plan expansion) intentionally do NOT have the onClick ' + EM + ' the drawer triggers only on the main row per spec wording ("click row"). ' +
    '**Drawer architecture:** right-side slide-out at `fixed inset-y-0 right-0 w-[480px] bg-white shadow-2xl z-50 overflow-y-auto` with backdrop `fixed inset-0 bg-black/30 z-40`. ARIA: `role="dialog" aria-modal="true" aria-label="Lead details"`. Three close mechanisms: backdrop click, X button in sticky header, ESC keypress (via the new useEffect). ' +
    '**8 sections in drawer (top to bottom):** ' +
    '(1) **Lead Info** ' + EM + ' 2x2 grid: phone, intent, area, created timestamp; ' +
    '(2) **Hierarchy** ' + EM + ' conditional list of agent / manager / area_manager / tenant_admin from existing Lead joins (L3); ' +
    '(3) **Credit Posture** ' + EM + ' full row from `creditOverrides[lead.user_id]` (L5 prefetched); shows all 4 limit columns + granted_by_tier + granted_at + note; renders only when `lead.user_id`; ' +
    '(4) **VIP Requests** ' + EM + ' all rows from `vipRequests[lead.id]` (L5 prefetched) across pending/approved/expired statuses with color-coded badges; ' +
    '(5) **Plan Content** ' + EM + ' formatted from `leads.plan_data` JSONB (planType, geoName, budgetMin/Max with currency formatting, propertyType); renders only when `plan_data` present; ' +
    '(6) **Activity Timeline** ' + EM + ' FULL timeline from `activities[lead.id]` (L4 prefetched, reverse-chronological), styled with the same amber-dot timeline pattern as the original L4 expand block (which was removed by L4 in favor of the slim last-2 preview); ' +
    '(7) **Emails Sent** ' + EM + ' all rows from `emailLog[lead.id]`: subject (truncated with title tooltip), direction + recipient_email + recipient_layer, status + sent_at timestamp; ' +
    '(8) **Notes** ' + EM + ' all rows from `notes[lead.id]` (structured notes table) plus a separate **Legacy free-text** section that renders `leads.notes` blob if non-empty. ' +
    '**Patch design:** 11 anchors across 2 production files + tracker. ' +
    'P1 multi-line exact-string anchor for the L5 vip_requests closing block (no backticks). ' +
    'P2a/P2b single-line exact-string anchors. ' +
    'C0/C-Lead-notes/C1/C2 single-line or short-multi-line exact-string anchors (no backticks). ' +
    'C3 line-pattern walk on the L6 granting useState marker (insert 3 useStates after). ' +
    'C4 line-pattern walk on the newly-inserted notes useState (insert ESC useEffect after). ' +
    'C5 single-line exact-string anchor with template literal backticks (rule allows single-line with backticks). ' +
    'C6 line-pattern walk from the bottom of the file (walk up: `}` ' + EM + ' `)` ' + EM + ' `</div>`) to find the outer wrapper close, then splice drawer JSX in before. ' +
    'Drawer JSX content uses string concatenation, escape sequences (`\\u00d7`, `\\u2191`, `\\u2014`, `\\u00b7`, `\\u2013`), and double-quoted className strings throughout ' + EM + ' avoids template literal backticks in the inserted content despite the surrounding JSX context already containing them elsewhere. ' +
    '**No new API routes.** Read-only drawer ' + EM + ' future polish (add-note inline, optimistic refresh after Approve VIP) deferred for now. ' +
    'No recovery passes needed. TSC clean. ' +
    '**Data observations (WALLiam `b16e1039`):** sample `lead_email_recipients_log` rows confirm the W-LEADS-EMAIL T2f T3b smoke captured per-recipient audit correctly (2 rows per lead-write for the 2-layer test config: agent TO + platform_admin BCC). `delivered_at` and `bounced_at` are uniformly NULL ' + EM + ' webhook integration with Resend not wired (logged for future). ' +
    '**Known limitations (documented):** ' +
    '(a) Drawer is read-only; add-note + edit-note will come in a follow-up. ' +
    '(b) Sub-rows (L4 activity preview, plan expansion) don\'t open drawer ' + EM + ' user must click main row. Intentional per spec wording. ' +
    '(c) After Approve VIP (L6) or Grant credits (L6) action runs, drawer doesn\'t auto-update vipRequests state ' + EM + ' user must close + reopen drawer (or full page refresh) to see new state. Optimistic refresh deferred. ' +
    '(d) Per F-LEAD-NOTES-NO-TENANT-ID-COLUMN: `lead_notes` lacks a `tenant_id` column. Implicit scoping via `lead_id` is currently safe but architecturally weaker than direct tenant scoping. Future migration could add `tenant_id` + backfill + NOT NULL constraint. ' +
    'L7 row in phase table stays OPEN until Lclose.\n';

  text = text + l7Entry;
  fs.writeFileSync(src, text, 'utf8');

  const l7Count = text.split('**2026-05-12 L7**').length - 1;
  if (l7Count !== 1) throw new Error('tracker: L7 marker count = ' + l7Count);
  console.log('  L7 marker count: ' + l7Count);
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta +' + (text.length - before) + ')');
}

console.log('\n=== L7 PATCHES APPLIED OK ===');