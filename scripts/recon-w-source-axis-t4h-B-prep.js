#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const pad = (n, w) => n.toString().padStart(w);

function section(title) {
  console.log('');
  console.log('============================================================');
  console.log(title);
  console.log('============================================================');
}

// === A. Leads-list SELECT block exact text ===
section('A. app/admin-homes/leads/page.tsx — SELECT block');
{
  const f = path.join(ROOT, 'app', 'admin-homes', 'leads', 'page.tsx');
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const startIdx = lines.findIndex(l => l.includes(".select(`"));
  if (startIdx === -1) {
    console.log('  .select(`...`) not found (looking for backtick select)');
  } else {
    let endIdx = -1;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i].includes('`)')) { endIdx = i; break; }
      if (i - startIdx > 50) break;
    }
    if (endIdx === -1) endIdx = Math.min(startIdx + 30, lines.length - 1);
    for (let i = startIdx; i <= endIdx; i++) {
      console.log('  L' + pad(i+1, 4) + ': ' + lines[i]);
    }
  }
}

// === B. AdminHomesLeadsClient.tsx — Lead interface ===
section('B. AdminHomesLeadsClient.tsx — Lead interface');
{
  const f = path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx');
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const startIdx = lines.findIndex(l => /^(interface|type)\s+Lead\b/.test(l.trim()) || /\binterface Lead\b/.test(l));
  if (startIdx === -1) {
    console.log('  Lead interface/type not found — searching for source_url field context:');
    const m = lines.findIndex(l => l.includes('source_url: string | null'));
    if (m !== -1) {
      const s = Math.max(0, m - 15);
      const e = Math.min(lines.length - 1, m + 10);
      for (let i = s; i <= e; i++) console.log('  L' + pad(i+1, 4) + ': ' + lines[i]);
    }
  } else {
    // Find closing brace
    let depth = 0, started = false, endIdx = -1;
    for (let i = startIdx; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') { depth--; if (started && depth === 0) { endIdx = i; break; } }
      }
      if (endIdx !== -1) break;
    }
    if (endIdx === -1) endIdx = Math.min(startIdx + 40, lines.length - 1);
    for (let i = startIdx; i <= endIdx; i++) console.log('  L' + pad(i+1, 4) + ': ' + lines[i]);
  }
}

// === C. AdminHomesLeadsClient.tsx — IIFE return for pill cell (L580-595 region) ===
section('C. AdminHomesLeadsClient.tsx — pill cell return statement');
{
  const f = path.join(ROOT, 'components', 'admin-homes', 'AdminHomesLeadsClient.tsx');
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  // Find "return lead.source_url ?"
  const idx = lines.findIndex(l => l.includes('return lead.source_url'));
  if (idx === -1) {
    console.log('  "return lead.source_url" not found');
  } else {
    const s = Math.max(0, idx - 2);
    const e = Math.min(lines.length - 1, idx + 15);
    for (let i = s; i <= e; i++) console.log('  L' + pad(i+1, 4) + ': ' + JSON.stringify(lines[i]));
  }
}

// === D. Workbench API route — SELECT blocks (full delimiter context) ===
section('D. app/api/admin-homes/leads/[id]/route.ts — SELECT blocks');
{
  const f = path.join(ROOT, 'app', 'api', 'admin-homes', 'leads', '[id]', 'route.ts');
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const re = /\.select\s*\(/;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      const s = Math.max(0, i - 1);
      const e = Math.min(lines.length - 1, i + 6);
      console.log('  --- L' + (i+1) + ' ---');
      for (let j = s; j <= e; j++) console.log('  L' + pad(j+1, 4) + ': ' + lines[j]);
      console.log('');
    }
  }
}

// === E. LeadWorkbenchClient.tsx — type definitions + Source URL block + Estimator headings ===
section('E. LeadWorkbenchClient.tsx — type defs + key anchors');
{
  const f = path.join(ROOT, 'app', 'admin-homes', 'leads', '[id]', 'LeadWorkbenchClient.tsx');
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  console.log('  Total lines: ' + lines.length);

  // E1. Imports + first 40 lines
  console.log('  --- E1. First 40 lines (imports + type defs) ---');
  for (let i = 0; i < Math.min(40, lines.length); i++) {
    console.log('  L' + pad(i+1, 4) + ': ' + lines[i]);
  }

  // E2. Any "interface" or "type" declarations
  console.log('');
  console.log('  --- E2. All interface/type declarations ---');
  for (let i = 0; i < lines.length; i++) {
    if (/^(interface|type)\s+\w+/.test(lines[i].trim())) {
      console.log('  L' + pad(i+1, 4) + ': ' + lines[i]);
    }
  }

  // E3. Find "anchorLead" first occurrence + a bit of context
  console.log('');
  console.log('  --- E3. anchorLead first declaration / prop / destructure ---');
  const aIdx = lines.findIndex(l => l.includes('anchorLead'));
  if (aIdx !== -1) {
    const s = Math.max(0, aIdx - 5);
    const e = Math.min(lines.length - 1, aIdx + 5);
    for (let i = s; i <= e; i++) console.log('  L' + pad(i+1, 4) + ': ' + lines[i]);
  }

  // E4. Source URL prominent block (anchor for h.7 site 1)
  console.log('');
  console.log('  --- E4. Source URL block (anchor for h.7 site 1) ---');
  const sIdx = lines.findIndex(l => l.includes('uppercase tracking-wider mb-1">Source URL'));
  if (sIdx !== -1) {
    const s = Math.max(0, sIdx - 1);
    const e = Math.min(lines.length - 1, sIdx + 14);
    for (let i = s; i <= e; i++) console.log('  L' + pad(i+1, 4) + ': ' + lines[i]);
  }

  // E5. Estimator Submission heading (anchor for h.7 site 2)
  console.log('');
  console.log('  --- E5. Estimator Submission heading + preceding "Submitted from" ---');
  const estIdx = lines.findIndex(l => l.includes('>Estimator Submission</h3>'));
  if (estIdx !== -1) {
    const s = Math.max(0, estIdx - 12);
    const e = Math.min(lines.length - 1, estIdx + 2);
    for (let i = s; i <= e; i++) console.log('  L' + pad(i+1, 4) + ': ' + lines[i]);
  }

  // E6. Estimator Questionnaire heading (anchor for h.7 site 3)
  console.log('');
  console.log('  --- E6. Estimator Questionnaire heading + preceding "Submitted from" ---');
  const estQIdx = lines.findIndex(l => l.includes('>Estimator Questionnaire</h3>'));
  if (estQIdx !== -1) {
    const s = Math.max(0, estQIdx - 12);
    const e = Math.min(lines.length - 1, estQIdx + 2);
    for (let i = s; i <= e; i++) console.log('  L' + pad(i+1, 4) + ': ' + lines[i]);
  }
}