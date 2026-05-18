#!/usr/bin/env node
// scripts/wleadflow/t2-read-routes.js
//
// W-LEAD-FLOW T2: per-route digest. Reads each of the 7 System 2
// lead-creation routes and extracts:
//   - Fields destructured from req.json() / request.json()
//   - leads INSERT payload keys
//   - Other tables INSERTed into (vip_requests, user_activities, ...)
//   - lead_origin_route literal value
//   - Auth/session indicators
//   - Email-send call sites
//   - Resolver / geo-agent indicators
//
// Outputs a digest to console + tests/lead-flow/t2-route-digest.json so
// the T3 harness scripts can read accurate per-route request shapes.

const fs = require('fs');
const path = require('path');

const ROUTES = [
  { id: 'S1', name: 'walliam-contact',           path: 'app/api/walliam/contact/route.ts' },
  { id: 'S2', name: 'walliam-charlie-vip',       path: 'app/api/walliam/charlie/vip-request/route.ts' },
  { id: 'S3', name: 'walliam-estimator-vip',     path: 'app/api/walliam/estimator/vip-request/route.ts' },
  { id: 'S4', name: 'walliam-estimator-q',       path: 'app/api/walliam/estimator/vip-questionnaire/route.ts' },
  { id: 'S5', name: 'charlie-lead',              path: 'app/api/charlie/lead/route.ts' },
  { id: 'S6', name: 'charlie-appointment',       path: 'app/api/charlie/appointment/route.ts' },
  { id: 'S7', name: 'charlie-plan-email',        path: 'app/api/charlie/plan-email/route.ts' },
];

function readRouteDigest(routePath) {
  if (!fs.existsSync(routePath)) {
    return { error: 'file not found at ' + routePath };
  }
  const src = fs.readFileSync(routePath, 'utf8');
  const bytes = src.length;

  // 1. Find every req.json() / request.json() destructuring
  const reqBodyFieldsSet = new Set();
  const reqJsonRegex = /const\s*\{([^}]+)\}\s*=\s*(?:await\s+)?(req|request)\.json\(\)/g;
  let m;
  while ((m = reqJsonRegex.exec(src)) !== null) {
    const inner = m[1];
    for (const raw of inner.split(',')) {
      const name = raw.trim().split(/[:=]/)[0].trim();
      if (name) reqBodyFieldsSet.add(name);
    }
  }
  const reqBodyFields = Array.from(reqBodyFieldsSet);

  // 2. Find leads .insert(...) payloads and extract top-level keys
  const leadInserts = [];
  // Scan for "from('leads')" then up to ".insert(" then capture the next braced/bracketed payload
  const fromLeadsRegex = /\.from\(\s*['"]leads['"]\s*\)/g;
  let fl;
  while ((fl = fromLeadsRegex.exec(src)) !== null) {
    const after = src.slice(fl.index, fl.index + 4000);
    const insertIdx = after.indexOf('.insert(');
    if (insertIdx < 0) continue;
    const afterInsert = after.slice(insertIdx + 8);
    // First non-whitespace char tells us object {...} or array [...]
    const trimmed = afterInsert.trimStart();
    if (trimmed[0] !== '{' && trimmed[0] !== '[') continue;
    // Bracket-balance to find the matching close
    const openCh = trimmed[0];
    const closeCh = openCh === '{' ? '}' : ']';
    let depth = 0;
    let endIdx = -1;
    for (let i = 0; i < trimmed.length; i++) {
      const c = trimmed[i];
      if (c === openCh) depth++;
      else if (c === closeCh) { depth--; if (depth === 0) { endIdx = i + 1; break; } }
    }
    if (endIdx < 0) continue;
    const payload = trimmed.slice(0, endIdx);
    // Extract top-level keys (NAME: ...) -- naive but works for typical Supabase insert payloads
    const keys = new Set();
    // We strip nested braces to avoid grabbing nested keys
    let stripped = payload;
    // Remove nested {...} repeatedly
    let prev;
    let safety = 50;
    do {
      prev = stripped;
      stripped = stripped.replace(/\{[^{}]*\}/g, '{}');
      safety--;
    } while (stripped !== prev && safety > 0);
    const keyRegex = /(\w+)\s*:/g;
    let km;
    while ((km = keyRegex.exec(stripped)) !== null) {
      keys.add(km[1]);
    }
    leadInserts.push(Array.from(keys));
  }

  // 3. Other table inserts
  const otherInserts = new Set();
  const anyFromRegex = /\.from\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = anyFromRegex.exec(src)) !== null) {
    if (m[1] === 'leads') continue;
    const after = src.slice(m.index, m.index + 1000);
    if (/\.insert\(/.test(after)) otherInserts.add(m[1]);
  }

  // 4. lead_origin_route literal
  const lorMatches = [];
  const lorRegex = /lead_origin_route\s*:\s*['"]([^'"]+)['"]/g;
  while ((m = lorRegex.exec(src)) !== null) {
    lorMatches.push(m[1]);
  }

  // 5. Auth / session indicators
  const authIndicators = [];
  if (/cookies\(\)|cookies\.get/.test(src)) authIndicators.push('cookies');
  if (/walliam_session_id|chat_sessions|getSession|sessionId/.test(src)) authIndicators.push('session');
  if (/auth\.getUser|getServerSession|currentUser|requireAuth/.test(src)) authIndicators.push('auth');
  if (/getCurrentTenantId|resolveTenant|host\.headers/.test(src)) authIndicators.push('tenant-from-host');

  // 6. Email send sites
  const emailSends = [];
  if (/sendActivityEmail/.test(src)) emailSends.push('sendActivityEmail');
  if (/resend\.emails\.send/.test(src)) emailSends.push('resend.emails.send');
  if (/sendTenantEmail/.test(src)) emailSends.push('sendTenantEmail');
  if (/sendLeadEmail/.test(src)) emailSends.push('sendLeadEmail');

  // 7. Resolver / agent assignment hints
  const resolverHints = [];
  if (/resolve_agent_for_context|resolveAgentForContext/.test(src)) resolverHints.push('resolve_agent_for_context');
  if (/resolveAgent|geo.*agent|agent.*geo/i.test(src)) resolverHints.push('geo-resolver');
  if (/assignment_source/.test(src)) resolverHints.push('assignment_source');
  if (/entityIdsFromBody|entityIdsFromSession/.test(src)) resolverHints.push('extract-entity-ids');

  // 8. HTTP methods exported
  const methods = [];
  if (/export\s+async\s+function\s+POST/.test(src)) methods.push('POST');
  if (/export\s+async\s+function\s+GET/.test(src)) methods.push('GET');
  if (/export\s+async\s+function\s+PUT/.test(src)) methods.push('PUT');
  if (/export\s+async\s+function\s+DELETE/.test(src)) methods.push('DELETE');

  return {
    bytes,
    methods,
    reqBodyFields,
    leadInserts,
    otherInserts: Array.from(otherInserts),
    lead_origin_route: lorMatches.length === 1 ? lorMatches[0] : (lorMatches.length > 1 ? lorMatches : null),
    authIndicators,
    emailSends,
    resolverHints,
  };
}

