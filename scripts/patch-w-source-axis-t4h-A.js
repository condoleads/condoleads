#!/usr/bin/env node
/**
 * patch-w-source-axis-t4h-A.js
 *
 * W-SOURCE-AXIS T4-h Patch A — server side
 *
 *   h.1: Remove dead expandedLead state + Plan data panel block
 *        (components/admin-homes/AdminHomesLeadsClient.tsx)
 *   h.2: Lead-write routes capture all 6 entity IDs
 *        - app/api/walliam/contact/route.ts (extend body destructuring + INSERT)
 *        - app/api/walliam/estimator/vip-request/route.ts (helper spread)
 *        - app/api/walliam/estimator/vip-questionnaire/route.ts (helper spread)
 *   h.3: New helper lib/admin-homes/extract-entity-ids.ts
 *
 * Backups created BEFORE any in-memory work. All assertions pass before write.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGETS = {
  ll:      path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx'),
  contact: path.join(ROOT, 'app', 'api', 'walliam', 'contact', 'route.ts'),
  estReq:  path.join(ROOT, 'app', 'api', 'walliam', 'estimator', 'vip-request', 'route.ts'),
  estQ:    path.join(ROOT, 'app', 'api', 'walliam', 'estimator', 'vip-questionnaire', 'route.ts'),
};
const HELPER_NEW = path.join(ROOT, 'lib', 'admin-homes', 'extract-entity-ids.ts');

for (const [k, p] of Object.entries(TARGETS)) {
  if (!fs.existsSync(p)) { console.error('TARGET MISSING (' + k + '): ' + p); process.exit(1); }
}
if (fs.existsSync(HELPER_NEW)) {
  console.error('HELPER ALREADY EXISTS: ' + HELPER_NEW + ' — refusing to overwrite (delete or rename first)');
  process.exit(1);
}

const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '_' +
              pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());

const orig = {};
for (const [k, p] of Object.entries(TARGETS)) orig[k] = fs.readFileSync(p, 'utf8');

// ---- Backups FIRST ----
console.log('Backups:');
for (const [k, p] of Object.entries(TARGETS)) {
  const bk = p + '.backup_' + stamp;
  fs.copyFileSync(p, bk);
  console.log('  ' + k + ': ' + path.basename(bk) + ' (' + fs.statSync(bk).size + ' bytes)');
}

let ll = orig.ll, contact = orig.contact, estReq = orig.estReq, estQ = orig.estQ;

// ===== h.1a: remove expandedLead useState =====
const USESTATE_OLD = '  const [expandedLead, setExpandedLead] = useState<string | null>(null)\n';
if (ll.indexOf(USESTATE_OLD) === -1) {
  if (!/\bexpandedLead\b/.test(ll)) {
    console.log('h.1a SKIP: already removed.');
  } else { console.error('h.1a FAIL: anchor missing but expandedLead still present.'); process.exit(1); }
} else {
  const c = ll.split(USESTATE_OLD).length - 1;
  if (c !== 1) { console.error('h.1a FAIL: anchor count = ' + c); process.exit(1); }
  ll = ll.replace(USESTATE_OLD, '');
  console.log('h.1a APPLIED.');
}

// ===== h.1b: remove Plan data panel block =====
function removePlanDataPanel(text) {
  const lines = text.split('\n');
  const startIdx = lines.findIndex(l => l.includes('{/* Plan data panel */}'));
  if (startIdx === -1) return { text, removed: false, reason: 'comment not found' };
  if (startIdx + 1 >= lines.length || !lines[startIdx + 1].includes('expandedLead === lead.id')) {
    return { text, removed: false, reason: 'expandedLead conditional not adjacent' };
  }
  const m = lines[startIdx].match(/^(\s*)/);
  const indent = m[1];
  const closeLine = indent + ')}';
  let endIdx = -1;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i] === closeLine) { endIdx = i; break; }
    if (i - startIdx > 80) break;
  }
  if (endIdx === -1) return { text, removed: false, reason: 'closing )} at same indent not found within 80 lines' };
  const count = endIdx - startIdx + 1;
  lines.splice(startIdx, count);
  return { text: lines.join('\n'), removed: true, startLine: startIdx + 1, endLine: endIdx + 1, count };
}
if (!/\bexpandedLead\b/.test(ll)) {
  console.log('h.1b SKIP: already clean.');
} else {
  const r = removePlanDataPanel(ll);
  if (!r.removed) { console.error('h.1b FAIL: ' + r.reason); process.exit(1); }
  ll = r.text;
  console.log('h.1b APPLIED: removed ' + r.count + ' lines (L' + r.startLine + '–L' + r.endLine + ').');
}

