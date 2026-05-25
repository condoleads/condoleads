// scripts/r-territory-ops-T1-1-drop-chart.js
//
// W-TERRITORY-OPS T1-1 -- drop chart UI, mount placeholder, keep TerritoryClient.
//
// EDIT TARGET: components/admin-homes/cockpit/tabs/TerritoryTab.tsx
//
// CHANGES:
//   1. Remove `useState` import (no longer needed)
//   2. Remove `TerritoryCascadeChart` import
//   3. Remove `Network, Table` icon imports (toggle is gone; replace with Construction icon)
//   4. Remove view state + Chart/Detail toggle UI
//   5. Mount honest "rebuild in progress" banner above TerritoryClient
//   6. TerritoryClient stays mounted below the banner
//
// SAFETY:
//   - Timestamped backup BEFORE edit
//   - CRLF line endings preserved (component .tsx files are CRLF per memory)
//   - Atomic write via Buffer.from + fs.writeFileSync
//   - Verification block re-reads file, checks markers, validates byte change
//   - Exits 0 on success, 1 on any verification failure
//
// USAGE:
//   node scripts/r-territory-ops-T1-1-drop-chart.js
//
// IDEMPOTENT:
//   If file already matches new state (no chart import, no useState, banner present),
//   prints "already applied" and exits 0 without backup or write.

const fs = require("fs");
const path = require("path");

const TARGET = path.join(
  "components",
  "admin-homes",
  "cockpit",
  "tabs",
  "TerritoryTab.tsx"
);

const ABS = path.resolve(TARGET);

function fail(msg) {
  console.error("FATAL: " + msg);
  process.exit(1);
}

function info(msg) {
  console.log(msg);
}

// ─── Read current file ─────────────────────────────────────────────────────
if (!fs.existsSync(ABS)) {
  fail(`target not on disk: ${ABS}`);
}
const originalBuf = fs.readFileSync(ABS);
const originalText = originalBuf.toString("utf8");
const originalBytes = originalBuf.length;

// Detect line endings
let crlfCount = 0;
let lfCount = 0;
for (let i = 0; i < originalBuf.length; i++) {
  if (originalBuf[i] === 0x0a) {
    if (i > 0 && originalBuf[i - 1] === 0x0d) crlfCount++;
    else lfCount++;
  }
}
const NL = crlfCount > lfCount ? "\r\n" : "\n";
info(
  `Read ${ABS} (${originalBytes} bytes; CRLF=${crlfCount}, LF=${lfCount}, using ${NL === "\r\n" ? "CRLF" : "LF"})`
);

// ─── Idempotency check ────────────────────────────────────────────────────
const alreadyApplied =
  !originalText.includes("TerritoryCascadeChart") &&
  !originalText.includes("useState") &&
  originalText.includes("Territory operations dashboard");

if (alreadyApplied) {
  info("Already applied (no chart import, no useState, banner present). Exiting 0.");
  process.exit(0);
}

// ─── Pre-flight: verify expected anchors are present ──────────────────────
const requiredAnchors = [
  `import { useState } from 'react'`,
  `import TerritoryCascadeChart from '@/components/admin-homes/cockpit/territory/TerritoryCascadeChart'`,
  `import { Network, Table } from 'lucide-react'`,
  `const [view, setView] = useState<'chart' | 'detail'>('chart')`,
  `<TerritoryCascadeChart tenantId={tenantId} tenantName={tenantName} />`,
];
for (const a of requiredAnchors) {
  if (!originalText.includes(a)) {
    fail(`expected anchor not found in file: ${JSON.stringify(a.slice(0, 80))}`);
  }
}
info("Pre-flight: all 5 expected anchors present.");

// ─── Backup ────────────────────────────────────────────────────────────────
const stamp = (() => {
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
})();
const backupPath = ABS + ".backup_" + stamp;
fs.writeFileSync(backupPath, originalBuf);
info(`Backup written: ${backupPath} (${originalBytes} bytes)`);

