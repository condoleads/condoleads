// scripts/patch-w-leads-ui-polish-l4-engagement-activity.js
//
// L4: Engagement inline + activity preview.
//   - page.tsx: pre-fetch user_activities for visible leads, pass as initialActivities prop
//   - AdminHomesLeadsClient.tsx:
//       * Props.initialActivities + destructure + useState init
//       * Remove loadingActivities state + fetchActivities function (dead post-L4)
//       * Add engagement chip inline with contact_name
//       * Remove Activity expand button (Actions cell)
//       * Replace conditional Activity timeline <tr> with always-visible last-2 preview <tr>
//   - tracker append (L4 status log entry)
//
// All multi-line anchors with backticks in content use line-pattern walks
// per the recovery2-locked default rule.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
console.log('L4 patch stamp: ' + stamp);

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

  // P1: insert pre-fetch block after `const { data: leads } = await query`
  const anchorP1 = '  const { data: leads } = await query';
  if (text.split(anchorP1).length - 1 !== 1) throw new Error('P1: anchor count != 1');
  const prefetchBlock = anchorP1 + `

  // L4: pre-fetch user_activities for inline engagement badge + last-2-activities preview.
  // Multi-tenant safety: scope by tenant_id when !seeAll (mirrors leads query at line above).
  // Role scoping is implicit -- only activities for emails of already-role-filtered leads are fetched.
  const leadEmails = Array.from(
    new Set((leads || []).map((l: any) => l.contact_email).filter(Boolean))
  ) as string[];
  const activitiesByLeadId: Record<string, Array<{ id: string; activity_type: string; activity_data: any; page_url: string | null; created_at: string }>> = {};
  if (leadEmails.length > 0) {
    let actQuery = supabase
      .from('user_activities')
      .select('id, activity_type, activity_data, page_url, created_at, contact_email')
      .in('contact_email', leadEmails)
      .order('created_at', { ascending: true });
    if (!seeAll && scopedTenantId) {
      actQuery = actQuery.eq('tenant_id', scopedTenantId);
    }
    const { data: allActivities } = await actQuery;
    const byEmail: Record<string, any[]> = {};
    for (const a of (allActivities || [])) {
      const email = (a as any).contact_email;
      if (!byEmail[email]) byEmail[email] = [];
      byEmail[email].push(a);
    }
    for (const lead of (leads || [])) {
      activitiesByLeadId[(lead as any).id] = byEmail[(lead as any).contact_email] || [];
    }
  }`;
  text = text.replace(anchorP1, prefetchBlock);
  console.log('  OK P1 prefetch block inserted');

  // P2: empty-tenant branch -- add initialActivities={{}}
  const anchorP2 = '          initialLeads={[]}';
  if (text.split(anchorP2).length - 1 !== 1) throw new Error('P2: anchor count != 1');
  text = text.replace(anchorP2, '          initialLeads={[]}\n          initialActivities={{}}');
  console.log('  OK P2 empty-branch initialActivities added');

  // P3: main return -- add initialActivities={activitiesByLeadId}
  const anchorP3 = '      initialLeads={leads || []}';
  if (text.split(anchorP3).length - 1 !== 1) throw new Error('P3: anchor count != 1');
  text = text.replace(anchorP3, '      initialLeads={leads || []}\n      initialActivities={activitiesByLeadId}');
  console.log('  OK P3 main-return initialActivities added');

  if (text.split('initialActivities=').length - 1 !== 2) throw new Error('page: initialActivities count != 2');
  if (!text.includes('activitiesByLeadId')) throw new Error('page: activitiesByLeadId missing');

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

  // C1: Props.initialActivities
  const anchorC1 = '  initialLeads: Lead[]';
  if (text.split(anchorC1).length - 1 !== 1) throw new Error('C1: anchor count != 1');
  text = text.replace(anchorC1, '  initialLeads: Lead[]\n  initialActivities: Record<string, any[]>');
  console.log('  OK C1 Props.initialActivities added');

  // C2: component signature destructure
  const anchorC2 = 'export default function AdminHomesLeadsClient({ initialLeads, agents, currentRole, currentAgentId }: Props) {';
  if (text.split(anchorC2).length - 1 !== 1) throw new Error('C2: anchor count != 1');
  text = text.replace(anchorC2, 'export default function AdminHomesLeadsClient({ initialLeads, initialActivities, agents, currentRole, currentAgentId }: Props) {');
  console.log('  OK C2 signature destructure updated');

  // C3: useState init from initialActivities
  const anchorC3 = '  const [activities, setActivities] = useState<Record<string, any[]>>({})';
  if (text.split(anchorC3).length - 1 !== 1) throw new Error('C3: anchor count != 1');
  text = text.replace(anchorC3, '  const [activities, setActivities] = useState<Record<string, any[]>>(initialActivities)');
  console.log('  OK C3 useState init from initialActivities');

  // C7: remove loadingActivities state (dead post-L4)
  const anchorC7 = '  const [loadingActivities, setLoadingActivities] = useState<string | null>(null)\n';
  if (text.split(anchorC7).length - 1 !== 1) throw new Error('C7: anchor count != 1');
  text = text.replace(anchorC7, '');
  console.log('  OK C7 loadingActivities state removed (dead post-L4)');

  // C8: remove fetchActivities function (line-pattern walk; body contains backticks)
  {
    const lines = text.split('\n');
    const fnStartIdx = lines.findIndex(l => l.includes('const fetchActivities = async'));
    if (fnStartIdx === -1) throw new Error('C8: fetchActivities not found');
    const startIndent = ((lines[fnStartIdx].match(/^(\s*)/) || ['', ''])[1] || '').length;
    let fnEndIdx = -1;
    for (let i = fnStartIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      const indent = ((line.match(/^(\s*)/) || ['', ''])[1] || '').length;
      if (line.trim() === '}' && indent === startIndent) { fnEndIdx = i; break; }
    }
    if (fnEndIdx === -1) throw new Error('C8: closing } not found');
    if (lines[fnEndIdx + 1] !== undefined && lines[fnEndIdx + 1].trim() === '') fnEndIdx++;
    const removed = lines.splice(fnStartIdx, fnEndIdx - fnStartIdx + 1);
    console.log('  OK C8 fetchActivities removed (' + removed.length + ' lines, ' + fnStartIdx + '..' + fnEndIdx + ')');
    text = lines.join('\n');
  }

  // C4: engagement chip inline with contact_name
  const anchorC4_find = '                      <div className="font-medium text-gray-900">{lead.contact_name}</div>';
  if (text.split(anchorC4_find).length - 1 !== 1) throw new Error('C4: anchor count != 1');
  const anchorC4_replace = `                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{lead.contact_name}</span>
                        {(() => {
                          const eng = calcEngagement(activities[lead.id] || []);
                          return (
                            <span className={\`text-xs font-semibold \${eng.color}\`} title={\`Engagement: \${eng.label} (\${eng.score})\`}>
                              {eng.label} \u00b7 {eng.score}
                            </span>
                          );
                        })()}
                      </div>`;
  text = text.replace(anchorC4_find, anchorC4_replace);
  console.log('  OK C4 engagement chip inserted in Contact cell');

  // C5: remove Activity button (line-pattern walk)
  {
    const lines = text.split('\n');
    const marker = "const key = lead.id + '-activity'";
    const markerIdx = lines.findIndex(l => l.includes(marker));
    if (markerIdx === -1) throw new Error('C5: marker not found');
    const dupes = lines.filter(l => l.includes(marker)).length;
    if (dupes !== 1) throw new Error('C5: marker count = ' + dupes);
    const openIdx = markerIdx - 2;
    if (!lines[openIdx].trim().startsWith('<button')) {
      throw new Error('C5: <button open expected at marker-2, got: ' + JSON.stringify(lines[openIdx]));
    }
    let closeIdx = -1;
    for (let i = openIdx + 1; i < Math.min(openIdx + 20, lines.length); i++) {
      if (lines[i].trim() === '</button>') { closeIdx = i; break; }
    }
    if (closeIdx === -1) throw new Error('C5: </button> close not found within 20 lines');
    const removed = lines.splice(openIdx, closeIdx - openIdx + 1);
    console.log('  OK C5 Activity button removed (' + removed.length + ' lines, ' + openIdx + '..' + closeIdx + ')');
    text = lines.join('\n');
  }

  // C6: replace Activity timeline expansion with always-visible last-2 preview row
  {
    const lines = text.split('\n');
    const startIdx = lines.findIndex(l => l.includes('{/* Activity timeline */}'));
    if (startIdx === -1) throw new Error('C6: Activity timeline comment not found');
    const startDupes = lines.filter(l => l.includes('{/* Activity timeline */}')).length;
    if (startDupes !== 1) throw new Error('C6: Activity timeline comment count = ' + startDupes);
    const planIdx = lines.findIndex((l, i) => i > startIdx && l.includes('{/* Plan data panel */}'));
    if (planIdx === -1) throw new Error('C6: Plan data panel marker not found below Activity timeline');
    let endIdx = -1;
    for (let i = planIdx - 1; i > startIdx; i--) {
      if (lines[i].trim() === ')}') { endIdx = i; break; }
    }
    if (endIdx === -1) throw new Error('C6: closing )} not found between Activity comment and Plan comment');
    const indent = ((lines[startIdx].match(/^(\s*)/) || ['', ''])[1] || '');

    const preview = [
      indent + '{/* L4: Inline activity preview (last 2) -- full timeline moves to L7 drawer */}',
      indent + '{(activities[lead.id] || []).length > 0 && (',
      indent + "  <tr key={lead.id + '-activity-preview'}>",
      indent + '    <td colSpan={11} className="px-6 py-2 bg-slate-50 border-b">',
      indent + '      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">',
      indent + '        <span className="font-semibold text-gray-400 uppercase tracking-wider">Recent activity</span>',
      indent + '        {(activities[lead.id] || []).slice(-2).reverse().map((a: any) => (',
      indent + '          <span key={a.id} className="inline-flex items-center gap-1.5">',
      indent + '            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />',
      indent + "            <span className=\"text-gray-700\">{a.activity_type.replace(/_/g, ' ')}</span>",
      indent + '            <span className="text-gray-400">',
      indent + "              {new Date(a.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}",
      indent + '            </span>',
      indent + '          </span>',
      indent + '        ))}',
      indent + '      </div>',
      indent + '    </td>',
      indent + '  </tr>',
      indent + ')}',
    ];

    const removed = lines.splice(startIdx, endIdx - startIdx + 1, ...preview);
    console.log('  OK C6 Activity timeline replaced (' + removed.length + ' lines removed, ' + preview.length + ' inserted at ' + startIdx + '..' + endIdx + ')');
    text = lines.join('\n');
  }

  // Residual checks
  if (text.includes("'-activity' ? 'Hide' : 'Activity'")) throw new Error('residual: old Activity button label still present');
  if (text.includes('{/* Activity timeline */}')) throw new Error('residual: old Activity timeline comment still present');
  if (!text.includes('{/* L4: Inline activity preview')) throw new Error('residual: new preview marker missing');
  if (!text.includes('initialActivities')) throw new Error('residual: initialActivities missing');
  if (text.includes('const [loadingActivities')) throw new Error('residual: loadingActivities state still present');
  if (text.includes('const fetchActivities = async')) throw new Error('residual: fetchActivities still present');

  fs.writeFileSync(src, text, 'utf8');
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta ' + (text.length - before) + ')');
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

  if (text.split('**2026-05-12 L3**').length - 1 < 1) throw new Error('tracker: L3 anchor not found');
  if (!text.endsWith('\n')) text = text + '\n';

  const EM = '\u2014';
  const l4Entry =
    '- **2026-05-12 L4** ' + EM + ' **Engagement inline + activity preview shipped.** ' +
    '`app/admin-homes/leads/page.tsx` server-side pre-fetches `user_activities` for all visible leads via single batched query ' +
    '(`.in(\'contact_email\', emails).order(\'created_at\', { ascending: true })`). ' +
    'Multi-tenant safety: `.eq(\'tenant_id\', scopedTenantId)` when `!seeAll` mirrors the leads query scoping ' +
    '(`user_activities.tenant_id` is NOT NULL per schema probe). ' +
    'Activities grouped by `contact_email`, then mapped to `Record<lead.id, Activity[]>` and passed as `initialActivities` prop to both render branches ' +
    '(empty-tenant branch passes `{}`). Role scoping is implicit ' + EM + ' activities are only fetched for emails of leads that already passed the role-based leads query filter (admin/manager/agent). ' +
    'Direct `tenant_id` filter (vs. the on-demand route\'s `agent_id IN tenant-agent-ids`) is broader by design: it includes anonymous browsing activity (`agent_id IS NULL`), which the agent-id filter would silently exclude. ' +
    '`components/admin-homes/AdminHomesLeadsClient.tsx`: Props extended with `initialActivities: Record<string, any[]>`; component destructure updated; ' +
    '`useState<Record<string, any[]>>` seeded from `initialActivities` (the on-demand `fetchActivities` round-trip is now dead code for visible leads). ' +
    '**Contact column** renders an always-visible engagement chip inline next to `lead.contact_name`: `calcEngagement(activities[lead.id] || [])` returns `{score, label, color}`, displayed as `{label} \u00b7 {score}` in the engagement color with a `title` tooltip ' +
    '(graceful degradation: empty-activity leads show `Cold \u00b7 0`). ' +
    '**Activity expand button removed** (11-line `<button>` block; line-pattern walk: unique marker `const key = lead.id + \'-activity\'`, walk back 2 lines to `<button` open, walk forward to `</button>` close, splice). Plan + Delete buttons at unchanged positions. ' +
    '**Activity timeline expansion replaced by always-visible preview row** (55-line conditional `<tr>` block at `{/* Activity timeline */}` ' + EM + ' bounded by next `{/* Plan data panel */}` ' + EM + ' replaced with a 19-line always-visible `<tr>` rendering the last 2 activities in reverse chronological order). ' +
    'Preview row only renders when `activities[lead.id].length > 0` (no clutter for empty-activity leads). Each entry: amber dot + activity type (underscores ' + EM + ' spaces) + short timestamp (`Mon DD, HH:MM`). ' +
    '**Dead-code removal** (TSC hygiene for `noUnusedLocals` safety): `loadingActivities` state line and the entire `fetchActivities` async function body removed (the latter via line-pattern walk: function-body backtick template literals required line-pattern). ' +
    'Both will be reintroduced cleanly when L7 lead detail drawer needs them. ' +
    'Full timeline moves to L7 detail drawer (planned). ' +
    '**No DB schema changes. No new API routes. CSV export unchanged** (engagement is a derived metric; per L2 principle, exports preserve raw DB values). ' +
    '**Patch design:** 11 anchors across 2 production files + tracker. Per the recovery2-locked rule, multi-line anchors operating on blocks with backtick content (C6 Activity timeline replacement, C8 fetchActivities removal) used line-pattern walks from the start. ' +
    'Single-line anchors (P1/P2/P3/C1/C2/C3/C4 find/C7) and walk-based anchors without backtick content (C5) used exact-string find / boundary-walk respectively. No recovery passes needed. ' +
    'L4 row in phase table stays OPEN until Lclose.\n';

  text = text + l4Entry;
  fs.writeFileSync(src, text, 'utf8');

  const l4Count = text.split('**2026-05-12 L4**').length - 1;
  if (l4Count !== 1) throw new Error('tracker: L4 marker count = ' + l4Count);
  console.log('  L4 marker count: ' + l4Count);
  console.log('  bytes: ' + before + ' -> ' + text.length + ' (delta +' + (text.length - before) + ')');
}

console.log('\n=== L4 PATCHES APPLIED OK ===');