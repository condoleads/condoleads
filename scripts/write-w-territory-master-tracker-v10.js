#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Write the W-TERRITORY-MASTER tracker v10 to disk.
 *
 * The tracker artifact is maintained in the conversation; this script writes
 * the canonical Markdown content to `docs/W-TERRITORY-MASTER-TRACKER.md` so
 * it can be committed atomically with P5.3's code + scripts.
 *
 * Discipline:
 *   - If docs/ doesn't exist, fail loudly (don't create silently).
 *   - If the file exists, back it up with timestamp before overwrite.
 *   - ASCII-purity check on the new content before write.
 *   - Post-write byte-count log.
 *
 * Invocation:
 *   node scripts/write-w-territory-master-tracker-v10.js
 */

const fs = require('fs')
const path = require('path')

function ts() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  )
}

// IMPORTANT: this is the tracker v10 content. Source of truth is the
// "W-TERRITORY-MASTER Tracker (v10)" artifact in the conversation. If that
// artifact is updated further, regenerate this file from the latest version.
//
// Note: this content uses ASCII-only characters per project gate. Em dashes
// that appeared in earlier versions are replaced with " -- " or "--".
//
// To keep this script readable, the tracker body is loaded from an inline
// template literal. If you edit the tracker prose, update both this script
// AND the conversation artifact.

const TRACKER_PATH = path.join(process.cwd(), 'docs', 'W-TERRITORY-MASTER-TRACKER.md')
const DOCS_DIR = path.dirname(TRACKER_PATH)

if (!fs.existsSync(DOCS_DIR)) {
  throw new Error('docs/ directory missing at ' + DOCS_DIR + '. Cannot create silently; investigate.')
}

// Read the existing tracker (if any) for backup and to detect prior version.
let prior = null
if (fs.existsSync(TRACKER_PATH)) {
  prior = fs.readFileSync(TRACKER_PATH, 'utf8')
  console.log('  prior tracker bytes: ' + prior.length)
} else {
  console.log('  no prior tracker on disk (first write)')
}

