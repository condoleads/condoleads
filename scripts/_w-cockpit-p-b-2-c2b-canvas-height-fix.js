// scripts/_w-cockpit-p-b-2-c2b-canvas-height-fix.js
// W-COCKPIT P-B-2 Commit 2b fix: shrink canvas height so the building strip
// fits within the initial viewport.
//
// 2a used 70vh because the canvas was the only thing in the Chart view.
// 2b adds a Coverage panel above (~200px) and a Building strip below (~120px),
// so 70vh overflows the viewport on standard 1080p displays.
//
// 55vh leaves room for both above and below content without scrolling.

const fs = require("fs");

const FILE = "components/admin-homes/cockpit/territory/TerritoryCascadeChart.tsx";

if (!fs.existsSync(FILE)) {
  console.error("MISS: file not found: " + FILE);
  process.exit(1);
}

let src = fs.readFileSync(FILE, "utf8");
const before = src;

const FIND  = `    <div className="relative" style={{ height: '70vh' }}>`;
const REPL  = `    <div className="relative" style={{ height: '55vh' }}>`;

if (src.split(FIND).length - 1 !== 1) {
  console.error("MISS: 70vh anchor not unique or absent");
  process.exit(1);
}

src = src.replace(FIND, REPL);
fs.writeFileSync(FILE, src, "utf8");
console.log("  applied: canvas height 70vh -> 55vh");