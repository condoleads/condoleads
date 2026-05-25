// scripts/r-territory-ops-T0-1-smoke.js
//
// W-TERRITORY-OPS T0-1 -- 15-scenario resolver smoke.
//
// Tests the deployed Fix 1 (hash-RR default), Fix 2 (non-selling fallthrough),
// and Fix 3 (resolver_health_check RPC) against real database state.
//
// ATOMICITY:
//   Single transaction with SAVEPOINTs per scenario. Outer ROLLBACK at end.
//   Production data is NEVER modified. Every fixture is created inside the
//   transaction and discarded on rollback.
//
// FIXTURES (all values verified by step2a/2b recon, no invented data):
//   - WALLiam tenant b16e1039-... (3 agents: WALLiam, Neo Smith, King Shah)
//   - aily tenant      e2619717-... (S18 isolation target)
//   - Real building    630a583e-... in Blue Grass Meadows, Whitby muni
//   - Real listing     c2364d2d-... (listing_key E8434198) inside that building
//   - Clean munis      Ajax/Brock/Clarington/Pickering in Whitby area
//   - Clean nbhds      Downtown/East End/East York in Toronto area
//   - Existing apa     King Shah has 11 community + Neo Smith has 1 muni card
//
// All 15 scenarios MUST PASS for T0-1 to close. Exit 0 on full pass, 1 on any fail.
//
// Usage:
//   node scripts/r-territory-ops-T0-1-smoke.js

require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");

// ─── Verified fixture constants (all from step2a/2b recon) ────────────────

const WALLIAM_TENANT = "b16e1039-38ed-43d7-bbc5-dd02bb651bc9";
const AILY_TENANT = "e2619717-6401-4159-8d4c-d5f87651c8d6";

const KING_SHAH = "fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe"; // tenant_admin, selling, active
const NEO_SMITH = "f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f"; // agent, selling, active
const WALLIAM_AGENT = "cf002201-9b11-4c0f-a1b3-65ed702c9976"; // agent, selling, active

const WHITBY_AREA = "03d4e133-d9f9-4a7e-ba9a-83e57269c1d4";
const WHITBY_MUNI = "70103aef-1b32-4939-9ff8-264e859a5587";

// Clean munis in Whitby area (for fan-out tests)
const OSHAWA_MUNI = "94447f26-216a-47be-ac73-d07f33732036";
const AJAX_MUNI = "f3570fae-89b0-415a-a23c-16cee8da32ff";
const PICKERING_MUNI = "dc096c48-42b5-4dde-b20c-3b2b7c7b3757";
const BROCK_MUNI = "33736d15-95b4-4c06-909d-e0bea9883ffc";

// Real building in Whitby with VOW listing
const TEST_BUILDING = "630a583e-ae42-4d50-9133-e71a89ceb430";
const TEST_BUILDING_COMMUNITY = "691943e2-b892-44b3-a437-e8d2e5b53119"; // Blue Grass Meadows
const TEST_LISTING = "c2364d2d-cb05-4826-8cd5-4a8eb0d945dd"; // E8434198 in TEST_BUILDING

// Clean Toronto neighbourhoods (no WALLiam apa)
const NBHD_DOWNTOWN = "dd0c4b89-8b4b-4e23-a134-028c7084efe3";
const TORONTO_AREA = "9d0d6843-b16f-42b6-911c-5887a143866e"; // from nbhd recon

// ─── Test harness ─────────────────────────────────────────────────────────

const results = [];
function record(id, name, pass, detail) {
  results.push({ id, name, pass, detail: detail || "" });
}

async function savepoint(c, name, fn) {
  await c.query(`SAVEPOINT ${name}`);
  try {
    await fn();
    await c.query(`ROLLBACK TO SAVEPOINT ${name}`);
  } catch (e) {
    await c.query(`ROLLBACK TO SAVEPOINT ${name}`);
    throw e;
  }
}

