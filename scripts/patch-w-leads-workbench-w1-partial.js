const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const d = new Date(), pad = n => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const src = path.join(ROOT, 'docs', 'W-LEADS-WORKBENCH-TRACKER.md');
if (!fs.existsSync(src)) throw new Error('tracker missing');

const bytes = fs.readFileSync(src);
let crlf = 0, lf = 0;
for (let i = 0; i < bytes.length; i++) {
  if (bytes[i] === 0x0A) { if (i > 0 && bytes[i-1] === 0x0D) crlf++; else lf++; }
}
const isCrlf = crlf > 0 && lf === 0;
if (!isCrlf && !(lf > 0 && crlf === 0)) throw new Error(`mixed LE crlf=${crlf} lf=${lf}`);
const EOL = isCrlf ? '\r\n' : '\n';
console.log(`LE: ${isCrlf ? 'CRLF' : 'LF'} | crlf=${crlf} lf=${lf}`);

fs.copyFileSync(src, `${src}.backup_${stamp}`);
const lines = bytes.toString('utf8').split(EOL);
let changes = 0;

// P1: reword Gap 1 (drop bug-trace mention)
const i1 = lines.findIndex(l => l.startsWith('Comprehensive lead capture inventory') && l.includes('Two confirmed bugs:'));
if (i1 === -1) throw new Error('P1 anchor');
lines[i1] = 'Comprehensive lead capture inventory across the platform was missing. Every CTA must be wired, source-correct, URL-bearing, and email-flowing. Home property page is missing the Book a Visit CTA that exists on Condo property pages (parity gap). The two known-bug instances (testingleads@gmail.com buyer plan delivery; registration source) are tackled comprehensively through universal source URL + lead-write wiring covering every CTA — not as separate bug traces.';
changes++;

// P2: delete outcome #18
const i2 = lines.findIndex(l => l.startsWith('18. ') && l.includes('testingleads'));
if (i2 === -1) throw new Error('P2 anchor');
lines.splice(i2, 1); changes++;

// P3: delete outcome #19
const i3 = lines.findIndex(l => l.startsWith('19. Registration flow'));
if (i3 === -1) throw new Error('P3 anchor');
lines.splice(i3, 1); changes++;

// P4: delete "## Open questions log" section
const i4a = lines.findIndex(l => l === '## Open questions log');
if (i4a === -1) throw new Error('P4 anchor');
let i4b = -1;
for (let j = i4a + 1; j < lines.length; j++) { if (lines[j].startsWith('## ')) { i4b = j; break; } }
if (i4b === -1) throw new Error('P4 next ##');
lines.splice(i4a, i4b - i4a); changes++;

// P5: flip W1 (Group A) to PARTIAL — 6/10 sub-targets verified, 4 pending
const i5 = lines.findIndex(l => l.startsWith('| W1 | Deep recon | OPEN |'));
if (i5 === -1) throw new Error('P5 anchor');
lines[i5] = '| W1 | Deep recon (Group A) | PARTIAL | 2026-05-13 | 6/10 sub-targets VERIFIED from disk+DB. VERIFIED: (1) lead-capture surface — 10 paths (9 `submitLeadFromForm` callers + `WalliamContactForm` + `VIPAIAccess` SiteHeaderClient L139/L242); (2) property page CTAs — `PropertyPageClient.tsx` + `HomePropertyPageClient.tsx` full dumps, dual-branch isWalliam/agent, OfferInquiryModal P1 bug at L300/L266 `{agent && ...}` guard; (3) 5 API routes — `walliam/contact` P0 body-trust tenant_id, `charlie/{appointment,lead,plan-email}` + `walliam/charlie/vip-request` header-correct, `walliam/estimator/vip-request` L204 writes source_url:pageUrl (50% partial); (4) `leads` schema 47 cols `source_url TEXT` EXISTS — no W2 column-add — + `tenants` schema; (5) distributions Q3-Q8 + testingleads history + King Shah tenant_admin no parent; (6) `deriveLeadOriginRoute` at `lib/utils/lead-origin-route.ts`. 4/10 PENDING (verify in next probes, not silent absorption): (a) `can()` permission code; (b) Users page credit UI shape (W4c extraction source); (c) email template renderers across 5 API routes; (d) cumulative-view data model (union leads by user_id). |';
changes++;

// P6: prepend W1-PARTIAL status log entry
const i6 = lines.findIndex(l => l.startsWith('- **2026-05-12 W-open**'));
if (i6 === -1) throw new Error('P6 anchor');
const entry = '- **2026-05-13 Group A / W1-PARTIAL** — Deep recon 6 of 10 sub-targets VERIFIED with disk+DB output (not guess). VERIFIED: lead-capture surface 10 paths (9 `submitLeadFromForm` callers + `WalliamContactForm` direct POST + `VIPAIAccess` in `SiteHeaderClient`); property page dual-branch architecture (`PropertyPageClient` + `HomePropertyPageClient` full file dumps); 5 API routes audited; `leads` schema confirms `source_url TEXT` already exists (no W2 column-add for that column); status / source / lead_origin_route / assignment_source / source-url-by-source / testingleads-history / King-Shah-hierarchy distributions; `deriveLeadOriginRoute` source documented. P0 FOUND: `walliam/contact` body-trust `tenant_id` (multi-tenant leak vector). P1 FOUND: `OfferInquiryModal` `{showOfferModal && agent && ...}` guard breaks Make-an-Offer on every WALLiam property page (condo + home). PENDING — must verify on disk before downstream phase implementation: `can()` permission code (W2.5 Group A prereq); Users page credit UI shape (W4c Group C extraction source); email template renderers across 5 API routes + `lib/actions/leads.ts buildLeadEmail` (W3c Group B rendering target); cumulative-view data model for union by user_id (W4a Group C aggregation design). Founder direction 2026-05-13: bug-trace approach abandoned — `testingleads@gmail.com` buyer plan delivery + registration source fold into universal source URL wiring across all CTAs; "History missing contact" question retracted. Working group-by-group from now on (A Foundation → B Strip+Wire → C Workbench → D Role-Aware → E Enhancements → F Test+Close). Next: 4 probe pastes complete remaining Group A / W1 sub-targets, tracker flips to W1 VERIFIED, then W2 schema (status enum +3 values, `lead_admin_actions`, `tenant_manager_assignments`).';
lines.splice(i6, 0, entry); changes++;

// Reassemble + LE check
const out = Buffer.from(lines.join(EOL), 'utf8');
let oCrlf = 0, oLf = 0;
for (let i = 0; i < out.length; i++) {
  if (out[i] === 0x0A) { if (i > 0 && out[i-1] === 0x0D) oCrlf++; else oLf++; }
}
if (isCrlf && oLf > 0) throw new Error(`LE drift LF in CRLF oLf=${oLf}`);
if (!isCrlf && oCrlf > 0) throw new Error(`LE drift CRLF in LF oCrlf=${oCrlf}`);

fs.writeFileSync(src, out);
console.log(`PATCH OK | changes=${changes} | ${bytes.length} -> ${out.length} bytes | LE=${isCrlf ? 'CRLF' : 'LF'}`);