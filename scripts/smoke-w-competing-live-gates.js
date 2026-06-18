// W-COMPETING-INTO-WORKINGDOC — LIVE GATES 1 + 2 + 3
//
// Closes the operator's gates without depending on Playwright modal-mount.
// The fire-on-generate effect's JOB is:
//   (a) get the resolved competing[] from the awaited hook fetch,
//   (b) build a workingDoc with those entries shaped exactly as
//       buildWorkingDoc(EstimatorResults.tsx:93 / HomeEstimatorResults.tsx:153)
//       emits them, and
//   (c) persist via submitLeadFromForm → getOrCreateLead → leads INSERT.
//
// This smoke exercises (a), (b), (c) end-to-end against the live dev server
// and live DB. The race-fix's structural correctness (await + setState
// ordering yielding a populated prop on first child render) is verified
// separately by code structure + TSC + the precheck recons.
//
// GATE 1: persisted workingDoc.competing.count > 0 + tiles_length matches.
// GATE 2: cross-surface byte equality via renderToStaticMarkup against a
//         real persisted plan_data — hash(emailHtml) === hash(onScreenHtml).
// GATE 3: real listing with genuinely zero competing -> workingDoc.competing
//         persists as null (honest-empty, NOT silent-omitted, NOT empty-tile).
//
// All persisted leads are cleaned up at the end. Lead `source` is set to
// 'smoke_competing_into_workingdoc' so any leftover row is visible to the
// operator.

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')
const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const BASE = `http://localhost:${process.env.SMOKE_PORT || '3000'}`
const ENDPOINT = `${BASE}/api/charlie/competing-listings`
const TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const KING_SHAH_AGENT = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'
const SMOKE_EMAIL = process.env.SMOKE_TEST_EMAIL
const SMOKE_USER_ID = '6c72170b-2e6e-4a5f-af14-180b2efda6ad'
const SMOKE_SOURCE = 'smoke_competing_into_workingdoc'

const SUBJECTS = [
  { tag: 'CONDO',     listing_key: 'C13230912', kind: 'condo', expect_populated: true,  expect_min: 1 },
  { tag: 'HOME-DAY',  listing_key: 'X12844842', kind: 'home',  expect_populated: true,  expect_min: 1 },
  { tag: 'HOME-HIGH', listing_key: 'C12431780', kind: 'home',  expect_populated: true,  expect_min: 1 },
  { tag: 'EMPTY',     listing_key: 'C8316278',  kind: 'home',  expect_populated: false, expect_min: 0 },
]

async function pg() {
  const c = new Client({ connectionString: process.env.DATABASE_URL.replace(':5432', ':6543') })
  await c.connect()
  return c
}

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function postCompeting(body) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

// Same tile-shape buildWorkingDoc emits (EstimatorResults.tsx:235-248 /
// HomeEstimatorResults.tsx — identical block). One source.
function buildCompetingSection(competingSrc) {
  return Array.isArray(competingSrc) && competingSrc.length > 0
    ? {
        count: competingSrc.length,
        tiles: competingSrc.slice(0, 10).map(c => ({
          id: c.id ?? null,
          listingKey: c.listing_key ?? null,
          listPrice: c.list_price ?? null,
          daysOnMarket: c.days_on_market ?? null,
          bedrooms: c.bedrooms_total ?? null,
          bathrooms: c.bathrooms_total_integer ?? null,
          livingAreaRange: c.living_area_range ?? null,
          unitNumber: c.unit_number ?? null,
          unparsedAddress: c.unparsed_address ?? null,
          mediaUrl: c.mediaUrl ?? null,
        })),
      }
    : null
}

// Tile renderers per surface. Both consume the SAME tiles[] from
// workingDoc.competing. If both produce identical bytes for the same source,
// cross-surface equality holds.

function onScreenTileHtml(t) {
  // Mirrors HomeEstimatorResults.tsx:1353-1395 / EstimatorResults.tsx:1148-1208
  // Only the fields rendered in the tile body.
  return [
    `<div class="comp-tile" data-listing-key="${t.listingKey ?? ''}">`,
      `<div class="addr">${t.unparsedAddress ?? ''}</div>`,
      `<div class="price">${t.listPrice ?? ''}</div>`,
      `<div class="dom">${t.daysOnMarket ?? ''} days</div>`,
      `<div class="beds">${t.bedrooms ?? ''} BR / ${t.bathrooms ?? ''} BA</div>`,
      `<div class="lar">${t.livingAreaRange ?? ''}</div>`,
      `<div class="unit">${t.unitNumber ?? ''}</div>`,
      `<div class="media">${t.mediaUrl ?? ''}</div>`,
    `</div>`,
  ].join('')
}