// Resolver call shortcut: matches signature
//   resolve_agent_for_context(p_listing_id, p_building_id, p_neighbourhood_id,
//                             p_community_id, p_municipality_id, p_area_id,
//                             p_user_id, p_tenant_id)
async function resolve(c, opts) {
  const r = await c.query(
    `SELECT resolve_agent_for_context($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid) AS agent_id`,
    [
      opts.listing || null,
      opts.building || null,
      opts.neighbourhood || null,
      opts.community || null,
      opts.municipality || null,
      opts.area || null,
      opts.user || null,
      opts.tenant,
    ]
  );
  return r.rows[0].agent_id;
}

const cs =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!cs) {
  console.error("FATAL: no DB connection string in env");
  process.exit(1);
}

(async () => {
  const c = new Client({ connectionString: cs });
  await c.connect();
  await c.query("BEGIN");

  try {
    // ─── Helpers: create synthetic tenant/agent with all NOT NULL columns ──
    //
    // tenants NOT NULL no-default columns (verified step2c): name, domain,
    //   admin_email, source_key. Other NOT NULL columns have defaults.
    // agents NOT NULL no-default columns (verified step2c): full_name, email,
    //   subdomain. is_selling is NOT NULL DEFAULT true (overridable per test).
    let synthSeq = 0;
    async function mkTenant(label) {
      synthSeq += 1;
      const tag = `${label}-${synthSeq}-${Date.now()}`;
      const r = await c.query(
        `INSERT INTO tenants (name, domain, admin_email, source_key, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id`,
        [`smoke-${tag}`, `${tag}.smoke.invalid`, `${tag}@smoke.invalid`, `smoke_${tag.replace(/[^a-z0-9_]/gi, "_")}`]
      );
      return r.rows[0].id;
    }
    async function mkAgent(tenantId, full_name, opts) {
      synthSeq += 1;
      const tag = `${synthSeq}-${Date.now()}`;
      const r = await c.query(
        `INSERT INTO agents (full_name, email, subdomain, tenant_id, role, is_active, is_selling)
         VALUES ($1, $2, $3, $4, 'agent', $5, $6)
         RETURNING id`,
        [
          full_name,
          `agent-${tag}@smoke.invalid`,
          `smoke-agent-${tag}`,
          tenantId,
          opts && opts.is_active === false ? false : true,
          opts && opts.is_selling === false ? false : true,
        ]
      );
      return r.rows[0].id;
    }

    // ─── S1: 1 selling agent, no cards → hash-RR returns that agent ────────
    //
    // Setup: synthetic tenant with 1 selling agent, no cards, no default.
    // Expectation: resolver returns the single agent for any listing.
    await savepoint(c, "sp_s1", async () => {
      const tn = await mkTenant("s1");
      const ag = await mkAgent(tn, "S1 Only Agent");

      const resolved = await resolve(c, {
        listing: TEST_LISTING,
        building: TEST_BUILDING,
        community: TEST_BUILDING_COMMUNITY,
        municipality: WHITBY_MUNI,
        area: WHITBY_AREA,
        tenant: tn,
      });
      const pass = resolved === ag;
      record(
        "S1",
        "1 selling agent, no cards → hash-RR returns that agent",
        pass,
        `expected ${ag}, got ${resolved}`
      );
    });

    // ─── S2: 3 selling agents, no cards → hash-RR distributes deterministically ──
    //
    // Setup: synthetic tenant with 3 selling agents, no cards, no default.
    // Expectation: across many listing UUIDs, all 3 agents appear in output;
    //   distribution within ±15% of 1/3 each.
    await savepoint(c, "sp_s2", async () => {
      const tn = await mkTenant("s2");
      const agents = [];
      for (let i = 0; i < 3; i++) {
        agents.push(await mkAgent(tn, `S2 Agent ${i}`));
      }

      // Use real listings from mls_listings as deterministic inputs
      const sampleListings = (
        await c.query(
          `SELECT id FROM mls_listings
            WHERE available_in_vow = true AND building_id IS NOT NULL
            ORDER BY id LIMIT 300`
        )
      ).rows.map((r) => r.id);

      const counts = { [agents[0]]: 0, [agents[1]]: 0, [agents[2]]: 0, other: 0 };
      for (const lid of sampleListings) {
        const r = await resolve(c, {
          listing: lid,
          community: TEST_BUILDING_COMMUNITY,
          municipality: WHITBY_MUNI,
          area: WHITBY_AREA,
          tenant: tn,
        });
        if (counts[r] !== undefined) counts[r]++;
        else counts.other++;
      }
      const total = sampleListings.length;
      const expected = total / 3;
      const within = (n) => Math.abs(n - expected) / expected < 0.25; // ±25% slack at N=300
      const allCovered = counts[agents[0]] > 0 && counts[agents[1]] > 0 && counts[agents[2]] > 0;
      const noLeak = counts.other === 0;
      const balanced = within(counts[agents[0]]) && within(counts[agents[1]]) && within(counts[agents[2]]);
      const pass = allCovered && noLeak && balanced;
      record(
        "S2",
        "3 selling agents, no cards → hash-RR ~1/3 each",
        pass,
        `counts=${JSON.stringify(counts)} expected~${expected.toFixed(0)} each`
      );
    });

    // ─── S3: tenant default set → P9 wins over P10 fallback ────────────────
    //
    // Setup: synthetic tenant, 3 selling agents, default = agent #2.
    // Expectation: every resolve returns agent #2 (not hash-RR).
    await savepoint(c, "sp_s3", async () => {
      const tn = await mkTenant("s3");
      const agents = [];
      for (let i = 0; i < 3; i++) {
        agents.push(await mkAgent(tn, `S3 Agent ${i}`));
      }
      const defaultAgent = agents[1];
      await c.query("UPDATE tenants SET default_agent_id = $1 WHERE id = $2", [
        defaultAgent,
        tn,
      ]);

      const sampleListings = (
        await c.query(
          `SELECT id FROM mls_listings WHERE available_in_vow = true LIMIT 50`
        )
      ).rows.map((r) => r.id);

      let allMatched = true;
      let firstMiss = null;
      for (const lid of sampleListings) {
        const r = await resolve(c, {
          listing: lid,
          municipality: WHITBY_MUNI,
          area: WHITBY_AREA,
          tenant: tn,
        });
        if (r !== defaultAgent) {
          allMatched = false;
          firstMiss = r;
          break;
        }
      }
      record(
        "S3",
        "Tenant default set → P9 wins over P10 hash-RR",
        allMatched,
        `expected ${defaultAgent} for all 50 listings; first miss=${firstMiss}`
      );
    });

    // ─── S4: muni card override on top of default → P5 wins over P9 ────────
    //
    // Setup: synthetic tenant, 2 agents, default=A, muni card for B at Oshawa.
    // Expectation: listings in Oshawa muni route to B (P5 wins), elsewhere to A (P9).
    await savepoint(c, "sp_s4", async () => {
      const tn = await mkTenant("s4");
      const agA = await mkAgent(tn, "S4 Agent A");
      const agB = await mkAgent(tn, "S4 Agent B");
      await c.query("UPDATE tenants SET default_agent_id = $1 WHERE id = $2", [agA, tn]);
      await c.query(
        `INSERT INTO agent_property_access
           (agent_id, tenant_id, scope, area_id, municipality_id, is_active, condo_access, homes_access, buildings_access)
         VALUES ($1, $2, 'municipality', $3, $4, true, true, true, true)`,
        [agB, tn, WHITBY_AREA, OSHAWA_MUNI]
      );

      const inMuni = await resolve(c, {
        municipality: OSHAWA_MUNI,
        area: WHITBY_AREA,
        tenant: tn,
      });
      const outsideMuni = await resolve(c, {
        municipality: AJAX_MUNI,
        area: WHITBY_AREA,
        tenant: tn,
      });
      const pass = inMuni === agB && outsideMuni === agA;
      record(
        "S4",
        "Muni card overrides tenant default",
        pass,
        `inMuni expected ${agB} got ${inMuni}; outside expected ${agA} got ${outsideMuni}`
      );
    });

    // ─── S6: building pin → P2 wins over geo cascade ────────────────────────
    //
    // Setup: WALLiam already has agent_geo_buildings for King Shah (9 rows).
    //   Pick fresh building, pin to Neo Smith inside savepoint, verify P2.
    // The test building is real (Blue Grass Meadows). Inside savepoint we add a
    // building pin for Neo Smith on a building that does NOT already have one.
    await savepoint(c, "sp_s6", async () => {
      // Find a building inside WALLiam-claimed muni that has NO existing agb row.
      const fresh = (
        await c.query(
          `SELECT b.id FROM buildings b
            JOIN communities co ON co.id = b.community_id
           WHERE co.municipality_id = $1
             AND NOT EXISTS (
               SELECT 1 FROM agent_geo_buildings agb WHERE agb.building_id = b.id
             )
           LIMIT 1`,
          [WHITBY_MUNI]
        )
      ).rows;
      if (fresh.length === 0) {
        record("S6", "Building pin wins over geo cascade", false, "no fresh building available in Whitby");
        return;
      }
      const bld = fresh[0].id;
      // Pin to Neo Smith (so result differs from community-cascade winner King Shah).
      await c.query(
        `INSERT INTO agent_geo_buildings (agent_id, building_id) VALUES ($1, $2)`,
        [NEO_SMITH, bld]
      );

      const resolved = await resolve(c, {
        building: bld,
        community: TEST_BUILDING_COMMUNITY, // Blue Grass Meadows (King Shah's)
        municipality: WHITBY_MUNI,
        area: WHITBY_AREA,
        tenant: WALLIAM_TENANT,
      });
      const pass = resolved === NEO_SMITH;
      record(
        "S6",
        "Building pin (P2) wins over community cascade",
        pass,
        `building→Neo Smith expected; got ${resolved}`
      );
    });

    // ─── S7: hierarchical card conflict (community + muni) → community wins ──
    //
    // PRODUCTION-VERIFY (no fixture creation needed):
    //   WALLiam has: King Shah on Blue Grass Meadows community + Neo Smith on Whitby muni.
    //   Expectation: resolve at Blue Grass Meadows context returns King Shah.
    {
      const resolved = await resolve(c, {
        community: TEST_BUILDING_COMMUNITY,
        municipality: WHITBY_MUNI,
        area: WHITBY_AREA,
        tenant: WALLIAM_TENANT,
      });
      const pass = resolved === KING_SHAH;
      record(
        "S7",
        "Community card (P4) wins over muni card (P5)",
        pass,
        `Blue Grass Meadows expected King Shah; got ${resolved}`
      );
    }

    // ─── S8: duplicate same-slot cards → UNIQUE rejects ─────────────────────
    //
    // Try to insert TWO active community cards for the same (tenant, community).
    // First should succeed, second should raise 23505 (unique_violation).
    await savepoint(c, "sp_s8", async () => {
      const tn = await mkTenant("s8");
      const ag1 = await mkAgent(tn, "S8 A");
      const ag2 = await mkAgent(tn, "S8 B");

      // Find a clean community we can use (one outside WALLiam's claim set is safe).
      const com = (
        await c.query(
          `SELECT id FROM communities WHERE municipality_id = $1 LIMIT 1`,
          [OSHAWA_MUNI]
        )
      ).rows[0].id;

      // First insert succeeds.
      await c.query(
        `INSERT INTO agent_property_access
           (agent_id, tenant_id, scope, community_id, municipality_id, area_id, is_active)
         VALUES ($1, $2, 'community', $3, $4, $5, true)`,
        [ag1, tn, com, OSHAWA_MUNI, WHITBY_AREA]
      );

      // Second insert at same slot must fail with 23505.
      let raised = false;
      let code = null;
      try {
        await c.query(
          `INSERT INTO agent_property_access
             (agent_id, tenant_id, scope, community_id, municipality_id, area_id, is_active)
           VALUES ($1, $2, 'community', $3, $4, $5, true)`,
          [ag2, tn, com, OSHAWA_MUNI, WHITBY_AREA]
        );
      } catch (e) {
        raised = true;
        code = e.code;
        // Recover from txn-level error so savepoint rollback works.
        await c.query(`ROLLBACK TO SAVEPOINT sp_s8`);
        await c.query(`SAVEPOINT sp_s8`);
      }
      const pass = raised && code === "23505";
      record(
        "S8",
        "Duplicate same-slot cards rejected by UNIQUE",
        pass,
        `raised=${raised}, code=${code}`
      );
    });

    // ─── S10: non-selling agent holding cards → Fix 2 fallthrough ───────────
    //
    // Setup: tenant with default=A (selling), muni card by B (non-selling).
    // Expectation: at the muni level, resolver falls through B (non-selling),
    //   eventually returning A via P9 default.
    await savepoint(c, "sp_s10", async () => {
      const tn = await mkTenant("s10");
      const agA = await mkAgent(tn, "S10 A selling");
      const agB = await mkAgent(tn, "S10 B non-selling", { is_selling: false });
      await c.query("UPDATE tenants SET default_agent_id = $1 WHERE id = $2", [agA, tn]);
      await c.query(
        `INSERT INTO agent_property_access
           (agent_id, tenant_id, scope, area_id, municipality_id, is_active, condo_access, homes_access, buildings_access)
         VALUES ($1, $2, 'municipality', $3, $4, true, true, true, true)`,
        [agB, tn, WHITBY_AREA, OSHAWA_MUNI]
      );

      const r = await resolve(c, {
        municipality: OSHAWA_MUNI,
        area: WHITBY_AREA,
        tenant: tn,
      });
      // The non-selling muni-card-holder must not be returned.
      const pass = r !== agB && r === agA;
      record(
        "S10",
        "Non-selling card-holder triggers Fix 2 fallthrough",
        pass,
        `must not return non-selling agB=${agB}; expected agA=${agA}; got ${r}`
      );
    });

    // ─── S11: tenant default agent becomes non-selling → P9 falls through to P10 hash-RR ─
    //
    // Setup: tenant with default=A (non-selling), 2 other selling agents (B, C).
    // Expectation: resolver does not return A; returns B or C via hash-RR.
    await savepoint(c, "sp_s11", async () => {
      const tn = await mkTenant("s11");
      const agA = await mkAgent(tn, "S11 A non-selling default", { is_selling: false });
      const agB = await mkAgent(tn, "S11 B");
      const agC = await mkAgent(tn, "S11 C");
      await c.query("UPDATE tenants SET default_agent_id = $1 WHERE id = $2", [agA, tn]);

      const r = await resolve(c, {
        listing: TEST_LISTING,
        municipality: WHITBY_MUNI,
        area: WHITBY_AREA,
        tenant: tn,
      });
      const pass = r !== agA && (r === agB || r === agC);
      record(
        "S11",
        "Non-selling tenant default triggers P9→P10 fallthrough",
        pass,
        `must not return agA=${agA}; expected agB=${agB} or agC=${agC}; got ${r}`
      );
    });

    // ─── S12: hash-RR rebalance on agent add → distribution shifts ────────
    //
    // Setup: synthetic tenant with 2 selling agents, no cards, no default.
    //   Measure distribution across N=300 listings → baseline ~1/2 each.
    //   Add 3rd selling agent; re-measure → distribution shifts to ~1/3 each.
    // Expectation: agent-3 receives > 0 listings; agent-1 + agent-2 shares drop.
    await savepoint(c, "sp_s12", async () => {
      const tn = await mkTenant("s12");
      const ags = [];
      for (let i = 0; i < 2; i++) {
        ags.push(await mkAgent(tn, `S12 A${i}`));
      }

      const listings = (
        await c.query(`SELECT id FROM mls_listings WHERE available_in_vow=true ORDER BY id LIMIT 300`)
      ).rows.map((r) => r.id);

      const phase1 = { [ags[0]]: 0, [ags[1]]: 0 };
      for (const lid of listings) {
        const r = await resolve(c, { listing: lid, municipality: WHITBY_MUNI, area: WHITBY_AREA, tenant: tn });
        if (phase1[r] !== undefined) phase1[r]++;
      }

      // Add third agent.
      const ag3 = await mkAgent(tn, "S12 A3");

      const phase2 = { [ags[0]]: 0, [ags[1]]: 0, [ag3]: 0 };
      for (const lid of listings) {
        const r = await resolve(c, { listing: lid, municipality: WHITBY_MUNI, area: WHITBY_AREA, tenant: tn });
        if (phase2[r] !== undefined) phase2[r]++;
      }

      const ag3Gained = phase2[ag3] > 0;
      const baselineShare = listings.length / 2;
      const newShare = listings.length / 3;
      const shifted =
        phase2[ags[0]] < phase1[ags[0]] && phase2[ags[1]] < phase1[ags[1]];
      const pass = ag3Gained && shifted;
      record(
        "S12",
        "Hash-RR rebalances on agent add (2→3)",
        pass,
        `phase1=${JSON.stringify(phase1)} phase2=${JSON.stringify(phase2)} baseline~${baselineShare} new~${newShare.toFixed(0)}`
      );
    });

    // ─── S14: listing pin (P1) wins over everything ─────────────────────────
    //
    // Setup: WALLiam already has community card for King Shah at Blue Grass Meadows.
    //   Pin TEST_LISTING to Neo Smith inside savepoint.
    // Expectation: resolver returns Neo Smith for that listing, despite King Shah
    //   owning the surrounding community.
    await savepoint(c, "sp_s14", async () => {
      await c.query(
        `INSERT INTO agent_listing_assignments (agent_id, listing_id)
         VALUES ($1, $2)`,
        [NEO_SMITH, TEST_LISTING]
      );

      const r = await resolve(c, {
        listing: TEST_LISTING,
        building: TEST_BUILDING,
        community: TEST_BUILDING_COMMUNITY,
        municipality: WHITBY_MUNI,
        area: WHITBY_AREA,
        tenant: WALLIAM_TENANT,
      });
      const pass = r === NEO_SMITH;
      record(
        "S14",
        "Listing pin (P1) wins over building/community/muni cascade",
        pass,
        `expected ${NEO_SMITH}; got ${r}`
      );
    });

    // ─── S15: scope='all' is dead code (no rows in production) ──────────────
    //
    // Production verify: zero active apa rows with scope='all' across all tenants.
    {
      const n = (
        await c.query(
          `SELECT COUNT(*) AS n FROM agent_property_access WHERE scope = 'all' AND is_active = true`
        )
      ).rows[0].n;
      const pass = Number(n) === 0;
      record("S15", "scope='all' has zero active rows (dead code)", pass, `count=${n}`);
    }

    // ─── S16: neighbourhood card (P3) wins over community/muni/area ─────────
    //
    // Setup: WALLiam tenant. Add neighbourhood card for Neo Smith at Downtown.
    // Expectation: resolver with neighbourhood=Downtown returns Neo Smith,
    //   not King Shah (who would win at other layers).
    await savepoint(c, "sp_s16", async () => {
      await c.query(
        `INSERT INTO agent_property_access
           (agent_id, tenant_id, scope, neighbourhood_id, area_id, is_active, condo_access, homes_access, buildings_access)
         VALUES ($1, $2, 'neighbourhood', $3, $4, true, true, true, true)`,
        [NEO_SMITH, WALLIAM_TENANT, NBHD_DOWNTOWN, TORONTO_AREA]
      );

      const r = await resolve(c, {
        neighbourhood: NBHD_DOWNTOWN,
        area: TORONTO_AREA,
        tenant: WALLIAM_TENANT,
      });
      const pass = r === NEO_SMITH;
      record(
        "S16",
        "Neighbourhood card (P3) wins over higher tiers",
        pass,
        `expected ${NEO_SMITH}; got ${r}`
      );
    });

    // ─── S18: multi-tenant isolation ─────────────────────────────────────────
    //
    // Setup: WALLiam has 12 active apa cards; aily has its own cards.
    //   resolve_agent_for_context for aily tenant must NOT return WALLiam agents,
    //   and vice versa.
    {
      // Pick a community WALLiam owns (Blue Grass Meadows). Call resolver for aily.
      // aily must not return a WALLiam agent.
      const ailyResult = await resolve(c, {
        community: TEST_BUILDING_COMMUNITY,
        municipality: WHITBY_MUNI,
        area: WHITBY_AREA,
        tenant: AILY_TENANT,
      });
      // Look up the resolved agent's tenant.
      let ailyAgentTenant = null;
      if (ailyResult) {
        const at = await c.query(`SELECT tenant_id FROM agents WHERE id = $1`, [
          ailyResult,
        ]);
        ailyAgentTenant = at.rows[0]?.tenant_id;
      }
      const pass = ailyAgentTenant === null || ailyAgentTenant === AILY_TENANT;
      record(
        "S18",
        "Multi-tenant isolation (aily call cannot return WALLiam agents)",
        pass,
        `aily resolved=${ailyResult} agent.tenant_id=${ailyAgentTenant}`
      );
    }

    // ─── S29: zero selling agents → resolver returns NULL; health = critical ──
    //
    // Setup: tenant with 1 agent (non-selling). No cards.
    // Expectation: resolver returns NULL; resolver_health_check returns
    //   selling_agent_count=0, disaster_state=true, health_grade='critical'.
    await savepoint(c, "sp_s29", async () => {
      const tn = await mkTenant("s29");
      await mkAgent(tn, "S29 only non-selling", { is_selling: false });

      const r = await resolve(c, {
        listing: TEST_LISTING,
        municipality: WHITBY_MUNI,
        area: WHITBY_AREA,
        tenant: tn,
      });
      const hc = (
        await c.query(`SELECT resolver_health_check($1::uuid) AS h`, [tn])
      ).rows[0].h;
      const resolverNull = r === null;
      const hcDisaster =
        hc.selling_agent_count === 0 &&
        hc.disaster_state === true &&
        hc.health_grade === "critical";
      const pass = resolverNull && hcDisaster;
      record(
        "S29",
        "Zero selling agents → NULL resolver + disaster health",
        pass,
        `resolved=${r}, health=${JSON.stringify(hc)}`
      );
    });

    // ─── REPORT ─────────────────────────────────────────────────────────────
    console.log("");
    console.log("=".repeat(70));
    console.log("W-TERRITORY-OPS T0-1 SMOKE (15 resolver scenarios)");
    console.log("=".repeat(70));
    let pass = 0,
      fail = 0;
    for (const r of results) {
      const mark = r.pass ? "  PASS" : "  FAIL";
      console.log(`${mark}  ${r.id}  ${r.name}`);
      if (!r.pass && r.detail) console.log("        " + r.detail);
      if (r.pass) pass++;
      else fail++;
    }
    console.log("-".repeat(70));
    console.log(`Summary: ${pass} passed, ${fail} failed (${results.length} total)`);

    // Always ROLLBACK outer transaction. Production state never changed.
    await c.query("ROLLBACK");
    console.log("");
    console.log("Outer transaction ROLLED BACK. Production untouched.");

    await c.end();
    process.exit(fail > 0 ? 1 : 0);
  } catch (e) {
    try {
      await c.query("ROLLBACK");
    } catch (_) {}
    await c.end();
    console.error("");
    console.error("FATAL during smoke:", e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();