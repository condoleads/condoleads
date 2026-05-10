#!/usr/bin/env node
/**
 * patch-t2g-runner-p10-fix.js (v3 — regex matching, whitespace-tolerant)
 *
 * v1/v2 used literal-substring oldStr matches and both failed in the wild
 * (whitespace/CRLF/quote drift). v3 matches the .includes() expression
 * via regex with \s+ between the literal "true\n" escape sequence and
 * "ORDER BY", tolerating any whitespace count.
 */

const fs = require('fs')
const path = require('path')

const TARGET = path.resolve('scripts', 'apply-t2g-resolve-agent-tenant-filter.js')

// Match the brittle .includes() call. \\n matches the literal 2-char JS
// escape sequence \n in the source code (backslash + n). \s+ tolerates
// any whitespace between that and ORDER BY.
const OLD_RE = /post\.body\.includes\(\s*"WHERE tenant_id = p_tenant_id AND is_active = true\\n\s+ORDER BY created_at ASC LIMIT 1"\s*\)/

const NEW_SNIPPET = '/WHERE tenant_id = p_tenant_id AND is_active = true\\s+ORDER BY created_at ASC LIMIT 1/.test(post.body)'

if (!fs.existsSync(TARGET)) {
  console.error('ERROR: target not found: ' + TARGET)
  process.exit(1)
}

const content = fs.readFileSync(TARGET, 'utf8')

if (content.indexOf(NEW_SNIPPET) !== -1) {
  console.log('Patch already applied (regex .test() form present). No-op.')
  process.exit(0)
}

const globalRe = new RegExp(OLD_RE.source, 'g')
const matches = content.match(globalRe) || []

if (matches.length === 0) {
  console.error('ERROR: regex did not match. Lines 149-154 dump:')
  const lines = content.split(/\r?\n/)
  for (let i = 148; i <= 153 && i < lines.length; i++) {
    console.error('  L' + (i + 1) + ': ' + JSON.stringify(lines[i]))
  }
  process.exit(1)
}
if (matches.length !== 1) {
  console.error('ERROR: expected exactly 1 match, found ' + matches.length)
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15)
const backup = TARGET + '.backup_' + stamp
fs.copyFileSync(TARGET, backup)
console.log('Backed up: ' + backup)

const patched = content.replace(OLD_RE, NEW_SNIPPET)
fs.writeFileSync(TARGET, patched, 'utf8')
console.log('Patched: ' + TARGET)
console.log('P10 check now uses regex .test() with \\s+ — whitespace-tolerant.')