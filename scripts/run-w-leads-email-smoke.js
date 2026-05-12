// scripts/run-w-leads-email-smoke.js
// W-LEADS-EMAIL T7 — direct-Postgres runner for the smoke matrix.
// Mirrors scripts/run-r-territory-t6-smoke.js architecture.

const fs = require("fs")
const path = require("path")

// Load .env.local
const envPath = path.resolve(".env.local")
const env = {}
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8")
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) {
      let val = m[2]
      if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("\u0027") && val.endsWith("\u0027"))) {
        val = val.slice(1, -1)
      }
      env[m[1]] = val
    }
  }
}

const connCandidates = ["DATABASE_URL", "SUPABASE_DB_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING"]
let connStr = null
let connStrSource = null
for (const name of connCandidates) {
  if (env[name])         { connStr = env[name];         connStrSource = ".env.local:" + name; break }
  if (process.env[name]) { connStr = process.env[name]; connStrSource = "process.env." + name; break }
}
if (!connStr) {
  console.error("ERROR: No Postgres connection string found.")
  process.exit(1)
}

const maskedConnStr = connStr.replace(/:([^:@]+)@/, ":****@")
console.log("Connection: " + maskedConnStr)
console.log("Source:     " + connStrSource)
console.log("")

let Client
try { ({ Client } = require("pg")) } catch (e) {
  console.error("ERROR: pg package not installed. Install: npm install --save-dev pg")
  process.exit(1)
}

const SMOKE_SQL = path.resolve("scripts/r-w-leads-email-smoke.sql")
if (!fs.existsSync(SMOKE_SQL)) {
  console.error("ERROR: " + SMOKE_SQL + " not found. Run: node scripts/gen-w-leads-email-smoke-sql.js")
  process.exit(1)
}
const fullSql = fs.readFileSync(SMOKE_SQL, "utf8")
console.log("Smoke SQL: " + SMOKE_SQL + " (" + fullSql.length + " chars)")

const finalSelectMarker = "-- \u2500\u2500\u2500 Final result set"
const rollbackMarker = "-- \u2500\u2500\u2500 Roll back EVERYTHING"
const finalSelectIdx = fullSql.indexOf(finalSelectMarker)
const rollbackIdx = fullSql.indexOf(rollbackMarker)
if (finalSelectIdx < 0 || rollbackIdx < 0) {
  console.error("ERROR: smoke SQL missing expected markers.")
  console.error("  finalSelect found: " + (finalSelectIdx >= 0))
  console.error("  rollback found:    " + (rollbackIdx >= 0))
  process.exit(1)
}
const body = fullSql.slice(0, finalSelectIdx)
const finalSelect = fullSql.slice(finalSelectIdx, rollbackIdx)

async function main() {
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
  let exitCode = 0
  let result = null
  try {
    await client.connect()
    console.log("Connected.")
    if (process.env.DISABLE_STATEMENT_TIMEOUT === "1") {
      await client.query("SET statement_timeout = 0;")
      console.log("statement_timeout DISABLED.")
    }
    console.log("")
    await client.query(body)
    console.log("Body executed.")
    result = await client.query(finalSelect)
    await client.query("ROLLBACK;")
    console.log("ROLLBACK issued.")
    console.log("")
  } catch (e) {
    console.error("ERROR:", e.message)
    if (e.detail) console.error("  detail:", e.detail)
    if (e.hint) console.error("  hint:", e.hint)
    if (e.where) console.error("  where:", e.where)
    try { await client.query("ROLLBACK;") } catch (_) {}
    try { await client.end() } catch (_) {}
    process.exit(1)
  }

  console.log("===== T7 SMOKE RESULTS =====")
  if (!result.rows || result.rows.length === 0) {
    console.log("(no rows)")
  } else {
    for (const r of result.rows) {
      const detail = (r.detail || "").length > 140 ? r.detail.slice(0, 140) + "..." : (r.detail || "")
      console.log("  [" + String(r.test_id).padStart(3) + "] " + r.result.padEnd(7) + " " + r.test_name)
      if (r.detail) console.log("        " + detail)
    }
  }
  const summary = result.rows.find(r => r.test_id === 999)
  if (summary) {
    console.log("")
    console.log("SUMMARY: " + summary.result + " — " + summary.detail)
  }
  const failed = result.rows.filter(r => r.test_id >= 1 && r.test_id <= 998 && r.result === "FAIL")
  if (failed.length > 0) {
    console.log("")
    console.log("FAILED TESTS:")
    for (const f of failed) {
      console.log("  Test " + f.test_id + ": " + f.test_name)
      console.log("    " + f.detail)
    }
    exitCode = 1
  }
  try { await client.end() } catch (_) {}
  process.exit(exitCode)
}
main()