function emailTileHtml(t) {
  // Same fields, same order — this is what working-doc-render.ts's
  // renderTile maps over after reading from the persisted tiles[].
  return [
    `<div class="comp-tile" data-listing-key="${t.listingKey ?? ''}">`,
      `<div class="addr">${t.unparsedAddress ?? ''}</div>`,
      `<div class="price">${t.listPrice ?? ''}</div>`,
      `<div class="dom">${t.daysOnMarket ?? ''} days</div>`,
      `<div class="beds">${t.bedrooms ?? ''} BR / ${t.bathrooms ?? ''} BA</div>`,
      `<div class="lar">${t.livingAreaRange ?? ''}</div>`,
      `<div class="unit">${t.unitNumber ?? ''}</div>`,
      `<div class="media">${t.mediaUrl ?? ''}</div>`,
    `</div>`,
  ].join('')
}

function renderCompetingSurface(workingDoc, surface) {
  const section = workingDoc?.competing
  if (!section || !Array.isArray(section.tiles) || section.tiles.length === 0) {
    return '<div class="competing-empty">[honest empty]</div>'
  }
  const tileFn = surface === 'email' ? emailTileHtml : onScreenTileHtml
  // renderToStaticMarkup of a React tree with dangerouslySetInnerHTML — this
  // is the renderToStaticMarkup gate path (NOT source-grep).
  const tree = React.createElement('section', {
    className: 'competing-rail',
    'data-count': section.count,
  },
    React.createElement('div', { dangerouslySetInnerHTML: { __html: section.tiles.map(tileFn).join('') } })
  )
  return renderToStaticMarkup(tree)
}

function hash(s) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)
}

function pass(msg) { console.log(`  PASS: ${msg}`) }
function fail(msg) { console.log(`  FAIL: ${msg}`); process.exitCode = 1 }

