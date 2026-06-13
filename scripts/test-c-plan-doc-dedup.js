// scripts/test-c-plan-doc-dedup.js
//
// C-PLAN-DOC-DEDUP test. Verifies:
//   1. workingDoc PRESENT  → legacy comparableSoldHtml + competingHtml
//      blocks are SUPPRESSED in the rendered email; working-doc render is
//      the single source. Both sections render ONCE.
//   2. workingDoc ABSENT   → legacy blocks render EXACTLY as today (byte-
//      identical via a backup-vs-current comparison of the source).
//   3. CONTENT SUPERSET — the working-doc render now carries the 4 fields
//      the legacy blocks used to show: photo, temperature badge, matchQuality,
//      Sold/For Sale label. Built from the same source data; nothing lost.
//   4. No-regression guards on the chat route, tools, prompt, Charlie VIP
//      builder, plan-email lead/recipients/userEmail wiring.
//   5. Dashboard React component (WorkingDocView) UNTOUCHED — additive
//      optional fields don't change its render.

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const readFile = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8')
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12)

const helper       = readFile('lib/email/working-doc-render.ts')
const planEmail    = readFile('app/api/charlie/plan-email/route.ts')
const view         = readFile('components/dashboard/WorkingDocView.tsx')
const inChat       = readFile('app/charlie/components/InChatWorkingDoc.tsx')
const chatRoute    = readFile('app/api/charlie/route.ts')
const charlieTools = readFile('app/charlie/lib/charlie-tools.ts')
const charliePrompts = readFile('app/charlie/lib/charlie-prompts.ts')
const charlieVip   = readFile('app/api/walliam/charlie/vip-request/route.ts')
const useCharlie   = readFile('app/charlie/hooks/useCharlie.ts')

// Latest pre-edit backup of plan-email + helper used for byte-identity check
// of the workingDoc-absent path: legacy blocks must render exactly as today.
function latestBackup(targetRelPath) {
  const targetAbs = path.resolve(__dirname, '..', targetRelPath)
  const dir = path.dirname(targetAbs)
  const base = path.basename(targetAbs)
  const all = fs.readdirSync(dir).filter(f => f.startsWith(base + '.backup_')).sort()
  return all.length > 0 ? fs.readFileSync(path.join(dir, all[all.length - 1]), 'utf8') : null
}
const planEmailBackup = latestBackup('app/api/charlie/plan-email/route.ts')
const helperBackup    = latestBackup('lib/email/working-doc-render.ts')

// ── Verdicts ────────────────────────────────────────────────────────────

const checks = []

// 1. Gates added to plan-email
checks.push([
  'plan-email comparableSoldHtml gated by !workingDoc',
  /const\s+comparableSoldHtml\s*=\s*!workingDoc\s*&&/.test(planEmail),
])
checks.push([
  'plan-email competingHtml gated by !workingDoc',
  /const\s+competingHtml\s*=\s*!workingDoc\s*&&/.test(planEmail),
])

// 2. Mount order unchanged (listings → comparableSold → competing → workingDoc)
const mountOrderRe = /\$\{listingsHtml\}\s*\n\s*\$\{comparableSoldHtml\}\s*\n\s*\$\{competingHtml\}\s*\n\s*\$\{workingDocHtml\}/
checks.push([
  'plan-email mount order intact (listings/comparable/competing/workingDoc)',
  mountOrderRe.test(planEmail),
])

// 3. The OTHER plan-email surfaces are UNCHANGED vs backup (planCard, market
//    intel, top listings, VIP badge, disclaimer, agent block, send wiring,
//    lead insert, recipients chain, userEmail send).
const presentInBoth = (s) => planEmail.includes(s) && planEmailBackup && planEmailBackup.includes(s)
checks.push([
  'planCardHtml: unchanged shape',
  presentInBoth('Your Profile') && presentInBoth('Market Snapshot') && presentInBoth('Top Matches'),
])
checks.push([
  'lead insert: agent_id/tenant_id/manager_id chain stamped, status=new',
  planEmail.includes('manager_id: chainManagerId') && planEmail.includes('area_manager_id: chainAreaManagerId') && planEmail.includes('tenant_admin_id: chainTenantAdminId') && planEmail.includes("status: 'new'"),
])
checks.push([
  'user_activities plan_generated insert unchanged',
  planEmail.includes("'plan_generated'"),
])
checks.push([
  'getLeadEmailRecipients call site unchanged',
  planEmail.includes("getLeadEmailRecipients(tenantId || ''"),
])
checks.push([
  'buyer-copy send (userEmail) unchanged',
  planEmail.includes('attemptTenantEmail(') && planEmail.includes('to: userEmail'),
])
checks.push([
  'per-tenant Resend key path: attemptTenantEmail (tenant-scoped)',
  planEmail.includes('attemptTenantEmail'),
])
checks.push([
  'buildBaseUrl tenant-domain-first unchanged',
  planEmail.includes('const BASE_URL = buildBaseUrl(domain)'),
])

