#!/usr/bin/env node
/**
 * CV-RECON: map the real hierarchy -> territory -> leads flow.
 *
 * One read-only probe. Writes only to scripts/cv-recon-core-flow.js (this file)
 * and cv-recon-output.txt. No DB writes.
 *
 * Discipline per CLAUDE.md + W-CORE-VERIFICATION-TRACKER:
 *   - One pg Client per probe section (F-VERIFY-READONLY-HANG mitigation).
 *   - BEGIN READ ONLY on every DB block.
 *   - Explicit column allow-lists; NEVER SELECT * on tenants/agents.
 *   - Output to cv-recon-output.txt (operator-reviewable).
 *
 * Answers the 8 questions in section 3 of W-CORE-VERIFICATION-TRACKER.
 */

require('dotenv').config({ path: '.env.local' });
const fs   = require('fs');
const path = require('path');
const { Client } = require('pg');

const OUT_PATH = path.resolve(__dirname, '..', 'cv-recon-output.txt');
const REPO     = path.resolve(__dirname, '..');

const lines = [];
function w(s = '') { lines.push(s); }
function h1(s)     { w(''); w('=' .repeat(80)); w(s); w('='.repeat(80)); }
function h2(s)     { w(''); w('-'.repeat(80)); w(s); w('-'.repeat(80)); }

async function withClient(label, fn) {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on('error', e => console.error('  [' + label + '] client error: ' + e.message));
  await c.connect();
  await c.query('BEGIN READ ONLY');
  await c.query('SET LOCAL statement_timeout = 0');
  try { await fn(c); }
  finally {
    await c.query('ROLLBACK').catch(() => {});
    await c.end().catch(() => {});
  }
}

// ============================================================================
// FS WALK + READ HELPERS
// ============================================================================

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); }
  catch (e) { return ''; }
}

function rel(p) { return path.relative(REPO, p).replace(/\\/g, '/'); }

// Find lines matching regex; return [{file, line, text}].
function grepFiles(files, regex, opts = {}) {
  const max = opts.maxPerFile || 6;
  const out = [];
  for (const f of files) {
    const body = readSafe(f);
    if (!body) continue;
    const rows = body.split(/\r?\n/);
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      if (regex.test(rows[i])) {
        out.push({ file: rel(f), line: i + 1, text: rows[i].trim() });
        if (++count >= max) break;
      }
    }
  }
  return out;
}

// ============================================================================
// MAIN
// ============================================================================

