// W-AILY-ROOT-BRAND verification — checks ROOT path metadata + body
// branding on BOTH aily.ca + walliam.ca + a System-1 surface, plus
// no-regression on the just-shipped Aily email/lead/routing.
//
// READ-ONLY against deployed prod. NO DB writes.
//
// NOTE: M1/M2 are code changes that must be DEPLOYED before this smoke
// fully reflects them. M3a (the DB row insert) is already live, so the
// page should ALREADY render content (not "Access configuration error")
// against TODAY's prod deploy. M1/M2 effects show after the next deploy.

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const AILY    = 'e2619717-6401-4159-8d4c-d5f87651c8d6'
const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

let pass = 0, fail = 0
const PASS = (m) => { console.log('  PASS:', m); pass++ }
const FAIL = (m) => { console.log('  FAIL:', m); fail++ }

async function fetchHtml(url) {
  const r = await fetch(url, { redirect: 'follow' })
  const html = await r.text()
  return { status: r.status, html, len: html.length }
}

function find(html, pattern) {
  const m = html.match(pattern)
  return m ? m[0] : null
}

;(async () => {
  console.log('=== W-AILY-ROOT-BRAND verification ===\n')

  // ─── G0: M3a is live — Aily default agent has 1 row ─────────────────
  console.log('--- G0: M3a row landed (DB-side, already live) ---')
  const { data: rows } = await sb.from('agent_property_access').select('*').eq('agent_id', '0b3fcbf7-1876-4433-932a-4af5c20daa3f')
  if (rows.length === 1 && rows[0].scope === 'all' && rows[0].is_active && rows[0].tenant_id === AILY) {
    PASS(`Aily default agent has 1 row: scope='all' tenant=AILY is_active=true id=${rows[0].id}`)
  } else {
    FAIL(`unexpected: rows=${rows.length} ${JSON.stringify(rows[0])}`)
  }

  // ─── G1: aily.ca/ root render ───────────────────────────────────────
  console.log('\n--- G1: https://www.aily.ca/ root render ---')
  const a = await fetchHtml('https://www.aily.ca/')
  console.log(`  status=${a.status}  bytes=${a.len}`)
  const aTitle = find(a.html, /<title>([^<]*)<\/title>/)
  console.log(`  title: ${aTitle}`)
  // Check for the M3a fix effect (no "Access configuration error")
  const hasAccessError = /Access configuration error/.test(a.html)
  if (!hasAccessError) PASS('NO "Access configuration error" — M3a in effect, HomePageComprehensive rendered')
  else FAIL('"Access configuration error" still present — M3a effect missing or page cached')
  // Check tenant id in body (proof tenant resolution still works)
  const dataTenantId = find(a.html, /data-tenant-id="([^"]*)"/)
  if (dataTenantId && dataTenantId.includes(AILY)) PASS(`body data-tenant-id includes AILY (${dataTenantId})`)
  else FAIL(`body data-tenant-id missing or wrong: ${dataTenantId}`)
  // M1 (post-deploy) — title shows aily. Until deploy, may still be CondoLeads.
  if (/aily/i.test(aTitle || '') && !/CondoLeads/i.test(aTitle || '')) PASS('M1 active: title is aily-branded')
  else if (/CondoLeads/i.test(aTitle || '')) console.log('  NOTE: title still shows CondoLeads — M1 deploy pending')
  // M2 (post-deploy) — page contains brandName=aily marker
  const hasBrandAily      = /"brandName":"aily"/.test(a.html)
  const hasBrandCondoleads = /"brandName":"CondoLeads"/.test(a.html)
  if (hasBrandAily && !hasBrandCondoleads) PASS('M2 active: brandName=aily, no CondoLeads brand leak')
  else if (hasBrandCondoleads) console.log('  NOTE: brandName="CondoLeads" still present — M2 deploy pending')

  // ─── G2: walliam.ca/ no-regression ───────────────────────────────────
  console.log('\n--- G2: https://www.walliam.ca/ no-regression ---')
  const w = await fetchHtml('https://www.walliam.ca/')
  console.log(`  status=${w.status}  bytes=${w.len}`)
  const wTitle = find(w.html, /<title>([^<]*)<\/title>/)
  console.log(`  title: ${wTitle}`)
  if (/WALLiam/i.test(wTitle || '')) PASS('walliam.ca title still shows WALLiam')
  else FAIL(`walliam.ca title lost WALLiam brand: ${wTitle}`)
  const wHasAccessError = /Access configuration error/.test(w.html)
  if (!wHasAccessError) PASS('walliam.ca no Access configuration error')
  else FAIL('walliam.ca shows Access configuration error — regression')
  const wHasHero = /"wordmarkStyle":"hero"/.test(w.html)
  if (wHasHero) PASS('walliam.ca wordmarkStyle=hero (WALLiam wordmark intact)')
  else console.log('  NOTE: walliam.ca wordmarkStyle hero marker not found in payload — may render through different path; visual check recommended')

  // ─── G3: geo page on aily.ca still renders aily ─────────────────────
  console.log('\n--- G3: https://www.aily.ca/grindstone geo page no-regression ---')
  const ag = await fetchHtml('https://www.aily.ca/grindstone')
  console.log(`  status=${ag.status}  bytes=${ag.len}`)
  if (ag.status === 200) PASS('geo page on aily.ca still 200 OK')
  else FAIL(`geo page status=${ag.status}`)
  if (/aily/i.test(ag.html) && !/WALLiam/.test(ag.html)) PASS('geo page on aily.ca still renders aily (no WALLiam leak)')
  else FAIL('geo page brand regression')

  // ─── G4: System-1 condoleads.ca fallback still CondoLeads ───────────
  console.log('\n--- G4: condoleads.ca System-1 fallback intact ---')
  try {
    const c = await fetchHtml('https://www.condoleads.ca/')
    console.log(`  status=${c.status}  bytes=${c.len}`)
    if (c.status === 200 && /CondoLeads/i.test(c.html)) PASS('condoleads.ca still shows CondoLeads (System-1 default unchanged)')
    else if (c.status === 200) console.log('  NOTE: condoleads.ca returned 200 but no CondoLeads string — manual check recommended')
    else console.log(`  NOTE: condoleads.ca status=${c.status} (may be a marketing redirect; not a regression of our change)`)
  } catch (e) {
    console.log('  NOTE: condoleads.ca probe threw — skipping (not in scope)')
  }

  // ─── G5: Aily email/lead pipe still intact (no-regression on yesterday's work) ─
  console.log('\n--- G5: Aily email/lead routing no-regression (DB-side) ---')
  const { data: ailyTenant } = await sb.from('tenants')
    .select('default_agent_id, send_from, email_from_domain, resend_verification_status')
    .eq('id', AILY).maybeSingle()
  if (ailyTenant?.default_agent_id === '0b3fcbf7-1876-4433-932a-4af5c20daa3f' &&
      ailyTenant?.send_from === 'aily <notifications@aily.ca>' &&
      ailyTenant?.email_from_domain === 'aily.ca' &&
      ailyTenant?.resend_verification_status === 'verified') {
    PASS('Aily tenant row email-pipe fields intact (default_agent, send_from, email_from_domain, verified status all match yesterday\'s post-go-live state)')
  } else {
    FAIL(`Aily tenant row drifted: ${JSON.stringify(ailyTenant)}`)
  }

  // ─── G6: cross-tenant isolation still intact ────────────────────────
  console.log('\n--- G6: cross-tenant isolation still intact ---')
  // Re-run the same resolver probe from yesterday's smoke.
  const { data: oneListing } = await sb
    .from('mls_listings').select('id, community_id, municipality_id, area_id')
    .eq('available_in_vow', true).eq('standard_status', 'Active')
    .not('community_id', 'is', null).limit(1).maybeSingle()
  const { data: rpc } = await sb.rpc('resolve_agent_for_context', {
    p_listing_id: oneListing.id, p_building_id: null, p_neighbourhood_id: null,
    p_community_id: oneListing.community_id, p_municipality_id: oneListing.municipality_id,
    p_area_id: oneListing.area_id, p_user_id: null, p_tenant_id: AILY,
  })
  const finalAgentId = rpc || ailyTenant?.default_agent_id
  const { data: a2 } = await sb.from('agents').select('full_name, tenant_id').eq('id', finalAgentId).maybeSingle()
  if (a2?.tenant_id === AILY) PASS(`Aily resolver still routes to Aily agent (${a2.full_name}, tenant=${a2.tenant_id.slice(0,8)})`)
  else FAIL(`isolation broken: resolved tenant=${a2?.tenant_id}`)

  console.log(`\n=== SUMMARY: ${pass} pass / ${fail} fail (M1/M2 effects visible only after deploy) ===`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('THREW:', e); process.exit(1) })
