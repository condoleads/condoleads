const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();

const CLIENT = 'components/admin-homes/AdminHomesLeadsClient.tsx';
const PAGE = 'app/admin-homes/leads/page.tsx';

function readFile(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  const raw = fs.readFileSync(abs, 'utf8');
  const crlf = /\r\n/.test(raw);
  const lines = (crlf ? raw.replace(/\r\n/g, '\n') : raw).split('\n');
  return { abs, lines, crlf, size: raw.length };
}

function findHits(lines, pattern) {
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) hits.push(i);
  }
  return hits;
}

function emitCtx(out, lines, hits, contextN, maxHits, truncAt) {
  const limit = Math.min(hits.length, maxHits);
  for (let h = 0; h < limit; h++) {
    const i = hits[h];
    const start = Math.max(0, i - 1);
    const end = Math.min(lines.length, i + contextN + 1);
    out.push('  hit @ L' + (i + 1) + ':');
    for (let k = start; k < end; k++) {
      const txt = lines[k].length > truncAt ? lines[k].slice(0, truncAt) + '...[TRUNC]' : lines[k];
      out.push('    L' + (k + 1) + ': ' + txt);
    }
  }
}

const out = [];

// ===== CLIENT FILE =====
const C = readFile(CLIENT);
if (!C) {
  out.push('CLIENT NOT FOUND: ' + CLIENT);
} else {
  out.push('===== ' + CLIENT + ' =====');
  out.push('lines: ' + C.lines.length + ', LE: ' + (C.crlf ? 'CRLF' : 'LF') + ', size: ' + C.size + ' bytes');
  out.push('');

  const SURFACES = [
    { tag: 'L1 quality buttons (STRIP)',          pat: /setQuality\(|quality:\s*['"]?(Hot|Cold|Disqualified|Unqualified)|onClick.*quality/i },
    { tag: 'L1 quality state/handlers (STRIP)',   pat: /qualityUpdates|qualityLoading|qualitySaving|handleQuality/i },
    { tag: 'L5 credit chip + VIP pending (STRIP)',pat: /creditPosture|getCreditPosture|animate-pulse|VIP Pending|vipPending/i },
    { tag: 'L5 chip class hints (STRIP)',         pat: /credit.*overrides.*chip|credit.*chip|posture.*pill/i },
    { tag: 'L6 grant credits form (STRIP)',       pat: /Grant credits|grantCredits|handleGrant|ai_chat_limit\s*[:=]|seller_plan_limit\s*[:=]|buyer_plan_limit\s*[:=]/i },
    { tag: 'L6 override POST handler (STRIP)',    pat: /\/api\/admin-homes\/users\/override/ },
    { tag: 'L7 drawer w-[480px] (STRIP)',         pat: /w-\[480px\]/ },
    { tag: 'L7 drawer dialog role (STRIP)',       pat: /role=['"]dialog['"]/ },
    { tag: 'L7 drawer state (STRIP)',             pat: /selectedLead|setSelectedLead|drawerOpen|closeDrawer|openDrawer/i },
    { tag: 'L7 click-row trigger (STRIP)',        pat: /closest\(['"][^'"]*button[^'"]*input/ },
    { tag: 'L2 source badge (PRESERVE)',          pat: /deriveLeadOriginRoute/ },
    { tag: 'L3 hierarchy chain (PRESERVE)',       pat: /(area_manager|tenant_admin)[^.]*\.full_name/ },
    { tag: 'L4 engagement+activity (PRESERVE)',   pat: /engagement|activityCount|user_activities/i }
  ];

  for (const s of SURFACES) {
    const hits = findHits(C.lines, s.pat);
    out.push('--- ' + s.tag + ' (' + hits.length + ' hits) ---');
    if (hits.length > 0) {
      emitCtx(out, C.lines, hits, 4, 2, 200);
    } else {
      out.push('  (no hits)');
    }
    out.push('');
  }

  // Section heading for distinctive block markers in render method
  out.push('--- All `</button>` lines (for button group identification) — first 20 ---');
  const btnClose = findHits(C.lines, /<\/button>/);
  out.push('  total: ' + btnClose.length);
  for (const i of btnClose.slice(0, 20)) {
    const txt = C.lines[i].length > 140 ? C.lines[i].slice(0, 140) + '...' : C.lines[i];
    out.push('  L' + (i + 1) + ': ' + txt);
  }
  out.push('');
}

// ===== PAGE FILE =====
const P = readFile(PAGE);
if (!P) {
  out.push('PAGE NOT FOUND: ' + PAGE);
} else {
  out.push('===== ' + PAGE + ' =====');
  out.push('lines: ' + P.lines.length + ', LE: ' + (P.crlf ? 'CRLF' : 'LF') + ', size: ' + P.size + ' bytes');
  out.push('');

  const TABLES = ['lead_email_recipients_log', 'lead_notes', 'user_credit_overrides', 'vip_requests', 'user_activities'];
  for (const t of TABLES) {
    const pat = new RegExp("\\.from\\(['\"]" + t + "['\"]");
    const hits = findHits(P.lines, pat);
    out.push('--- prefetch ' + t + ' (' + hits.length + ' .from() hits) ---');
    if (hits.length > 0) {
      emitCtx(out, P.lines, hits, 12, 1, 240);
    } else {
      out.push('  (no hits — not prefetched in this file)');
    }
    out.push('');
  }

  // Find props passed to client (last 50 lines typically have render return)
  out.push('--- last 50 lines of page.tsx (likely the render + AdminHomesLeadsClient props) ---');
  const start = Math.max(0, P.lines.length - 50);
  for (let i = start; i < P.lines.length; i++) {
    const txt = P.lines[i].length > 200 ? P.lines[i].slice(0, 200) + '...' : P.lines[i];
    out.push('  L' + (i + 1) + ': ' + txt);
  }
  out.push('');
}

const text = out.join('\n') + '\n';
const odir = path.join(ROOT, 'recon');
if (!fs.existsSync(odir)) fs.mkdirSync(odir, { recursive: true });
const op = path.join(odir, 'W-LEADS-WORKBENCH-W3A-RECON.txt');
fs.writeFileSync(op, text, 'utf8');
process.stdout.write(text);
process.stdout.write('=== FILE: ' + op + ' (' + Buffer.byteLength(text, 'utf8') + ' bytes) ===\n');