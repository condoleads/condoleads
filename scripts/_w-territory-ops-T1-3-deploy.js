// scripts/_w-territory-ops-T1-3-deploy.js
//
// T1-3 Phase 2 -- deploy territory_agents_summary RPC + verify against
// real WALLiam data + capture rollback snapshot.
//
// Pattern matches T0-1 deploy:
//   1. Capture rollback snapshot if function already exists
//   2. Apply migration inside a transaction
//   3. Verify function exists with the locked 10-column shape
//   4. Verify return values against the recon baseline:
//        King Shah: 11 cards, 9 building pins, 0 listing pins, 9 user assigns, is_tenant_default=true
//        Neo Smith: 1 card,   0 building pins, 0 listing pins, 0 user assigns, is_tenant_default=false
//        WALLiam:   0 cards,  0 building pins, 0 listing pins, 0 user assigns, is_tenant_default=false
//   5. Verify multi-tenant: aily returns 3 agents, all 0 cards, all is_tenant_default=false
//   6. COMMIT if all green; ROLLBACK + exit 1 on any verification failure
//
// IDEMPOTENT: re-run is no-op (CREATE OR REPLACE FUNCTION semantics).
//
// USAGE: node scripts/_w-territory-ops-T1-3-deploy.js

require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATION_PATH = path.join(
  "supabase",
  "migrations",
  "20260525_w_territory_ops_T1_3_agents_summary_rpc.sql"
);
const SNAPSHOT_DIR = path.join("supabase", "migrations", "rollback-snapshots");

const WALLIAM = "b16e1039-38ed-43d7-bbc5-dd02bb651bc9";
const AILY = "e2619717-6401-4159-8d4c-d5f87651c8d6";
const KING_SHAH = "fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe";
const NEO_SMITH = "f2ce3011-f8b0-4827-9d34-8fb7d7a9ba3f";
const WALLIAM_AGENT = "cf002201-9b11-4c0f-a1b3-65ed702c9976";

const cs =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!cs) {
  console.error("FATAL: no DB connection string in env");
  process.exit(1);
}
if (!fs.existsSync(MIGRATION_PATH)) {
  console.error(`FATAL: migration not on disk: ${MIGRATION_PATH}`);
  process.exit(1);
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "_" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail: detail || "" });
}

