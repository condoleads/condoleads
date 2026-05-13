const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' +
              pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());

// Source-file edits
const edits = [
  {
    file: 'lib/actions/leads.ts',
    transforms: [
      {
        id: 'A1: buildLeadEmail decl + sourceUrl param',
        old: "function buildLeadEmail(params: {\n  contactName: string\n  contactEmail: string\n  contactPhone?: string\n  message?: string\n  source: string\n  buildingName?: string\n  buildingAddress?: string\n  unitNumber?: string\n}): string {",
        new: "function buildLeadEmail(params: {\n  contactName: string\n  contactEmail: string\n  contactPhone?: string\n  message?: string\n  source: string\n  sourceUrl?: string | null\n  buildingName?: string\n  buildingAddress?: string\n  unitNumber?: string\n}): string {"
      },
      {
        id: 'A2: buildLeadEmail destructure + sourceUrl',
        old: "  const { contactName, contactEmail, contactPhone, message, source, buildingName, buildingAddress, unitNumber } = params",
        new: "  const { contactName, contactEmail, contactPhone, message, source, sourceUrl, buildingName, buildingAddress, unitNumber } = params"
      },
      {
        id: 'A3: buildLeadEmail render row (after Property, before Message)',
        old: "          ${propertyLine ? `<tr><td style=\"color: #64748b;\">Property</td><td style=\"color: #0f172a;\">${propertyLine}</td></tr>` : ''}\n          ${message ? `<tr><td style=\"color: #64748b; vertical-align: top;\">Message</td><td style=\"color: #0f172a;\">${message}</td></tr>` : ''}",
        new: "          ${propertyLine ? `<tr><td style=\"color: #64748b;\">Property</td><td style=\"color: #0f172a;\">${propertyLine}</td></tr>` : ''}\n          ${sourceUrl ? `<tr><td style=\"color: #64748b; vertical-align: top;\">Source URL</td><td style=\"color: #0f172a; word-break: break-all;\"><a href=\"${sourceUrl}\" style=\"color: #1d4ed8;\">${sourceUrl}</a></td></tr>` : ''}\n          ${message ? `<tr><td style=\"color: #64748b; vertical-align: top;\">Message</td><td style=\"color: #0f172a;\">${message}</td></tr>` : ''}"
      },
      {
        id: 'A4: insert source_url referer fallback',
        old: "      source_url: params.sourceUrl || null,",
        new: "      source_url: params.sourceUrl || referer || null,"
      },
      {
        id: 'A5: buildLeadEmail call + sourceUrl pass-through',
        old: "    const html = buildLeadEmail({\n      contactName: params.contactName,\n      contactEmail: params.contactEmail,\n      contactPhone: params.contactPhone,\n      message: params.message,\n      source,\n      buildingName: params.propertyDetails?.buildingName,\n      buildingAddress: params.propertyDetails?.buildingAddress,\n      unitNumber: params.propertyDetails?.unitNumber,\n    })",
        new: "    const html = buildLeadEmail({\n      contactName: params.contactName,\n      contactEmail: params.contactEmail,\n      contactPhone: params.contactPhone,\n      message: params.message,\n      source,\n      sourceUrl: params.sourceUrl || referer || null,\n      buildingName: params.propertyDetails?.buildingName,\n      buildingAddress: params.propertyDetails?.buildingAddress,\n      unitNumber: params.propertyDetails?.unitNumber,\n    })"
      }
    ]
  }
];

// Tracker edits
const trackerPath = 'docs/W-LEADS-WORKBENCH-TRACKER.md';

// Phase 1: validate every anchor across every file (zero writes)
console.log('=== Phase 1: validating anchors ===');
for (const e of edits) {
  const abs = path.join(ROOT, e.file);
  if (!fs.existsSync(abs)) throw new Error('FILE MISSING: ' + e.file);
  const inputBytes = fs.readFileSync(abs);
  let crlfIn = 0, lfOnlyIn = 0;
  for (let i = 0; i < inputBytes.length; i++) {
    if (inputBytes[i] === 0x0A) {
      if (i > 0 && inputBytes[i - 1] === 0x0D) crlfIn++; else lfOnlyIn++;
    }
  }
  if (crlfIn > 0 && lfOnlyIn === 0) throw new Error(e.file + ': CRLF detected, expected LF');
  let content = inputBytes.toString('utf8');
  e.originalSize = inputBytes.length;
  for (const t of e.transforms) {
    const parts = content.split(t.old);
    if (parts.length - 1 !== 1) throw new Error(e.file + ' [' + t.id + ']: anchor count ' + (parts.length - 1) + ', expected 1');
    content = parts[0] + t.new + parts.slice(1).join(t.old);
    console.log('  OK ' + e.file + ' :: ' + t.id);
  }
  e.newContent = content;
}