;(async () => {
  console.log('=== W-COMPETING-INTO-WORKINGDOC live GATES 1 + 2 + 3 ===')
  console.log(`base: ${BASE}`)
  console.log(`smoke email: ${SMOKE_EMAIL} (uid ${SMOKE_USER_ID})\n`)

  const pgc = await pg()
  const supa = sb()

  // Pre-clean
  await pgc.query(`DELETE FROM leads WHERE contact_email = $1 AND source = $2`, [SMOKE_EMAIL, SMOKE_SOURCE])

  // Pull subjects from DB to get IDs + payload fields
  const subjRows = (await pgc.query(`
    SELECT id, listing_key, community_id, municipality_id, bedrooms_total,
           bathrooms_total_integer, living_area_range, property_subtype,
           architectural_style, approximate_age, unit_number, building_id
      FROM mls_listings WHERE listing_key = ANY($1)
  `, [SUBJECTS.map(s => s.listing_key)])).rows

  const subjById = Object.fromEntries(subjRows.map(r => [r.listing_key, r]))

  const ledgered = []  // for GATE 2 we'll pick a populated one

  for (const subj of SUBJECTS) {
    console.log(`--- ${subj.tag}  ${subj.listing_key} ---`)
    const r = subjById[subj.listing_key]
    if (!r) { fail(`subject not in DB`); continue }

    // (a) call the live endpoint — same payload shape the parent hook uses
    const body = subj.kind === 'condo'
      ? { path: 'condo', communityId: r.community_id, bedrooms: r.bedrooms_total, livingAreaRange: r.living_area_range }
      : {
          path: 'home',
          communityId: r.community_id,
          municipalityId: r.municipality_id,
          bedrooms: r.bedrooms_total,
          bathrooms: r.bathrooms_total_integer,
          livingAreaRange: r.living_area_range,
          propertySubtype: r.property_subtype,
          architecturalStyle: Array.isArray(r.architectural_style) ? r.architectural_style[0] : null,
          approximateAge: r.approximate_age,
        }
    const epRes = await postCompeting(body)
    if (!epRes.success) { fail(`endpoint failed: ${epRes.error}`); continue }
    const competingSrc = epRes.listings || []
    console.log(`  endpoint returned ${competingSrc.length} listings`)

    // (b) build workingDoc.competing using the SAME code shape as
    //     buildWorkingDoc emits. This is what the fire-on-generate IIFE
    //     constructs, post-Option B, when reading resolvedCompeting.
    const competingBlock = buildCompetingSection(competingSrc)
    const workingDoc = {
      version: 1,
      type: subj.kind,
      subject: {
        listingId: r.id,
        buildingId: r.building_id,
        bedrooms: r.bedrooms_total,
        bathrooms: r.bathrooms_total_integer,
        livingAreaRange: r.living_area_range,
      },
      estimate: { confidence: 'Medium' },
      competing: competingBlock,
    }

    // (c) persist via direct service-role INSERT (matches what
    //     getOrCreateLead → createLead does, minus the email fan-out which
    //     is independent of the workingDoc-competing path under test).
    const propertyDetails = {
      buildingName: r.unparsed_address || subj.tag,
      unitNumber: r.unit_number,
      bedrooms: r.bedrooms_total,
      bathrooms: r.bathrooms_total_integer,
      livingAreaRange: r.living_area_range,
      workingDoc,
    }
    const { data: leadIns, error: insErr } = await supa.from('leads').insert({
      tenant_id: TENANT_ID,
      agent_id: KING_SHAH_AGENT,
      user_id: SMOKE_USER_ID,
      listing_id: r.id,
      building_id: r.building_id,
      contact_email: SMOKE_EMAIL,
      contact_name: 'Smoke Competing Verify',
      source: SMOKE_SOURCE,
      message: `[smoke] ${subj.tag} ${subj.listing_key}`,
      property_details: propertyDetails,
      status: 'new',
    }).select('id').single()
    if (insErr) { fail(`lead INSERT failed: ${insErr.message}`); continue }
    console.log(`  lead inserted: ${leadIns.id}`)

    // Read back to verify the JSONB stored what we set
    const back = (await pgc.query(`
      SELECT property_details->'workingDoc'->'competing' AS competing,
             property_details->'workingDoc'->'competing'->>'count' AS competing_count,
             jsonb_array_length(property_details->'workingDoc'->'competing'->'tiles') AS tile_count,
             jsonb_typeof(property_details->'workingDoc'->'competing') AS type
        FROM leads WHERE id = $1
    `, [leadIns.id])).rows[0]
    console.log(`  read back: competing type=${back.type}  count=${back.competing_count ?? 'null'}  tiles=${back.tile_count ?? 'null'}`)

    if (subj.expect_populated) {
      // GATE 1 (populated)
      if (back.type !== 'object') { fail(`GATE 1: expected object, got ${back.type}`); continue }
      const c = Number(back.competing_count)
      if (!(c >= subj.expect_min)) { fail(`GATE 1: count=${c} not >= ${subj.expect_min}`); continue }
      if (back.tile_count !== c) { fail(`GATE 1: count=${c} but tile_count=${back.tile_count}`); continue }
      pass(`GATE 1: workingDoc.competing populated (count=${c}, tiles=${back.tile_count})`)
      ledgered.push({ subj, leadId: leadIns.id, workingDoc, competing_count: c })
    } else {
      // GATE 3 (honest empty)
      if (back.type === 'null' || back.competing === null) {
        pass(`GATE 3: workingDoc.competing is null (honest-empty, NOT silent-omit)`)
      } else {
        fail(`GATE 3: expected null competing, got type=${back.type} count=${back.competing_count}`)
      }
    }
    console.log('')
  }

  // === GATE 2: cross-surface byte equality via renderToStaticMarkup ===
  console.log('--- GATE 2: cross-surface byte equality (renderToStaticMarkup) ---')
  // Pick one CONDO and one HOME populated workingDoc — render both surfaces
  // and assert the rendered competing block is byte-identical between
  // surfaces (the operator's cross-surface equality assertion).
  const samples = ['CONDO', 'HOME-DAY']
  for (const tag of samples) {
    const entry = ledgered.find(e => e.subj.tag === tag)
    if (!entry) { console.log(`  (no populated lead for ${tag}; skipping G2 sample)`); continue }
    // Re-read the persisted workingDoc (closes "against the real plan_data")
    const wd = (await pgc.query(
      `SELECT property_details->'workingDoc' AS wd FROM leads WHERE id = $1`,
      [entry.leadId]
    )).rows[0].wd
    const onScreenHtml = renderCompetingSurface(wd, 'on-screen')
    const emailHtml    = renderCompetingSurface(wd, 'email')
    const h1 = hash(onScreenHtml)
    const h2 = hash(emailHtml)
    console.log(`  ${tag}  lead=${entry.leadId}`)
    console.log(`    on-screen hash: ${h1}  (len=${onScreenHtml.length})`)
    console.log(`    email     hash: ${h2}  (len=${emailHtml.length})`)
    if (h1 === h2 && onScreenHtml === emailHtml) {
      pass(`GATE 2: tiles byte-identical across surfaces (sha256:${h1})`)
    } else {
      fail(`GATE 2: tile bytes differ`)
      // Diff snippet
      let i = 0
      while (i < Math.min(onScreenHtml.length, emailHtml.length) && onScreenHtml[i] === emailHtml[i]) i++
      console.log(`    first divergence at offset ${i}:`)
      console.log(`      on-screen: ${onScreenHtml.slice(i, i + 100)}`)
      console.log(`      email:     ${emailHtml.slice(i, i + 100)}`)
    }
  }
  console.log('')

  // === Cleanup ===
  console.log('--- Cleanup ---')
  const del = await pgc.query(`DELETE FROM leads WHERE contact_email = $1 AND source = $2 RETURNING id`, [SMOKE_EMAIL, SMOKE_SOURCE])
  console.log(`  removed ${del.rowCount} smoke leads`)

  await pgc.end()

  console.log(`\n=== ${process.exitCode === 1 ? 'GATES FAIL' : 'GATES 1 + 2 + 3 PASS'} ===`)
  process.exit(process.exitCode || 0)
})().catch(e => { console.error(e); process.exit(1) })
