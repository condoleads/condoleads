// scripts/r-territory-ops-T1-3-smoke.js
//
// W-TERRITORY-OPS T1-3 -- code smoke for Agents view + 3 routes + bulk-reassign txn.
//
// Sections:
//   1. Static analysis of agents-summary route
//   2. Static analysis of bulk-reassign route
//   3. Static analysis of bulk-deactivate route
//   4. Static analysis of AgentsView.tsx
//   5. Static analysis of TerritoryTab.tsx
//   6. Live RPC: territory_agents_summary against WALLiam + aily
//      Multi-tenant isolation verification
//   7. Live bulk-reassign DRY RUN inside a transaction with ROLLBACK
//      (proves the SQL path works; production state untouched)

require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { Client } = require("pg");

const WALLIAM = "b16e1039-38ed-43d7-bbc5-dd02bb651bc9";
const AILY = "e2619717-6401-4159-8d4c-d5f87651c8d6";
const KING_SHAH = "fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe";
const NEO_SMITH = "f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f";

const SUMMARY_PATH = path.join("app","api","admin-homes","territory","agents-summary","route.ts");
const REASSIGN_PATH = path.join("app","api","admin-homes","territory","cards","bulk-reassign","route.ts");
const DEACTIVATE_PATH = path.join("app","api","admin-homes","territory","cards","bulk-deactivate","route.ts");
const VIEW_PATH = path.join("components","admin-homes","cockpit","territory","AgentsView.tsx");
const TAB_PATH = path.join("components","admin-homes","cockpit","tabs","TerritoryTab.tsx");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cs = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;

