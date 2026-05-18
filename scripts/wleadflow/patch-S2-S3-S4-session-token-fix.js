#!/usr/bin/env node
// scripts/wleadflow/patch-S2-S3-S4-session-token-fix.js
//
// Adds a fresh session_token UUID generation to the chat_sessions clone
// in run-S2-S3-S4-session.js. Addresses the UNIQUE-constraint collision
// where the clone inherits the template's session_token verbatim.
//
// Pattern matches the production route at
// app/api/walliam/charlie/session/route.ts which always sets
//   session_token: crypto.randomUUID()
// on insert.
//
// Idempotent: aborts if the patched line is already present.

const fs = require('fs');

const target = 'scripts/wleadflow/run-S2-S3-S4-session.js';
if (!fs.existsSync(target)) {
  console.error('ABORT: target not found: ' + target);
  process.exit(1);
}

// Timestamped backup -- mandatory per Rule Zero
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '_' +
              pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
const backupPath = target + '.backup_' + stamp;
fs.copyFileSync(target, backupPath);
console.log('BACKUP: ' + backupPath);

let text = fs.readFileSync(target, 'utf8');
const originalLen = text.length;

// Idempotency guard
if (text.indexOf("clone.session_token = require('crypto').randomUUID()") !== -1) {
  console.error('ABORT: patch already applied (session_token line present)');
  process.exit(1);
}

// Anchor: exact line at line 105 of unpatched file
const anchor = "    if ('user_id' in clone)           clone.user_id = null;  // anonymous test session";
const newLine = "    if ('session_token' in clone)     clone.session_token = require('crypto').randomUUID();  // fresh unique token (avoid UNIQUE collision on clone)";
const replacement = anchor + '\n' + newLine;

// Anchor uniqueness check
const occ = text.split(anchor).length - 1;
if (occ !== 1) {
  console.error('ABORT: anchor count ' + occ + ' != 1 in ' + target);
  console.error('  anchor: ' + JSON.stringify(anchor));
  process.exit(1);
}

text = text.replace(anchor, replacement);
fs.writeFileSync(target, text, 'utf8');

const newLen = text.length;
console.log('PATCHED: ' + target);
console.log('  before: ' + originalLen + ' bytes');
console.log('  after:  ' + newLen + ' bytes');
console.log('  delta:  +' + (newLen - originalLen) + ' bytes');

// Post-verify: read back and confirm both old + new lines coexist
const verify = fs.readFileSync(target, 'utf8');
const oldPresent = verify.indexOf(anchor) !== -1;
const newPresent = verify.indexOf("clone.session_token = require('crypto').randomUUID()") !== -1;
if (!oldPresent) {
  console.error('ABORT: post-verify -- anchor line missing from output');
  process.exit(1);
}
if (!newPresent) {
  console.error('ABORT: post-verify -- new session_token line missing from output');
  process.exit(1);
}
console.log('VERIFIED: anchor line preserved + session_token line present');