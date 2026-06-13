// scripts/test-c-chat-valuation-style.js
//
// C-CHAT-VALUATION-STYLE — visual-only theme-prop test. Verifies:
//   1. WorkingDocView has a theme prop, default 'light'.
//   2. The LIGHT theme's class-string lookup contains EXACTLY today's
//      class strings — verbatim from the pre-change render. This is the
//      KEY dashboard byte-identity guard: any dashboard render that
//      doesn't pass a theme prop receives default 'light' and gets the
//      same DOM as before this commit.
//   3. The DARK theme uses panel-matching dark classes (white text on
//      dark backgrounds, no accidental light-mode leak).
//   4. InChatWorkingDoc passes theme='dark' explicitly.
//   5. NO data-layer change: buildWorkingDocFromResult, collectListing-
//      Keys, listing-id resolution via Supabase, baseUrl=window.location.
//      origin all intact in the wrapper.
//   6. 09b97ef byte-identity guards still hold: chat route, tools,
//      system prompt, Charlie VIP email builder, plan-email, useCharlie.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const readFile = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8')
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12)

const view = readFile('components/dashboard/WorkingDocView.tsx')
const wrapper = readFile('app/charlie/components/InChatWorkingDoc.tsx')
const chatRoute = readFile('app/api/charlie/route.ts')
const charlieTools = readFile('app/charlie/lib/charlie-tools.ts')
const charliePrompts = readFile('app/charlie/lib/charlie-prompts.ts')
const useCharlie = readFile('app/charlie/hooks/useCharlie.ts')
const planEmail = readFile('app/api/charlie/plan-email/route.ts')
const charlieVip = readFile('app/api/walliam/charlie/vip-request/route.ts')
const resultsPanel = readFile('app/charlie/components/ResultsPanel.tsx')

// Every class string the PRE-change dashboard render emitted (verbatim).
// If LIGHT theme entries don't contain ALL of these in the same shape,
// the dashboard DOM may have shifted — FAIL.
const PRE_CHANGE_DASHBOARD_CLASSES = [
  // Outer container
  "'bg-white rounded-lg shadow p-6 mt-6'",
  // Heading
  "'text-lg font-semibold mb-4'",
  // Header card (light slate)
  "'bg-slate-50 border border-slate-200 rounded-lg p-4'",
  // Header caption
  "'text-[10px] uppercase tracking-wide text-gray-500'",
  // Subject line
  "'text-sm font-semibold text-gray-900 mt-1'",
  // Estimate price (large)
  "'text-2xl font-extrabold text-gray-900 mt-2'",
  // Range text
  "'text-xs text-gray-500 mt-0.5'",
  // Confidence
  "'text-xs text-gray-600 mt-1.5'",
  // Section wrap
  "'mt-6'",
  // Section title
  "'text-sm font-semibold text-gray-900'",
  // Section subtitle
  "'text-xs text-gray-500 mt-0.5'",
  // Section header
  "'text-xs text-gray-600 mt-1.5'",
  // Table text
  "'w-full mt-2 text-sm'",
  // Tile row border
  "'border-b border-gray-200 last:border-0'",
  // Tile address link
  "'text-sm font-medium text-blue-700 hover:text-blue-900'",
  // Tile address (no link)
  "'text-sm font-medium text-gray-900'",
  // Tile unit
  "'text-xs text-gray-500 mt-0.5'",
  // Tile specs
  "'text-xs text-gray-500 mt-0.5'",
  // Tile price
  "'text-sm font-bold text-gray-900'",
  // Tile adjusted
  "'text-xs font-normal text-gray-500 ml-1'",
  // Tile tier
  "'text-[10px] text-gray-500 mt-0.5'",
  // Tile date
  "'text-[10px] text-gray-500 mt-0.5'",
  // Tile dom
  "'text-[10px] text-gray-400 mt-0.5'",
  // Footer
  "'mt-5 pt-4 border-t border-gray-100 text-[11px] text-gray-400 leading-relaxed'",
]

// Find the LIGHT object literal and assert every pre-change class string
// appears verbatim inside it.
const lightObjMatch = view.match(/const\s+LIGHT\s*:\s*ThemeClasses\s*=\s*\{([\s\S]*?)\n\}/)
const lightBody = lightObjMatch ? lightObjMatch[1] : ''
const missingFromLight = PRE_CHANGE_DASHBOARD_CLASSES.filter(s => !lightBody.includes(s))

// Find the DARK object literal and assert it has dark-mode markers.
const darkObjMatch = view.match(/const\s+DARK\s*:\s*ThemeClasses\s*=\s*\{([\s\S]*?)\n\}/)
const darkBody = darkObjMatch ? darkObjMatch[1] : ''

