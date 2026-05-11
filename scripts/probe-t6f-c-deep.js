// scripts/probe-t6f-c-deep.js
//
// Read-only deep recon for T6f-C. Targets the gaps in fresh probe:
//
// VIP-APPROVE:
//   1. Every createHtmlResponse(...) call site with ±2 line context
//   2. Lines 60-90 (vip_request load + early-return paths)
//   3. Lines 150-190 (approve email-send block + subject + agent fallback + helper call site)
//
// CONTACT:
//   4. Lines 60-188 (POST handler body — supabase instantiation, agent resolve,
//      L113 source context, L125 subject context, L175 source context, buildContactEmail call site)
//
// Output: recon/W-LEADS-EMAIL-T6F-C-DEEP.txt

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const OUT = path.join('recon', 'W-LEADS-EMAIL-T6F-C-DEEP.txt')

const F_APPROVE = 'app/api/walliam/charlie/vip-approve/route.ts'
const F_CONTACT = 'app/api/walliam/contact/route.ts'

function read(p) {
  return fs.readFileSync(path.resolve(ROOT, p), 'utf8').split(/\r\n|\n/)
}

function dumpRange(out, label, lines, fromL, toL) {
  out.push('  --- ' + label + ' (L' + fromL + '..L' + Math.min(toL, lines.length) + ') ---')
  for (let i = fromL - 1; i < Math.min(toL, lines.length); i++) {
    out.push('  L' + (i + 1).toString().padStart(4) + ': ' + lines[i].trimEnd())
  }
  out.push('')
}

const out = []
out.push('W-LEADS-EMAIL T6f-C deep recon probe (read-only, gap-fill)')
out.push('Generated: ' + new Date().toISOString())
out.push('')

// =============================================================================
// VIP-APPROVE
// =============================================================================
out.push('=== FILE: ' + F_APPROVE + ' ===')
out.push('')

const approve = read(F_APPROVE)

// 1. createHtmlResponse(...) call sites
out.push('  --- SECTION A: createHtmlResponse(...) call sites (±2 line context) ---')
let aCount = 0
const aSeen = new Set()
for (let i = 0; i < approve.length; i++) {
  if (/createHtmlResponse\s*\(/.test(approve[i])) {
    // Skip the function declaration line itself
    if (/^function\s+createHtmlResponse/.test(approve[i])) continue
    aCount++
    const startCtx = Math.max(0, i - 2)
    const endCtx = Math.min(approve.length - 1, i + 3)
    const key = startCtx + '-' + endCtx
    if (aSeen.has(key)) continue
    aSeen.add(key)
    out.push('  -- call site #' + aCount + ' at L' + (i + 1) + ' --')
    for (let j = startCtx; j <= endCtx; j++) {
      out.push('  L' + (j + 1).toString().padStart(4) + ': ' + approve[j].trimEnd())
    }
    out.push('')
  }
}
out.push('  TOTAL: ' + aCount + ' createHtmlResponse call sites')
out.push('')

// 2. vip_request load region + early-return paths
dumpRange(out, 'SECTION B: vip_request load + early-return paths', approve, 30, 90)

// 3. approve email-send block + agent fallback + helper call site
dumpRange(out, 'SECTION C: approve email-send block (subject L162 + agent L165 + helper call)', approve, 150, 190)

out.push('=== END FILE: ' + F_APPROVE + ' ===')
out.push('')

// =============================================================================
// CONTACT
// =============================================================================
out.push('=== FILE: ' + F_CONTACT + ' ===')
out.push('')

const contact = read(F_CONTACT)

// 4. POST handler body
dumpRange(out, 'SECTION D: POST handler body (L60..L188)', contact, 60, 188)

out.push('=== END FILE: ' + F_CONTACT + ' ===')
out.push('')

const reconDir = path.dirname(path.resolve(ROOT, OUT))
if (!fs.existsSync(reconDir)) fs.mkdirSync(reconDir, { recursive: true })

fs.writeFileSync(path.resolve(ROOT, OUT), out.join('\n'))
console.log('Wrote: ' + OUT)
console.log('Output bytes: ' + Buffer.byteLength(out.join('\n'), 'utf8'))