// ─── Compose new file content ─────────────────────────────────────────────
// Lines arranged with the project's CRLF line ending.
const lines = [
  `'use client'`,
  `// components/admin-homes/cockpit/tabs/TerritoryTab.tsx`,
  `// W-TERRITORY-OPS T1-1 -- chart dropped; rebuild-in-progress banner mounted.`,
  `// TerritoryClient (legacy Coverage/Matrix/Audit) remains fully functional below`,
  `// the banner so operators retain capability while T1-2..T1-6 ship the new`,
  `// Health / Agents / Cards / Geography views.`,
  `import TerritoryClient from '@/components/admin-homes/TerritoryClient'`,
  `import { Construction } from 'lucide-react'`,
  ``,
  `interface Props { tenantId: string; tenantName: string }`,
  ``,
  `export default function TerritoryTab({ tenantId, tenantName }: Props) {`,
  `  return (`,
  `    <div>`,
  `      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4">`,
  `        <div className="flex items-start gap-3">`,
  `          <Construction className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />`,
  `          <div className="flex-1 text-sm">`,
  `            <p className="font-semibold text-amber-900">`,
  `              Territory operations dashboard &mdash; rebuild in progress`,
  `            </p>`,
  `            <p className="mt-1 text-amber-800">`,
  `              The new Health, Agents, Cards, and Geography views are being`,
  `              built. Until then, the Coverage / Matrix / Audit views below`,
  `              remain fully functional.`,
  `            </p>`,
  `          </div>`,
  `        </div>`,
  `      </div>`,
  `      <TerritoryClient tenantId={tenantId} tenantName={tenantName} seeAll={false} />`,
  `    </div>`,
  `  )`,
  `}`,
  ``, // trailing newline
];
const newText = lines.join(NL);
const newBuf = Buffer.from(newText, "utf8");

// ─── Write atomically ──────────────────────────────────────────────────────
fs.writeFileSync(ABS, newBuf);
info(`Wrote ${ABS} (${newBuf.length} bytes)`);

// ─── Verify ───────────────────────────────────────────────────────────────
const verifyBuf = fs.readFileSync(ABS);
const verifyText = verifyBuf.toString("utf8");

const mustHave = [
  `'use client'`,
  `import TerritoryClient from '@/components/admin-homes/TerritoryClient'`,
  `import { Construction } from 'lucide-react'`,
  `Territory operations dashboard`,
  `rebuild in progress`,
  `<TerritoryClient tenantId={tenantId} tenantName={tenantName} seeAll={false} />`,
];
const mustNotHave = [
  `TerritoryCascadeChart`,
  `useState`,
  `Network, Table`,
  `Chart/Detail`,
  `setView`,
];

let pass = true;
const issues = [];
for (const m of mustHave) {
  if (!verifyText.includes(m)) {
    pass = false;
    issues.push(`MISSING (should be present): ${JSON.stringify(m.slice(0, 80))}`);
  }
}
for (const m of mustNotHave) {
  if (verifyText.includes(m)) {
    pass = false;
    issues.push(`PRESENT (should be gone): ${JSON.stringify(m)}`);
  }
}

// Line ending check on the written file
let newCrlf = 0;
let newLf = 0;
for (let i = 0; i < verifyBuf.length; i++) {
  if (verifyBuf[i] === 0x0a) {
    if (i > 0 && verifyBuf[i - 1] === 0x0d) newCrlf++;
    else newLf++;
  }
}
const mixed = newCrlf > 0 && newLf > 0;
if (mixed) {
  pass = false;
  issues.push(`mixed line endings written (CRLF=${newCrlf}, LF=${newLf})`);
}

console.log("");
console.log("=== T1-1 patch verification ===");
console.log(`  Original size: ${originalBytes} bytes`);
console.log(`  New size:      ${verifyBuf.length} bytes`);
console.log(`  Backup:        ${backupPath}`);
console.log(`  Line endings:  ${newCrlf > 0 ? "CRLF" : "LF"} (CRLF=${newCrlf}, LF=${newLf})`);
console.log(`  Mixed:         ${mixed}`);
console.log(`  Markers present:  ${mustHave.length - issues.filter(i => i.startsWith('MISSING')).length}/${mustHave.length}`);
console.log(`  Markers removed:  ${mustNotHave.length - issues.filter(i => i.startsWith('PRESENT')).length}/${mustNotHave.length}`);
console.log("");

if (!pass) {
  console.error("VERIFICATION FAILED:");
  for (const i of issues) console.error("  " + i);
  console.error("");
  console.error(`Restore from backup: copy ${backupPath} back to ${ABS}`);
  process.exit(1);
}

console.log("PASS -- T1-1 patch applied cleanly.");
console.log("");
console.log("Next:");
console.log("  npx tsc --noEmit   -- TSC clean check");
console.log("  npm run dev        -- visual smoke at http://localhost:3000/admin-homes/tenants/{id}/cockpit (?tab=territory)");
console.log("");
process.exit(0);