const fs = require('fs');
const p = 'docs/W-LEADS-WORKBENCH-TRACKER.md';
let raw = fs.readFileSync(p, 'utf8');
const hadBOM = raw.charCodeAt(0) === 0xFEFF;
if (hadBOM) raw = raw.slice(1);
const usesCRLF = /\r\n/.test(raw);
let content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw;

function uniq(content, oldStr, newStr, label) {
  const parts = content.split(oldStr);
  if (parts.length === 1) throw new Error(label + ': anchor not found');
  if (parts.length > 2) throw new Error(label + ': anchor not unique (' + (parts.length - 1) + ')');
  return parts.join(newStr);
}

// T1: version line
content = uniq(content,
  '**Version:** v10 \u2014 W3a SHIPPED \u2014 L1/L5/L6/L7 inline noise stripped from leads dashboard + W3c phase row backfilled to SHIPPED',
  '**Version:** v11 \u2014 W3b CLOSED (no-op, parity verified) \u2014 Book a Visit CTA already exists at parity in both property page clients via AppointmentForm on WALLiam branch',
  'T1'
);

// T2: W3b phase row
content = uniq(content,
  '| W3b | Home property Book a Visit parity | OPEN | \u2014 | Add Book a Visit CTA to home property page matching condo (4 CTAs total per property type) |',
  '| W3b | Home property Book a Visit parity | SHIPPED (no-op) | 2026-05-13 | Verified at parity per W3b recon: both `HomePropertyPageClient.tsx` (L179-L197) and `PropertyPageClient.tsx` (L186-L207) render Book a Visit via collapsible `AppointmentForm` button on WALLiam branch. 4 CTAs per property type confirmed. W1 finding stale; no patch shipped. 2 new findings logged. |',
  'T2'
);

// T3: append W3b-CLOSED status log entry after W3a-SHIPPED tail
const W3B_ENTRY = '\n- **2026-05-13 W3b-CLOSED (no-op, parity verified)** \u2014 W3b recon over both property page clients confirmed Book a Visit CTA already exists at parity. `app/property/[id]/HomePropertyPageClient.tsx` (12485 bytes, L179-L197) and `app/property/[id]/PropertyPageClient.tsx` (14842 bytes, L186-L207) both render an identical collapsible Book-a-Visit button on the WALLiam branch (`isWalliam && walliamTenantId`) toggling into `<AppointmentForm type="buyer" listings={[listing]} userId={user?.id} agent={null} ...>` from `@/app/charlie/components/AppointmentForm`. 4 CTAs per property type confirmed in WALLiam branch: `WalliamAgentCard` + `WalliamCTA` + Book-a-Visit + (Home)`PropertyEstimateCTA`. W1 recon finding ("Home property page is missing the Book a Visit CTA that exists on Condo property pages") is stale \u2014 likely fixed in a pre-W3b commit on the same-day timeline, or W1 misread the file. No code patch shipped; tracker bookkeeping only. **NEW finding F-PROPERTY-CLIENTS-DEAD-WALLIAM-CONTACT-FORM-IMPORT**: both `HomePropertyPageClient.tsx` L27 and `PropertyPageClient.tsx` L30 import `WalliamContactForm` from `@/components/WalliamContactForm` but never reference in JSX \u2014 dead import in both files; trivial follow-up trim during next sweep. **NEW finding F-APPOINTMENTFORM-AGENT-NULL-AT-PROPERTY-VISIT**: `AppointmentForm` is invoked with `agent={null}` on both property clients (home L192, condo L202) \u2014 Book-a-Visit submissions don\'t carry agent attribution from property context; either downstream agent resolution happens via `resolve_agent_for_context(listing_id)` server-side (verify in AppointmentForm submit path), or these leads land without agent assignment. P1 from W1 (`{showOfferModal && agent && ...}` guard at home L266 + condo L300 breaking Make-an-Offer on WALLiam properties when no agent assigned) remains OPEN, not in W3b scope. NEXT: W4a workbench page shell at `/admin-homes/leads/[id]/page.tsx` (foundation for W3d click-row navigate + W4b-g workbench tabs). W3d cannot ship until W4a route exists.';

content = uniq(content, 'W7 smoke matrix, W8 close.', 'W7 smoke matrix, W8 close.' + W3B_ENTRY, 'T3');

const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
const bakPath = p + '.backup_' + ts;
fs.copyFileSync(p, bakPath);

let out = usesCRLF ? content.replace(/\n/g, '\r\n') : content;
if (hadBOM) out = '\uFEFF' + out;
fs.writeFileSync(p, out, 'utf8');

console.log('PATCHED tracker: T1 (v10->v11) + T2 (W3b row SHIPPED no-op) + T3 (W3b-CLOSED status log entry)');
console.log('Backup: ' + bakPath);
