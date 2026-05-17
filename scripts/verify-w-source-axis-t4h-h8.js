#!/usr/bin/env node
/**
 * verify-w-source-axis-t4h-h8.js
 *
 * W-SOURCE-AXIS T4-h H.8 — Extended verifier
 *
 * READ-ONLY. No writes, no backups. Reads all files modified by T4-h
 * Patches A and B plus the new helper, runs every assertion derived from
 * those patches' post-build checks, adds h.3 helper-shape checks, and
 * adds T5 multi-tenant carry-forward checks (substring level — Rule Zero
 * verified data only).
 *
 * Exit 0 iff every check passes.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const FILES = {
  llPage:  path.join(ROOT, 'app', 'admin-homes', 'leads', 'page.tsx'),
  wbApi:   path.join(ROOT, 'app', 'api', 'admin-homes', 'leads', '[id]', 'route.ts'),
  llCli:   path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx'),
  wbCli:   path.join(ROOT, 'app', 'admin-homes', 'leads', '[id]', 'LeadWorkbenchClient.tsx'),
  contact: path.join(ROOT, 'app', 'api', 'walliam', 'contact', 'route.ts'),
  estReq:  path.join(ROOT, 'app', 'api', 'walliam', 'estimator', 'vip-request', 'route.ts'),
  estQ:    path.join(ROOT, 'app', 'api', 'walliam', 'estimator', 'vip-questionnaire', 'route.ts'),
  helper:  path.join(ROOT, 'lib', 'admin-homes', 'extract-entity-ids.ts'),
};

// ----- Read all files (read-only) -----
const txt = {};
const missing = [];
for (const [k, p] of Object.entries(FILES)) {
  if (!fs.existsSync(p)) { missing.push(k + ' -> ' + path.relative(ROOT, p)); continue; }
  txt[k] = fs.readFileSync(p, 'utf8');
}
if (missing.length > 0) {
  console.error('MISSING FILES:');
  for (const m of missing) console.error('  ' + m);
  process.exit(1);
}

const HELPER_IMPORT = "import { entityIdsFromSession } from '@/lib/admin-homes/extract-entity-ids'";

// Helper to access file text by symbol
const ll      = txt.llCli;       // AdminHomesLeadsClient.tsx (also touched in h.5/h.6)
const llPage  = txt.llPage;      // leads/page.tsx (h.4a)
const wbApi   = txt.wbApi;       // /api/admin-homes/leads/[id]/route.ts (h.4b)
const wbCli   = txt.wbCli;       // LeadWorkbenchClient.tsx (h.7a–d)
const contact = txt.contact;     // /api/walliam/contact/route.ts (h.2a/b)
const estReq  = txt.estReq;      // /api/walliam/estimator/vip-request/route.ts (h.2c/d)
const estQ    = txt.estQ;        // /api/walliam/estimator/vip-questionnaire/route.ts (h.2e/f)
const helper  = txt.helper;      // lib/admin-homes/extract-entity-ids.ts (h.3 NEW)

// ====== Check definitions ======

const sections = [];

// --- h.1 (Patch A) — 5 ---
sections.push({ title: 'h.1 — dead expandedLead removed (leads-list client)', checks: [
  { name: 'expandedLead state removed',                ok: !/\bexpandedLead\b/.test(ll) },
  { name: 'setExpandedLead removed',                   ok: !/\bsetExpandedLead\b/.test(ll) },
  { name: 'Plan data panel comment removed',           ok: !ll.includes('Plan data panel') },
  { name: 'T4-g.4 pill arrow preserved (no regression)', ok: ll.includes("lead.source_url ? ' \u2197'") },
  { name: 'T4-c <a> wrap preserved (no regression)',   ok: ll.includes('inline-block hover:opacity-80') },
]});

// --- h.2 contact (Patch A) — 8 ---
sections.push({ title: 'h.2 contact — destructure + INSERT', checks: [
  { name: 'destructuring has neighbourhood_id',        ok: /community_id,\s*municipality_id,\s*area_id,\s*neighbourhood_id,/.test(contact) },
  { name: 'INSERT has area_id',                        ok: contact.includes('area_id: area_id || null,') },
  { name: 'INSERT has municipality_id',                ok: contact.includes('municipality_id: municipality_id || null,') },
  { name: 'INSERT has community_id',                   ok: contact.includes('community_id: community_id || null,') },
  { name: 'INSERT has neighbourhood_id',               ok: contact.includes('neighbourhood_id: neighbourhood_id || null,') },
  { name: 'INSERT still has building_id (no regression)', ok: contact.includes('building_id: building_id || null,') },
  { name: 'INSERT still has listing_id (no regression)',  ok: contact.includes('listing_id: listing_id || null,') },
  { name: 'INSERT still has geo_name (no regression)',    ok: contact.includes('geo_name: geo_name || null,') },
]});

// --- h.2 vip-request (Patch A) — 5 ---
sections.push({ title: 'h.2 vip-request — helper wired in', checks: [
  { name: 'helper import present',                     ok: estReq.includes(HELPER_IMPORT) },
  { name: 'helper spread in INSERT',                   ok: /\.\.\.entityIdsFromSession\(session\)/.test(estReq) },
  { name: 'legacy building_id line removed',           ok: !/building_id:\s*session\.current_page_type\s*===\s*'building'/.test(estReq) },
  { name: 'source_url preserved (no regression)',      ok: estReq.includes('source_url: pageUrl') },
  { name: 'lead_origin_route preserved',               ok: estReq.includes("lead_origin_route: 'estimator_vip_request'") },
]});

// --- h.2 vip-questionnaire (Patch A) — 4 ---
sections.push({ title: 'h.2 vip-questionnaire — helper wired in', checks: [
  { name: 'helper import present',                     ok: estQ.includes(HELPER_IMPORT) },
  { name: 'helper spread in INSERT',                   ok: /\.\.\.entityIdsFromSession\(session\)/.test(estQ) },
  { name: 'legacy building_id line removed',           ok: !/building_id:\s*session\?\.current_page_type/.test(estQ) },
  { name: 'lead_origin_route preserved',               ok: estQ.includes("lead_origin_route: 'estimator_questionnaire'") },
]});

// --- h.3 helper file shape (NEW in Patch A) — 7 ---
sections.push({ title: 'h.3 — extract-entity-ids helper module', checks: [
  { name: 'exports EntityIds interface',               ok: /export\s+interface\s+EntityIds\b/.test(helper) },
  { name: 'exports entityIdsFromBody',                 ok: /export\s+function\s+entityIdsFromBody\b/.test(helper) },
  { name: 'exports entityIdsFromSession',              ok: /export\s+function\s+entityIdsFromSession\b/.test(helper) },
  { name: 'exports entityIdsFromBodyAndSession',       ok: /export\s+function\s+entityIdsFromBodyAndSession\b/.test(helper) },
  { name: 'EntityIds has all 6 ID fields',             ok: ['building_id','listing_id','area_id','municipality_id','community_id','neighbourhood_id'].every(f => helper.includes(f + ':')) },
  { name: 'session resolver recognises 7 page types',  ok: ["'building'","'listing'","'property'","'area'","'municipality'","'community'","'neighbourhood'"].every(s => helper.includes(s)) },
  { name: 'helper has no tenant_id business logic',    ok: !/\btenant_id\b/.test(helper) },
]});

// --- h.4 read-path JOINs (Patch B) — 13 ---
sections.push({ title: 'h.4 — read-path JOINs (leads-list page + workbench API)', checks: [
  { name: 'leads-list: building JOIN',                 ok: llPage.includes('building:buildings!leads_building_id_fkey ( id, building_name, slug )') },
  { name: 'leads-list: listing JOIN',                  ok: llPage.includes('listing:mls_listings!leads_listing_id_fkey ( id, unparsed_address )') },
  { name: 'leads-list: area JOIN',                     ok: llPage.includes('area:treb_areas!leads_area_id_fkey ( id, name, slug )') },
  { name: 'leads-list: municipality JOIN',             ok: llPage.includes('municipality:municipalities!leads_municipality_id_fkey ( id, name, slug )') },
  { name: 'leads-list: community JOIN',                ok: llPage.includes('community:communities!leads_community_id_fkey ( id, name, slug )') },
  { name: 'leads-list: neighbourhood JOIN',            ok: llPage.includes('neighbourhood:neighbourhoods!leads_neighbourhood_id_fkey ( id, name, slug )') },
  { name: 'leads-list: tenant_admin preserved',        ok: llPage.includes('tenant_admin:agents!leads_tenant_admin_id_fkey ( id, full_name, email )') },
  { name: 'leads-list: agents JOIN preserved',         ok: llPage.includes('agents!leads_agent_id_fkey ( id, full_name, email )') },
  { name: 'workbench API: building JOIN',              ok: wbApi.includes('building:buildings!leads_building_id_fkey(id,building_name,slug)') },
  { name: 'workbench API: 4 geo JOINs',                ok: wbApi.includes('area:treb_areas!leads_area_id_fkey') && wbApi.includes('municipality:municipalities!') && wbApi.includes('community:communities!') && wbApi.includes('neighbourhood:neighbourhoods!') },
  { name: 'workbench API: raw FK columns',             ok: wbApi.includes('building_id, listing_id, area_id, municipality_id, community_id, neighbourhood_id') },
  { name: 'workbench API: source_url preserved',       ok: wbApi.includes('source_url') },
  { name: 'workbench API: created_at preserved',       ok: wbApi.includes('created_at') },
]});

// --- h.5 Lead type extension (Patch B) — 8 ---
sections.push({ title: 'h.5 — Lead TS interface extended', checks: [
  { name: 'Lead: building? field',                     ok: /building\?:\s*\{[^}]*building_name/.test(ll) },
  { name: 'Lead: listing? field',                      ok: /listing\?:\s*\{[^}]*unparsed_address/.test(ll) },
  { name: 'Lead: area? field',                         ok: /area\?:\s*\{[^}]*name:/.test(ll) },
  { name: 'Lead: municipality? field',                 ok: /municipality\?:\s*\{[^}]*name:/.test(ll) },
  { name: 'Lead: community? field',                    ok: /community\?:\s*\{[^}]*name:/.test(ll) },
  { name: 'Lead: neighbourhood? field',                ok: /neighbourhood\?:\s*\{[^}]*name:/.test(ll) },
  { name: 'Lead: tenant_admin preserved',              ok: /tenant_admin\?:/.test(ll) },
  { name: 'Lead: source_url preserved',                ok: ll.includes('source_url: string | null') },
]});

// --- h.6 row UI ctx render (Patch B) — 5 ---
sections.push({ title: 'h.6 — row UI: pillRendered + context breadcrumb', checks: [
  { name: 'pillRendered defined',                      ok: ll.includes('const pillRendered = lead.source_url ?') },
  { name: 'ctx build (with building push)',            ok: ll.includes('const ctx:') && ll.includes('if (lead.building) ctx.push') },
  { name: 'Fragment with pillRendered',                ok: /<>\s*\n\s*\{pillRendered\}/.test(ll) },
  { name: 'stopPropagation preserved',                 ok: /onClick=\{\s*\(e\)\s*=>\s*e\.stopPropagation/.test(ll) },
  { name: 'pill arrow preserved (T4-g.4)',             ok: ll.includes("lead.source_url ? ' \u2197'") },
]});

// --- h.7 workbench SourceContextSection (Patch B) — 5 ---
sections.push({ title: 'h.7 — SourceContextSection on workbench (3 tabs)', checks: [
  { name: 'SourceContextSection function defined',     ok: wbCli.includes('function SourceContextSection') },
  { name: 'SourceContextSection used exactly 3x',      ok: (wbCli.match(/<SourceContextSection lead=\{anchorLead\}\s*\/>/g) || []).length === 3 },
  { name: 'Overview Source URL block preserved',       ok: wbCli.includes('uppercase tracking-wider mb-1">Source URL') },
  { name: 'Estimator Submission heading preserved',    ok: wbCli.includes('>Estimator Submission</h3>') },
  { name: 'Estimator Questionnaire heading preserved', ok: wbCli.includes('>Estimator Questionnaire</h3>') },
]});

// --- T5 multi-tenant carry-forward — 8 ---
sections.push({ title: 'T5 — multi-tenant carry-forward (substring-level Rule Zero)', checks: [
  { name: 'contact route still references tenant_id',          ok: /\btenant_id\b/.test(contact) },
  { name: 'vip-request route still references tenant_id',      ok: /\btenant_id\b/.test(estReq) },
  { name: 'vip-questionnaire route still references tenant_id',ok: /\btenant_id\b/.test(estQ) },
  { name: 'leads-list page still references tenant_id',        ok: /\btenant_id\b/.test(llPage) },
  { name: 'workbench API still references tenant_id',          ok: /\btenant_id\b/.test(wbApi) },
  { name: 'helper module is tenant-neutral (no tenant_id)',    ok: !/\btenant_id\b/.test(helper) },
  { name: 'helper module has no hardcoded walliam literal',    ok: !/\bwalliam\b/.test(helper) },
  { name: 'helper module has no hardcoded condoleads literal', ok: !/\bcondoleads\b/.test(helper) },
]});

// ====== Run + report ======

let totalChecks = 0, totalFailed = 0;
console.log('verify-w-source-axis-t4h-h8 — extended verifier');
console.log('================================================');
for (const sec of sections) {
  console.log('');
  console.log('[ ' + sec.title + ' ]');
  for (const c of sec.checks) {
    totalChecks++;
    if (!c.ok) totalFailed++;
    console.log((c.ok ? '  PASS' : '  FAIL') + '  ' + c.name);
  }
}

console.log('');
console.log('================================================');
console.log('Total: ' + totalChecks + ' checks, ' + (totalChecks - totalFailed) + ' PASS, ' + totalFailed + ' FAIL');

// ---- File-size summary (informational; no assertions) ----
console.log('');
console.log('File sizes (informational):');
for (const [k, p] of Object.entries(FILES)) {
  const sz = fs.statSync(p).size;
  console.log('  ' + k.padEnd(8) + ' ' + sz + 'B  ' + path.relative(ROOT, p));
}

if (totalFailed > 0) process.exit(1);
process.exit(0);