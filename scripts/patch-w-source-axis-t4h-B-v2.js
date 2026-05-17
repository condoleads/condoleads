#!/usr/bin/env node
/**
 * patch-w-source-axis-t4h-B-v2.js
 *
 * v2 — same edits as v1, fixed for mixed line endings.
 * app/admin-homes/leads/page.tsx is CRLF; other 3 files are LF.
 *
 * Strategy: detect each file's line ending on read, normalize to LF for
 * in-memory anchor matching, write back with original LE preserved.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGETS = {
  llPage: path.join(ROOT, 'app', 'admin-homes', 'leads', 'page.tsx'),
  wbApi:  path.join(ROOT, 'app', 'api', 'admin-homes', 'leads', '[id]', 'route.ts'),
  llCli:  path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx'),
  wbCli:  path.join(ROOT, 'app', 'admin-homes', 'leads', '[id]', 'LeadWorkbenchClient.tsx'),
};

for (const [k, p] of Object.entries(TARGETS)) {
  if (!fs.existsSync(p)) { console.error('TARGET MISSING (' + k + '): ' + p); process.exit(1); }
}

const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '_' +
              pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());

function detectAndNormalize(rawText) {
  if (rawText.includes('\r\n')) return { normalized: rawText.replace(/\r\n/g, '\n'), le: '\r\n' };
  return { normalized: rawText, le: '\n' };
}
function denormalize(text, le) {
  return le === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}

const raw = {}, le = {}, work = {};
for (const [k, p] of Object.entries(TARGETS)) {
  raw[k] = fs.readFileSync(p, 'utf8');
  const det = detectAndNormalize(raw[k]);
  work[k] = det.normalized;
  le[k] = det.le;
}

// ----- Backups FIRST (byte-exact copy of original; LE preserved naturally) -----
console.log('Backups:');
for (const [k, p] of Object.entries(TARGETS)) {
  const bk = p + '.backup_' + stamp;
  fs.copyFileSync(p, bk);
  console.log('  ' + k + ': ' + path.basename(bk) + ' (' + fs.statSync(bk).size +
              'B, LE=' + (le[k] === '\r\n' ? 'CRLF' : 'LF') + ')');
}

let llPage = work.llPage, wbApi = work.wbApi, llCli = work.llCli, wbCli = work.wbCli;

// ===== h.4a =====
const LL_SEL_OLD =
  '      tenant_admin:agents!leads_tenant_admin_id_fkey ( id, full_name, email )\n' +
  '    `)';
const LL_SEL_NEW =
  '      tenant_admin:agents!leads_tenant_admin_id_fkey ( id, full_name, email ),\n' +
  '      building:buildings!leads_building_id_fkey ( id, building_name, slug ),\n' +
  '      listing:mls_listings!leads_listing_id_fkey ( id, unparsed_address ),\n' +
  '      area:treb_areas!leads_area_id_fkey ( id, name, slug ),\n' +
  '      municipality:municipalities!leads_municipality_id_fkey ( id, name, slug ),\n' +
  '      community:communities!leads_community_id_fkey ( id, name, slug ),\n' +
  '      neighbourhood:neighbourhoods!leads_neighbourhood_id_fkey ( id, name, slug )\n' +
  '    `)';
if (llPage.indexOf(LL_SEL_OLD) === -1) {
  if (llPage.includes('building:buildings!leads_building_id_fkey')) console.log('h.4a SKIP: already extended.');
  else { console.error('h.4a FAIL: anchor not found.'); process.exit(1); }
} else {
  const c = llPage.split(LL_SEL_OLD).length - 1;
  if (c !== 1) { console.error('h.4a FAIL: anchor count = ' + c); process.exit(1); }
  llPage = llPage.replace(LL_SEL_OLD, LL_SEL_NEW);
  console.log('h.4a APPLIED.');
}

// ===== h.4b =====
const WB_SEL_OLD = ".select('id, tenant_id, agent_id, contact_name, contact_email, contact_phone, status, quality, temperature, source, source_url, intent, geo_name, created_at')";
const WB_SEL_NEW = ".select('id, tenant_id, agent_id, contact_name, contact_email, contact_phone, status, quality, temperature, source, source_url, intent, geo_name, created_at, building_id, listing_id, area_id, municipality_id, community_id, neighbourhood_id, building:buildings!leads_building_id_fkey(id,building_name,slug), listing:mls_listings!leads_listing_id_fkey(id,unparsed_address), area:treb_areas!leads_area_id_fkey(id,name,slug), municipality:municipalities!leads_municipality_id_fkey(id,name,slug), community:communities!leads_community_id_fkey(id,name,slug), neighbourhood:neighbourhoods!leads_neighbourhood_id_fkey(id,name,slug)')";
if (wbApi.indexOf(WB_SEL_OLD) === -1) {
  if (wbApi.includes('building:buildings!leads_building_id_fkey')) console.log('h.4b SKIP: already extended.');
  else { console.error('h.4b FAIL: anchor not found.'); process.exit(1); }
} else {
  const c = wbApi.split(WB_SEL_OLD).length - 1;
  if (c !== 1) { console.error('h.4b FAIL: anchor count = ' + c); process.exit(1); }
  wbApi = wbApi.replace(WB_SEL_OLD, WB_SEL_NEW);
  console.log('h.4b APPLIED.');
}

// ===== h.5 =====
const LEAD_OLD =
  '  tenant_admin?: { id: string; full_name: string; email: string }\n' +
  '}';
const LEAD_NEW =
  '  tenant_admin?: { id: string; full_name: string; email: string }\n' +
  '  building?: { id: string; building_name: string | null; slug: string | null } | null\n' +
  '  listing?: { id: string; unparsed_address: string | null } | null\n' +
  '  area?: { id: string; name: string | null; slug: string | null } | null\n' +
  '  municipality?: { id: string; name: string | null; slug: string | null } | null\n' +
  '  community?: { id: string; name: string | null; slug: string | null } | null\n' +
  '  neighbourhood?: { id: string; name: string | null; slug: string | null } | null\n' +
  '}';
if (llCli.indexOf(LEAD_OLD) === -1) {
  if (llCli.includes('building?: { id: string; building_name:')) console.log('h.5 SKIP: already extended.');
  else { console.error('h.5 FAIL: anchor not found.'); process.exit(1); }
} else {
  const c = llCli.split(LEAD_OLD).length - 1;
  if (c !== 1) { console.error('h.5 FAIL: anchor count = ' + c); process.exit(1); }
  llCli = llCli.replace(LEAD_OLD, LEAD_NEW);
  console.log('h.5 APPLIED.');
}

// ===== h.6 =====
const ROW_OLD =
  '                        return lead.source_url ? (\n' +
  '\n' +
  '                          <a href={lead.source_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={lead.source_url} className="inline-block hover:opacity-80">\n' +
  '\n' +
  '                            {pill}\n' +
  '\n' +
  '                          </a>\n' +
  '\n' +
  '                        ) : pill';
const ROW_NEW =
  '                        const pillRendered = lead.source_url ? (\n' +
  '                          <a href={lead.source_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={lead.source_url} className="inline-block hover:opacity-80">\n' +
  '                            {pill}\n' +
  '                          </a>\n' +
  '                        ) : pill\n' +
  '\n' +
  '                        const ctx: Array<{ name: string | null; slug: string | null }> = []\n' +
  '                        if (lead.building) ctx.push({ name: lead.building.building_name, slug: lead.building.slug })\n' +
  '                        if (lead.listing) ctx.push({ name: lead.listing.unparsed_address, slug: null })\n' +
  '                        if (lead.neighbourhood) ctx.push({ name: lead.neighbourhood.name, slug: lead.neighbourhood.slug })\n' +
  '                        if (lead.community) ctx.push({ name: lead.community.name, slug: lead.community.slug })\n' +
  '                        if (lead.municipality) ctx.push({ name: lead.municipality.name, slug: lead.municipality.slug })\n' +
  '                        if (lead.area) ctx.push({ name: lead.area.name, slug: lead.area.slug })\n' +
  '\n' +
  '                        return (\n' +
  '                          <>\n' +
  '                            {pillRendered}\n' +
  '                            {ctx.length > 0 && (\n' +
  '                              <div className="text-xs text-gray-500 mt-1 truncate" title={ctx.map(c => c.name || \'?\').join(\' \u00b7 \')}>\n' +
  '                                {ctx.map((it, i) => (\n' +
  '                                  <span key={i}>\n' +
  '                                    {i > 0 && <span className="mx-1 text-gray-300">\u00b7</span>}\n' +
  '                                    {it.slug ? (\n' +
  '                                      <a href={`/${it.slug}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:underline">{it.name || \'?\'}</a>\n' +
  '                                    ) : (\n' +
  '                                      <span>{it.name || \'?\'}</span>\n' +
  '                                    )}\n' +
  '                                  </span>\n' +
  '                                ))}\n' +
  '                              </div>\n' +
  '                            )}\n' +
  '                          </>\n' +
  '                        )';
if (llCli.indexOf(ROW_OLD) === -1) {
  if (llCli.includes('const pillRendered = lead.source_url')) console.log('h.6 SKIP: already applied.');
  else { console.error('h.6 FAIL: row return anchor not found.'); process.exit(1); }
} else {
  const c = llCli.split(ROW_OLD).length - 1;
  if (c !== 1) { console.error('h.6 FAIL: anchor count = ' + c); process.exit(1); }
  llCli = llCli.replace(ROW_OLD, ROW_NEW);
  console.log('h.6 APPLIED.');
}

// ===== h.7a =====
const SCS_FN =
  'function SourceContextSection({ lead }: { lead: any }) {\n' +
  '  const items: Array<{ label: string; name: string | null; slug: string | null }> = []\n' +
  '  if (lead?.building) items.push({ label: \'Building\', name: lead.building.building_name, slug: lead.building.slug })\n' +
  '  if (lead?.listing) items.push({ label: \'Listing\', name: lead.listing.unparsed_address, slug: null })\n' +
  '  if (lead?.neighbourhood) items.push({ label: \'Neighbourhood\', name: lead.neighbourhood.name, slug: lead.neighbourhood.slug })\n' +
  '  if (lead?.community) items.push({ label: \'Community\', name: lead.community.name, slug: lead.community.slug })\n' +
  '  if (lead?.municipality) items.push({ label: \'Municipality\', name: lead.municipality.name, slug: lead.municipality.slug })\n' +
  '  if (lead?.area) items.push({ label: \'Area\', name: lead.area.name, slug: lead.area.slug })\n' +
  '  if (items.length === 0) return null\n' +
  '  return (\n' +
  '    <div className="mt-4">\n' +
  '      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Source Context</div>\n' +
  '      <div className="space-y-1 text-sm">\n' +
  '        {items.map((it, i) => (\n' +
  '          <div key={i}>\n' +
  '            <span className="text-gray-400">{it.label}: </span>\n' +
  '            {it.slug ? (\n' +
  '              <a href={`/${it.slug}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">\n' +
  '                {it.name || \'(unnamed)\'} \u2197\n' +
  '              </a>\n' +
  '            ) : (\n' +
  '              <span>{it.name || \'(unnamed)\'}</span>\n' +
  '            )}\n' +
  '          </div>\n' +
  '        ))}\n' +
  '      </div>\n' +
  '    </div>\n' +
  '  )\n' +
  '}\n' +
  '\n';
const TABKEY = "type TabKey = 'overview' | 'plan' | 'estimator' | 'estimator_questionnaire' | 'credits' | 'activity' | 'emails' | 'vip' | 'notes'";
if (wbCli.includes('function SourceContextSection')) console.log('h.7a SKIP: already defined.');
else if (wbCli.indexOf(TABKEY) === -1) { console.error('h.7a FAIL: TabKey anchor not found.'); process.exit(1); }
else {
  const c = wbCli.split(TABKEY).length - 1;
  if (c !== 1) { console.error('h.7a FAIL: TabKey count = ' + c); process.exit(1); }
  wbCli = wbCli.replace(TABKEY, SCS_FN + TABKEY);
  console.log('h.7a APPLIED.');
}

// ===== h.7b =====
const OV_URL_BLOCK =
  '        <div className="mt-4">\n' +
  '          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Source URL</div>\n' +
  '          <div className="text-sm break-all">\n' +
  '            {anchorLead.source_url ? (\n' +
  '              <a href={anchorLead.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">\n' +
  '                {anchorLead.source_url} \u2197\n' +
  '              </a>\n' +
  '            ) : (\n' +
  '              <span className="text-gray-400">\u2014</span>\n' +
  '            )}\n' +
  '          </div>\n' +
  '        </div>';
if (wbCli.indexOf(OV_URL_BLOCK) === -1) { console.error('h.7b FAIL: Overview Source URL block not found.'); process.exit(1); }
{
  const c = wbCli.split(OV_URL_BLOCK).length - 1;
  if (c !== 1) { console.error('h.7b FAIL: count = ' + c); process.exit(1); }
  const idx = wbCli.indexOf(OV_URL_BLOCK) + OV_URL_BLOCK.length;
  if (wbCli.slice(idx, idx + 100).includes('SourceContextSection lead={anchorLead}')) {
    console.log('h.7b SKIP: already present.');
  } else {
    wbCli = wbCli.replace(OV_URL_BLOCK, OV_URL_BLOCK + '\n\n        <SourceContextSection lead={anchorLead} />');
    console.log('h.7b APPLIED.');
  }
}

// ===== h.7c =====
const EST_HEAD = '            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Estimator Submission</h3>';
if (wbCli.indexOf(EST_HEAD) === -1) { console.error('h.7c FAIL: Estimator Submission heading not found.'); process.exit(1); }
{
  const c = wbCli.split(EST_HEAD).length - 1;
  if (c !== 1) { console.error('h.7c FAIL: count = ' + c); process.exit(1); }
  const idx = wbCli.indexOf(EST_HEAD);
  if (wbCli.slice(Math.max(0, idx - 200), idx).includes('SourceContextSection lead={anchorLead}')) {
    console.log('h.7c SKIP: already present.');
  } else {
    wbCli = wbCli.replace(EST_HEAD, '            <SourceContextSection lead={anchorLead} />\n\n' + EST_HEAD);
    console.log('h.7c APPLIED.');
  }
}

// ===== h.7d =====
const ESTQ_HEAD = '            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Estimator Questionnaire</h3>';
if (wbCli.indexOf(ESTQ_HEAD) === -1) { console.error('h.7d FAIL: Estimator Questionnaire heading not found.'); process.exit(1); }
{
  const c = wbCli.split(ESTQ_HEAD).length - 1;
  if (c !== 1) { console.error('h.7d FAIL: count = ' + c); process.exit(1); }
  const idx = wbCli.indexOf(ESTQ_HEAD);
  if (wbCli.slice(Math.max(0, idx - 200), idx).includes('SourceContextSection lead={anchorLead}')) {
    console.log('h.7d SKIP: already present.');
  } else {
    wbCli = wbCli.replace(ESTQ_HEAD, '            <SourceContextSection lead={anchorLead} />\n\n' + ESTQ_HEAD);
    console.log('h.7d APPLIED.');
  }
}

// ===== Assertions =====
const checks = [
  { name: 'leads-list: building JOIN',         ok: llPage.includes('building:buildings!leads_building_id_fkey ( id, building_name, slug )') },
  { name: 'leads-list: listing JOIN',          ok: llPage.includes('listing:mls_listings!leads_listing_id_fkey ( id, unparsed_address )') },
  { name: 'leads-list: area JOIN',             ok: llPage.includes('area:treb_areas!leads_area_id_fkey ( id, name, slug )') },
  { name: 'leads-list: municipality JOIN',     ok: llPage.includes('municipality:municipalities!leads_municipality_id_fkey ( id, name, slug )') },
  { name: 'leads-list: community JOIN',        ok: llPage.includes('community:communities!leads_community_id_fkey ( id, name, slug )') },
  { name: 'leads-list: neighbourhood JOIN',    ok: llPage.includes('neighbourhood:neighbourhoods!leads_neighbourhood_id_fkey ( id, name, slug )') },
  { name: 'leads-list: tenant_admin preserved',ok: llPage.includes('tenant_admin:agents!leads_tenant_admin_id_fkey ( id, full_name, email )') },
  { name: 'leads-list: agents JOIN preserved', ok: llPage.includes('agents!leads_agent_id_fkey ( id, full_name, email )') },
  { name: 'workbench API: building JOIN',      ok: wbApi.includes('building:buildings!leads_building_id_fkey(id,building_name,slug)') },
  { name: 'workbench API: 4 geo JOINs',        ok: wbApi.includes('area:treb_areas!leads_area_id_fkey') && wbApi.includes('municipality:municipalities!') && wbApi.includes('community:communities!') && wbApi.includes('neighbourhood:neighbourhoods!') },
  { name: 'workbench API: raw FK columns',     ok: wbApi.includes('building_id, listing_id, area_id, municipality_id, community_id, neighbourhood_id') },
  { name: 'workbench API: source_url preserved', ok: wbApi.includes('source_url') },
  { name: 'workbench API: created_at preserved', ok: wbApi.includes('created_at') },
  { name: 'Lead: building? field',             ok: /building\?:\s*\{[^}]*building_name/.test(llCli) },
  { name: 'Lead: listing? field',              ok: /listing\?:\s*\{[^}]*unparsed_address/.test(llCli) },
  { name: 'Lead: area? field',                 ok: /area\?:\s*\{[^}]*name:/.test(llCli) },
  { name: 'Lead: municipality? field',         ok: /municipality\?:\s*\{[^}]*name:/.test(llCli) },
  { name: 'Lead: community? field',            ok: /community\?:\s*\{[^}]*name:/.test(llCli) },
  { name: 'Lead: neighbourhood? field',        ok: /neighbourhood\?:\s*\{[^}]*name:/.test(llCli) },
  { name: 'Lead: tenant_admin preserved',      ok: /tenant_admin\?:/.test(llCli) },
  { name: 'Lead: source_url preserved',        ok: llCli.includes('source_url: string | null') },
  { name: 'row UI: pillRendered',              ok: llCli.includes('const pillRendered = lead.source_url ?') },
  { name: 'row UI: ctx build',                 ok: llCli.includes('const ctx:') && llCli.includes('if (lead.building) ctx.push') },
  { name: 'row UI: Fragment with pillRendered',ok: /<>\s*\n\s*\{pillRendered\}/.test(llCli) },
  { name: 'row UI: T4-g.4 pill arrow preserved', ok: llCli.includes("lead.source_url ? ' \u2197'") },
  { name: 'row UI: stopPropagation preserved', ok: /onClick=\{\s*\(e\)\s*=>\s*e\.stopPropagation/.test(llCli) },
  { name: 'workbench: SourceContextSection',   ok: wbCli.includes('function SourceContextSection') },
  { name: 'workbench: SCS used 3x',            ok: (wbCli.match(/<SourceContextSection lead=\{anchorLead\}\s*\/>/g) || []).length === 3 },
  { name: 'workbench: Source URL preserved',   ok: wbCli.includes('uppercase tracking-wider mb-1">Source URL') },
  { name: 'workbench: Est Submission heading', ok: wbCli.includes('>Estimator Submission</h3>') },
  { name: 'workbench: Est Q heading',          ok: wbCli.includes('>Estimator Questionnaire</h3>') },
];

console.log('');
console.log('Post-build assertions:');
console.log('------------------------------------------------------------');
let failed = 0;
for (const c of checks) {
  console.log((c.ok ? '  PASS' : '  FAIL') + '  ' + c.name);
  if (!c.ok) failed++;
}
console.log('------------------------------------------------------------');
if (failed > 0) {
  console.error('FAILED ' + failed + ' assertion(s) — refusing to write (backups preserved)');
  process.exit(1);
}

// ===== Write (denormalize per file's original LE) =====
fs.writeFileSync(TARGETS.llPage, denormalize(llPage, le.llPage), 'utf8');
fs.writeFileSync(TARGETS.wbApi, denormalize(wbApi, le.wbApi), 'utf8');
fs.writeFileSync(TARGETS.llCli, denormalize(llCli, le.llCli), 'utf8');
fs.writeFileSync(TARGETS.wbCli, denormalize(wbCli, le.wbCli), 'utf8');
console.log('');
for (const [k, p] of Object.entries(TARGETS)) {
  const size = fs.statSync(p).size;
  const o = Buffer.byteLength(raw[k], 'utf8');
  const delta = size - o;
  console.log('Wrote: ' + path.relative(ROOT, p) + '  ' + size + 'B (was ' + o + 'B, delta ' + (delta >= 0 ? '+' : '') + delta + ', LE=' + (le[k] === '\r\n' ? 'CRLF' : 'LF') + ')');
}