(async () => {
  const c = new Client({ connectionString: cs });
  await c.connect();

  // === 1. Rollback snapshot (only if function already exists) ===
  const existing = await c.query(
    `SELECT pg_get_functiondef(oid) AS body
       FROM pg_proc
      WHERE proname = 'territory_agents_summary'
      LIMIT 1`
  );

  if (existing.rowCount > 0) {
    if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const snapPath = path.join(
      SNAPSHOT_DIR,
      `_w-territory-ops-T1-3-agents-summary-snapshot_${stamp()}.sql`
    );
    fs.writeFileSync(
      snapPath,
      `-- Pre-T1-3 snapshot of territory_agents_summary captured ${new Date().toISOString()}\n` +
      `-- Restore via: psql -f <this file>\n\n` +
      existing.rows[0].body +
      ";\n"
    );
    console.log(`Rollback snapshot: ${snapPath}`);
  } else {
    console.log("No pre-existing territory_agents_summary -- this is a fresh deploy (no snapshot needed).");
  }

  // === 2. Apply migration inside a transaction ===
  const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
  console.log(`Applying migration: ${MIGRATION_PATH} (${sql.length} chars)`);

  await c.query("BEGIN");
  try {
    await c.query(sql);

    // === 3. Verify function exists with the locked shape ===
    const sig = await c.query(
      `SELECT pg_get_function_identity_arguments(oid) AS args,
              pg_get_function_result(oid) AS returns
         FROM pg_proc
        WHERE proname = 'territory_agents_summary'
        LIMIT 1`
    );
    check("function exists post-apply", sig.rowCount > 0);
    if (sig.rowCount > 0) {
      check(
        "function signature: p_tenant_id uuid",
        sig.rows[0].args.includes("p_tenant_id uuid"),
        `got: ${sig.rows[0].args}`
      );
      const expectedReturnFields = [
        "agent_id",
        "full_name",
        "role",
        "is_selling",
        "is_active",
        "is_tenant_default",
        "assigned_card_count",
        "building_pin_count",
        "listing_pin_count",
        "user_assignment_count",
      ];
      for (const f of expectedReturnFields) {
        check(
          `return column present: ${f}`,
          sig.rows[0].returns.includes(f),
          `returns: ${sig.rows[0].returns}`
        );
      }
    }

    // === 4. Verify WALLiam baseline ===
    const wRes = await c.query(
      `SELECT * FROM territory_agents_summary($1::uuid)`,
      [WALLIAM]
    );
    check("WALLiam returns 3 agents", wRes.rowCount === 3, `got ${wRes.rowCount}`);

    const byId = new Map(wRes.rows.map((r) => [r.agent_id, r]));

    // King Shah expectations
    const ks = byId.get(KING_SHAH);
    check("King Shah row present", !!ks);
    if (ks) {
      check("King Shah full_name", ks.full_name === "King Shah", `got ${ks.full_name}`);
      check("King Shah role=tenant_admin", ks.role === "tenant_admin", `got ${ks.role}`);
      check("King Shah selling=true", ks.is_selling === true);
      check("King Shah active=true", ks.is_active === true);
      check("King Shah is_tenant_default=true", ks.is_tenant_default === true);
      check("King Shah assigned_card_count=11", ks.assigned_card_count === 11, `got ${ks.assigned_card_count}`);
      check("King Shah building_pin_count=9", ks.building_pin_count === 9, `got ${ks.building_pin_count}`);
      check("King Shah listing_pin_count=0", ks.listing_pin_count === 0, `got ${ks.listing_pin_count}`);
      check("King Shah user_assignment_count=9", ks.user_assignment_count === 9, `got ${ks.user_assignment_count}`);
    }

    // Neo Smith expectations
    const ns = byId.get(NEO_SMITH);
    check("Neo Smith row present", !!ns);
    if (ns) {
      check("Neo Smith role=agent", ns.role === "agent", `got ${ns.role}`);
      check("Neo Smith is_tenant_default=false", ns.is_tenant_default === false);
      check("Neo Smith assigned_card_count=1", ns.assigned_card_count === 1, `got ${ns.assigned_card_count}`);
      check("Neo Smith building_pin_count=0", ns.building_pin_count === 0);
      check("Neo Smith user_assignment_count=0", ns.user_assignment_count === 0);
    }

    // WALLiam agent expectations
    const wa = byId.get(WALLIAM_AGENT);
    check("WALLiam agent row present", !!wa);
    if (wa) {
      check("WALLiam agent is_tenant_default=false", wa.is_tenant_default === false);
      check("WALLiam agent assigned_card_count=0", wa.assigned_card_count === 0);
      check("WALLiam agent building_pin_count=0", wa.building_pin_count === 0);
    }

    // === 5. Multi-tenant isolation: aily ===
    const aRes = await c.query(
      `SELECT * FROM territory_agents_summary($1::uuid)`,
      [AILY]
    );
    check("aily returns 3 agents", aRes.rowCount === 3, `got ${aRes.rowCount}`);
    const ailyAllZero =
      aRes.rows.every((r) => r.assigned_card_count === 0) &&
      aRes.rows.every((r) => r.building_pin_count === 0) &&
      aRes.rows.every((r) => r.listing_pin_count === 0);
    check("aily all agents have 0 cards / 0 pins (multi-tenant isolation)", ailyAllZero);

    // === Report ===
    const passN = checks.filter((c) => c.ok).length;
    const failN = checks.filter((c) => !c.ok).length;

    console.log("");
    console.log("=== T1-3 deploy verification ===");
    for (const c of checks) {
      const mark = c.ok ? "  PASS" : "  FAIL";
      console.log(`${mark}  ${c.name}`);
      if (!c.ok && c.detail) console.log("         " + c.detail);
    }
    console.log("-".repeat(70));
    console.log(`Summary: ${passN} passed, ${failN} failed (${checks.length} total)`);

    if (failN > 0) {
      console.error("");
      console.error("Verification failed. ROLLING BACK migration.");
      await c.query("ROLLBACK");
      await c.end();
      process.exit(1);
    }

    await c.query("COMMIT");
    console.log("");
    console.log("T1-3 RPC deployed. territory_agents_summary is now live.");
    console.log("");
    console.log("Live WALLiam baseline (proof of correctness):");
    for (const r of wRes.rows) {
      console.log(
        `  ${r.full_name.padEnd(15)} | role=${r.role.padEnd(13)} | cards=${r.assigned_card_count}  buildings=${r.building_pin_count}  listings=${r.listing_pin_count}  users=${r.user_assignment_count}  default=${r.is_tenant_default}`
      );
    }
    await c.end();
    process.exit(0);
  } catch (e) {
    console.error("");
    console.error("FATAL during apply:", e.message);
    await c.query("ROLLBACK").catch(() => {});
    await c.end();
    process.exit(1);
  }
})();