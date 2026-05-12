// scripts/patch-w-leads-email-tracker-v20.js
// W-LEADS-EMAIL tracker v19 -> v20: T6e CLOSED, T6 phase FULLY CLOSED

const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
const TRACKER = path.join(ROOT, "docs/W-LEADS-EMAIL-TRACKER.md")

if (!process.env.V20_ENTRY_B64) { console.error("FAIL: V20_ENTRY_B64 env var not set"); process.exit(1) }
const V20_ENTRY = Buffer.from(process.env.V20_ENTRY_B64, "base64").toString("utf8")

function fail(msg) { console.error("FAIL:", msg); process.exit(1) }

function ts() {
  const d = new Date(); const pad = n => String(n).padStart(2, "0")
  return d.getFullYear().toString() + pad(d.getMonth()+1) + pad(d.getDate()) + "_" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
}

function readMeta(p) {
  const buf = fs.readFileSync(p)
  const hasBOM = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF
  const text = buf.toString("utf8")
  let crlf = 0, lf = 0
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0A) { if (i > 0 && buf[i-1] === 0x0D) crlf++; else lf++ }
  }
  const lineEnding = (crlf > 0 && lf === 0) ? "CRLF" : (crlf === 0 && lf > 0) ? "LF" : "MIXED"
  return { text, hasBOM, lineEnding, size: buf.length }
}

function atomicReplace(text, oldStr, newStr, label) {
  const first = text.indexOf(oldStr); const last = text.lastIndexOf(oldStr)
  if (first === -1) fail(label + ": anchor not found")
  if (first !== last) fail(label + ": anchor not unique (first=" + first + ", last=" + last + ")")
  console.log("  [" + label + "] offset=" + first + " oldLen=" + oldStr.length + " newLen=" + newStr.length + " delta=" + (newStr.length - oldStr.length))
  return text.substring(0, first) + newStr + text.substring(first + oldStr.length)
}

const EMDASH = "\u2014"
const CHECK = "\u2705"

console.log("=== Tracker v19 -> v20 patch starting ===\n")

const meta0 = readMeta(TRACKER)
console.log("pre-patch state:")
console.log("  size=" + meta0.size + " BOM=" + meta0.hasBOM + " lineEnding=" + meta0.lineEnding + "\n")

if (meta0.size !== 141629) fail("baseline size: expected 141629, got " + meta0.size)
if (meta0.lineEnding !== "CRLF") fail("baseline line ending: expected CRLF, got " + meta0.lineEnding)
if (meta0.hasBOM) fail("baseline: BOM should NOT be present")

if (meta0.text.indexOf("v20") !== -1) fail("tracker already contains v20 - already patched")
if (meta0.text.indexOf("T6e CLOSED 2026-05-12") !== -1) fail("tracker already has T6e CLOSED 2026-05-12 marker")

const backup = TRACKER + ".backup_" + ts()
fs.copyFileSync(TRACKER, backup)
console.log("backup: " + backup + "\n")

let text = meta0.text

// P1: L3 version header v19 -> v20
const P1_OLD = "**Version:** v19 " + EMDASH + " T6d CLOSED 2026-05-11 (T6d-1 + T6d-2 + T6d-3 shipped)"
const P1_NEW = "**Version:** v20 " + EMDASH + " T6e CLOSED 2026-05-12 (T6e-1 + T6e-2 + T6e-3 single-commit close) " + EMDASH + " T6 phase FULLY CLOSED"
text = atomicReplace(text, P1_OLD, P1_NEW, "P1 L3 version header")

// P2: L4 T6 phase segment - mark fully CLOSED, append T6e
const P2_OLD = "**T6 phase IN PROGRESS " + EMDASH + " T6a + T6b + T6c + T6f-A + T6f-B (B-1 + B-2 + B-3 + B-4) + T6f-C (C-1 + C-2) + T6d (T6d-1 + T6d-2 + T6d-3) " + CHECK + " CLOSED 2026-05-11.**"
const P2_NEW = "**T6 phase " + CHECK + " CLOSED 2026-05-12 " + EMDASH + " T6a + T6b + T6c + T6f-A + T6f-B (B-1 + B-2 + B-3 + B-4) + T6f-C (C-1 + C-2) + T6d (T6d-1 + T6d-2 + T6d-3) + T6e (T6e-1 + T6e-2 + T6e-3). All 8 sub-phases shipped, OD-4=(c) bidirectional contract verified intact via smoke 9/9 GREEN.**"
text = atomicReplace(text, P2_OLD, P2_NEW, "P2 L4 T6 phase segment")

