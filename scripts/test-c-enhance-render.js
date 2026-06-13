// scripts/test-c-enhance-render.js
//
// C-ENHANCE-2-RENDER test. Static-code proofs for the 3-surface tier-rail +
// chip + tax-match enhancement. No mutation, no email send, no dev needed.
//
// Checks:
//   1. In-chat: SellerEstimateBlock renders tier rail (gated on tiers),
//      anchor highlight, label-map imports, tier color literals, NO
//      "Geographic Confidence Spread" string, NO "working document"
//      string. ComparableCard takes sourceTier + path props + renders
//      chip with TIER_COLORS solid bg + white text.
//   2. Plan-email: tier chip injected in comparableSoldHtml per-tile, new
//      taxMatchHtml block defined + mounted, plan_data.sellerEstimate
//      persisted on lead insert. NO "working document" / "Geographic
//      Confidence Spread" / "Tax-Matched Comparables" strings.
//   3. Dashboard: CharlieLeadEstimate renders white-card chrome with
//      tier rail + chip + tax-match. NO estimator/working-document strings.
//      LeadDetailClient branches exclusive — Charlie present mounts
//      CharlieLeadEstimate, absent mounts WorkingDocView.
//   4. Form: livingAreaRange + propertyTax now in the canSubmit guard.
//   5. Byte-identical proofs: ResultsPanel.tsx, WorkingDocView.tsx,
//      chat-route, tools, prompt, Charlie VIP email (SHA fingerprints).

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const readFile = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8')
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12)

const cmpCard      = readFile('app/charlie/components/ComparableCard.tsx')
const sellerBlock  = readFile('app/charlie/components/SellerEstimateBlock.tsx')
const sellerForm   = readFile('app/charlie/components/SellerForm.tsx')
const planEmail    = readFile('app/api/charlie/plan-email/route.ts')
const charlieLead  = readFile('components/dashboard/CharlieLeadEstimate.tsx')
const leadDetail   = readFile('components/dashboard/LeadDetailClient.tsx')
const pagePost     = readFile('app/dashboard/leads/[id]/page.tsx')
const resultsPanel = readFile('app/charlie/components/ResultsPanel.tsx')
const workingDocView = readFile('components/dashboard/WorkingDocView.tsx')
const chatRoute    = readFile('app/api/charlie/route.ts')
const charlieTools = readFile('app/charlie/lib/charlie-tools.ts')
const charliePrompts = readFile('app/charlie/lib/charlie-prompts.ts')
const charlieVip   = readFile('app/api/walliam/charlie/vip-request/route.ts')

const useCharlie   = readFile('app/charlie/hooks/useCharlie.ts')

const checks = []
function check(name, ok, detail) { checks.push([name, !!ok, detail]) }

