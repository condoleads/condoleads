const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();

function dumpTracker(rel, sectionFilter) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.log('=== ' + rel + ' === NOT FOUND'); return; }
  const raw = fs.readFileSync(p, 'utf8');
  const crlf = /\r\n/.test(raw);
  const lines = (crlf ? raw.replace(/\r\n/g, '\n') : raw).split('\n');
  console.log('===== ' + rel + ' (' + lines.length + ' lines, ' + (crlf ? 'CRLF' : 'LF') + ') =====');

  // Header (first 8 lines)
  console.log('--- HEADER ---');
  for (let i = 0; i < Math.min(8, lines.length); i++) console.log('L' + (i + 1) + ': ' + lines[i]);

  // All ## section headings
  console.log('--- SECTION HEADINGS ---');
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) console.log('L' + (i + 1) + ': ' + lines[i]);
  }

  // For each requested section, dump full content
  for (const filter of sectionFilter) {
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (new RegExp('^##\\s+' + filter, 'i').test(lines[i])) { start = i; break; }
    }
    if (start < 0) { console.log('--- SECTION "' + filter + '" NOT FOUND ---'); continue; }
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) { end = i; break; }
    }
    const sectionLen = end - start;
    console.log('--- SECTION "' + filter + '" L' + (start + 1) + '-L' + end + ' (' + sectionLen + ' lines) ---');
    // Cap dump at 60 lines per section to fit scrollback
    const cap = Math.min(end, start + 60);
    for (let i = start; i < cap; i++) console.log('L' + (i + 1) + ': ' + lines[i]);
    if (cap < end) console.log('... [' + (end - cap) + ' lines elided] ...');
  }
  console.log('');
}

// W-LEADS-WORKBENCH: see Phase table + last few status log entries
dumpTracker('docs/W-LEADS-WORKBENCH-TRACKER.md', ['Phase', 'Status log']);

// W-LAUNCH-TRACKER: see launch blockers + active execution trackers
dumpTracker('docs/W-LAUNCH-TRACKER.md', ['Launch blockers', 'Active execution', 'Next action']);

// W-LAUNCH-TRACKER: check if F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED is mentioned anywhere
const lt = path.join(ROOT, 'docs/W-LAUNCH-TRACKER.md');
if (fs.existsSync(lt)) {
  const raw = fs.readFileSync(lt, 'utf8');
  const lines = (/\r\n/.test(raw) ? raw.replace(/\r\n/g, '\n') : raw).split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (/F-W3C-ESTIMATOR-3-ROUTES-UNAUDITED/i.test(lines[i]) ||
        /W3c-[ABC]/i.test(lines[i]) ||
        /W-LEADS-WORKBENCH/i.test(lines[i])) hits.push(i);
  }
  console.log('===== W-LAUNCH-TRACKER cross-refs to W3c / W-LEADS-WORKBENCH =====');
  console.log('matches: ' + hits.length);
  for (const i of hits.slice(0, 20)) console.log('  L' + (i + 1) + ': ' + lines[i]);
  if (hits.length > 20) console.log('  ... [' + (hits.length - 20) + ' more]');
}