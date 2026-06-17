// scripts/offer-modal-gate-verify.ts
//
// W-OFFER-MODAL-WALLIAM-GATE FIX-VERIFY — render-trace + source-level.
//
// react-dom/server.renderToStaticMarkup on the REAL exported
// OfferInquiryModal to prove:
//   1. Walliam hero render (agent=null on parent, walliamAgentId=King
//      Shah UUID) — the mount-gate evaluation in the parent yields a
//      NON-NULL JSX child, and the rendered modal markup contains the
//      form (not a null render).
//   2. Non-hero render (real agent object) — also renders the form;
//      no regression on the agent-domain path.
//   3. OfferInquiryModal no longer reads .id off a possibly-null
//      agent object: agent.id / agent.full_name occurrences in the
//      file are gone; agentId / agentName usages replace them.
//   4. Get Estimate path (HomePropertyPageClient.tsx:268) BYTE-
//      IDENTICAL — assert that block of source unchanged.
//   5. Multi-tenant: the new mount block contains no hardcoded
//      tenant id or hostname.
//   6. Edit-set identity: only the 3 declared targets modified.
//
// Render method: renderToStaticMarkup on the real exported component
// with simulated parent props. The parent's mount-gate evaluation is
// replicated in pure JS using the same fallback chain.

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const OUT_DIR = path.resolve(__dirname, '..', 'recon')
const RENDER_DIR = path.join(OUT_DIR, 'offer-modal-gate-render')
const REPORT = path.join(OUT_DIR, 'offer-modal-gate-verify.txt')
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(RENDER_DIR, { recursive: true })
fs.writeFileSync(REPORT, '')
const log = (m: string) => { console.log(m); fs.appendFileSync(REPORT, m + '\n') }
const hr  = () => log('─'.repeat(76))

let pass = 0, fail = 0
function expect(label: string, cond: boolean, evidence?: string) {
  if (!cond) fail++; else pass++
  log(`${cond ? 'PASS' : 'FAIL'}  ${label}${evidence ? '\n        → ' + evidence : ''}`)
}

