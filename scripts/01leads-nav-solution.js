// scripts/01leads-nav-solution.js
// Two surgical edits:
// 1. Solution.tsx — new subtext + "See it Live" button
// 2. Nav.tsx — consolidate to single "See Demo" button

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

function updateFile(relPath, oldStr, newStr, label) {
  const file = path.join(ROOT, relPath);
  const content = fs.readFileSync(file, 'utf8');

  if (!content.includes(oldStr)) {
    console.error(`✗ ${label}: OLD STRING NOT FOUND in ${relPath}`);
    console.error('  Looking for:');
    console.error('  ' + oldStr.split('\n').slice(0, 3).join('\n  '));
    process.exit(1);
  }

  const updated = content.replace(oldStr, newStr);
  fs.writeFileSync(file, updated, 'utf8');
  console.log(`✓ ${label}: ${relPath}`);
}

// ============================================================
// 1. Solution.tsx — replace subtext paragraph + add See it Live button
// ============================================================
const solutionOld = `          <p style={{
            fontSize: 18, color: 'rgba(255,255,255,0.5)',
            maxWidth: 620, margin: '0 auto', lineHeight: 1.7,
            opacity: v ? 1 : 0,
            transition: 'opacity 0.7s ease 0.25s',
          }}>
            Don't rent someone else's chatbot. Launch your own AI —
            on your domain, in your voice, under your name.
          </p>
        </div>`;

const solutionNew = `          <p style={{
            fontSize: 18, color: 'rgba(255,255,255,0.5)',
            maxWidth: 620, margin: '0 auto', lineHeight: 1.7,
            opacity: v ? 1 : 0,
            transition: 'opacity 0.7s ease 0.25s',
          }}>
            Launch your brand with an AI lead magnet.<br />
            Your own domain. Your name. Your leads.
          </p>

          <div style={{
            marginTop: 28,
            opacity: v ? 1 : 0,
            transition: 'opacity 0.7s ease 0.4s',
          }}>
            <a href="https://walliam.ca" target="_blank" rel="noopener" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '13px 30px', borderRadius: 100,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: '#fff', fontSize: 14, fontWeight: 700,
              textDecoration: 'none', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.12)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.18)' }}
            >See it Live →</a>
          </div>
        </div>`;

updateFile('app/zerooneleads/components/Solution.tsx', solutionOld, solutionNew, 'Solution subtext + demo button');

// ============================================================
// 2. Nav.tsx — replace dual CTA (text link + Book Call) with single See Demo button
// ============================================================
const navOld = `        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="https://walliam.ca" target="_blank" rel="noopener" style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontWeight: 500 }} className="nav-desktop">See Demo →</a>
          <a href="#pricing" style={{ padding: '8px 20px', borderRadius: 100, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 20px rgba(59,130,246,0.4)' }}>Get Started</a>
        </div>`;

const navNew = `        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="https://walliam.ca" target="_blank" rel="noopener" style={{ padding: '8px 20px', borderRadius: 100, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 20px rgba(59,130,246,0.4)' }}>See Demo</a>
        </div>`;

// Try the original pattern first — the Nav may have been updated in a previous commit
try {
  updateFile('app/zerooneleads/components/Nav.tsx', navOld, navNew, 'Nav consolidation');
} catch (e) {
  // Fallback: try the "Book Call" variant (if previous commit changed Get Started -> Book Call)
  const navOldAlt = `        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="https://walliam.ca" target="_blank" rel="noopener" style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontWeight: 500 }} className="nav-desktop">See Demo →</a>
          <a href="/contact" style={{ padding: '8px 20px', borderRadius: 100, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 20px rgba(59,130,246,0.4)' }}>Book Call</a>
        </div>`;
  updateFile('app/zerooneleads/components/Nav.tsx', navOldAlt, navNew, 'Nav consolidation (Book Call variant)');
}

console.log('\n✓ All updates complete.');
console.log('Next: npx tsc --noEmit, then npm run dev to preview.');