const fs = require('fs')
const path = require('path')

const TRACKER = 'docs/W-LEADS-WORKBENCH-TRACKER.md'
const filePath = path.join(process.cwd(), TRACKER)
const ts = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)

fs.copyFileSync(filePath, filePath + '.backup_' + ts)
console.log('  BACKUP ' + path.basename(filePath) + ' -> ' + path.basename(filePath) + '.backup_' + ts)

let txt = fs.readFileSync(filePath, 'utf8')

function exactReplace(text, oldStr, newStr, label) {
  const idx = text.indexOf(oldStr)
  if (idx === -1) throw new Error('anchor not found: ' + label)
  if (text.indexOf(oldStr, idx + oldStr.length) !== -1) throw new Error('anchor not unique: ' + label)
  return text.replace(oldStr, newStr)
}

// 1. Version line v12 -> v13
const oldVersion = '**Version:** v12 \u2014 W4a + W3d SHIPPED \u2014 Workbench page shell at /admin-homes/leads/[id] with Overview tab + cumulative leadFamily by user_id; leads-list row click navigates to workbench'
const newVersion = '**Version:** v13 \u2014 W4b SHIPPED \u2014 Plan tab renderer at email-template richness; normalizes both planType-nested and intent-flat plan_data shapes; family-of-plans selector when >1; anchor agent join extended for AgentCard fidelity'
txt = exactReplace(txt, oldVersion, newVersion, 'version line v12 -> v13')

// 2. W4b row OPEN -> SHIPPED
const oldW4b = '| W4b | Plan tab (buyer + seller renderer) | OPEN | \u2014 | Match email richness exactly |'
const newW4b = '| W4b | Plan tab (buyer + seller renderer) | SHIPPED | 2026-05-14 | `components/admin-homes/lead-workbench/PlanRenderer.tsx` new file; normalizer handles both plan_data shapes (17 planType + 20 intent rows verified live in walliam tenant); 10 sub-sections gated on data presence (Market Intelligence, Offer Intelligence, Best Time, Subtype Breakdown, Summary, Profile, Top Listings, Source URL, Agent Card, Disclaimer); selector pill row when family has >1 plans; `page.tsx` ANCHOR_SELECT + FAMILY_SELECT agent join extended to include cell_phone, profile_photo_url, brokerage_name, title |'
txt = exactReplace(txt, oldW4b, newW4b, 'W4b row')

// 3. Append status log entry
const entry =
  '\n- **2026-05-14 W4b-SHIPPED** \u2014 Plan tab renderer shipped at email-template richness. ' +
  '`components/admin-homes/lead-workbench/PlanRenderer.tsx` new file (~558 lines). ' +
  'Default export `PlanTab({anchorLead, leadFamily})` discovers plan-bearing rows in family, renders selector pill row when >1 plans (label format: `Buyer/Seller \u00b7 Geo \u00b7 Date`, anchor marked), defaults to anchor. ' +
  'Internal `PlanRenderer({lead})` renders 10 sections all gated on data presence: dark header strip with intent emoji + geo + Condition badge (computed from analytics.sale_to_list_ratio + closed_avg_dom_90 using buildRichPlanEmail thresholds verbatim), Market Intelligence 6-metric grid (DOM/STL/Active/Sold/Absorption/Median-PSF), Offer Intelligence 3-card (Offer-At/Avg-Concession/Decide-In), Best Time seasonal block (best months / worst months / current month rank), Subtype Breakdown table (price by home type), Summary (rare; only when plan.summary persisted), Profile (buyer or seller variant -- buyer: budget/type/bedrooms/timeline; seller: type/est.value/timeline/goal), Top Listings list (matched/comparable), Source URL link, Agent Card (dark themed with photo/email/cell/title/brokerage), Disclaimer. ' +
  '`normalizePlan()` handles BOTH stored plan_data shapes verified live via SQL: 17 rows planType-nested (`plan-email/route.ts` writes `{planType, plan: {nested profile}, analytics, topListings}`); 20 rows intent-flat (`charlie/lead/route.ts` writes `{intent, geoName, geoType, geoId, budgetMin/Max OR estimatedValueMin/Max, propertyType, bedrooms, timeline, goal, analytics, topListings, generatedAt}`); 0 overlap, 0 missing-both. ' +
  '2 patches to existing files: `LeadWorkbenchClient.tsx` (import PlanTab from `@/components/admin-homes/lead-workbench/PlanRenderer`; extend tab ternary with `tab === \'plan\'` branch -- PlaceholderTab still catches W4c-g); `app/admin-homes/leads/[id]/page.tsx` ANCHOR_SELECT + FAMILY_SELECT agent join extended from `(id, full_name, email)` to `(id, full_name, email, cell_phone, profile_photo_url, brokerage_name, title)` so AgentCard renders at email-template fidelity. ' +
  '**Multi-tenant safety**: PlanTab is pure consumer of `leadFamily` prepared by `page.tsx` server fetch (already gated by `can(\'lead.read\')` + cross-tenant 404 in W4a); no new tenant-scoping concerns. ' +
  '**NEW finding F-W4B-PLAN-DATA-RENDER-SUBSET**: `comparables`, `blocks`, `sellerEstimate`, `vipCreditUsed`, `summary`, live `agent` object are API-time-only fields -- passed to email builder at send time, not persisted to plan_data JSONB; workbench cannot render them. Future workstream should either persist these into plan_data at write time OR document them as live-only fields. ' +
  '**NEW finding F-W4B-PLAN-RENDERER-DRIFT-RISK**: `PlanRenderer.tsx` (React JSX) and `buildRichPlanEmail()` in `app/api/charlie/plan-email/route.ts` (HTML string template) are independent sources for the same conceptual output; risk of drift over time. Future workstream should extract a shared `lib/plan-renderer/` consumed by both. ' +
  '**NEW finding F-W4B-LISTING-LINKS-PENDING**: top-listing rows in workbench are not click-through to live listing pages; requires tenant_domain resolution from anchor lead`s tenant_id (not currently joined in ANCHOR_SELECT). Deferred to W4 polish or future workstream. ' +
  '**NEW finding F-W4B-ANALYTICS-EMPTY-IN-PRACTICE**: both real plan_data samples inspected at W4b recon time show `analytics: {}` and `topListings: []` -- the rich rendering path is built but live data is sparse. Investigation belongs to plan-generation workstream (Charlie tool-call audit), not workbench. ' +
  'TSC --noEmit exit 0 after patch + targeted anchor-token reinsertion at three sites (chat delivery sanitization eats bare opening anchor tokens not closed on same line -- workflow note, not code issue; fix in `scripts/patch-w4b-fix-stripped-anchors.js` uses `\\u003c` + `\'a\'` runtime concat to avoid recurrence in future patches). ' +
  'NEXT: W4c Credits & Usage tab -- extract `<UserCreditPanel>` from Users page surface (Probe 2 W1-VERIFIED 5-source data bundle: user_profiles + chat_sessions + user_credit_overrides + tenants cap config + agents display names) and embed in workbench Credits tab.\n'

if (!txt.endsWith('\n')) txt += '\n'
txt += entry

fs.writeFileSync(filePath, txt, 'utf8')
console.log('  WROTE  ' + TRACKER + ' (' + txt.length + ' bytes)')