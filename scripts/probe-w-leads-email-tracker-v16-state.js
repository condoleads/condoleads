// scripts/probe-w-leads-email-tracker-v16-state.js
//
// Read-only probe of the W-LEADS-EMAIL tracker to lock v17 anchors.
//
// Captures:
//   1. Version header line (expect: "v16" marker present)
//   2. Status line tail (expect: T6f-B-1 + B-2 closed wording)
//   3. T6f-B sub-section block (expect: B-3 + B-4 pending markers)
//   4. v16 status log entry top (anchor for v17 entry insertion)
//   5. Next-action section header (expect: T6f-B-3 or T6f-B-4 mention)
//   6. T6f phase scope table row (if present)
//   7. Line count + line ending detection
//
// Output: recon/W-LEADS-EMAIL-TRACKER-V16-STATE.txt + stdout summary.

const fs = require('fs')
const path = require('path')

const TRACKER = 'docs/W-LEADS-EMAIL-TRACKER.md'
const OUT = path.join('recon', 'W-LEADS-EMAIL-TRACKER-V16-STATE.txt')

const abs = path.resolve(process.cwd(), TRACKER)
const raw = fs.readFileSync(abs, 'utf8')
const usesCRLF = raw.includes('\r\n')
const content = usesCRLF ? raw.replace(/\r\n/g, '\n') : raw
const lines = content.split('\n')

const out = []
out.push('W-LEADS-EMAIL tracker v16 state probe')
out.push('File: ' + TRACKER)
out.push('Total lines: ' + lines.length)
out.push('Line endings: ' + (usesCRLF ? 'CRLF' : 'LF'))
out.push('Total bytes: ' + Buffer.byteLength(raw, 'utf8'))
out.push('')

// ===========================================================================
// 1. Version header — find the line with "v16" near the top (first 20 lines)
// ===========================================================================
out.push('=== SECTION 1: Version header (search "v16" in first 30 lines) ===')
for (let i = 0; i < Math.min(30, lines.length); i++) {
  if (/v1[5-7]/.test(lines[i])) {
    out.push('  L' + (i + 1).toString().padStart(4) + ': ' + lines[i])
  }
}
out.push('')

// ===========================================================================
// 2. Status line tail — search for "T6f-B" in first 60 lines
// ===========================================================================
out.push('=== SECTION 2: Status line region (search "T6f" in first 60 lines) ===')
for (let i = 0; i < Math.min(60, lines.length); i++) {
  if (/T6f/.test(lines[i])) {
    out.push('  L' + (i + 1).toString().padStart(4) + ': ' + lines[i])
  }
}
out.push('')

// ===========================================================================
// 3. T6f-B sub-section block — search for "T6f-B" + 10 lines context
// ===========================================================================
out.push('=== SECTION 3: T6f-B sub-section block (T6f-B references with +/-2 line context) ===')
const seen = new Set()
for (let i = 0; i < lines.length; i++) {
  if (/T6f-B/.test(lines[i])) {
    const startCtx = Math.max(0, i - 2)
    const endCtx = Math.min(lines.length - 1, i + 4)
    const key = startCtx + '-' + endCtx
    if (seen.has(key)) continue
    seen.add(key)
    out.push('  -- context around L' + (i + 1) + ' --')
    for (let j = startCtx; j <= endCtx; j++) {
      out.push('  L' + (j + 1).toString().padStart(4) + ': ' + lines[j])
    }
    out.push('')
  }
}

// ===========================================================================
// 4. v15/v16 status log entries — find "2026-05-11 v1[5-6]" markers
// ===========================================================================
out.push('=== SECTION 4: v15/v16 status log entries (anchor for v17 insertion) ===')
for (let i = 0; i < lines.length; i++) {
  if (/2026-05-11 v1[3-7]/.test(lines[i])) {
    out.push('  L' + (i + 1).toString().padStart(4) + ': ' + lines[i].substring(0, 200) + (lines[i].length > 200 ? '...[truncated]' : ''))
  }
}
out.push('')

// ===========================================================================
// 5. Next-action section — search for "## Next" or "### Next" or "Next action"
// ===========================================================================
out.push('=== SECTION 5: Next-action region (search "Next" headers + T6f-C mention) ===')
for (let i = 0; i < lines.length; i++) {
  if (/^#+\s*Next/i.test(lines[i]) || /^\*\*Next:/.test(lines[i]) || /T6f-C/.test(lines[i])) {
    const startCtx = Math.max(0, i - 1)
    const endCtx = Math.min(lines.length - 1, i + 6)
    out.push('  -- Next-related at L' + (i + 1) + ' --')
    for (let j = startCtx; j <= endCtx; j++) {
      out.push('  L' + (j + 1).toString().padStart(4) + ': ' + lines[j])
    }
    out.push('')
  }
}

// ===========================================================================
// 6. T6f phase scope table (if present) — search for "T6f-B-1" / "T6f-B-2" rows
// ===========================================================================
out.push('=== SECTION 6: T6f-B-* sub-phase scope rows (search "T6f-B-[1-4]") ===')
for (let i = 0; i < lines.length; i++) {
  if (/T6f-B-[1-4]/.test(lines[i])) {
    out.push('  L' + (i + 1).toString().padStart(4) + ': ' + lines[i].substring(0, 250) + (lines[i].length > 250 ? '...[truncated]' : ''))
  }
}
out.push('')

// ===========================================================================
// 7. Findings section — T6f-B-related findings (closed/open status)
// ===========================================================================
out.push('=== SECTION 7: T6f-related finding markers ===')
for (let i = 0; i < lines.length; i++) {
  if (/F-ESTIMATOR-VIP-(REQUEST|APPROVE|QUESTIONNAIRE)-MULTITENANT-DEBT|F-ESTIMATOR.*BRAND|F-T6f|T6f-A.*CLOSED|T6f-B.*CLOSED/.test(lines[i])) {
    out.push('  L' + (i + 1).toString().padStart(4) + ': ' + lines[i].substring(0, 250) + (lines[i].length > 250 ? '...[truncated]' : ''))
  }
}
out.push('')

if (!fs.existsSync(path.dirname(path.resolve(process.cwd(), OUT)))) {
  fs.mkdirSync(path.dirname(path.resolve(process.cwd(), OUT)), { recursive: true })
}
fs.writeFileSync(path.resolve(process.cwd(), OUT), out.join('\n'))
console.log('Wrote: ' + OUT)
console.log('Output bytes: ' + Buffer.byteLength(out.join('\n'), 'utf8'))