// ===== h.2a: contact destructuring — add neighbourhood_id =====
const CONTACT_DESTR_OLD =
  '    const {\n' +
  '      name, email, phone, message,\n' +
  '      source,\n' +
  '      building_id, listing_id,\n' +
  '      community_id, municipality_id, area_id,\n' +
  '      geo_name, tenant_id,\n' +
  '    } = await req.json()';
const CONTACT_DESTR_NEW =
  '    const {\n' +
  '      name, email, phone, message,\n' +
  '      source,\n' +
  '      building_id, listing_id,\n' +
  '      community_id, municipality_id, area_id, neighbourhood_id,\n' +
  '      geo_name, tenant_id,\n' +
  '    } = await req.json()';
if (contact.indexOf(CONTACT_DESTR_OLD) === -1) {
  if (contact.indexOf(CONTACT_DESTR_NEW) !== -1) { console.log('h.2a SKIP: destructuring already has neighbourhood_id.'); }
  else { console.error('h.2a FAIL: destructuring anchor not found.'); process.exit(1); }
} else {
  const c = contact.split(CONTACT_DESTR_OLD).length - 1;
  if (c !== 1) { console.error('h.2a FAIL: anchor count = ' + c); process.exit(1); }
  contact = contact.replace(CONTACT_DESTR_OLD, CONTACT_DESTR_NEW);
  console.log('h.2a APPLIED.');
}

// ===== h.2b: contact INSERT — add 4 missing geo IDs =====
const CONTACT_INS_OLD =
  '      building_id: building_id || null,\n' +
  '      listing_id: listing_id || null,\n' +
  '      geo_name: geo_name || null,';
const CONTACT_INS_NEW =
  '      building_id: building_id || null,\n' +
  '      listing_id: listing_id || null,\n' +
  '      area_id: area_id || null,\n' +
  '      municipality_id: municipality_id || null,\n' +
  '      community_id: community_id || null,\n' +
  '      neighbourhood_id: neighbourhood_id || null,\n' +
  '      geo_name: geo_name || null,';
if (contact.indexOf(CONTACT_INS_OLD) === -1) {
  if (/area_id: area_id \|\| null,/.test(contact)) { console.log('h.2b SKIP: INSERT already has area_id.'); }
  else { console.error('h.2b FAIL: INSERT anchor not found.'); process.exit(1); }
} else {
  const c = contact.split(CONTACT_INS_OLD).length - 1;
  if (c !== 1) { console.error('h.2b FAIL: INSERT anchor count = ' + c); process.exit(1); }
  contact = contact.replace(CONTACT_INS_OLD, CONTACT_INS_NEW);
  console.log('h.2b APPLIED.');
}

// ===== h.2c/e: add helper import to estimator routes =====
const HELPER_IMPORT = "import { entityIdsFromSession } from '@/lib/admin-homes/extract-entity-ids'";
function addImportAfterLast(text, newImport) {
  const lines = text.split('\n');
  let lastImportIdx = -1;
  let inMulti = false;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const t = ln.trim();
    if (/^import\s/.test(ln)) {
      lastImportIdx = i;
      inMulti = !/from\s+['"][^'"]+['"]\s*;?\s*\r?$/.test(ln);
    } else if (inMulti) {
      lastImportIdx = i;
      if (/from\s+['"][^'"]+['"]\s*;?\s*\r?$/.test(ln)) inMulti = false;
    } else if (lastImportIdx >= 0 && t !== '' && !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*')) {
      break;
    }
  }
  if (lastImportIdx === -1) return { text, added: false, reason: 'no import found' };
  lines.splice(lastImportIdx + 1, 0, newImport);
  return { text: lines.join('\n'), added: true, line: lastImportIdx + 2 };
}

if (estReq.indexOf(HELPER_IMPORT) !== -1) {
  console.log('h.2c SKIP: import already present in vip-request.');
} else {
  const r = addImportAfterLast(estReq, HELPER_IMPORT);
  if (!r.added) { console.error('h.2c FAIL: ' + r.reason); process.exit(1); }
  estReq = r.text;
  console.log('h.2c APPLIED at L' + r.line);
}

if (estQ.indexOf(HELPER_IMPORT) !== -1) {
  console.log('h.2e SKIP: import already present in vip-questionnaire.');
} else {
  const r = addImportAfterLast(estQ, HELPER_IMPORT);
  if (!r.added) { console.error('h.2e FAIL: ' + r.reason); process.exit(1); }
  estQ = r.text;
  console.log('h.2e APPLIED at L' + r.line);
}

