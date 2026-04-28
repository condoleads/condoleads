// scripts/fix-gate-uxbug.js
// W-RECOVERY A1 follow-up: gate UX bugs (v2 — corrected indentation)
//   1. useCharlie.ts — remove message echo from gate branch
//   2. CharlieOverlay.tsx — forward gateReason + onOpenRegister to ChatPanel
//   3. ChatPanel.tsx — gate quick replies; disable input + send when gated

const fs = require('fs')

const files = [
  'app/charlie/hooks/useCharlie.ts',
  'app/charlie/components/CharlieOverlay.tsx',
  'app/charlie/components/ChatPanel.tsx',
]

const fileData = {}
for (const p of files) {
  if (!fs.existsSync(p)) {
    console.error('FAIL: missing file ' + p)
    process.exit(1)
  }
  const raw = fs.readFileSync(p, 'utf8')
  const ending = raw.includes('\r\n') ? '\r\n' : '\n'
  fileData[p] = { content: raw.replace(/\r\n/g, '\n'), ending }
}

let edits = 0

// === EDIT 1: useCharlie.ts — remove message echo from gate branch ===
{
  const p = 'app/charlie/hooks/useCharlie.ts'
  const find = `    if (!userIdRef.current && !isGreeting) {
      setState(s => ({
        ...s,
        gateActive: true,
        gateReason: 'register',
        gatePlanType: null,
        isStreaming: false,
        // Echo the user's message into the conversation but do NOT add a streaming assistant placeholder
        messages: [...s.messages, { id: Date.now().toString(), role: 'user' as const, content: userText }],
      }))
      return
    }`
  const replace = `    if (!userIdRef.current && !isGreeting) {
      setState(s => ({
        ...s,
        gateActive: true,
        gateReason: 'register',
        gatePlanType: null,
        isStreaming: false,
      }))
      return
    }`
  const c = fileData[p].content
  const occ = c.split(find).length - 1
  if (occ === 0) {
    console.error('FAIL [1] useCharlie.ts: gate branch anchor not found')
    process.exit(1)
  }
  if (occ > 1) {
    console.error('FAIL [1] useCharlie.ts: gate branch matched ' + occ + ' times, expected 1')
    process.exit(1)
  }
  fileData[p].content = c.replace(find, replace)
  console.log('OK  [1] useCharlie.ts: removed message echo from gate branch')
  edits++
}

// === EDIT 2: CharlieOverlay.tsx — forward gateReason + onOpenRegister to ChatPanel ===
{
  const p = 'app/charlie/components/CharlieOverlay.tsx'
  const re = /(<ChatPanel\s+messages=\{state\.messages\}\s+isStreaming=\{state\.isStreaming\}\s+assistantName=\{state\.assistantName\}\s+onSend=\{onSend\}\s+onBuyClick=\{\(\) => setFormMode\('buyer'\)\}\s+onSellClick=\{\(\) => setFormMode\('seller'\)\})(\s*)\/>/
  const reGlobal = new RegExp(re.source, 'g')
  const c = fileData[p].content
  const allMatches = c.match(reGlobal)
  if (!allMatches) {
    console.error('FAIL [2] CharlieOverlay.tsx: ChatPanel JSX block not found')
    process.exit(1)
  }
  if (allMatches.length > 1) {
    console.error('FAIL [2] CharlieOverlay.tsx: ChatPanel JSX block matched ' + allMatches.length + ' times')
    process.exit(1)
  }
  fileData[p].content = c.replace(
    re,
    '$1\n                  gateReason={state.gateReason}\n                  onOpenRegister={onOpenRegister}\n                />'
  )
  console.log('OK  [2] CharlieOverlay.tsx: forwarded gateReason + onOpenRegister to ChatPanel')
  edits++
}

// === EDIT 3a: ChatPanel.tsx — gate quick reply onSend ===
{
  const p = 'app/charlie/components/ChatPanel.tsx'
  let c = fileData[p].content

  const re3a = /(if \(r === 'I want to sell'\) \{ onSellClick\?\.\(\); return \}\n)(\s+)(onSend\(r\))/
  const re3aG = new RegExp(re3a.source, 'g')
  const m3a = c.match(re3aG)
  if (!m3a) {
    console.error('FAIL [3a] ChatPanel.tsx: quick reply block not found')
    process.exit(1)
  }
  if (m3a.length > 1) {
    console.error('FAIL [3a] ChatPanel.tsx: quick reply block matched ' + m3a.length + ' times')
    process.exit(1)
  }
  c = c.replace(re3a, "$1$2if (isGated) { onOpenRegister?.(); return }\n$2$3")
  console.log('OK  [3a] ChatPanel.tsx: gated quick reply onSend')
  edits++

  // === EDIT 3b: input disabled — add isGated ===
  const find3b = 'disabled={isStreaming}'
  const occ3b = c.split(find3b).length - 1
  if (occ3b !== 1) {
    console.error('FAIL [3b] ChatPanel.tsx: input disabled prop found ' + occ3b + ' times, expected 1')
    process.exit(1)
  }
  c = c.replace(find3b, 'disabled={isStreaming || isGated}')
  console.log('OK  [3b] ChatPanel.tsx: input disabled now includes isGated')
  edits++

  // === EDIT 3c: send button disabled — add isGated ===
  const find3c = 'disabled={!input.trim() || isStreaming}'
  const occ3c = c.split(find3c).length - 1
  if (occ3c !== 1) {
    console.error('FAIL [3c] ChatPanel.tsx: button disabled prop found ' + occ3c + ' times, expected 1')
    process.exit(1)
  }
  c = c.replace(find3c, 'disabled={!input.trim() || isStreaming || isGated}')
  console.log('OK  [3c] ChatPanel.tsx: send button disabled now includes isGated')
  edits++

  fileData[p].content = c
}

// Write all back with original line endings
for (const p of files) {
  const out = fileData[p].ending === '\r\n'
    ? fileData[p].content.replace(/\n/g, '\r\n')
    : fileData[p].content
  fs.writeFileSync(p, out, 'utf8')
}

console.log('')
console.log('=== ' + edits + ' edits applied across ' + files.length + ' files ===')
console.log('Next: npx tsc --noEmit')