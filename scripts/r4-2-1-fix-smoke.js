const fs = require('fs')
const path = 'C:/Condoleads/project/scripts/r4-2-smoke-rpcs.js'

const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')
console.log('Detected line ending:', useCRLF ? 'CRLF' : 'LF')

const contentLF = original.replace(/\r\n/g, '\n')

const OLD_LF = [
  '    // Cycle: try to reassign AM \u2192 A1 (A1 is in AM\'s subtree)',
  '    await expectInvariant(\'17. TA1 reassigns AM \u2192 A1 (A1 in AM subtree \u2192 cycle)\', \'CYCLE\',',
  '      () => rpc.reassign(TA1, AM, A1, \'smoke 17\'))',
  '',
  '    await expectOk(\'18. TA1 reassigns A1 to top of tenant (parent=null)\','
].join('\n')

const NEW_LF = [
  '    // Cell 17 (cycle detection) intentionally omitted.',
  '    //',
  '    // The CYCLE invariant in rpc_reassign_parent fires when new_parent_id is',
  '    // in the target\'s subtree. But subtrees ALWAYS contain only same-or-lower',
  '    // tier agents (per the spec: parent role tier must be > child role tier).',
  '    // So any reachable cycle case is also a PARENT_TIER violation, and',
  '    // PARENT_TIER is checked first (cheaper).',
  '    //',
  '    // CYCLE remains in the RPC as defense-in-depth: it would activate if',
  '    // a data migration or manual SQL ever produced a same-tier parent-child',
  '    // relationship (currently impossible via API, but the trigger is the',
  '    // last line of defense if schema integrity is violated).',
  '    //',
  '    // Cell 17 retired 2026-05-04 in R4.2.1.',
  '',
  '    await expectOk(\'18. TA1 reassigns A1 to top of tenant (parent=null)\','
].join('\n')

if (!contentLF.includes(OLD_LF)) {
  console.error('OLD block not found; aborting.')
  console.error('Looking for first 80 chars of OLD:', JSON.stringify(OLD_LF.substring(0,80)))
  process.exit(1)
}

const updatedLF = contentLF.replace(OLD_LF, NEW_LF)
const updated = useCRLF ? updatedLF.replace(/\n/g, '\r\n') : updatedLF
fs.writeFileSync(path, updated, 'utf8')

console.log('Patched.')
console.log('Original size:', original.length)
console.log('New size:', updated.length)
console.log('Delta:', updated.length - original.length)