// Tracker validation (separate to keep structure simple)
{
  const abs = path.join(ROOT, trackerPath);
  if (!fs.existsSync(abs)) throw new Error('TRACKER MISSING');
  const inputBytes = fs.readFileSync(abs);
  let content = inputBytes.toString('utf8');
  const originalSize = inputBytes.length;

  // T1: header v5 -> v6
  const oldH = '**Version:** v5 \u2014 OPEN 2026-05-13 \u2014 W2 + W2.5 SHIPPED.';
  const newH = '**Version:** v6 \u2014 OPEN 2026-05-13 \u2014 W2 + W2.5 + W3c-A SHIPPED.';
  if (content.split(oldH).length - 1 !== 1) throw new Error('tracker T1 anchor count != 1');
  content = content.replace(oldH, newH);
  console.log('  OK tracker :: T1 header v5 -> v6');

  // T2: insert W3c-A-SHIPPED status log entry above W2.5-SHIPPED
  const lines = content.split('\n');
  const prefix = '- **2026-05-13 W2.5-SHIPPED**';
  const idx = lines.findIndex(l => l.startsWith(prefix));
  if (idx === -1) throw new Error('tracker T2 anchor not found');
  if (lines.filter(l => l.startsWith(prefix)).length !== 1) throw new Error('tracker T2 anchor not unique');

  const entry = "- **2026-05-13 W3c-A-SHIPPED** \u2014 `lib/actions/leads.ts` canonical helper update (5 transforms, 1 file). `buildLeadEmail` declaration L274: new `sourceUrl?: string | null` param added between `source` and `buildingName`. Destructure L284 updated to include `sourceUrl`. Render row added in HTML table between Property and Message rows: `${sourceUrl ? <tr>...Source URL...word-break: break-all...mailto-style anchor to ${sourceUrl}...</tr> : ''}`. Insert at L183 now `source_url: params.sourceUrl || referer || null` (referer in scope from L159 capture). Call site L222-232 passes `sourceUrl: params.sourceUrl || referer || null` to match insert. Pure-additive in signature shape (optional field, no callers broken). Closes W3c-A. Phase 1-8 recon verified shape; W2.5-SHIPPED tracker entry name `emailHtml` for builder #7 confirmed wrong (real function is `buildAgentEmailHtml`); tracker entry count `8 inline builders` confirmed undercount (real total 10 in named routes + 1 local copy in vip-approve = 11 inline). NEXT: W3c-B (5 route files: walliam/contact + charlie/appointment + charlie/lead + charlie/plan-email + walliam/charlie/vip-request \u2014 referer capture via headers() from next/headers + source_url insert backfill + 8 builder updates) then W3c-C (3 estimator routes \u2014 render row in buildApprovalEmailHtml + sourceUrl param/render in buildQuestionnaireEmailHtml + buildUserApprovalEmailHtml typed-object refactor in vip-approve).";

  lines.splice(idx, 0, entry);
  content = lines.join('\n');
  console.log('  OK tracker :: T2 W3c-A-SHIPPED status log inserted at index ' + idx);

  edits.push({
    file: trackerPath,
    transforms: [],
    originalSize: originalSize,
    newContent: content
  });
}

// Phase 2: write all files atomically with timestamped backups
console.log('');
console.log('=== Phase 2: writing files (stamp=' + stamp + ') ===');
for (const e of edits) {
  const abs = path.join(ROOT, e.file);
  fs.copyFileSync(abs, abs + '.backup_' + stamp);
  console.log('  BACKUP ' + e.file + '.backup_' + stamp);
  fs.writeFileSync(abs, e.newContent, 'utf8');
  const outSize = fs.readFileSync(abs).length;
  const delta = outSize - e.originalSize;
  console.log('  WROTE  ' + e.file + ' (' + e.originalSize + ' -> ' + outSize + ' bytes, delta ' + (delta >= 0 ? '+' : '') + delta + ')');
}

console.log('');
console.log('=== W3c-A PATCH SUCCESS ===');