// =======================================================================
// TRACKER v10 CONTENT
// =======================================================================
const TRACKER_V10 = [
  '# W-TERRITORY-MASTER -- phases P5 through P7 (consolidated tracker)',
  '',
  '**Opened:** 2026-05-26',
  '**Owner:** Shah + Claude',
  '**Tracker version:** v10 (P5.3 SHIPPED; ready for atomic commit)',
  '',
  '## Phase roadmap',
  '',
  '| Phase | Name | Status | SHA |',
  '|---|---|---|---|',
  '| P1 | Spec lock | CLOSED | (in tracker) |',
  '| P4 | Lead feed + claim system (phases 1+2) | CLOSED | `98940be`, `ced7f82` |',
  '| P2 | Resolver audit + strip fallbacks | CLOSED | `3993c2b` |',
  '| P2-data | Phantom-card fix | CLOSED | `b3331d4` |',
  '| P3 | Area auto-distribution engine | CLOSED | `013b0d4` |',
  '| P5 | Single-listing pins (lifecycle + UI) | CLOSED | `5086826` |',
  '| P5.1 | Property search in Pins | CLOSED | `1b42e7c` |',
  '| P5.2 | Buildings DB layer | CLOSED | `9df26c1` |',
  '| P5.2b | reresolve_listing building_id propagation fix | CLOSED (bundled `9df26c1`) | `9df26c1` |',
  '| P5.2c | Buildings APIs + BuildingsView + 7th TerritoryTab view | CLOSED | `e3fe91e` |',
  '| P5.2c-followup-1 | BuildingsView unified Tree+Search | CLOSED | `8b3889b` |',
  '| P5.2c-followup-2 | Platform admin act-as-agent picker | CLOSED | `d72938f` |',
  '| P5.2c-followup-3 | Geography view perf (geo-rollup MV swap) | CLOSED | `16877fc` |',
  '| P5.3 | Per-property-type resolved owner + source tier in GeographyView | SHIPPED (commit pending) | -- |',
  '| P6 | Property-type carving UI (condo vs home checkboxes) | OPEN | -- |',
  '| P7 | Neighbourhood + cache repopulation | OPEN | -- |',
  '',
  '---',
  '',
  '# P5.3 -- Per-property-type resolved owner + source tier [SHIPPED, commit pending]',
  '',
  '## What shipped',
  '',
  '### Behavior change',
  '',
  'GeographyView previously rendered one "Holder" column per geo row. P5.3 splits',
  'this into two columns -- "Condo" and "Homes" -- each showing the resolved primary',
  'agent for that property type, with a source-tier hint ("from tenant default",',
  '"from municipality", etc.) when the resolution is inherited rather than own-scope.',
  '',
  '### Code change',
  '',
  'The `/api/admin-homes/territory/geo-rollup` route stopped calling the',
  '`resolve_geo_primary` RPC entirely. The RPC takes only `(scope, scope_id,',
  'tenant_id)` and ignores `condo_access`/`homes_access` flags -- it cannot split',
  'owners by property type. P5.3 replaces it with inline parameterized apa lookups',
  '(one per property type) plus an ancestor walk plus a `tenants.default_agent_id`',
  'fallback. The canonical resolver chain (`resolve_agent_for_context`,',
  '`resolve_display_agent_for_context`) is untouched per W-COCKPIT scope.',
  '',
  '### Files in P5.3 ship (10 total)',
  '',
  '**Production code (2 modified):**',
  '- `app/api/admin-homes/territory/geo-rollup/route.ts` (10,974 -> 14,003 bytes)',
  '- `components/admin-homes/cockpit/territory/GeographyView.tsx` (21,613 -> 23,621 bytes;',
  "  also fixes pre-existing U+2192 ASCII violation with JSX-safe `{'->'}`)",
  '',
  '**Canonical scripts (5 new):**',
  '- `scripts/r-w-territory-master-p5-3-recon.js`',
  '- `scripts/probe-resolve-geo-primary.js`',
  '- `scripts/probe-p5-3-smoke-failures.js`',
  '- `scripts/r-w-territory-master-p5-3-deploy.js`',
  '- `scripts/r-w-territory-master-p5-3-smoke.js`',
  '',
  '**Fix iteration audit trail (4 scripts):**',
  '- `scripts/r-w-territory-master-p5-3-fix.js` (v1: hit JSX trap)',
  '- `scripts/r-w-territory-master-p5-3-fix-v2.js` (v2: brace-balance edge case)',
  '- `scripts/r-w-territory-master-p5-3-fix-v3.js` (v3: CRLF + over-walked sanity check)',
  '- `scripts/r-w-territory-master-p5-3-fix-v4.js` (v4: targeted swaps, shipped)',
  '',
  '### Verification',
  '',
  '- TSC `--noEmit` clean',
  '- DB+file smoke 53/53 PASS (38 file-structure + 13 DB + 2 cross-tenant)',
  '- Browser smoke green at `http://localhost:3000/admin-homes/tenants/b16e1039-38ed-43d7-bbc5-dd02bb651bc9?tab=territory`:',
  '  - Header columns flipped from "Holder" to "Condo" + "Homes"',
  '  - All 73 WALLiam area rows show King Shah in both columns with "from tenant default" hint',
  '  - Correct behavior since WALLiam has zero area-scope apa rows',
  '  - Drill / Carve / Cards action buttons preserved',
  '  - "Conflict zones only" toggle preserved',
  '',
  '---',
  '',
  '# Active findings (NOT P5.3 scope)',
  '',
  '- **F-TPA-UNPOPULATED** -- `tenant_property_access` schema exists (12 cols, 6 idx)',
  '  but 0 rows across all tenants. Either deprecate `TenantGeoAssignmentSection` UI',
  '  and drop the table, or make explicit per-tenant coverage a launch-blocking',
  '  onboarding step. Decision required pre-first-customer.',
  '',
  '- **F-AUDIT-ORIGINATOR-WRITE-GAP** -- `changed_by uuid` column exists on both',
  '  `lead_ownership_changes` and `territory_assignment_changes`. Write paths in',
  '  pin/building create/deactivate endpoints currently pass `assigned_by` /',
  '  `deactivated_by` (acting agent), not `auth.user.id`. Surgical fix needed:',
  '  ~5 endpoint files + 3 triggers. Not blocking ship.',
  '',
  '- **F-RESOLVE-GEO-PRIMARY-NO-PROPERTY-TYPE** -- `resolve_geo_primary` RPC',
  '  (oid 24991104, 766 chars) ignores `condo_access`/`homes_access` flags entirely.',
  '  Q5 probe confirmed LATENT: zero production apa rows have asymmetric',
  '  `(condo_access, homes_access)` on primary cards today, so the resolver chain',
  '  is not actively mis-routing. P5.3 ships route-side defensive correctness.',
  '  Activates when P6 ships property-type carving UI -- the first creator of',
  '  asymmetric apa rows. Resolver chain fix is a separate workstream.',
  '',
  '- **F-WCOCKPIT-V14-PHANTOM-DRIFT** -- W-COCKPIT P-B-2 v14 documented 11 King',
  '  Shah Whitby community apa rows as **phantoms** with both flags false.',
  '  Production reality (verified 2026-05-27 this session via',
  '  `scripts/probe-p5-3-smoke-failures.js`): all 11 rows have both flags TRUE,',
  '  `is_primary=true`, `is_active=true`, all created_at 2026-05-06 (predating the',
  '  v14 doc of 2026-05-24). Documentation drift, NOT data drift. Implication:',
  '  listings inside those 11 Whitby communities route to King Shah (own-scope',
  '  community card wins), not Neo Smith (Whitby muni primary). Operator review',
  '  needed -- is this intended routing? Not a P5.3 bug; P5.3 surfaces it.',
  '',
  '---',
  '',
  '# Process lessons (P5.3)',
  '',
  '- **L-JSX-ASCII-ESCAPE-TRAP** -- Replacing a Unicode character with raw `->`',
  '  inside JSX is invalid syntax (TS1382: `>` is the JSX tag-close character).',
  '  Use JSX expression form `{\'->\'}` instead. ASCII-purity patches against',
  '  `.tsx` files must validate JSX context, not just character codes.',
  '',
  '- **L-ANCHOR-UNICODE-FRAGILE** -- Hand-writing patch anchors that contain',
  '  Unicode (em dashes, smart quotes, arrows) is fragile across artifact-write',
  '  pipelines. The character that lands on disk may not byte-equal what was',
  '  typed. Rule: anchors must be ASCII-only landmarks, or built from substrings',
  '  read from disk at runtime.',
  '',
  '- **L-CRLF-DETECTION-MANDATORY** -- Multi-line anchors using literal `\\n`',
  '  will not match CRLF files. Every multi-file fix script must auto-detect',
  "  line-ending style: `const NL = original.indexOf('\\r\\n') !== -1 ? '\\r\\n' : '\\n'`",
  '  and build anchors with `NL`. Mixed-ending codebases are real.',
  '',
  '- **L-MINIMAL-OVER-CLEVER** -- P5.3 smoke prediction fix took 4 attempts',
  '  (JSX trap, brace-balance parser, region-detection line-walker, then targeted',
  '  substring swaps that worked first try). When the actual change is "flip a',
  '  few predicates", start with the smallest surgical swap, not the cleverest',
  '  region-walker. Right tool: `string.replace(oldChunk, newChunk)` with a',
  '  uniqueness gate. Wrong tools: parsers, line-walkers, brace-balancers.',
  '',
  '---',
  '',
  '# Next action',
  '',
  '**P5.3 atomic commit + push.** Then:',
  '',
  '1. **P5.3-followup-review** -- operator review of King Shah\'s 11 Whitby',
  '   community cards. Is the routing (King Shah at community level, NOT Neo',
  '   Smith from Whitby muni) intended? Operator decides; tracker records.',
  '',
  '2. **P6** -- property-type carving UI (condo vs home checkboxes on card',
  '   creation). This will be the first creator of asymmetric apa rows, which',
  '   activates F-RESOLVE-GEO-PRIMARY-NO-PROPERTY-TYPE on the routing chain.',
  '   P5.3\'s route-side filter is already in place.',
  '',
  '3. **P7** -- neighbourhood + cache repopulation.',
  '',
  '4. **Pre-launch sweep** -- F-TPA-UNPOPULATED decision, F-AUDIT-ORIGINATOR-',
  '   WRITE-GAP surgical patch, F-WCOCKPIT-V14 operator review confirmed.',
  '',
  '',
].join('\n')

// ASCII purity gate
for (let i = 0; i < TRACKER_V10.length; i++) {
  if (TRACKER_V10.charCodeAt(i) > 127) {
    throw new Error('Tracker content has non-ASCII char at index ' + i + ' (charCode=' + TRACKER_V10.charCodeAt(i) + ')')
  }
}
console.log('  ASCII purity: OK')

if (prior !== null) {
  const backupPath = TRACKER_PATH + '.backup_' + ts()
  fs.copyFileSync(TRACKER_PATH, backupPath)
  console.log('  backup: ' + backupPath)
}

fs.writeFileSync(TRACKER_PATH, TRACKER_V10, 'utf8')
console.log('  wrote: ' + TRACKER_PATH + ' (' + TRACKER_V10.length + ' bytes)')
console.log('')
console.log('=== TRACKER v10 WRITTEN ===')
console.log('Ready for atomic commit alongside P5.3 code + scripts.')