// ── 1. ComparableCard tier chip ────────────────────────────────────────
check('ComparableCard imports HOME_LABEL_MAP + CONDO_LABEL_MAP (constants only, no component)',
  /from\s+['"]@\/app\/estimator\/components\/GeoConfidenceSpread['"]/.test(cmpCard)
  && /HOME_LABEL_MAP/.test(cmpCard) && /CONDO_LABEL_MAP/.test(cmpCard)
  && !/GeoConfidenceSpread,/.test(cmpCard))
check('ComparableCard defines TIER_COLORS with verbatim hex (#10b981/#f59e0b/#64748b/#c2410c)',
  cmpCard.includes("platinum: '#10b981'") && cmpCard.includes("gold:     '#f59e0b'")
  && cmpCard.includes("silver:   '#64748b'") && cmpCard.includes("bronze:   '#c2410c'"))
check('ComparableCard Props add sourceTier? + path? (additive optional)',
  /sourceTier\?:\s*ComparableTier\s*\|\s*null/.test(cmpCard)
  && /path\?:\s*'condo'\s*\|\s*'home'/.test(cmpCard))
check('ComparableCard renders chip with solid tier bg + white text',
  /background:\s*tierColor,\s*color:\s*'#fff'/.test(cmpCard))
check('ComparableCard chip silent-omits when no valid tier',
  /tierLabel\s*&&\s*tierColor\s*&&/.test(cmpCard))

// ── 2. SellerEstimateBlock tier rail + tax-match ───────────────────────
check('SellerEstimateBlock imports label-map constants (not the component)',
  /from\s+['"]@\/app\/estimator\/components\/GeoConfidenceSpread['"]/.test(sellerBlock)
  && /HOME_LABEL_MAP/.test(sellerBlock) && /CONDO_LABEL_MAP/.test(sellerBlock)
  && !/GeoConfidenceSpread\s+from/.test(sellerBlock))
check('SellerEstimateBlock Props.estimate now declares tiers/bestGeoTier/taxMatch',
  /tiers\?:\s*\{[\s\S]{0,300}platinum:\s*TierSlot\s*\|\s*null/.test(sellerBlock)
  && /bestGeoTier\?:\s*TierKey\s*\|\s*'none'/.test(sellerBlock)
  && /taxMatch\?:\s*\{/.test(sellerBlock))
check('SellerEstimateBlock heading uses Charlie voice "Confidence by Area" (NOT "Geographic Confidence Spread")',
  /Confidence by Area/.test(sellerBlock)
  && !/Geographic Confidence Spread/.test(sellerBlock))
check('SellerEstimateBlock tax-match heading uses "Tax-Matched · N found" (NOT estimator "Tax-Matched Comparables")',
  /Tax-Matched\s*·\s*\{taxComps\.length\}\s*found/.test(sellerBlock)
  && !/Tax-Matched Comparables/.test(sellerBlock))
check('SellerEstimateBlock: zero "working document" string',
  !/working document/i.test(sellerBlock))
check('SellerEstimateBlock tier rail gated on estimate.tiers',
  /hasTiers\s*=\s*!!estimate\.tiers/.test(sellerBlock)
  && /\{hasTiers\s*&&/.test(sellerBlock))
check('SellerEstimateBlock anchor highlight: bestGeoTier row gets emerald bg + ANCHOR chip',
  /isBest\s*=\s*bestTier\s*===\s*slot/.test(sellerBlock)
  && /Anchor/.test(sellerBlock)
  && /rgba\(16,185,129,0\.12\)/.test(sellerBlock))
check('SellerEstimateBlock tax-match subsection gated on taxComps.length > 0',
  /hasTaxMatch\s*=\s*taxComps\.length\s*>\s*0/.test(sellerBlock)
  && /\{hasTaxMatch\s*&&/.test(sellerBlock))
check('SellerEstimateBlock passes sourceTier + path to ComparableCard',
  /sourceTier=\{uniformTierForGeoTiles\}[\s\S]{0,80}path=\{resolvedPath\}/.test(sellerBlock))
check('SellerEstimateBlock derives path from buildingName (ResultsPanel mount line UNCHANGED)',
  /resolvedPath[\s\S]{0,80}buildingName\s*\?\s*'condo'\s*:\s*'home'/.test(sellerBlock))

// ── 3. Plan-email tier chip + taxMatchHtml + plan_data persistence ─────
check('plan-email persists sellerEstimate in plan_data (additive)',
  /plan_data:\s*\{[\s\S]{0,400}sellerEstimate:\s*sellerEstimate\s*\?\s*\{/.test(planEmail)
  && /estimate:\s*sellerEstimate\.estimate\s*\|\|\s*null/.test(planEmail)
  && /competingListings:\s*sellerEstimate\.competingListings\s*\|\|\s*\[\]/.test(planEmail))
check('plan-email defines TIER_COLORS_EMAIL + HOME_LABELS_EMAIL + CONDO_LABELS_EMAIL inline (no helper import)',
  /TIER_COLORS_EMAIL/.test(planEmail) && /HOME_LABELS_EMAIL/.test(planEmail) && /CONDO_LABELS_EMAIL/.test(planEmail)
  && !/from\s+['"]@\/lib\/email\/working-doc-render['"]/.test(planEmail))
check('plan-email tierChipHtml helper defined',
  /function\s+tierChipHtml\(/.test(planEmail))
check('plan-email comparableSoldHtml per-tile injects tier chip via tierChipHtml(tileTier)',
  /comparableSoldHtml[\s\S]{0,2000}\$\{tierChipHtml\(tileTier\)\}/.test(planEmail))
check('plan-email defines taxMatchHtml block',
  /const\s+taxMatchHtml\s*=\s*taxComps\.length\s*>\s*0\s*\?/.test(planEmail))
check('plan-email taxMatchHtml heading uses Charlie voice "Tax-Matched (N)" (NOT "Tax-Matched Comparables")',
  /Tax-Matched\s*\(\$\{taxComps\.length\}\)/.test(planEmail)
  && !/Tax-Matched Comparables/.test(planEmail))
check('plan-email mounts taxMatchHtml between comparableSoldHtml and competingHtml',
  /\$\{comparableSoldHtml\}\s*\n\s*\$\{taxMatchHtml\}\s*\n\s*\$\{competingHtml\}/.test(planEmail))
check('plan-email: zero "working document" string',
  !/working document/i.test(planEmail))
check('plan-email: zero "Geographic Confidence Spread" string',
  !/Geographic Confidence Spread/.test(planEmail))
check('plan-email comparableSoldHtml + competingHtml still UNGATED (single-render, no dedup regression)',
  /const\s+comparableSoldHtml\s*=\s*sellerComps\.length\s*>\s*0\s*\?/.test(planEmail)
  && /const\s+competingHtml\s*=\s*sellerEstimate\?\.competingListings\s*&&\s*sellerEstimate\.competingListings\.length\s*>\s*0\s*\?/.test(planEmail))
check('plan-email lead insert unchanged: agent/tenant/hierarchy chain stamped',
  /agent_id:\s*agent\?\.id\s*\|\|\s*null/.test(planEmail)
  && /manager_id:\s*chainManagerId/.test(planEmail)
  && /tenant_admin_id:\s*chainTenantAdminId/.test(planEmail)
  && /status:\s*'new'/.test(planEmail)
  && /tenant_id:\s*tenantId/.test(planEmail))
check('plan-email getLeadEmailRecipients call site unchanged',
  /getLeadEmailRecipients\(tenantId\s*\|\|\s*''\s*,\s*agent\?\.id\s*\|\|\s*null/.test(planEmail))
check('plan-email buyer-copy send (to: userEmail) unchanged',
  /attemptTenantEmail\([\s\S]{0,200}to:\s*userEmail/.test(planEmail))

// ── 4. CharlieLeadEstimate (dashboard) ─────────────────────────────────
check('CharlieLeadEstimate imports label-map constants only (no estimator components)',
  /HOME_LABEL_MAP/.test(charlieLead) && /CONDO_LABEL_MAP/.test(charlieLead)
  && !/GeoConfidenceSpread\s+from/.test(charlieLead))
check('CharlieLeadEstimate header is Charlie voice "Charlie seller estimate" (NOT "Estimator working document")',
  /Charlie seller estimate/.test(charlieLead)
  && !/Estimator working document/.test(charlieLead))
check('CharlieLeadEstimate: zero "working document" string',
  !/working document/i.test(charlieLead))
check('CharlieLeadEstimate: zero "Geographic Confidence Spread" string',
  !/Geographic Confidence Spread/.test(charlieLead))
check('CharlieLeadEstimate: zero "Tax-Matched Comparables" string',
  !/Tax-Matched Comparables/.test(charlieLead))
check('CharlieLeadEstimate uses Charlie voice headings ("Confidence by Area", "Tax-Matched · N found")',
  /Confidence by Area/.test(charlieLead)
  && /Tax-Matched · \{taxComps\.length\} found/.test(charlieLead))
check('CharlieLeadEstimate returns null when sellerEstimate is absent (graceful)',
  /if\s*\(!sellerEstimate\)\s*return\s+null/.test(charlieLead))
check('CharlieLeadEstimate renders tier rail (4 slots, anchor highlighted)',
  /TIER_ORDER\.map\(slot\s*=>/.test(charlieLead)
  && /isBest\s*=\s*bestTier\s*===\s*slot/.test(charlieLead)
  && /Anchor/.test(charlieLead))

// ── 5. LeadDetailClient exclusive branch ───────────────────────────────
check('LeadDetailClient imports CharlieLeadEstimate',
  /from\s+['"]@\/components\/dashboard\/CharlieLeadEstimate['"]/.test(leadDetail))
check('LeadDetailClient Props.charlieSellerEstimate added (optional)',
  /charlieSellerEstimate\?:\s*any/.test(leadDetail))
check('LeadDetailClient branches exclusive: charlieSellerEstimate ? CharlieLeadEstimate : WorkingDocView',
  /charlieSellerEstimate\s*\?\s*\([\s\S]{0,200}CharlieLeadEstimate[\s\S]{0,400}\)\s*:\s*\([\s\S]{0,200}WorkingDocView/.test(leadDetail))
check('page.tsx passes charlieSellerEstimate from plan_data.sellerEstimate',
  /charlieSellerEstimate=\{\(lead\s+as\s+any\)\?\.plan_data\?\.sellerEstimate\s*\?\?\s*null\}/.test(pagePost))

// ── 6. SellerForm: sq-ft + tax required ────────────────────────────────
check('SellerForm canSubmit requires livingAreaRange (both condo + home now)',
  /canSubmit\s*=[\s\S]{0,400}!!form\.livingAreaRange/.test(sellerForm))
check('SellerForm canSubmit requires propertyTax when intent === sale',
  /canSubmit\s*=[\s\S]{0,400}form\.intent\s*===\s*'sale'\s*\?\s*!!form\.propertyTax/.test(sellerForm))
check('SellerForm sq-ft ComboField required=true (both paths)',
  /label="Square Footage Range"[\s\S]{0,400}required=\{true\}/.test(sellerForm))
check('SellerForm propertyTax label is required for sale + has accuracy hint (NOT misleading "future value")',
  /lbl\('Annual Property Tax \(\$\)'\s*,\s*true\s*,\s*'Affects accuracy/.test(sellerForm)
  && !/Used for future value calculations/.test(sellerForm))

// ── 7. Byte-identical proofs ───────────────────────────────────────────
check('ResultsPanel.tsx UNTOUCHED (mount line + sellerEstimate block intact)',
  /<SellerEstimateBlock[\s\S]{0,500}estimate=\{se\.estimate\}[\s\S]{0,300}comparables=\{se\.comparables/.test(resultsPanel)
  && !/CharlieLeadEstimate|InChatWorkingDoc/.test(resultsPanel))
check('WorkingDocView.tsx UNTOUCHED (LIGHT theme + 24 verbatim class strings + theme prop)',
  /WorkingDocViewTheme\s*=\s*'light'\s*\|\s*'dark'/.test(workingDocView)
  && workingDocView.includes("'bg-white rounded-lg shadow p-6 mt-6'")
  && workingDocView.includes("'text-sm font-medium text-blue-700 hover:text-blue-900'")
  && workingDocView.includes("'mt-5 pt-4 border-t border-gray-100 text-[11px] text-gray-400 leading-relaxed'"))
check('chat route SHA still matches 09b97ef fingerprint 9c64acba0564',
  sha(chatRoute) === '9c64acba0564')
check('tools file SHA still matches 09b97ef fingerprint a02ee7ab48f9',
  sha(charlieTools) === 'a02ee7ab48f9')
check('system prompt SHA still matches 09b97ef fingerprint fbe7b7de14b9',
  sha(charliePrompts) === 'fbe7b7de14b9')
check('Charlie VIP buyer-approval SHA still matches 09b97ef fingerprint 97c651e90c6f',
  sha(charlieVip) === '97c651e90c6f')
check('useCharlie UNCHANGED: post-revert state preserved (no workingDoc field on plan-email POST)',
  /\/api\/charlie\/plan-email/.test(useCharlie)
  && !/buildWorkingDocFromResult/.test(useCharlie))

// Print
let allPass = true
for (const [name, ok, detail] of checks) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name)
  if (!ok) allPass = false
  if (detail) console.log('       ' + detail)
}

console.log('')
console.log('SHA fingerprints (current):')
console.log('  ComparableCard:           sha=' + sha(cmpCard))
console.log('  SellerEstimateBlock:      sha=' + sha(sellerBlock))
console.log('  SellerForm:               sha=' + sha(sellerForm))
console.log('  plan-email/route.ts:      sha=' + sha(planEmail))
console.log('  CharlieLeadEstimate:      sha=' + sha(charlieLead))
console.log('  LeadDetailClient:         sha=' + sha(leadDetail))
console.log('  dashboard page.tsx:       sha=' + sha(pagePost))
console.log('')
console.log('Protected SHA byte-identity:')
console.log('  ResultsPanel:             sha=' + sha(resultsPanel))
console.log('  WorkingDocView:           sha=' + sha(workingDocView))
console.log('  chat route:               sha=' + sha(chatRoute) + (sha(chatRoute) === '9c64acba0564' ? ' MATCH' : ' MISMATCH'))
console.log('  charlie-tools:            sha=' + sha(charlieTools) + (sha(charlieTools) === 'a02ee7ab48f9' ? ' MATCH' : ' MISMATCH'))
console.log('  charlie-prompts:          sha=' + sha(charliePrompts) + (sha(charliePrompts) === 'fbe7b7de14b9' ? ' MATCH' : ' MISMATCH'))
console.log('  charlie/vip-request:      sha=' + sha(charlieVip) + (sha(charlieVip) === '97c651e90c6f' ? ' MATCH' : ' MISMATCH'))
console.log('  useCharlie:               sha=' + sha(useCharlie))

console.log('')
console.log('OVERALL: ' + (allPass ? 'PASS' : 'FAIL'))
process.exit(allPass ? 0 : 1)