const digests = {};
for (const r of ROUTES) {
  digests[r.id] = { ...r, ...readRouteDigest(r.path) };
}

console.log('=== W-LEAD-FLOW T2: Per-route digest ===');
console.log('');
for (const r of ROUTES) {
  const d = digests[r.id];
  console.log('--- ' + r.id + ' (' + r.name + '): ' + r.path);
  if (d.error) {
    console.log('    ERROR: ' + d.error);
    console.log('');
    continue;
  }
  console.log('    bytes:             ' + d.bytes);
  console.log('    methods:           ' + d.methods.join(', '));
  console.log('    lead_origin_route: ' + (Array.isArray(d.lead_origin_route) ? d.lead_origin_route.join(' | ') : (d.lead_origin_route || '(not found)')));
  console.log('    req body fields:   ' + (d.reqBodyFields.length ? d.reqBodyFields.join(', ') : '(none destructured)'));
  console.log('    leads INSERT(s):   ' + d.leadInserts.length);
  for (let i = 0; i < d.leadInserts.length; i++) {
    console.log('      [' + i + '] ' + d.leadInserts[i].join(', '));
  }
  console.log('    other inserts:     ' + (d.otherInserts.length ? d.otherInserts.join(', ') : '(none)'));
  console.log('    auth/session:      ' + (d.authIndicators.length ? d.authIndicators.join(', ') : '(none)'));
  console.log('    email sends:       ' + (d.emailSends.length ? d.emailSends.join(', ') : '(none)'));
  console.log('    resolver hints:    ' + (d.resolverHints.length ? d.resolverHints.join(', ') : '(none)'));
  console.log('');
}

fs.mkdirSync('tests/lead-flow', { recursive: true });
fs.writeFileSync('tests/lead-flow/t2-route-digest.json', JSON.stringify(digests, null, 2) + '\n');
console.log('Wrote tests/lead-flow/t2-route-digest.json');