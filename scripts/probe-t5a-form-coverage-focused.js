#!/usr/bin/env node
/**
 * probe-t5a-form-coverage-focused.js
 *
 * Third pass — fills the gaps from the deep probe by inspecting only the
 * slices of the 6 page-type components that matter for form coverage.
 *
 * For each target file: dump first 40 lines (imports + signature) + lines
 * within ±10 of any reference to the 5 form/CTA components we care about.
 * Suppresses everything else so the paste stays tractable.
 *
 * Also dumps the first 150 lines of the T0-C form-coverage recon file
 * so we can lock the exact meaning of OD-5=(a) before T5b decision.
 *
 * Read-only.
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

const TARGETS = [
  'app/[slug]/AreaPage.tsx',
  'app/[slug]/MunicipalityPage.tsx',
  'app/[slug]/CommunityPage.tsx',
  'app/[slug]/BuildingPage.tsx',
  'app/[slug]/DevelopmentPage.tsx',
  'app/property/[id]/PropertyPageClient.tsx',
  'app/property/[id]/HomePropertyPageClient.tsx',
]

const RECON_FILE = 'recon/W-LEADS-EMAIL-T0-C-form-coverage.txt'
const RECON_LINES = 200

// Components/imports we care about (each match also pulls ±10 lines of context)
const NEEDLES = [
  'WalliamCTA',
  'WalliamContactForm',
  'CharliePageContext',
  'ContactModal',
  'AgentContactForm',
  'submitLeadFromForm',
  'RegisterModal',
  'OfferInquiryModal',
  'MobileContactBar',
  '/api/walliam/',
  '/api/charlie/',
]

const CONTEXT_BEFORE = 4
const CONTEXT_AFTER = 8

function exists(p) {
  try { fs.accessSync(p); return true } catch { return false }
}

function read(p) {
  return fs.readFileSync(p, 'utf8')
}

function focusedSlice(absPath) {
  const text = read(absPath)
  const lines = text.split('\n')
  const wantLines = new Set()

  // Always include first 40 lines (imports + component signature)
  for (let i = 0; i < Math.min(40, lines.length); i++) wantLines.add(i)

  // Add ±context around each needle match
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const needle of NEEDLES) {
      if (line.includes(needle)) {
        for (let j = Math.max(0, i - CONTEXT_BEFORE); j <= Math.min(lines.length - 1, i + CONTEXT_AFTER); j++) {
          wantLines.add(j)
        }
        break
      }
    }
  }

  // Emit with gap markers and line numbers
  const sorted = [...wantLines].sort((a, b) => a - b)
  let output = ''
  let prev = -1
  for (const idx of sorted) {
    if (prev >= 0 && idx > prev + 1) {
      output += `  ... [gap of ${idx - prev - 1} line(s)]\n`
    }
    const ln = idx + 1
    const text = lines[idx].length > 200 ? lines[idx].slice(0, 200) + '...' : lines[idx]
    output += `  L${String(ln).padStart(4, ' ')}: ${text}\n`
    prev = idx
  }
  if (sorted.length > 0 && prev < lines.length - 1) {
    output += `  ... [+${lines.length - 1 - prev} more lines to EOF]\n`
  }
  return { totalLines: lines.length, slice: output, hitCount: sorted.length }
}

console.log('=== T5a FOCUSED PROBE: per-page form composition ===\n')

for (const rel of TARGETS) {
  const abs = path.resolve(ROOT, rel)
  console.log('-' .repeat(80))
  if (!exists(abs)) {
    console.log(`${rel} — NOT FOUND`)
    console.log('')
    continue
  }
  const r = focusedSlice(abs)
  console.log(`${rel} (${r.totalLines} lines total; showing ${r.hitCount} relevant lines)`)
  console.log('')
  console.log(r.slice || '  (no relevant lines beyond first 40)')
  console.log('')
}

// T0-C recon dump
console.log('=' .repeat(80))
console.log(`T0-C recon evidence (${RECON_FILE}, first ${RECON_LINES} lines)`)
console.log('=' .repeat(80))
console.log('')
const reconAbs = path.resolve(ROOT, RECON_FILE)
if (exists(reconAbs)) {
  const lines = read(reconAbs).split('\n')
  console.log(lines.slice(0, RECON_LINES).join('\n'))
  if (lines.length > RECON_LINES) {
    console.log(`\n... [+${lines.length - RECON_LINES} more lines in recon file]`)
  }
} else {
  console.log(`(${RECON_FILE} NOT FOUND)`)
}

console.log('\n=== END focused probe ===')