const results = [];
function record(id, name, pass, detail) {
  results.push({ id, name, pass, detail: detail || "" });
}
function readU8(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

(async () => {
  // ─── 1. agents-summary static ─────────────────────────────────────────
  const s = readU8(SUMMARY_PATH);
  record("SU0", "summary route on disk", s !== null);
  if (s) {
    record("SU1", "GET handler", s.includes("export async function GET("));
    record("SU2", "calls territory_agents_summary RPC", s.includes("'territory_agents_summary'"));
    record("SU3", "uses resolveAdminHomesUser", s.includes("resolveAdminHomesUser"));
    record("SU4", "force-dynamic", s.includes("force-dynamic"));
    record("SU5", "UUID_RE validation", s.includes("UUID_RE"));
    record("SU6", "tenant_manager_assignments membership", s.includes("tenant_manager_assignments"));
  }

  // ─── 2. bulk-reassign static ──────────────────────────────────────────
  const r = readU8(REASSIGN_PATH);
  record("RA0", "reassign route on disk", r !== null);
  if (r) {
    record("RA1", "POST handler", r.includes("export async function POST("));
    record("RA2", "uses async queue (SET LOCAL skip_apa_reroll)", r.includes("SET LOCAL app.skip_apa_reroll = 'on'"));
    record("RA3", "validates from_agent_id + to_agent_id", r.includes("from_agent_id") && r.includes("to_agent_id"));
    record("RA4", "rejects same-agent move", r.includes("from and to are the same agent"));
    record("RA5", "verifies tenant membership on both agents", r.includes("agent does not belong to tenant"));
    record("RA6", "verifies to_agent is active", r.includes("to_agent is not active"));
    record("RA7", "returns moved_count + queued_count", r.includes("moved_count") && r.includes("queued_count"));
  }

  // ─── 3. bulk-deactivate static ────────────────────────────────────────
  const d = readU8(DEACTIVATE_PATH);
  record("DA0", "deactivate route on disk", d !== null);
  if (d) {
    record("DA1", "POST handler", d.includes("export async function POST("));
    record("DA2", "uses async queue", d.includes("SET LOCAL app.skip_apa_reroll = 'on'"));
    record("DA3", "rejects empty card_ids", d.includes("card_ids must be non-empty array"));
    record("DA4", "verifies tenant membership on each card", d.includes("card does not belong to tenant"));
    record("DA5", "returns deactivated_count + queued_count", d.includes("deactivated_count") && d.includes("queued_count"));
  }

  // ─── 4. AgentsView static ─────────────────────────────────────────────
  const v = readU8(VIEW_PATH);
  record("V0", "AgentsView on disk", v !== null);
  if (v) {
    record("V1", "'use client'", v.startsWith("'use client'"));
    record("V2", "default exports AgentsView", v.includes("export default function AgentsView"));
    record("V3", "fetches /agents-summary", v.includes("/api/admin-homes/territory/agents-summary"));
    record("V4", "calls /bulk-reassign", v.includes("/api/admin-homes/territory/cards/bulk-reassign"));
    record("V5", "AgentRow has 10 expected fields",
      v.includes("agent_id") && v.includes("full_name") && v.includes("role") &&
      v.includes("is_selling") && v.includes("is_active") && v.includes("is_tenant_default") &&
      v.includes("assigned_card_count") && v.includes("building_pin_count") &&
      v.includes("listing_pin_count") && v.includes("user_assignment_count"));
    record("V6", "filter input", v.includes("Filter by name"));
    record("V7", "reassign modal", v.includes("Pick the destination agent"));
    record("V8", "tenant_id query param via encodeURIComponent", v.includes("encodeURIComponent(tenantId)"));
    record("V9", "credentials: 'include'", v.includes("credentials: 'include'"));
  }

  // ─── 5. TerritoryTab static ───────────────────────────────────────────
  const t = readU8(TAB_PATH);
  record("T0", "TerritoryTab on disk", t !== null);
  if (t) {
    record("T1", "imports AgentsView", t.includes("import AgentsView from '@/components/admin-homes/cockpit/territory/AgentsView'"));
    record("T2", "3-way View type", t.includes("type View = 'agents' | 'health' | 'detail'"));
    record("T3", "Agents is default", t.includes("useState<View>('agents')"));
    record("T4", "renders AgentsView in agents branch", t.includes("<AgentsView tenantId={tenantId} tenantName={tenantName} />"));
    record("T5", "renders HealthView in health branch", t.includes("<HealthView tenantId={tenantId} tenantName={tenantName} />"));
    record("T6", "renders TerritoryClient in detail branch (no operator regression)",
      t.includes("<TerritoryClient tenantId={tenantId} tenantName={tenantName} seeAll={false} />"));
  }

  // ─── 6. Live RPC: WALLiam + aily ─────────────────────────────────────
  if (url && key) {
    const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: wData, error: wErr } = await sb.rpc("territory_agents_summary", { p_tenant_id: WALLIAM });
    record("RPC1", "WALLiam RPC succeeded", !wErr && Array.isArray(wData), wErr?.message);
    if (Array.isArray(wData)) {
      record("RPC2", "WALLiam returns 3 agents", wData.length === 3, `got ${wData.length}`);
      const ks = wData.find((x) => x.agent_id === KING_SHAH);
      const ns = wData.find((x) => x.agent_id === NEO_SMITH);
      record("RPC3", "King Shah row present", !!ks);
      record("RPC4", "Neo Smith row present", !!ns);
      if (ks) {
        record("RPC5", "King Shah assigned_card_count=11", ks.assigned_card_count === 11, `got ${ks.assigned_card_count}`);
        record("RPC6", "King Shah building_pin_count=9", ks.building_pin_count === 9, `got ${ks.building_pin_count}`);
        record("RPC7", "King Shah is_tenant_default=true", ks.is_tenant_default === true);
        record("RPC8", "King Shah user_assignment_count=9", ks.user_assignment_count === 9, `got ${ks.user_assignment_count}`);
      }
      if (ns) {
        record("RPC9", "Neo Smith assigned_card_count=1", ns.assigned_card_count === 1, `got ${ns.assigned_card_count}`);
        record("RPC10", "Neo Smith is_tenant_default=false", ns.is_tenant_default === false);
      }
    }

    const { data: aData, error: aErr } = await sb.rpc("territory_agents_summary", { p_tenant_id: AILY });
    record("RPC11", "aily RPC succeeded", !aErr && Array.isArray(aData), aErr?.message);
    if (Array.isArray(aData)) {
      record("RPC12", "aily returns 3 agents", aData.length === 3, `got ${aData.length}`);
      record("RPC13", "Multi-tenant isolation: aily all 0 cards",
        aData.every((x) => x.assigned_card_count === 0 && x.building_pin_count === 0 && x.listing_pin_count === 0));
      // No WALLiam agent IDs in aily payload
      const wIds = new Set([KING_SHAH, NEO_SMITH, "cf002201-9b11-4c0f-a1b3-65ed702c9976"]);
      const leakage = aData.some((x) => wIds.has(x.agent_id));
      record("RPC14", "Multi-tenant isolation: aily contains zero WALLiam agent IDs", !leakage);
    }
  } else {
    record("RPC0", "skipped live RPC (no env)", false, "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
  }

  // ─── 7. Live bulk-reassign DRY RUN (txn with ROLLBACK) ────────────────
  // Proves the UPDATE path works without touching production state.
  if (cs) {
    const c = new Client({ connectionString: cs });
    await c.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL app.skip_apa_reroll = 'on'");

      // Pick one of King Shah's community cards to test the move SQL.
      const ksCard = await c.query(
        `SELECT id FROM agent_property_access
          WHERE tenant_id = $1 AND agent_id = $2 AND is_active = true
          ORDER BY id LIMIT 1`,
        [WALLIAM, KING_SHAH]
      );
      if (ksCard.rowCount === 0) {
        record("BR1", "found a King Shah card to move", false, "no active cards held by King Shah");
      } else {
        const cardId = ksCard.rows[0].id;
        const u = await c.query(
          `UPDATE agent_property_access
              SET agent_id = $1, updated_at = now()
            WHERE id = $2 AND tenant_id = $3 AND agent_id = $4 AND is_active = true`,
          [NEO_SMITH, cardId, WALLIAM, KING_SHAH]
        );
        record("BR1", "UPDATE matched 1 row", u.rowCount === 1, `rowCount=${u.rowCount}`);

        // Verify the row now belongs to Neo Smith inside this tx.
        const verify = await c.query(
          `SELECT agent_id FROM agent_property_access WHERE id = $1`,
          [cardId]
        );
        record("BR2", "card now held by Neo Smith inside tx", verify.rows[0]?.agent_id === NEO_SMITH);

        // Verify a reroll job was enqueued (skip_apa_reroll path).
        const q = await c.query(
          `SELECT COUNT(*)::int AS n FROM territory_reroll_queue
            WHERE tenant_id = $1 AND status = 'pending'`,
          [WALLIAM]
        );
        record("BR3", "reroll job queued (async path verified)", q.rows[0].n >= 1, `queued=${q.rows[0].n}`);
      }
    } catch (e) {
      record("BR-ERR", "dry-run threw", false, e.message);
    } finally {
      await c.query("ROLLBACK").catch(() => {});
      await c.end();
    }
  } else {
    record("BR0", "skipped bulk-reassign dry run (no pg conn)", false);
  }

  // ─── Report ───────────────────────────────────────────────────────────
  console.log("");
  console.log("=".repeat(70));
  console.log("T1-3 smoke results");
  console.log("=".repeat(70));
  let p=0, f=0;
  for (const r of results) {
    const mark = r.pass ? "  PASS" : "  FAIL";
    console.log(`${mark}  ${r.id.padEnd(5)}  ${r.name}`);
    if (!r.pass && r.detail) console.log("         " + r.detail);
    if (r.pass) p++; else f++;
  }
  console.log("-".repeat(70));
  console.log(`Summary: ${p} passed, ${f} failed (${results.length} total)`);
  process.exit(f > 0 ? 1 : 0);
})().catch((e) => {
  console.error("FATAL:", e.message);
  console.error(e.stack);
  process.exit(1);
});