// P3: L4 Next: pointer - retire T6e mention, point at T7
const P3_OLD = "**Next: T6 continues " + EMDASH + " T6e (plan integration verification per OD-4=(c) " + EMDASH + " final T6 sub-phase). T6d fully closed: T6d-1 channel-aware auto-approve config + T6d-2 schema migration (granted_by_tier CHECK relaxation adding 'auto') + T6d-3 defensive error capture, single commit `2b0dce6`. T6f-C fully closed: C-1 walliam/contact (commit `655ed9b`) + C-2 walliam/charlie/vip-approve (commit `d73ee70`). T6f-B fully closed: B-1 + B-2 (commit `99de227` v16) + B-3 (commit `60bc358`) + B-4 (commit `529aeae`).**"
const P3_NEW = "**Next: T7 cross-tenant smoke matrix (OD-6=(c) at v2; covers new T6d + T6e findings + 2 neighbourhood findings F-SLUG-ROUTER-MISSING-NEIGHBOURHOOD-BRANCH + F-T5-VERIFY-NEIGHBOURHOOD-CHARLIE-CONTEXT-RENDER from T5 closure). Then T8 comprehensive smoke + regression sweep, Tlast workstream close + `docs/W-LAUNCH-TRACKER.md` row update. T6e shipped: T6e-1 helper tenant_id fix + T6e-2 caller activity_type fix + T6e-3 F57 comment correction, single commit `2f44877`. T6d fully closed: T6d-1 channel-aware auto-approve config + T6d-2 schema migration (granted_by_tier CHECK relaxation adding \"auto\") + T6d-3 defensive error capture, single commit `2b0dce6`. T6f-C fully closed: C-1 walliam/contact (commit `655ed9b`) + C-2 walliam/charlie/vip-approve (commit `d73ee70`). T6f-B fully closed: B-1 + B-2 (commit `99de227` v16) + B-3 (commit `60bc358`) + B-4 (commit `529aeae`).**"
text = atomicReplace(text, P3_OLD, P3_NEW, "P3 L4 Next pointer")

// P4: Insert v20 entry as new line before v19 entry at L618
const V19_ANCHOR = "- **2026-05-11 v19 T6d CLOSED"
const V19_IDX = text.indexOf(V19_ANCHOR)
if (V19_IDX === -1) fail("P4: v19 anchor line not found")
const V19_LAST = text.lastIndexOf(V19_ANCHOR)
if (V19_IDX !== V19_LAST) fail("P4: v19 anchor not unique")

const insertion = V20_ENTRY + "\r\n"
text = text.substring(0, V19_IDX) + insertion + text.substring(V19_IDX)
console.log("  [P4 insert v20 entry] before v19 at offset " + V19_IDX + ", inserted " + insertion.length + " chars")

fs.writeFileSync(TRACKER, Buffer.from(text, "utf8"))

// Post-patch verification
const meta1 = readMeta(TRACKER)
console.log("\npost-patch state:")
console.log("  size=" + meta1.size + " (delta +" + (meta1.size - meta0.size) + ") BOM=" + meta1.hasBOM + " lineEnding=" + meta1.lineEnding)

if (meta1.lineEnding !== "CRLF") fail("post-patch line ending corrupted: " + meta1.lineEnding)
if (meta1.hasBOM) fail("post-patch: BOM appeared unexpectedly")

if (meta1.text.indexOf("**Version:** v20") === -1) fail("v20 version header missing post-patch")
if (meta1.text.indexOf("T6 phase " + CHECK + " CLOSED 2026-05-12") === -1) fail("T6 phase CLOSED marker missing")
if (meta1.text.indexOf("Next: T7 cross-tenant smoke matrix") === -1) fail("Next: T7 pointer missing")
if (meta1.text.indexOf("2026-05-12 v20 T6e CLOSED") === -1) fail("v20 entry not inserted")

const v20count = (meta1.text.match(/v20/g) || []).length
console.log("  v20 occurrences: " + v20count + " (must be >= 4)")
if (v20count < 4) fail("expected >= 4 v20 references, got " + v20count)

console.log("\n=== Tracker v19 -> v20 patch COMPLETE ===")
console.log("Backup: " + backup)