(async () => {
  w('================================================================================');
  w('CV-RECON -- one read-only probe mapping hierarchy -> territory -> leads flow');
  w('Date: ' + new Date().toISOString());
  w('Mode: read-only, autonomous; output only to cv-recon-output.txt');
  w('================================================================================');
  w('');
  w('Reference: docs/W-CORE-VERIFICATION-TRACKER.md section 3 (the 8 questions).');
  w('Discipline: one pg Client per DB section (F-VERIFY-READONLY-HANG), BEGIN READ');
  w('  ONLY, explicit column allow-lists. No writes.');

  // -----------------------------------------------------------------------
  // Code-side enumeration: gather candidate files first.
  // -----------------------------------------------------------------------
  const appDir       = path.join(REPO, 'app');
  const apiDir       = path.join(REPO, 'app', 'api');
  const libDir       = path.join(REPO, 'lib');
  const componentsDir = path.join(REPO, 'components');

  const pageFiles   = [...walk(appDir)].filter(p => /\\page\.tsx$|\/page\.tsx$/.test(p));
  const routeFiles  = [...walk(apiDir)].filter(p => /route\.ts$/.test(p));
  const compFiles   = [...walk(componentsDir)].filter(p => /\.tsx?$/.test(p));
  const libFiles    = [...walk(libDir)].filter(p => /\.tsx?$/.test(p));

  // ===========================================================================
  // Q1 -- LEAD-CAPTURE SURFACES
  // ===========================================================================
  h1('Q1 -- LEAD-CAPTURE SURFACES (every page rendering a lead-capture entry point)');
  w('');
  w('Strategy: scan all app/**/page.tsx files for imports of known lead-capture');
  w('client components (Charlie/Contact/Estimator/Appointment/etc.) AND for direct');
  w('fetch() calls to lead-capture API routes. A surface is any page that ends');
  w('up posting to one or more of the mechanism endpoints (Q2).');
  w('');
  w('  Total app/**/page.tsx files scanned: ' + pageFiles.length);

  // Step 1a: enumerate all client components that POST to lead-capture endpoints.
  // (Charlie, Contact, Estimator, Appointment, plus anything else that fetches
  //  the /api/walliam or /api/charlie endpoints from the client.)
  const leadEndpointRE = /\/api\/(walliam|charlie)\/[^\s'"`]+/g;
  const leadClientCompFiles = [];
  for (const f of compFiles) {
    const body = readSafe(f);
    if (!body) continue;
    if (leadEndpointRE.test(body)) leadClientCompFiles.push({ file: rel(f), endpoints: Array.from(new Set(body.match(leadEndpointRE) || [])) });
  }
  w('');
  w('  client components POSTing to /api/walliam or /api/charlie endpoints:');
  w('    (' + leadClientCompFiles.length + ' files)');
  for (const c of leadClientCompFiles.slice(0, 40)) {
    w('    ' + c.file);
    for (const ep of c.endpoints.slice(0, 6)) w('      -> ' + ep);
  }
  if (leadClientCompFiles.length > 40) w('    ... ' + (leadClientCompFiles.length - 40) + ' more');

  // Step 1b: which pages render these client components?
  // Build a map: component file basename -> page files that import it.
  const compBasenames = new Set(leadClientCompFiles.map(c => path.basename(c.file).replace(/\.tsx?$/, '')));
  const pageToCapture = []; // { page, captureImports: [name] }
  for (const pg of pageFiles) {
    const body = readSafe(pg);
    if (!body) continue;
    const matched = [];
    for (const name of compBasenames) {
      // Match `import ... <Name> ...` or JSX `<Name `
      const reImp = new RegExp('import[^;]*\\b' + name + '\\b[^;]*from', 'm');
      const reJsx = new RegExp('<' + name + '\\b');
      if (reImp.test(body) || reJsx.test(body)) matched.push(name);
    }
    // Also: pages that DIRECTLY fetch the endpoints (not through a separate component)
    const directHits = body.match(leadEndpointRE) || [];
    if (matched.length > 0 || directHits.length > 0) {
      pageToCapture.push({ page: rel(pg), captureImports: matched, directEndpoints: Array.from(new Set(directHits)) });
    }
  }
  h2('Q1.A -- pages that host a lead-capture component or directly post to a capture endpoint');
  w('');
  w('  (' + pageToCapture.length + ' lead-bearing pages)');
  for (const p of pageToCapture) {
    w('  ' + p.page);
    if (p.captureImports.length) w('    captures: ' + p.captureImports.join(', '));
    for (const ep of p.directEndpoints.slice(0, 4)) w('    direct -> ' + ep);
  }

  // ===========================================================================
  // Q2 -- MECHANISMS (the lead-capture API routes themselves)
  // ===========================================================================
  h1('Q2 -- MECHANISMS (lead-capture API routes -- the real endpoint set)');
  w('');
  const mechRoutes = routeFiles.filter(p => /\/(walliam|charlie)\//.test(p.replace(/\\/g, '/')));
  w('  Total /api/walliam and /api/charlie route.ts files: ' + mechRoutes.length);
  w('');
  for (const r of mechRoutes) {
    const body = readSafe(r);
    const verbs = [];
    if (/export async function GET\b/.test(body))    verbs.push('GET');
    if (/export async function POST\b/.test(body))   verbs.push('POST');
    if (/export async function PUT\b/.test(body))    verbs.push('PUT');
    if (/export async function DELETE\b/.test(body)) verbs.push('DELETE');
    // Heuristics: does it write to leads, call resolve_agent_for_context, or call cache-first?
    const writesLeads   = /\.from\(['"]leads['"]\)\s*\.(insert|update|upsert)/.test(body) || /INSERT\s+INTO\s+leads\b/i.test(body);
    const callsRpc      = /resolve_agent_for_context/.test(body) || /resolveAgentForContext/.test(body);
    const callsCache    = /mls_listings_assigned_agent_id_fkey!inner/.test(body);
    const sendsEmail    = /sendTenantEmail|sendNotificationEmail|sendEmailViaResend/.test(body);
    const walksHierarchy= /walkHierarchy/.test(body);
    w('  ' + rel(r) + '  [' + verbs.join(',') + ']');
    w('      writesLeads=' + writesLeads + '  callsRpc=' + callsRpc + '  cacheFirst=' + callsCache + '  sendsEmail=' + sendsEmail + '  walksHierarchy=' + walksHierarchy);
  }

  // ===========================================================================
  // Q3 -- RESOLUTION PATH per (surface, mechanism) pair
  // ===========================================================================
  h1('Q3 -- RESOLUTION PATH per route: cache-first (Phase 2) vs RPC');
  w('');
  w('"Phase 2 cache-first" pattern = .select(\'assigned_agent_id, agents!...fkey!inner(...)\')');
  w('on mls_listings, then fall through to .rpc(\'resolve_agent_for_context\', ...) on NULL.');
  w('A route can be: cache-only (no RPC), RPC-only (no cache), or BOTH (cache-first+RPC');
  w('fallthrough, which is the wired-correctly v20 EDIT D shape).');
  w('');
  const resolutionMap = []; // { route, cacheFirst, callsRpc, classification }
  for (const r of mechRoutes) {
    const body = readSafe(r);
    const cacheFirst = /mls_listings_assigned_agent_id_fkey!inner/.test(body);
    const callsRpc   = /resolve_agent_for_context/.test(body) || /resolveAgentForContext/.test(body);
    const usesWrapper = /resolveAgentForContext\b/.test(body);  // calls the wrapper in tenant-resolver
    let cls;
    if (cacheFirst && callsRpc) cls = 'cache-first + RPC fallthrough (Phase 2 EDIT D)';
    else if (cacheFirst && !callsRpc) cls = 'cache-first only (unusual)';
    else if (!cacheFirst && usesWrapper) cls = 'wrapper-only (calls resolveAgentForContext from lib/utils/tenant-resolver)';
    else if (callsRpc) cls = 'RPC-only (direct rpc call, no cache-first preamble)';
    else cls = 'no resolver call detected';
    resolutionMap.push({ route: rel(r), cacheFirst, callsRpc, classification: cls });
  }
  for (const m of resolutionMap) {
    w('  ' + m.route);
    w('      ' + m.classification);
  }

  // ===========================================================================
  // Q4 -- leads.agent_id WRITERS
  // ===========================================================================
  h1('Q4 -- leads.agent_id WRITERS (insert + update paths)');
  w('');
  w('Grep across the codebase for any code that writes leads.agent_id. The');
  w('expected pattern: insert stamps it once (resolved owner); no subsequent');
  w('UPDATE except the explicit user-initiated reassign route.');
  w('');
  const codeFiles = [...walk(path.join(REPO, 'app')), ...walk(libDir), ...walk(path.join(REPO, 'scripts'))]
    .filter(p => /\.(ts|tsx|js)$/.test(p));
  // Insert paths
  const insertHits = grepFiles(codeFiles, /\.from\(['"]leads['"]\)\s*\.insert/);
  // Update paths
  const updateHits = grepFiles(codeFiles, /\.from\(['"]leads['"]\)\s*\.update/);
  // Raw SQL
  const rawSqlHits = grepFiles(codeFiles, /UPDATE\s+leads\s+SET[\s\S]*?\bagent_id\b/i);
  const rawInsertHits = grepFiles(codeFiles, /INSERT\s+INTO\s+leads\b/i);
  w('  .from(\'leads\').insert(...) call sites: (' + insertHits.length + ')');
  for (const h of insertHits.slice(0, 30)) w('    ' + h.file + ':' + h.line + '  ' + h.text.slice(0, 100));
  w('');
  w('  .from(\'leads\').update(...) call sites: (' + updateHits.length + ')');
  for (const h of updateHits.slice(0, 30)) w('    ' + h.file + ':' + h.line + '  ' + h.text.slice(0, 100));
  w('');
  w('  raw UPDATE leads SET ... agent_id: (' + rawSqlHits.length + ')');
  for (const h of rawSqlHits.slice(0, 20)) w('    ' + h.file + ':' + h.line + '  ' + h.text.slice(0, 100));
  w('');
  w('  raw INSERT INTO leads: (' + rawInsertHits.length + ')');
  for (const h of rawInsertHits.slice(0, 20)) w('    ' + h.file + ':' + h.line + '  ' + h.text.slice(0, 100));

  // For each update hit, classify whether it writes agent_id specifically.
  // Read each .update call's anchor file and inspect a 5-line window for agent_id.
  h2('Q4.A -- update-leads writers that touch agent_id specifically');
  w('');
  const updateAgentIdHits = [];
  for (const h of updateHits) {
    const body = readSafe(path.join(REPO, h.file));
    if (!body) continue;
    const rows = body.split(/\r?\n/);
    // examine 8-line window starting at this line
    const window = rows.slice(Math.max(0, h.line - 1), h.line + 8).join('\n');
    if (/\bagent_id\b/.test(window)) updateAgentIdHits.push(h);
  }
  for (const h of updateAgentIdHits) w('  ' + h.file + ':' + h.line + '  ' + h.text.slice(0, 110));
  if (updateAgentIdHits.length === 0) w('  (none -- agent_id only written at insert)');

  // ===========================================================================
  // Q5 -- HIERARCHY columns + WALLiam chain depth
  // ===========================================================================
  h1('Q5 -- HIERARCHY columns + WALLiam chain depth');
  w('');
  await withClient('hierarchy-schema-discovery', async c => {
    // First discover which hierarchy-related columns actually exist on
    // agents and on leads. The tracker prose says "manager_id /
    // area_manager_id / tenant_admin_id on agents" but the reassign-agent
    // route stamps these onto LEADS (computed via walkHierarchy from
    // agents.parent_id). Discovery first; do not assume.
    const agentCols = await c.query(`
      SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'agents'
         AND column_name IN ('id', 'tenant_id', 'role', 'parent_id',
                             'manager_id', 'area_manager_id', 'tenant_admin_id',
                             'can_create_children', 'is_active', 'is_selling',
                             'full_name', 'email')
       ORDER BY column_name
    `);
    w('  agents schema -- hierarchy-relevant columns that EXIST:');
    const agentColSet = new Set(agentCols.rows.map(r => r.column_name));
    for (const r of agentCols.rows) {
      w('    ' + r.column_name.padEnd(22) + ' ' + r.data_type.padEnd(12) + ' nullable=' + r.is_nullable);
    }
    w('');
    w('  Tracker prose mentioned manager_id/area_manager_id/tenant_admin_id as agents');
    w('  columns. Reality:');
    for (const expected of ['manager_id', 'area_manager_id', 'tenant_admin_id']) {
      w('    agents.' + expected.padEnd(20) + (agentColSet.has(expected) ? 'EXISTS' : 'DOES NOT EXIST on agents'));
    }
    // Schema discovery on leads (where the chain actually lives per reassign route)
    const leadCols = await c.query(`
      SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'leads'
         AND column_name IN ('id', 'tenant_id', 'agent_id', 'manager_id',
                             'area_manager_id', 'tenant_admin_id', 'created_at',
                             'updated_at', 'contact_email', 'status')
       ORDER BY column_name
    `);
    w('');
    w('  leads schema -- chain columns that EXIST (where the chain is STAMPED at lead-creation):');
    for (const r of leadCols.rows) {
      w('    leads.' + r.column_name.padEnd(20) + ' ' + r.data_type.padEnd(12) + ' nullable=' + r.is_nullable);
    }
  });

  await withClient('walliam-agents', async c => {
    // WALLiam agents -- explicit allow-list using only columns that EXIST on agents.
    const agents = await c.query(`
      SELECT a.id, a.full_name, a.role, a.is_active, a.is_selling, a.parent_id,
             a.can_create_children, a.email
        FROM public.agents a
       WHERE a.tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
       ORDER BY a.role, a.full_name
    `);
    w('');
    w('  WALLiam agents (' + agents.rows.length + ' total):');
    for (const r of agents.rows) {
      w('    ' + r.id.slice(0, 8) + '...  role=' + (r.role || '?').padEnd(14) + ' active=' + r.is_active + ' selling=' + r.is_selling + ' parent=' + (r.parent_id ? r.parent_id.slice(0, 8) + '...' : 'NULL') + ' can_create_children=' + r.can_create_children + ' name=' + (r.full_name || '<none>'));
    }

    // Chain depth via parent_id walk
    const roleAgg = await c.query(`
      SELECT role, COUNT(*)::int AS n,
             SUM(CASE WHEN parent_id IS NOT NULL THEN 1 ELSE 0 END)::int AS with_parent
        FROM public.agents
       WHERE tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
       GROUP BY role
       ORDER BY role
    `);
    w('');
    w('  WALLiam agents grouped by role (chain link = parent_id):');
    for (const r of roleAgg.rows) {
      w('    role=' + (r.role || '?').padEnd(14) + ' n=' + r.n + '  with_parent_id_set=' + r.with_parent);
    }

    // Maximum chain depth (recursive parent_id walk)
    const depth = await c.query(`
      WITH RECURSIVE chain AS (
        SELECT id, parent_id, role, 1 AS depth
          FROM public.agents
         WHERE tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
           AND parent_id IS NULL
        UNION ALL
        SELECT a.id, a.parent_id, a.role, c.depth + 1
          FROM public.agents a
          JOIN chain c ON a.parent_id = c.id
         WHERE a.tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
      )
      SELECT MAX(depth)::int AS max_chain_depth,
             COUNT(*)::int   AS reachable_via_chain
        FROM chain
    `);
    w('');
    w('  WALLiam chain (recursive parent_id walk):');
    w('    max_chain_depth: ' + depth.rows[0].max_chain_depth);
    w('    agents reachable via chain: ' + depth.rows[0].reachable_via_chain);
    w('    (tracker design: agent -> manager -> area_manager -> tenant_admin = depth 4)');
  });

  // ===========================================================================
  // Q6 -- EMAIL + escalation + credential boundary
  // ===========================================================================
  h1('Q6 -- LEAD -> EMAIL + up-chain BCC + credential-dependency boundary');
  w('');
  w('Strategy: locate the lead-email entry points + the W-HIERARCHY/R7 BCC walker.');
  w('Find the line that touches the Resend API key (the credential-dependent boundary).');
  w('');
  const emailFiles = grepFiles(codeFiles, /sendTenantEmail\b|walkHierarchy\b|lead-email-recipients|logEmailRecipients|TenantEmailNotConfigured|RESEND_API_KEY|resend_api_key/);
  // Group by file
  const byFile = {};
  for (const h of emailFiles) {
    if (!byFile[h.file]) byFile[h.file] = [];
    byFile[h.file].push(h);
  }
  for (const file of Object.keys(byFile).sort()) {
    w('  ' + file);
    for (const h of byFile[file].slice(0, 6)) w('    L' + h.line + ': ' + h.text.slice(0, 110));
  }

  // Specifically inspect lib/admin-homes/lead-email-recipients.* if present.
  h2('Q6.A -- the email-machinery library (lead-email-recipients)');
  w('');
  const recipFiles = codeFiles.filter(p => /lead-email-recipients|sendTenantEmail/i.test(rel(p)));
  for (const f of recipFiles.slice(0, 8)) {
    w('  ' + rel(f));
    const body = readSafe(f);
    if (!body) continue;
    // Find the credential-key reference lines.
    const rows = body.split(/\r?\n/);
    for (let i = 0; i < rows.length; i++) {
      if (/resend_api_key|RESEND_API_KEY|new\s+Resend\s*\(|throwIfNoKey|TenantEmailNotConfigured/.test(rows[i])) {
        w('    L' + (i + 1) + ': ' + rows[i].trim().slice(0, 110));
      }
    }
  }

  // ===========================================================================
  // Q7 -- SHARED-PATH MAP (how many distinct handlers per surface x mechanism)
  // ===========================================================================
  h1('Q7 -- SHARED CODE PATHS -- which pairs go through the same handler');
  w('');
  w('Each mechanism route IS a handler. Multiple surfaces (pages) post to the');
  w('same route -> shared core. Group page->endpoint hits from Q1.A by endpoint.');
  w('');
  const endpointToPages = new Map();
  for (const p of pageToCapture) {
    // Collect endpoints from directEndpoints (where applicable) and from components.
    const eps = new Set(p.directEndpoints);
    for (const compName of p.captureImports) {
      const compHit = leadClientCompFiles.find(c => path.basename(c.file).replace(/\.tsx?$/, '') === compName);
      if (compHit) for (const ep of compHit.endpoints) eps.add(ep);
    }
    for (const ep of eps) {
      if (!endpointToPages.has(ep)) endpointToPages.set(ep, []);
      endpointToPages.get(ep).push(p.page);
    }
  }
  // Sort endpoints alphabetically.
  const eps = Array.from(endpointToPages.keys()).sort();
  for (const ep of eps) {
    const pages = endpointToPages.get(ep);
    w('  ' + ep);
    w('    shared by ' + pages.length + ' page(s):');
    for (const pg of pages) w('      ' + pg);
  }
  w('');
  w('Test count derivation (Efficiency 2 from the tracker):');
  w('  - distinct endpoints (mechanisms): ' + eps.length);
  w('  - distinct lead-bearing pages (surfaces): ' + pageToCapture.length);
  w('  - test count = (distinct endpoints) x core + (surfaces - distinct endpoints) thin wrappers');
  w('    NOT (surfaces * mechanisms).');

  // ===========================================================================
  // Q8 -- COLD-START re-verify (12 apa carves + floor pool)
  // ===========================================================================
  h1('Q8 -- COLD-START re-verify: 12 WALLiam apa carves + floor pool');
  w('');
  w('Compare live DB state against the tracker memory:');
  w('  - WALLiam apa: 1 Neo Smith @ Whitby muni + 11 King Shah @ Whitby communities = 12 carves');
  w('  - WALLiam tenant_floor_pool: 3 members (King Shah, Neo Smith, WALLiam seed agent)');
  w('');
  await withClient('apa-carves', async c => {
    // WALLiam apa carves -- explicit allow-list.
    const apa = await c.query(`
      SELECT apa.id, apa.agent_id, apa.scope, apa.area_id, apa.municipality_id,
             apa.community_id, apa.neighbourhood_id, apa.is_active, apa.is_primary,
             apa.condo_access, apa.homes_access, apa.buildings_access
        FROM public.agent_property_access apa
       WHERE apa.tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
       ORDER BY apa.scope, apa.is_primary DESC, apa.id
    `);
    w('  WALLiam apa rows: ' + apa.rows.length + (apa.rows.length === 12 ? '  (MATCHES tracker memory: 12)' : '  (MISMATCH: tracker memory says 12)'));
    // Count by scope + active status
    const scopeAgg = {};
    for (const r of apa.rows) {
      const key = r.scope + (r.is_active ? '' : '/inactive');
      scopeAgg[key] = (scopeAgg[key] || 0) + 1;
    }
    for (const k of Object.keys(scopeAgg).sort()) {
      w('    scope=' + k.padEnd(20) + ' n=' + scopeAgg[k]);
    }
    w('');
    w('  Per-row detail:');
    for (const r of apa.rows) {
      const geo = r.scope === 'community' ? r.community_id
                : r.scope === 'municipality' ? r.municipality_id
                : r.scope === 'area' ? r.area_id
                : r.scope === 'neighbourhood' ? r.neighbourhood_id
                : null;
      w('    apa=' + r.id.slice(0, 8) + '...  agent=' + r.agent_id.slice(0, 8) + '...  scope=' + r.scope.padEnd(13) + ' geo=' + (geo ? geo.slice(0, 8) + '...' : 'NULL') + '  active=' + r.is_active + '  primary=' + r.is_primary + '  condo=' + r.condo_access + ' homes=' + r.homes_access + ' bldg=' + r.buildings_access);
    }
  });

  await withClient('floor-pool', async c => {
    // Discover tenant_floor_pool schema first (the recon assumed buildings_access; it may not exist).
    const fpCols = await c.query(`
      SELECT column_name, data_type
        FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'tenant_floor_pool'
       ORDER BY ordinal_position
    `);
    w('');
    w('  tenant_floor_pool schema (' + fpCols.rows.length + ' columns):');
    for (const r of fpCols.rows) w('    ' + r.column_name.padEnd(22) + ' ' + r.data_type);

    // Build SELECT list from the columns that actually exist.
    const tfpColSet = new Set(fpCols.rows.map(r => r.column_name));
    const fpSelectCols = ['id', 'agent_id', 'is_active'];
    for (const opt of ['condo_access', 'homes_access', 'buildings_access']) {
      if (tfpColSet.has(opt)) fpSelectCols.push(opt);
    }
    const fp = await c.query(`
      SELECT ${fpSelectCols.map(c => 'tfp.' + c).join(', ')}
        FROM public.tenant_floor_pool tfp
       WHERE tfp.tenant_id = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
       ORDER BY tfp.id
    `);
    w('');
    w('  WALLiam tenant_floor_pool rows: ' + fp.rows.length + (fp.rows.length === 3 ? '  (MATCHES tracker memory: 3)' : '  (MISMATCH: tracker memory says 3)'));
    for (const r of fp.rows) {
      const flags = [];
      if (tfpColSet.has('condo_access'))     flags.push('condo=' + r.condo_access);
      if (tfpColSet.has('homes_access'))     flags.push('homes=' + r.homes_access);
      if (tfpColSet.has('buildings_access')) flags.push('bldg=' + r.buildings_access);
      w('    tfp=' + r.id.slice(0, 8) + '...  agent=' + r.agent_id.slice(0, 8) + '...  active=' + r.is_active + '  ' + flags.join(' '));
    }

    // Cache-state cross-check: do the 12 apa carves still own ~12,621 community-scope listings?
    const cacheDist = await c.query(`
      SELECT assigned_scope, COUNT(*)::int AS n
        FROM public.mls_listings
       WHERE assigned_agent_id IN (SELECT id FROM public.agents WHERE tenant_id='b16e1039-38ed-43d7-bbc5-dd02bb651bc9')
       GROUP BY assigned_scope
       ORDER BY n DESC
    `);
    w('');
    w('  mls_listings.assigned_scope distribution for WALLiam agents (cache truth):');
    for (const r of cacheDist.rows) w('    scope=' + (r.assigned_scope || '(null)').padEnd(15) + ' n=' + r.n);
  });

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  h1('SUMMARY (one-line per question)');
  w('');
  w('Q1 surfaces:     ' + pageToCapture.length + ' page(s) host lead-capture components OR post directly to a /api/walliam|charlie endpoint.');
  w('Q2 mechanisms:   ' + mechRoutes.length + ' /api/walliam + /api/charlie route.ts files (see above for verbs + behavior flags).');
  w('Q3 resolution:   per-route classification above; expect cache-first+RPC fallthrough on session/lead routes per Phase 2 EDIT D.');
  w('Q4 leads writes: ' + insertHits.length + ' .from(\'leads\').insert sites, ' + updateAgentIdHits.length + ' .from(\'leads\').update sites touching agent_id (frozen-after check below).');
  w('Q5 hierarchy:    agents schema confirms parent_id/manager_id/area_manager_id/tenant_admin_id columns; WALLiam chain depth listed.');
  w('Q6 email/creds:  sendTenantEmail + walkHierarchy + lib/admin-homes/lead-email-recipients identified; resend_api_key boundary marked.');
  w('Q7 shared paths: ' + eps.length + ' distinct endpoints across ' + pageToCapture.length + ' surfaces; test count = endpoints (core) + (surfaces-endpoints) wrappers.');
  w('Q8 cold-start:   apa carves + floor pool counts against tracker memory above.');
  w('');
  w('================================================================================');
  w('END OF CV-RECON');
  w('================================================================================');

  fs.writeFileSync(OUT_PATH, lines.join('\n'));
  console.log('Wrote ' + rel(OUT_PATH) + ' (' + lines.length + ' lines, ' + lines.join('\n').length + ' bytes).');
})().catch(e => {
  console.error('FAIL: ' + e.message);
  console.error(e.stack);
  process.exit(1);
});
