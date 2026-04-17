// scripts/01leads-mls-fusion-polish.js
// Surgical fixes to MLSFusion.tsx:
// 1. MLS stream spacing (increase max-height, better visual separation)
// 2. Softer copy for ChatGPT-style AI caption + subtext
// 3. Better vertical spacing between sections

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const file = path.join(ROOT, 'app', 'zerooneleads', 'components', 'MLSFusion.tsx');

let content = fs.readFileSync(file, 'utf8');

function replaceOrFail(oldStr, newStr, label) {
  if (!content.includes(oldStr)) {
    console.error(`✗ ${label}: pattern not found`);
    console.error('Looking for:\n' + oldStr.split('\n').slice(0, 3).join('\n'));
    process.exit(1);
  }
  content = content.replace(oldStr, newStr);
  console.log(`✓ ${label}`);
}

// ── Fix 1: MLS stream max-height 180 → 220, add proper scroll fade ──
replaceOrFail(
  `    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden', maxHeight: 180 }}>`,
  `    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden', maxHeight: 220, paddingBottom: 4 }}>`,
  'MLS stream height + padding'
);

// ── Fix 2: Section vertical padding 140px → 160px (more top breathing room under nav) ──
replaceOrFail(
  `    <section ref={ref} id="mls-fusion" style={{
      padding: '140px 24px',`,
  `    <section ref={ref} id="mls-fusion" style={{
      padding: '160px 24px 140px',`,
  'Section padding'
);

// ── Fix 3: Dashed border between MLS and AI Reasoning → solid with more space ──
replaceOrFail(
  `            {/* AI Reasoning */}
            <div style={{
              marginBottom: 14,
              paddingTop: 14,
              borderTop: '1px dashed rgba(255,255,255,0.1)',
            }}>`,
  `            {/* AI Reasoning */}
            <div style={{
              marginTop: 20,
              marginBottom: 18,
              paddingTop: 18,
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}>`,
  'AI Reasoning separator'
);

// ── Fix 4: 01leads column padding 24px 22px → 28px 24px ──
replaceOrFail(
  `          {/* LEFT — 01LEADS: MLS + AI fusion */}
          <div style={{
            padding: '24px 22px',
            borderRadius: 18,
            background: 'linear-gradient(180deg, rgba(59,130,246,0.06), rgba(139,92,246,0.04))',
            border: '1px solid rgba(59,130,246,0.25)',
            position: 'relative',
          }}>`,
  `          {/* LEFT — 01LEADS: MLS + AI fusion */}
          <div style={{
            padding: '32px 26px 28px',
            borderRadius: 18,
            background: 'linear-gradient(180deg, rgba(59,130,246,0.06), rgba(139,92,246,0.04))',
            border: '1px solid rgba(59,130,246,0.25)',
            position: 'relative',
          }}>`,
  '01leads column padding'
);

// ── Fix 5: ChatGPT-style column padding + match height ──
replaceOrFail(
  `          {/* RIGHT — CHATGPT-STYLE AI (dim) */}
          <div style={{
            padding: '24px 22px',
            borderRadius: 18,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            position: 'relative',
            opacity: 0.55,
            filter: 'grayscale(0.4)',
          }}>`,
  `          {/* RIGHT — CHATGPT-STYLE AI (dim) */}
          <div style={{
            padding: '32px 26px 28px',
            borderRadius: 18,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            position: 'relative',
            opacity: 0.6,
            filter: 'grayscale(0.3)',
            display: 'flex',
            flexDirection: 'column',
          }}>`,
  'ChatGPT column padding + flex'
);

// ── Fix 6: Softer caption under ChatGPT column ──
replaceOrFail(
  `            {/* Bottom caption */}
            <div style={{
              marginTop: 14,
              textAlign: 'center',
              fontSize: 11,
              color: 'rgba(239,68,68,0.7)',
              fontWeight: 700,
              letterSpacing: '0.05em',
            }}>
              Half the equation. Half the answer.
            </div>
          </div>`,
  `            {/* Bottom caption — softer framing */}
            <div style={{
              marginTop: 'auto',
              paddingTop: 18,
              textAlign: 'center',
              fontSize: 12,
              color: 'rgba(255,255,255,0.55)',
              fontWeight: 600,
              lineHeight: 1.5,
            }}>
              ChatGPT-style AI lacks MLS feed access —<br />
              so it can't deliver answers like these.
            </div>
          </div>`,
  'Softer ChatGPT caption'
);

// ── Fix 7: Softer subtext in header ──
replaceOrFail(
  `            01leads fuses live GTA MLS data with AI reasoning. That's why every answer is
            grounded in real sales — not invented. ChatGPT-style AI has only half the equation.`,
  `            01leads fuses live GTA MLS data with AI reasoning. That's why every answer is
            grounded in real sales. ChatGPT-style AI lacks MLS feed access — so it can't
            deliver answers like these.`,
  'Softer header subtext'
);

// ── Fix 8: MLS stream section bottom margin (room before next section) ──
replaceOrFail(
  `            {/* MLS Stream */}
            <div style={{ marginBottom: 14 }}>`,
  `            {/* MLS Stream */}
            <div style={{ marginBottom: 4 }}>`,
  'MLS stream bottom margin'
);

// ── Fix 9: Convergence pill margin (more breathing room above) ──
replaceOrFail(
  `            {/* Convergence indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
              opacity: showConvergence ? 1 : 0.2,
              transition: 'opacity 0.5s',
            }}>`,
  `            {/* Convergence indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 8,
              marginBottom: 18,
              opacity: showConvergence ? 1 : 0.2,
              transition: 'opacity 0.5s',
            }}>`,
  'Convergence pill spacing'
);

fs.writeFileSync(file, content, 'utf8');
console.log('\n✓ MLSFusion polished.');
console.log('Next: npx tsc --noEmit, then npm run dev to preview.');