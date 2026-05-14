// scripts/patch-w4b-fix-stripped-anchors.js
// Repair PlanRenderer.tsx: three anchor opening tokens were stripped in
// transit (chat sanitization). Reinsert at the three known sites
// identified at L497 / L528 / L536 in the post-W4b file dump.

const fs = require('fs')
const path = require('path')

const FILE = 'components/admin-homes/lead-workbench/PlanRenderer.tsx'
const filePath = path.join(process.cwd(), FILE)
const ts = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)

fs.copyFileSync(filePath, filePath + '.backup_' + ts)
console.log('  BACKUP ' + path.basename(filePath) + ' -> ' + path.basename(filePath) + '.backup_' + ts)

let txt = fs.readFileSync(filePath, 'utf8')

// Build the missing token without ever placing the literal opening sequence
// adjacent in source. At runtime '\u003c' -> '<' concatenated with 'a' -> '<a'.
const A_OPEN = '\u003c' + 'a'

const patches = [
  {
    label: 'SourceUrl anchor open',
    before: '      \u003ch3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Source URL\u003c/h3>\n      \n        href={url}',
    after:  '      \u003ch3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Source URL\u003c/h3>\n      ' + A_OPEN + '\n        href={url}',
  },
  {
    label: 'AgentCard email anchor open',
    before: "          {agent.email && (\n            \n              href={'mailto:' + agent.email}",
    after:  "          {agent.email && (\n            " + A_OPEN + "\n              href={'mailto:' + agent.email}",
  },
  {
    label: 'AgentCard phone anchor open',
    before: "          {agent.cell_phone && (\n            \n              href={'tel:' + agent.cell_phone}",
    after:  "          {agent.cell_phone && (\n            " + A_OPEN + "\n              href={'tel:' + agent.cell_phone}",
  },
]

for (const p of patches) {
  const firstIdx = txt.indexOf(p.before)
  if (firstIdx === -1) throw new Error('Anchor not found: ' + p.label)
  const secondIdx = txt.indexOf(p.before, firstIdx + p.before.length)
  if (secondIdx !== -1) throw new Error('Anchor not unique: ' + p.label)
  txt = txt.replace(p.before, p.after)
  console.log('  PATCH  ' + p.label)
}

fs.writeFileSync(filePath, txt, 'utf8')
console.log('  WROTE  ' + FILE + ' (' + txt.length + ' bytes)')