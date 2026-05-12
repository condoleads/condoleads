const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")

const status = execSync("git -c core.quotepath=false status --porcelain", { encoding: "utf8" })
const lines = status.split("\n").filter(Boolean)

const goodExt = new Set([".js", ".ts", ".tsx", ".json", ".md", ".txt", ".sql", ".log", ".sh", ".ps1", ".yml", ".yaml", ".lock", ".config", ".env", ".gitignore", ".css", ".html", ".tsv", ".csv"])

const stray = []
const legit = []

for (const line of lines) {
  if (!line.startsWith("??")) continue
  let p = line.slice(3).trim()
  if (p.startsWith("\"") && p.endsWith("\"")) p = p.slice(1, -1)
  if (!p.includes("/")) {
    const ext = path.extname(p).toLowerCase()
    if (!goodExt.has(ext)) stray.push(p)
    else legit.push(p)
  }
}

console.log("=== STRAY FILES (will quarantine) ===")
stray.forEach(p => console.log("  " + JSON.stringify(p)))
console.log("Count stray = " + stray.length)
console.log("")
console.log("=== LEGITIMATE TOP-LEVEL UNTRACKED (kept in place) ===")
legit.forEach(p => console.log("  " + p))
console.log("")

if (stray.length === 0) { console.log("No stray files - nothing to quarantine"); process.exit(0) }

const d = new Date()
const pad = n => String(n).padStart(2, "0")
const stamp = d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + "_" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
const quarantine = path.join(".stray-cleanup", stamp)
fs.mkdirSync(quarantine, { recursive: true })

let moved = 0
for (const p of stray) {
  try {
    if (fs.existsSync(p)) {
      const safe = p.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) + "_" + moved
      const dest = path.join(quarantine, safe)
      fs.renameSync(p, dest)
      console.log("  moved: " + JSON.stringify(p))
      moved++
    } else { console.log("  not found on disk (skipping): " + JSON.stringify(p)) }
  } catch (e) { console.log("  ERROR: " + JSON.stringify(p) + " - " + e.message) }
}
console.log("")
console.log("Quarantined " + moved + " stray files to " + quarantine)