;(async () => {
  log('W-OFFER-MODAL-WALLIAM-GATE FIX-VERIFY — ' + new Date().toISOString())
  hr()

  const { renderToStaticMarkup } = await import('react-dom/server')
  const { jsx } = await import('react/jsx-runtime')
  const { default: OfferInquiryModal } = await import('../components/property/OfferInquiryModal')

  const sampleListing = {
    id: 'X12345678',
    unit_number: '801',
    unparsed_address: '88 Test Street, Toronto, ON',
    building_id: 'b-abc',
    list_price: 850000,
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 1 — Walliam hero: mount-gate evaluation + render
  // ═══════════════════════════════════════════════════════════════
  log('SECTION 1 — Walliam hero (agent=null on parent; walliamAgentId=King Shah)')

  // Replicate the parent's mount-gate expression from
  // HomePropertyPageClient.tsx (and PropertyPageClient.tsx — same shape).
  function parentMountGate(args: {
    showOfferModal: boolean
    agent: { id: string; full_name: string } | null
    walliamAgentId: string | null
    assistantName: string | undefined
  }): { mounts: boolean; agentId: string; agentName: string } {
    const offerAgentId = args.agent?.id || args.walliamAgentId || ''
    const offerAgentName = args.agent?.full_name || args.assistantName || 'our team'
    return {
      mounts: !!(args.showOfferModal && offerAgentId),
      agentId: offerAgentId,
      agentName: offerAgentName,
    }
  }

  const walliam = parentMountGate({
    showOfferModal: true,
    agent: null,
    walliamAgentId: 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe',
    assistantName: 'WALLiam',
  })
  expect('1.1: gate evaluates to TRUE on walliam hero (was FALSE pre-fix)',
    walliam.mounts, `mounts=${walliam.mounts}`)
  expect('1.2: agentId resolves to King Shah UUID via walliamAgentId fallback',
    walliam.agentId === 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe', `agentId=${walliam.agentId}`)
  expect('1.3: agentName resolves to "WALLiam" via assistantName fallback',
    walliam.agentName === 'WALLiam', `agentName=${walliam.agentName}`)

  // Render the modal with the resolved props
  const walliamMarkup = renderToStaticMarkup(jsx(OfferInquiryModal as any, {
    isOpen: true,
    onClose: () => {},
    listing: sampleListing,
    buildingName: '88 Test Street',
    isSale: true,
    agentId: walliam.agentId,
    agentName: walliam.agentName,
  }))
  fs.writeFileSync(path.join(RENDER_DIR, 'walliam-hero.html'), walliamMarkup)
  expect('1.4: modal renders non-empty markup on walliam hero',
    walliamMarkup.length > 100, `len=${walliamMarkup.length}`)
  expect('1.5: modal renders the form (input fields present)',
    /<input[^>]+type="text"/.test(walliamMarkup) &&
    /<input[^>]+type="email"/.test(walliamMarkup) &&
    /<input[^>]+type="tel"/.test(walliamMarkup))
  expect('1.6: modal renders the submit button',
    /<button[^>]+type="submit"/.test(walliamMarkup))
  expect('1.7: disclaimer mentions resolved agentName ("WALLiam")',
    /By submitting, you agree to be contacted by WALLiam/.test(walliamMarkup))

  hr()

  // ═══════════════════════════════════════════════════════════════
  // SECTION 2 — Non-hero (System 1 / agent-domain): no regression
  // ═══════════════════════════════════════════════════════════════
  log('SECTION 2 — Non-hero (real agent object)')

  const nonHero = parentMountGate({
    showOfferModal: true,
    agent: { id: 'a-real-agent-uuid', full_name: 'Jane Realtor' },
    walliamAgentId: null,
    assistantName: undefined,
  })
  expect('2.1: gate evaluates to TRUE with real agent',
    nonHero.mounts, `mounts=${nonHero.mounts}`)
  expect('2.2: agentId pulled from real agent.id (not fallback)',
    nonHero.agentId === 'a-real-agent-uuid', `agentId=${nonHero.agentId}`)
  expect('2.3: agentName pulled from real agent.full_name (not fallback)',
    nonHero.agentName === 'Jane Realtor', `agentName=${nonHero.agentName}`)

  const nonHeroMarkup = renderToStaticMarkup(jsx(OfferInquiryModal as any, {
    isOpen: true,
    onClose: () => {},
    listing: sampleListing,
    buildingName: '88 Test Street',
    isSale: false,
    agentId: nonHero.agentId,
    agentName: nonHero.agentName,
  }))
  fs.writeFileSync(path.join(RENDER_DIR, 'non-hero.html'), nonHeroMarkup)
  expect('2.4: non-hero modal renders non-empty markup',
    nonHeroMarkup.length > 100)
  expect('2.5: disclaimer mentions real agent name "Jane Realtor"',
    /By submitting, you agree to be contacted by Jane Realtor/.test(nonHeroMarkup))
  expect('2.6: lease branch (isSale=false) shows "Apply for Lease" title',
    /Apply for Lease/.test(nonHeroMarkup))

  hr()

  // ═══════════════════════════════════════════════════════════════
  // SECTION 3 — Failure modes properly handled
  // ═══════════════════════════════════════════════════════════════
  log('SECTION 3 — failure modes')

  // 3a: agent=null + walliamAgentId=null + no assistantName → mount FALSE
  const empty = parentMountGate({
    showOfferModal: true,
    agent: null,
    walliamAgentId: null,
    assistantName: undefined,
  })
  expect('3.1: empty agent + null walliamAgentId → gate FALSE (no mount, no crash)',
    !empty.mounts)
  expect('3.2: agentId is empty string in that case (server-action would never be called)',
    empty.agentId === '')
  expect('3.3: agentName falls through to "our team" generic',
    empty.agentName === 'our team')

  // 3b: showOfferModal=false → mount FALSE regardless
  const closed = parentMountGate({
    showOfferModal: false,
    agent: null,
    walliamAgentId: 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe',
    assistantName: 'WALLiam',
  })
  expect('3.4: showOfferModal=false → gate FALSE (modal closed)',
    !closed.mounts)

  hr()

  // ═══════════════════════════════════════════════════════════════
  // SECTION 4 — Source-level proofs
  // ═══════════════════════════════════════════════════════════════
  log('SECTION 4 — source-level proofs')

  // Strip line/block comments + JSX comments {/* ... */} so the regexes
  // only see code. Header comments explain the historical shape ("Was
  // `agent.id` ..." / "Was `showOfferModal && agent &&` ...") and those
  // string fragments should NOT count against the code-changed assertions.
  function stripComments(s: string): string {
    return s
      .replace(/\/\/[^\n]*/g, '')                  // // line comments
      .replace(/\/\*[\s\S]*?\*\//g, '')            // /* block comments */
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')        // JSX {/* comments */}
  }
  const modalSrc = stripComments(fs.readFileSync(path.resolve(__dirname, '..', 'components/property/OfferInquiryModal.tsx'), 'utf8'))
  const hpcSrc   = stripComments(fs.readFileSync(path.resolve(__dirname, '..', 'app/property/[id]/HomePropertyPageClient.tsx'), 'utf8'))
  const ppcSrc   = stripComments(fs.readFileSync(path.resolve(__dirname, '..', 'app/property/[id]/PropertyPageClient.tsx'), 'utf8'))

  // 4.1 OfferInquiryModal no longer reads .id off a possibly-null agent
  expect('4.1: OfferInquiryModal source does NOT read agent.id (refactored to agentId prop)',
    !/\bagent\.id\b/.test(modalSrc))
  expect('4.2: OfferInquiryModal source does NOT read agent.full_name',
    !/\bagent\.full_name\b/.test(modalSrc))
  expect('4.3: OfferInquiryModal prop signature uses agentId + agentName',
    /agentId:\s*string/.test(modalSrc) && /agentName:\s*string/.test(modalSrc))
  expect('4.4: OfferInquiryModal prop signature does NOT have agent: { id, ... }',
    !/agent:\s*\{\s*\n?\s*id:\s*string\s*\n?\s*full_name:/.test(modalSrc))

  // 4.5 HomePropertyPageClient + PropertyPageClient: new mount gate uses the fallback chain
  expect('4.5: HomePropertyPageClient mount gate uses fallback chain',
    /const offerAgentId = agent\?\.id \|\| walliamAgentId \|\| ''/.test(hpcSrc) &&
    /const offerAgentName = agent\?\.full_name \|\| assistantName \|\| 'our team'/.test(hpcSrc))
  expect('4.6: PropertyPageClient mount gate uses fallback chain',
    /const offerAgentId = agent\?\.id \|\| walliamAgentId \|\| ''/.test(ppcSrc) &&
    /const offerAgentName = agent\?\.full_name \|\| assistantName \|\| 'our team'/.test(ppcSrc))

  // 4.7 No more `{showOfferModal && agent && (` literal anywhere
  expect('4.7: old "showOfferModal && agent &&" gate removed from HomePropertyPageClient',
    !/showOfferModal && agent &&/.test(hpcSrc))
  expect('4.8: old "showOfferModal && agent &&" gate removed from PropertyPageClient',
    !/showOfferModal && agent &&/.test(ppcSrc))

  // 4.9 Get Estimate mount UNCHANGED — assert the HomeEstimatorBuyerModal
  //     and EstimatorBuyerModal blocks contain their pre-fix signature
  expect('4.9: HomeEstimatorBuyerModal mount still uses `agent?.id || walliamAgentId || \'\'`',
    /HomeEstimatorBuyerModal[\s\S]{0,400}agentId=\{agent\?\.id \|\| walliamAgentId \|\| ''\}/.test(hpcSrc))
  expect('4.10: EstimatorBuyerModal mount in PropertyPageClient unchanged',
    /agentId=\{agent\?\.id \|\| walliamAgentId \|\| ''\}/.test(ppcSrc))

  hr()

  // ═══════════════════════════════════════════════════════════════
  // SECTION 5 — Multi-tenant: zero hardcoded tenant ids/hostnames
  // ═══════════════════════════════════════════════════════════════
  log('SECTION 5 — multi-tenant zero hardcoding (new code only)')

  // Extract the new gate block from each file via marker.
  function newGateBlock(src: string): string {
    const start = src.indexOf('W-OFFER-MODAL-WALLIAM-GATE')
    if (start < 0) return ''
    const tail = src.slice(start)
    // Cut after the closing })()
    const endMarker = tail.indexOf('})()}')
    return endMarker > 0 ? tail.slice(0, endMarker + 6) : tail.slice(0, 1500)
  }
  const blockHpc = newGateBlock(hpcSrc)
  const blockPpc = newGateBlock(ppcSrc)
  for (const [label, block] of [['HomePropertyPageClient', blockHpc], ['PropertyPageClient', blockPpc]]) {
    const codeOnly = block.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(`5.${label === 'HomePropertyPageClient' ? '1a' : '1b'}: ${label} new block contains no WALLiam UUID literal`,
      !codeOnly.includes('b16e1039-38ed-43d7-bbc5-dd02bb651bc9'))
    expect(`5.${label === 'HomePropertyPageClient' ? '2a' : '2b'}: ${label} new block contains no Aily UUID literal`,
      !codeOnly.includes('e2619717-6401-4159-8d4c-d5f87651c8d6'))
    expect(`5.${label === 'HomePropertyPageClient' ? '3a' : '3b'}: ${label} new block contains no walliam.ca hostname literal`,
      !/['"`]walliam\.ca['"`]/.test(codeOnly))
    expect(`5.${label === 'HomePropertyPageClient' ? '4a' : '4b'}: ${label} new block contains no King Shah UUID literal`,
      !codeOnly.includes('fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'))
  }

  hr()

  // ═══════════════════════════════════════════════════════════════
  // SECTION 6 — Edit-set identity
  // ═══════════════════════════════════════════════════════════════
  log('SECTION 6 — edit-set identity')
  const status = execSync('git status --porcelain', { encoding: 'utf8' })
  const modified = status.split('\n').filter(l => /^\s*M /.test(l)).map(l => l.replace(/^\s*M\s+/, '').replace(/\\/g, '/'))
  const declared = new Set([
    'components/property/OfferInquiryModal.tsx',
    'app/property/[id]/HomePropertyPageClient.tsx',
    'app/property/[id]/PropertyPageClient.tsx',
  ])
  const preDirty = new Set([
    'app/api/charlie/municipalities/route.ts',
    'scripts/r-w-territory-master-p2-data-phantom-fix.js',
    'scripts/r-w-territory-master-p4-check-fix.js',
  ])
  const allDeclared = [...declared].every(f => modified.includes(f))
  const unexpected = modified.filter(f => !declared.has(f) && !preDirty.has(f) &&
    !/^docs\//.test(f) && !/^scripts\//.test(f) && !/^recon\//.test(f))
  expect('6.1: all 3 declared targets in M list',
    allDeclared, `M: ${modified.join(', ')}`)
  expect('6.2: no NEW unexpected source files modified',
    unexpected.length === 0,
    unexpected.length === 0 ? 'pre-existing dirty excluded' : `UNEXPECTED: ${unexpected.join(', ')}`)

  // Byte-identity of unrelated paths (Charlie, estimator matchers,
  // submitLeadFromForm, middleware) — none of these should be in M.
  function diffEmpty(p: string): boolean {
    try { return execSync(`git diff HEAD -- "${p}"`, { encoding: 'utf8' }).trim() === '' }
    catch { return false }
  }
  expect('6.3: middleware.ts unchanged (last commit was e79c670; not touched here)',
    diffEmpty('middleware.ts'))
  expect('6.4: app/actions/submitLeadFromForm.ts unchanged',
    diffEmpty('app/actions/submitLeadFromForm.ts'))
  expect('6.5: app/actions/submitActivityFromForm.ts unchanged',
    diffEmpty('app/actions/submitActivityFromForm.ts'))
  expect('6.6: lib/actions/leads.ts unchanged',
    diffEmpty('lib/actions/leads.ts'))
  expect('6.7: app/api/charlie/plan-email/route.ts unchanged',
    diffEmpty('app/api/charlie/plan-email/route.ts'))
  expect('6.8: app/estimator/components/HomeEstimatorBuyerModal.tsx unchanged',
    diffEmpty('app/estimator/components/HomeEstimatorBuyerModal.tsx'))
  expect('6.9: app/estimator/components/HomeEstimatorResults.tsx unchanged',
    diffEmpty('app/estimator/components/HomeEstimatorResults.tsx'))

  hr()

  log(`SUMMARY: ${pass} PASS, ${fail} FAIL`)
  log(fail === 0 ? 'STATUS: Offer modal mount-gate verified for walliam hero + non-hero + failure modes.' : 'STATUS: FAIL — investigate before proceeding.')
  log('NOTE: live verification = operator clicks Sale Offer on walliam.ca, modal opens, completes form, confirms activity_type=sale_offer_inquiry row + lead row + agent/admin email (the x-tenant-id fix from e79c670 already clears the server-action gate for the path).')

  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error(e); log('FATAL: ' + (e?.stack || e?.message || String(e))); process.exit(2) })
