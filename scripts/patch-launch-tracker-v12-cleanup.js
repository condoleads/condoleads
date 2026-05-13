const fs = require('fs')
const path = 'C:/Condoleads/project/docs/W-LAUNCH-TRACKER.md'
const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')

if (original.includes('v12') && original.includes('W-HIERARCHY: \u2705 CLOSED 2026-05-03')) {
  console.log('[SKIP] v12 cleanup already applied')
  process.exit(0)
}

let content = original.replace(/\r\n/g, '\n')

const fixes = [
  {
    name: 'Section 3 — remove External blockers subsection (Paddle KYC out of scope)',
    old: '### External blockers\n\n**E-1. Paddle KYC** \u2014 Sumsub verification + action required per dashboard.\n\n### Scripts cleanup (per memory rule)',
    new: '### Scripts cleanup (per memory rule)'
  },
  {
    name: 'Next Action — strip Paddle dependency, fix Hierarchy note, drop 01leads scope creep',
    old: '**P0 TIER CLOSED 2026-05-05.** All five P0 items (P0-1 through P0-5) shipped in a single working block. The only remaining launch blocker is external: Paddle KYC review (submitted; awaiting Sumsub/Paddle outcome). Once Paddle clears, payment processor onboarding completes and the platform is launch-ready.\n\n**Post-P0 backlog** (not blocking launch):\n- W-ROLES-DELEGATION R5 (delegation CRUD), R6 (workspace UI), R8 (full smoke matrix) \u2014 deferred per cohesion review.\n- W-HIERARCHY H3.9, H4 (backfill), H5 (smoke) \u2014 confirm closed or schedule.\n- 01leads.com go-to-market once payment processor live.\n- Scripts cleanup: `Remove-Item -Recurse -Force scripts` after final verification.',
    new: '**P0 TIER CLOSED 2026-05-05.** All five P0 items (P0-1 through P0-5) shipped in a single working block.\n\n**Post-P0 backlog** (not blocking launch \u2014 see Section 3 P1/P2 + Section 4 trackers for detail):\n- W-ROLES-DELEGATION R5 (delegation CRUD), R6 (workspace UI), R8 (full smoke matrix) \u2014 deferred per cohesion review.\n- W-HIERARCHY: \u2705 CLOSED 2026-05-03 (v17 FINAL \u2014 all phases H1..H6 done; production walliam.ca on full Lead+Email contract).\n- W-LEADS-EMAIL: F55 / P2-4 \u2014 replace remaining hardcoded admin email literals with env var (hygiene).\n- W-TERRITORY: largest open feature; required before tenant-2 onboarding.\n- Scripts cleanup: `Remove-Item -Recurse -Force scripts` after final verification.'
  }
]

for (const f of fixes) {
  const count = content.split(f.old).length - 1
  if (count === 0) { console.error('NOT FOUND:', f.name); process.exit(1) }
  if (count > 1)  { console.error('NOT UNIQUE:', f.name, '(' + count + ')'); process.exit(1) }
  content = content.replace(f.old, f.new)
  console.log('  Patched:', f.name)
}

// Append v12 status log entry — anchor on v11 line
const v11Marker = 'Launch unblocked modulo external Paddle KYC.'
if (!content.includes(v11Marker)) { console.error('v11 marker not found'); process.exit(1) }
const v12Line = '\n- **2026-05-05 v12** \u2014 **Cleanup pass.** Verified W-HIERARCHY status from on-disk `docs/W-HIERARCHY-TRACKER.md`: all phases H1..H6 closed 2026-05-03 (v17 FINAL). H3.9 shipped commit `bd1f462`; H4 in-place wipe; H5 closed via Path X; H6 housekeeping. The Next Action\'s "confirm closed or schedule" note for H3.9/H4/H5 was a false ambiguity introduced in my v6 \u2014 those phases shipped over a month ago. Removed. Also removed Section 3 "External blockers" subsection (Paddle KYC) and the "01leads.com go-to-market" line from Next Action \u2014 payment processor onboarding and 01leads launch are operational/business scope, not product-system cohesion; they don\'t belong in this tracker. Result: launch tracker is now strictly product/code launch readiness. P0 closed; W-HIERARCHY closed; remaining product work is W-ROLES-DELEGATION R5/R6/R8 (deferred), F55/P2-4 hygiene, W-TERRITORY build, scripts cleanup.'

content = content.replace(v11Marker, v11Marker + v12Line)
console.log('  Appended v12 status log')

const finalContent = useCRLF ? content.replace(/\n/g, '\r\n') : content
fs.writeFileSync(path, finalContent, 'utf8')
console.log('Original:', original.length, '-> New:', finalContent.length, '(delta', finalContent.length - original.length + ')')