// ===== h.2d: vip-request — replace building_id line with helper spread =====
const ESTREQ_OLD = "          building_id: session.current_page_type === 'building' ? session.current_page_id : null,";
const ESTREQ_NEW = "          ...entityIdsFromSession(session),";
if (estReq.indexOf(ESTREQ_OLD) === -1) {
  if (estReq.indexOf(ESTREQ_NEW) !== -1) { console.log('h.2d SKIP: spread already present.'); }
  else { console.error('h.2d FAIL: anchor not found in vip-request.'); process.exit(1); }
} else {
  const c = estReq.split(ESTREQ_OLD).length - 1;
  if (c !== 1) { console.error('h.2d FAIL: anchor count = ' + c); process.exit(1); }
  estReq = estReq.replace(ESTREQ_OLD, ESTREQ_NEW);
  console.log('h.2d APPLIED.');
}

// ===== h.2f: vip-questionnaire — replace building_id line with helper spread =====
const ESTQ_OLD = "            building_id: session?.current_page_type === 'building' ? session?.current_page_id : null,";
const ESTQ_NEW = "            ...entityIdsFromSession(session),";
if (estQ.indexOf(ESTQ_OLD) === -1) {
  if (estQ.indexOf(ESTQ_NEW) !== -1) { console.log('h.2f SKIP: spread already present.'); }
  else { console.error('h.2f FAIL: anchor not found in vip-questionnaire.'); process.exit(1); }
} else {
  const c = estQ.split(ESTQ_OLD).length - 1;
  if (c !== 1) { console.error('h.2f FAIL: anchor count = ' + c); process.exit(1); }
  estQ = estQ.replace(ESTQ_OLD, ESTQ_NEW);
  console.log('h.2f APPLIED.');
}

// ===== Assertions =====
const checks = [
  // h.1
  { name: 'leadsList: expandedLead state removed',                ok: !/\bexpandedLead\b/.test(ll) },
  { name: 'leadsList: setExpandedLead removed',                   ok: !/\bsetExpandedLead\b/.test(ll) },
  { name: 'leadsList: Plan data panel comment removed',           ok: !ll.includes('Plan data panel') },
  { name: 'leadsList: T4-g.4 pill arrow preserved (no regression)', ok: ll.includes("lead.source_url ? ' \u2197'") },
  { name: 'leadsList: T4-c <a> wrap preserved (no regression)',   ok: ll.includes('inline-block hover:opacity-80') },

  // h.2 contact
  { name: 'contact: destructuring has neighbourhood_id',          ok: /community_id,\s*municipality_id,\s*area_id,\s*neighbourhood_id,/.test(contact) },
  { name: 'contact: INSERT has area_id',                          ok: contact.includes('area_id: area_id || null,') },
  { name: 'contact: INSERT has municipality_id',                  ok: contact.includes('municipality_id: municipality_id || null,') },
  { name: 'contact: INSERT has community_id',                     ok: contact.includes('community_id: community_id || null,') },
  { name: 'contact: INSERT has neighbourhood_id',                 ok: contact.includes('neighbourhood_id: neighbourhood_id || null,') },
  { name: 'contact: INSERT still has building_id (no regression)',ok: contact.includes('building_id: building_id || null,') },
  { name: 'contact: INSERT still has listing_id (no regression)', ok: contact.includes('listing_id: listing_id || null,') },
  { name: 'contact: INSERT still has geo_name (no regression)',   ok: contact.includes('geo_name: geo_name || null,') },

  // h.2 vip-request
  { name: 'vip-request: helper import present',                   ok: estReq.includes(HELPER_IMPORT) },
  { name: 'vip-request: helper spread in INSERT',                 ok: /\.\.\.entityIdsFromSession\(session\)/.test(estReq) },
  { name: 'vip-request: legacy building_id line removed',         ok: !/building_id:\s*session\.current_page_type\s*===\s*'building'/.test(estReq) },
  { name: 'vip-request: source_url preserved (no regression)',    ok: estReq.includes('source_url: pageUrl') },
  { name: 'vip-request: lead_origin_route preserved',             ok: estReq.includes("lead_origin_route: 'estimator_vip_request'") },

  // h.2 vip-questionnaire
  { name: 'vip-questionnaire: helper import present',             ok: estQ.includes(HELPER_IMPORT) },
  { name: 'vip-questionnaire: helper spread in INSERT',           ok: /\.\.\.entityIdsFromSession\(session\)/.test(estQ) },
  { name: 'vip-questionnaire: legacy building_id line removed',   ok: !/building_id:\s*session\?\.current_page_type/.test(estQ) },
  { name: 'vip-questionnaire: lead_origin_route preserved',       ok: estQ.includes("lead_origin_route: 'estimator_questionnaire'") },
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
  console.error('FAILED ' + failed + ' assertion(s) — refusing to write to disk (backups preserved)');
  process.exit(1);
}