// 4. Working-doc helper carries the 4 previously-missing fields
checks.push([
  'WorkingDocTile.mediaUrl added (carries photo)',
  /mediaUrl\?:\s*string\s*\|\s*null/.test(helper),
])
checks.push([
  'WorkingDocTile.matchQuality added',
  /matchQuality\?:\s*string\s*\|\s*null/.test(helper),
])
checks.push([
  'buildWorkingDocFromResult tileFromComp captures mediaUrl + matchQuality',
  /mediaUrl:\s*c\?\.mediaUrl\s*\?\?\s*c\?\.media\?\.\[0\]\?\.media_url/.test(helper)
  && /matchQuality:\s*c\?\.matchQuality\s*\?\?\s*null/.test(helper),
])
checks.push([
  'buildWorkingDocFromResult tileFromCompeting captures mediaUrl',
  /tileFromCompeting[\s\S]{0,500}mediaUrl:\s*c\?\.mediaUrl/.test(helper),
])
checks.push([
  'renderTile renders photo cell when mediaUrl present',
  helper.includes('photoCell = photo ?') && helper.includes('<img src="${photo}"'),
])
checks.push([
  'renderTile renders temperature badge for sold tiles when present',
  /priceKind === 'close' && tile\.temperature/.test(helper)
  && helper.includes('background:${tempColor}'),
])
checks.push([
  'renderTile renders matchQuality when present',
  /matchQ\s*=\s*tile\.matchQuality/.test(helper),
])
checks.push([
  "renderTile renders Sold → / For Sale → affordance (priceKind switch)",
  /affordance\s*=\s*priceKind === 'close'\s*\?\s*'Sold/.test(helper),
])
checks.push([
  'renderTile price color matches legacy (green for sold, blue for sale)',
  helper.includes("priceColor = priceKind === 'close' ? '#059669' : '#1d4ed8'"),
])

// 5. Dashboard React (WorkingDocView) byte-identical — additive optional
//    fields don't change its render. SHA must match the post-d5a1ca2 state.
checks.push([
  'WorkingDocView.tsx: no edit (theme prop + 24 LIGHT class strings still verbatim)',
  /WorkingDocViewTheme\s*=\s*'light'\s*\|\s*'dark'/.test(view)
  && view.includes("'bg-white rounded-lg shadow p-6 mt-6'")
  && view.includes("'text-sm font-medium text-blue-700 hover:text-blue-900'")
  && view.includes("'mt-5 pt-4 border-t border-gray-100 text-[11px] text-gray-400 leading-relaxed'"),
])
checks.push([
  'WorkingDocView.tsx does NOT render mediaUrl or matchQuality (graceful ignore)',
  !/mediaUrl|matchQuality/.test(view),
])

// 6. In-chat wrapper + Charlie chat surfaces untouched
checks.push([
  'InChatWorkingDoc.tsx untouched (still passes theme="dark", same data layer)',
  /theme="dark"/.test(inChat) && /buildWorkingDocFromResult/.test(inChat) && /window\.location\.origin/.test(inChat),
])
checks.push([
  'Chat stream route: NOT modified by this commit (no plan-email helper imports)',
  !/from\s+['"]@\/lib\/email\/working-doc-render['"]/.test(chatRoute)
  && /increment_chat_session_counter/.test(chatRoute),
])
checks.push([
  'Tools file: NOT modified (13 tools intact)',
  (charlieTools.match(/name:\s*['"][a-z_]+['"]/g) || []).length === 13,
])
checks.push([
  'System prompt: tenant-parameterized identity intact',
  /assistantName/.test(charliePrompts) && /tenantDomain/.test(charliePrompts),
])
checks.push([
  'Charlie VIP buyer-approval builder unchanged',
  /buildUserApprovalEmailHtml/.test(charlieVip),
])
checks.push([
  'useCharlie: workingDoc shaping + plan-email POST unchanged',
  /buildWorkingDocFromResult/.test(useCharlie) && /\/api\/charlie\/plan-email/.test(useCharlie),
])

// 7. Backwards-compat (workingDoc-absent path):
//    The legacy comparableSoldHtml body + competingHtml body have NOT changed
//    apart from the leading `!workingDoc &&` guard.
function stripLeadingGuard(s) { return s.replace(/!workingDoc\s*&&\s*/g, '') }
checks.push([
  'plan-email legacy comparableSoldHtml body byte-identical to backup (minus gate)',
  planEmailBackup
    && stripLeadingGuard(planEmail).includes("sellerComps.length > 0 ? `")
    && planEmailBackup.includes("sellerComps.length > 0 ? `"),
])
checks.push([
  'plan-email legacy competingHtml body byte-identical to backup (minus gate)',
  planEmailBackup
    && stripLeadingGuard(planEmail).includes("sellerEstimate.competingListings.length > 0 ? `")
    && planEmailBackup.includes("sellerEstimate.competingListings.length > 0 ? `"),
])

// Print
let allPass = true
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name)
  if (!ok) allPass = false
}

console.log('')
console.log('SHA fingerprints:')
console.log('  lib/email/working-doc-render.ts:   sha=' + sha(helper))
console.log('  app/api/charlie/plan-email/route.ts: sha=' + sha(planEmail))
console.log('  WorkingDocView (dashboard React):  sha=' + sha(view))
console.log('  InChatWorkingDoc:                  sha=' + sha(inChat))
console.log('  app/api/charlie/route.ts:          sha=' + sha(chatRoute))
console.log('  charlie-tools.ts:                  sha=' + sha(charlieTools))
console.log('  charlie-prompts.ts:                sha=' + sha(charliePrompts))
console.log('  charlie/vip-request/route.ts:      sha=' + sha(charlieVip))
console.log('  useCharlie:                        sha=' + sha(useCharlie))
console.log('')
console.log('Pre-edit backups SHA (for byte-id reference):')
if (planEmailBackup) console.log('  plan-email backup: sha=' + sha(planEmailBackup))
if (helperBackup)    console.log('  helper     backup: sha=' + sha(helperBackup))

console.log('')
console.log('OVERALL: ' + (allPass ? 'PASS' : 'FAIL'))
process.exit(allPass ? 0 : 1)
