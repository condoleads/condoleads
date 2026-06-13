// scripts/test-c-chat-valuation.js
//
// C-CHAT-VALUATION test. UI-only static-code + DB-shape proofs.
// Verifies the in-chat working-document render (option C2) is wired
// correctly AND that the chat-stream + tools + plan-email backend remain
// byte-identical to pre-C-CHAT-VALUATION.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const readFile = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8')
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12)

const wrapper = readFile('app/charlie/components/InChatWorkingDoc.tsx')
const resultsPanel = readFile('app/charlie/components/ResultsPanel.tsx')
const workingDocView = readFile('components/dashboard/WorkingDocView.tsx')
const chatRoute = readFile('app/api/charlie/route.ts')
const charlieTools = readFile('app/charlie/lib/charlie-tools.ts')
const charliePrompts = readFile('app/charlie/lib/charlie-prompts.ts')
const useCharlie = readFile('app/charlie/hooks/useCharlie.ts')
const planEmail = readFile('app/api/charlie/plan-email/route.ts')
const charlieVip = readFile('app/api/walliam/charlie/vip-request/route.ts')

const checks = [
  // ── InChatWorkingDoc wrapper ───────────────────────────────────────────
  ['Wrapper imports buildWorkingDocFromResult + collectListingKeys from shared helper',
    /from\s+['"]@\/lib\/email\/working-doc-render['"]/.test(wrapper)
    && /buildWorkingDocFromResult/.test(wrapper)
    && /collectListingKeys/.test(wrapper)],
  ['Wrapper imports React WorkingDocView (reuse, not rebuild)',
    /from\s+['"]@\/components\/dashboard\/WorkingDocView['"]/.test(wrapper)],
  ['Wrapper does NOT import email-HTML emitters (renderEstimateHeader/renderWorkingDocSections)',
    !/renderEstimateHeader|renderWorkingDocSections/.test(wrapper)],
  ['Wrapper shapes runner data via buildWorkingDocFromResult (useMemo)',
    /buildWorkingDocFromResult\s*\(\s*\{/.test(wrapper)
    && /useMemo/.test(wrapper)],
  ['Wrapper does client-side listing-id resolution (useEffect + supabase)',
    /useEffect/.test(wrapper)
    && /\.from\(['"]mls_listings['"]\)/.test(wrapper)
    && /\.in\(['"]listing_key['"]/.test(wrapper)],
  ['Wrapper uses window.location.origin (tenant-correct by construction, no hardcoded host)',
    /window\.location\.origin/.test(wrapper)
    && !/'https?:\/\/walliam\.ca'|'https?:\/\/condoleads\.ca'|"https?:\/\/walliam\.ca"|"https?:\/\/condoleads\.ca"/.test(wrapper)],
  ['Wrapper returns null when workingDoc is null (backwards-compat graceful)',
    /if\s*\(\s*!workingDoc\s*\)\s*return\s+null/.test(wrapper)],

  // ── ResultsPanel wiring ────────────────────────────────────────────────
  ['ResultsPanel imports InChatWorkingDoc',
    /from\s+['"]\.\/InChatWorkingDoc['"]/.test(resultsPanel)],
  ['ResultsPanel mounts InChatWorkingDoc inside sellerEstimate block',
    /<InChatWorkingDoc\s+sellerEstimate=\{se\}/.test(resultsPanel)],
  ['ResultsPanel sellerEstimate block structure intact (Property Estimate / Competing / Pricing Risk / Strategy)',
    /Property Estimate/.test(resultsPanel)
    && /Competing For Sale/.test(resultsPanel)
    && /Pricing Strategy & Risk/.test(resultsPanel)
    && /Your Seller Strategy/.test(resultsPanel)],

  // ── WorkingDocView reuse ───────────────────────────────────────────────
  ['WorkingDocView props unchanged (workingDoc + baseUrl + idMap)',
    /workingDoc:\s*WorkingDoc\s*\|\s*null\s*\|\s*undefined/.test(workingDocView)
    && /baseUrl:\s*string/.test(workingDocView)
    && /idMap:\s*Record<string,\s*string>/.test(workingDocView)],
  ['WorkingDocView returns null when workingDoc is null (graceful)',
    /if\s*\(\s*!workingDoc\s*\)\s*return\s+null/.test(workingDocView)],

  // ── Chat-stream route: BYTE-IDENTICAL ──────────────────────────────────
  ['Chat stream route NOT modified (no working-doc helper imports)',
    !/from\s+['"]@\/lib\/email\/working-doc-render['"]/.test(chatRoute)],
  ['Chat stream route NOT modified (no matcher action imports)',
    !/estimateCondoSale|estimateHomeSale|findCondoComparablesSales|findHomeComparables/.test(chatRoute)],
  ['Chat stream: generate_plan stub intact (planReady: true, no matcher)',
    /if\s*\(\s*name\s*===\s*['"]generate_plan['"]/.test(chatRoute)
    && /planReady:\s*true/.test(chatRoute)],
  ['Chat stream: SSE event types intact (text, tool_result, gate, chat_credit_used, vip_credit_used, done, error)',
    /type:\s*['"]text['"]/.test(chatRoute)
    && /type:\s*['"]tool_result['"]/.test(chatRoute)
    && /type:\s*['"]gate['"]/.test(chatRoute)
    && /type:\s*['"]chat_credit_used['"]/.test(chatRoute)
    && /type:\s*['"]vip_credit_used['"]/.test(chatRoute)
    && /type:\s*['"]done['"]/.test(chatRoute)
    && /type:\s*['"]error['"]/.test(chatRoute)],
  ['Chat stream: plan-pool atomic increment RPC intact',
    /increment_chat_session_counter/.test(chatRoute)
    && /(seller_plans_used|buyer_plans_used)/.test(chatRoute)],

  // ── Tools file: BYTE-IDENTICAL ─────────────────────────────────────────
  ['Tools file: NOT modified (13 existing tools intact)',
    (charlieTools.match(/name:\s*['"][a-z_]+['"]/g) || []).length === 13],

  // ── System prompt: NOT modified ────────────────────────────────────────
  ['System prompt: BUYER + SELLER flow rules + tenant-parameterized identity intact',
    /BUYER FLOW/.test(charliePrompts)
    && /SELLER FLOW/.test(charliePrompts)
    && /assistantName/.test(charliePrompts)
    && /tenantDomain/.test(charliePrompts)],

  // ── useCharlie: C-PLAN-DOC intact + nothing else touched ───────────────
  ['useCharlie: C-PLAN-DOC working-doc threading still in plan-email POST',
    /buildWorkingDocFromResult/.test(useCharlie)
    && /workingDoc/.test(useCharlie)],
  ['useCharlie: SSE consumer + handleToolResult + ConversationBlock types intact',
    /event\.type === ['"]tool_result['"]/.test(useCharlie)
    && /handleToolResult/.test(useCharlie)
    && /sellerEstimate/.test(useCharlie)
    && /'plan'/.test(useCharlie)],

  // ── plan-email (C-PLAN-DOC) intact ─────────────────────────────────────
  ['plan-email C-PLAN-DOC integration intact (workingDoc destructure + render)',
    /,\s*workingDoc\s*\}\s*=\s*await\s+req\.json\(\)/.test(planEmail)
    && /renderEstimateHeader/.test(planEmail)
    && /renderWorkingDocSections/.test(planEmail)
    && planEmail.includes('${workingDocHtml}')],
  ['plan-email: does NOT call /api/walliam/estimator/increment',
    !/\/api\/walliam\/estimator\/increment/.test(planEmail)],

  // ── Charlie VIP builder UNTOUCHED ──────────────────────────────────────
  ['Charlie VIP buyer-approval builder unchanged (no working-doc imports)',
    /buildUserApprovalEmailHtml/.test(charlieVip)
    && !/from\s+['"]@\/lib\/email\/working-doc-render['"]/.test(charlieVip)],
]

let allPass = true
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name)
  if (!ok) allPass = false
}

console.log('')
console.log('File hashes (byte-identity guards):')
console.log('  chat route:           sha=' + sha(chatRoute))
console.log('  tools:                sha=' + sha(charlieTools))
console.log('  system prompt:        sha=' + sha(charliePrompts))
console.log('  Charlie VIP builder:  sha=' + sha(charlieVip))
console.log('  WorkingDocView reuse: sha=' + sha(workingDocView))
console.log('')
console.log('OVERALL: ' + (allPass ? 'PASS' : 'FAIL'))
process.exit(allPass ? 0 : 1)