// ===== Write helper (new file) =====
const HELPER_DIR = path.dirname(HELPER_NEW);
if (!fs.existsSync(HELPER_DIR)) fs.mkdirSync(HELPER_DIR, { recursive: true });
const HELPER_CONTENT = `/**
 * extract-entity-ids
 *
 * Single source of truth for resolving a lead's entity context (building /
 * listing / 4 geo levels) from either a request body or a chat session row.
 * Used by lead-write routes in W-SOURCE-AXIS T4-h to ensure that, when the
 * data is present, the lead row stores the resolved entity IDs.
 *
 * Multi-tenant safe: this module makes no tenant-specific assumptions.
 */

export interface EntityIds {
  building_id: string | null;
  listing_id: string | null;
  area_id: string | null;
  municipality_id: string | null;
  community_id: string | null;
  neighbourhood_id: string | null;
}

const NULL_IDS: EntityIds = {
  building_id: null,
  listing_id: null,
  area_id: null,
  municipality_id: null,
  community_id: null,
  neighbourhood_id: null,
};

function nullIfEmpty(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Extract entity IDs from a request body. Each field is independently optional.
 */
export function entityIdsFromBody(body: any): EntityIds {
  if (!body || typeof body !== 'object') return { ...NULL_IDS };
  return {
    building_id:      nullIfEmpty(body.building_id),
    listing_id:       nullIfEmpty(body.listing_id),
    area_id:          nullIfEmpty(body.area_id),
    municipality_id:  nullIfEmpty(body.municipality_id),
    community_id:     nullIfEmpty(body.community_id),
    neighbourhood_id: nullIfEmpty(body.neighbourhood_id),
  };
}

/**
 * Extract entity IDs from a chat-session row using current_page_type /
 * current_page_id. Recognised values: 'building', 'listing', 'property',
 * 'area', 'municipality', 'community', 'neighbourhood'. 'property' maps
 * to listing_id as a synonym for 'listing' on the public site.
 */
export function entityIdsFromSession(session: any): EntityIds {
  if (!session) return { ...NULL_IDS };
  const t: unknown = session.current_page_type;
  const id = nullIfEmpty(session.current_page_id);
  if (!id || typeof t !== 'string') return { ...NULL_IDS };
  return {
    building_id:      t === 'building' ? id : null,
    listing_id:       (t === 'listing' || t === 'property') ? id : null,
    area_id:          t === 'area' ? id : null,
    municipality_id:  t === 'municipality' ? id : null,
    community_id:     t === 'community' ? id : null,
    neighbourhood_id: t === 'neighbourhood' ? id : null,
  };
}

/**
 * Combine body and session sources, preferring body when both are present.
 */
export function entityIdsFromBodyAndSession(body: any, session: any): EntityIds {
  const b = entityIdsFromBody(body);
  const s = entityIdsFromSession(session);
  return {
    building_id:      b.building_id      ?? s.building_id,
    listing_id:       b.listing_id       ?? s.listing_id,
    area_id:          b.area_id          ?? s.area_id,
    municipality_id:  b.municipality_id  ?? s.municipality_id,
    community_id:     b.community_id     ?? s.community_id,
    neighbourhood_id: b.neighbourhood_id ?? s.neighbourhood_id,
  };
}
`;
fs.writeFileSync(HELPER_NEW, HELPER_CONTENT, 'utf8');
console.log('');
console.log('Wrote NEW: ' + path.relative(ROOT, HELPER_NEW) + ' (' + fs.statSync(HELPER_NEW).size + ' bytes)');

// ===== Write modified files =====
fs.writeFileSync(TARGETS.ll, ll, 'utf8');
fs.writeFileSync(TARGETS.contact, contact, 'utf8');
fs.writeFileSync(TARGETS.estReq, estReq, 'utf8');
fs.writeFileSync(TARGETS.estQ, estQ, 'utf8');
console.log('');
for (const [k, p] of Object.entries(TARGETS)) {
  const size = fs.statSync(p).size;
  const o = Buffer.byteLength(orig[k], 'utf8');
  const d = size - o;
  console.log('Wrote: ' + path.relative(ROOT, p) + '  ' + size + 'B (was ' + o + 'B, delta ' + (d >= 0 ? '+' : '') + d + ')');
}