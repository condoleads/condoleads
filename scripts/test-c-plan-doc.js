// Quick inline checks
const fs = require('fs')
const path = require('path')

const useCharlie = fs.readFileSync(path.resolve(__dirname, '..', 'app/charlie/hooks/useCharlie.ts'), 'utf8')
const planEmail = fs.readFileSync(path.resolve(__dirname, '..', 'app/api/charlie/plan-email/route.ts'), 'utf8')
const chatRoute = fs.readFileSync(path.resolve(__dirname, '..', 'app/api/charlie/route.ts'), 'utf8')
const charlieVip = fs.readFileSync(path.resolve(__dirname, '..', 'app/api/walliam/charlie/vip-request/route.ts'), 'utf8')

const checks = [
  ['useCharlie imports buildWorkingDocFromResult', /from\s+['"]@\/lib\/email\/working-doc-render['"]/.test(useCharlie) && /buildWorkingDocFromResult/.test(useCharlie)],
  ['useCharlie shapes workingDoc + threads', /buildWorkingDocFromResult\s*\(\s*\{/.test(useCharlie)],
  ['useCharlie maps path home/condo', /se\.path\s*===\s*['"]home['"]\s*\?\s*['"]home['"]\s*:\s*['"]condo['"]/.test(useCharlie)],
  ['plan-email imports working-doc-render helpers', /from\s+['"]@\/lib\/email\/working-doc-render['"]/.test(planEmail)],
  ['plan-email imports all 4 helpers', /resolveListingIds/.test(planEmail) && /collectListingKeys/.test(planEmail) && /renderEstimateHeader/.test(planEmail) && /renderWorkingDocSections/.test(planEmail)],
  ['plan-email destructures workingDoc from POST body', /,\s*workingDoc\s*\}\s*=\s*await\s+req\.json\(\)/.test(planEmail)],
  ['plan-email resolves listing ids', /resolveListingIds\(\s*supabase\s*,\s*collectListingKeys\(/.test(planEmail)],
  ['plan-email renders header+sections via shared helper', /renderEstimateHeader\([^)]+\)\s*\+\s*renderWorkingDocSections/.test(planEmail)],
  ['plan-email splices workingDocHtml into body', planEmail.includes('${workingDocHtml}')],
  ['plan-email audience=buyer', /audience:\s*['"]buyer['"]/.test(planEmail)],
  ['plan-email backwards-compat (absent→empty)', /workingDoc\s*\?\s*[\s\S]+?:\s*['"]['"]/.test(planEmail)],
  ['plan-email does NOT call estimator increment', !/\/api\/walliam\/estimator\/increment/.test(planEmail)],
  ['plan-email still inserts lead', /\.from\(['"]leads['"]\)/.test(planEmail) && /\.insert\(/.test(planEmail)],
  ['plan-email still logs plan_generated activity', /plan_generated/.test(planEmail)],
  ['plan-email still uses getLeadEmailRecipients (6-layer)', /getLeadEmailRecipients/.test(planEmail)],
  ['plan-email still uses attemptTenantEmail (F-EMAIL-CALLER)', /attemptTenantEmail/.test(planEmail)],
  ['Chat stream: generate_plan stub intact', /if\s*\(\s*name\s*===\s*['"]generate_plan['"]/.test(chatRoute) && /planReady:\s*true/.test(chatRoute)],
  ['Chat stream: NO matcher calls (still stub)', !/estimateCondoSale|estimateHomeSale|findCondoComparablesSales|findHomeComparables/.test(chatRoute)],
  ['Charlie VIP buyer builder UNTOUCHED (no working-doc import)', /buildUserApprovalEmailHtml/.test(charlieVip) && !/from\s+['"]@\/lib\/email\/working-doc-render['"]/.test(charlieVip)],
]

let allPass = true
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name)
  if (!ok) allPass = false
}
console.log('')
console.log('OVERALL: ' + (allPass ? 'PASS' : 'FAIL'))
process.exit(allPass ? 0 : 1)