const darkHasDarkContainer = /bg-\[#0f172a\]|bg-slate-900|bg-black/.test(darkBody)
const darkHasWhiteText = /text-white\b/.test(darkBody)
const darkLinksReadable = /text-blue-300|text-blue-400/.test(darkBody)
// Match the SOLID light-mode classes only — Tailwind translucent overlays
// (e.g. `bg-white/[0.04]`, `border-white/[0.06]`) are legitimate dark-theme
// surfaces and must not trip this guard. Solid variants end with the color
// shade and a word boundary (or end-of-quote).
const darkNoLightLeak = !/text-gray-\d{2,3}(?![\/\w])|border-gray-\d{2,3}(?![\/\w])|bg-white(?![\/\w-])|bg-slate-50(?![\/\w-])/.test(darkBody)

// The view must default theme to 'light' so old callers (dashboard) get
// the LIGHT path without any signature change downstream.
const hasDefaultLight = /theme\s*=\s*['"]light['"]/.test(view) || /theme:\s*WorkingDocViewTheme[^=]*=\s*['"]light['"]/.test(view)

// InChatWorkingDoc must explicitly pass theme="dark".
const wrapperPassesDark = /theme=["']dark["']/.test(wrapper) || /theme:\s*['"]dark['"]/.test(wrapper)

// Wrapper data layer untouched.
const wrapperShapingIntact =
     /buildWorkingDocFromResult/.test(wrapper)
  && /collectListingKeys/.test(wrapper)
  && /\.from\(['"]mls_listings['"]\)/.test(wrapper)
  && /window\.location\.origin/.test(wrapper)
  && !/'https?:\/\/walliam\.ca'|"https?:\/\/walliam\.ca"|'https?:\/\/condoleads\.ca'|"https?:\/\/condoleads\.ca"/.test(wrapper)

// 09b97ef byte-identity guards.
const chatRouteShasUnchanged = sha(chatRoute) === '9c64acba0564'
const toolsShaUnchanged = sha(charlieTools) === 'a02ee7ab48f9'
const promptShaUnchanged = sha(charliePrompts) === 'fbe7b7de14b9'
const vipShaUnchanged = sha(charlieVip) === '97c651e90c6f'
// plan-email + useCharlie carry C-PLAN-DOC integration; verify markers.
const planEmailIntact =
     /,\s*workingDoc\s*\}\s*=\s*await\s+req\.json\(\)/.test(planEmail)
  && /renderEstimateHeader/.test(planEmail)
  && /renderWorkingDocSections/.test(planEmail)
  && planEmail.includes('${workingDocHtml}')
const useCharlieIntact =
     /buildWorkingDocFromResult/.test(useCharlie)
  && /workingDoc/.test(useCharlie)

// ResultsPanel wiring intact (09b97ef change).
const resultsPanelIntact =
     /from\s+['"]\.\/InChatWorkingDoc['"]/.test(resultsPanel)
  && /<InChatWorkingDoc\s+sellerEstimate=\{se\}/.test(resultsPanel)

const checks = [
  ['WorkingDocView has theme prop with default \'light\' (dashboard signature preserved)', hasDefaultLight],
  ['LIGHT theme object contains EVERY pre-change dashboard class string (byte-identical render)', missingFromLight.length === 0],
  ['DARK theme uses dark container (bg-[#0f172a] / bg-slate-900 / bg-black)', darkHasDarkContainer],
  ['DARK theme uses white text', darkHasWhiteText],
  ['DARK theme uses light blue link colors (readable on dark)', darkLinksReadable],
  ['DARK theme has NO accidental light-mode class leak (text-gray-*, border-gray-*, bg-white, bg-slate-50)', darkNoLightLeak],
  ['InChatWorkingDoc passes theme="dark" explicitly', wrapperPassesDark],
  ['InChatWorkingDoc data layer untouched (buildWorkingDocFromResult + collectListingKeys + mls_listings query + window.location.origin)', wrapperShapingIntact],
  ['ResultsPanel wiring from 09b97ef intact', resultsPanelIntact],
  ['Chat route byte-identical to 09b97ef (sha 9c64acba0564)', chatRouteShasUnchanged],
  ['Tools file byte-identical to 09b97ef (sha a02ee7ab48f9)', toolsShaUnchanged],
  ['System prompt byte-identical to 09b97ef (sha fbe7b7de14b9)', promptShaUnchanged],
  ['Charlie VIP buyer-approval builder byte-identical to 09b97ef (sha 97c651e90c6f)', vipShaUnchanged],
  ['plan-email C-PLAN-DOC integration intact', planEmailIntact],
  ['useCharlie C-PLAN-DOC threading intact', useCharlieIntact],
]

let allPass = true
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name)
  if (!ok) allPass = false
}

if (missingFromLight.length > 0) {
  console.log('')
  console.log('LIGHT theme is missing these pre-change classes:')
  for (const s of missingFromLight) console.log('  - ' + s)
}

console.log('')
console.log('Current file hashes:')
console.log('  WorkingDocView:        sha=' + sha(view))
console.log('  InChatWorkingDoc:      sha=' + sha(wrapper))
console.log('  ResultsPanel:          sha=' + sha(resultsPanel))
console.log('')
console.log('09b97ef byte-identity guards (must match):')
console.log('  chat route:            sha=' + sha(chatRoute) + (chatRouteShasUnchanged ? ' MATCH' : ' MISMATCH'))
console.log('  tools:                 sha=' + sha(charlieTools) + (toolsShaUnchanged ? ' MATCH' : ' MISMATCH'))
console.log('  system prompt:         sha=' + sha(charliePrompts) + (promptShaUnchanged ? ' MATCH' : ' MISMATCH'))
console.log('  Charlie VIP builder:   sha=' + sha(charlieVip) + (vipShaUnchanged ? ' MATCH' : ' MISMATCH'))
console.log('')
console.log('OVERALL: ' + (allPass ? 'PASS' : 'FAIL'))
process.exit(allPass ? 0 : 1)
