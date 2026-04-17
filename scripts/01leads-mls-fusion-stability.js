// scripts/01leads-mls-fusion-stability.js
// Two fixes:
// 1. Listing text clipping (line-height + padding)
// 2. Page shake during animation (fixed column heights)

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

// ── Fix 1: MLS listing bubble — proper line-height and padding ──
replaceOrFail(
  `        <div key={\`\${trigger}-\${i}\`} style={{
          padding: '7px 10px',
          background: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(59,130,246,0.18)',
          borderRadius: 6,
          fontSize: 11,
          fontFamily: 'monospace',
          color: 'rgba(255,255,255,0.7)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          animation: 'streamIn 0.3s ease',
        }}>{line}</div>`,
  `        <div key={\`\${trigger}-\${i}\`} style={{
          padding: '9px 12px',
          background: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(59,130,246,0.18)',
          borderRadius: 6,
          fontSize: 11,
          fontFamily: 'monospace',
          lineHeight: 1.5,
          color: 'rgba(255,255,255,0.7)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          animation: 'streamIn 0.3s ease',
          flexShrink: 0,
        }}>{line}</div>`,
  'Listing bubble padding + line-height'
);

// ── Fix 2: MLS stream container — fixed height prevents shake ──
replaceOrFail(
  `    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden', maxHeight: 220, paddingBottom: 4 }}>`,
  `    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden', height: 280, paddingBottom: 4, position: 'relative' }}>`,
  'MLS stream container fixed height'
);

// ── Fix 3: Lock 01leads column minHeight to prevent growth-induced shake ──
replaceOrFail(
  `          {/* LEFT — 01LEADS: MLS + AI fusion */}
          <div style={{
            padding: '32px 26px 28px',
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
            minHeight: 780,
            display: 'flex',
            flexDirection: 'column',
          }}>`,
  '01leads column minHeight + flex'
);

// ── Fix 4: Lock ChatGPT column to match ──
replaceOrFail(
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
            minHeight: 780,
          }}>`,
  'ChatGPT column minHeight'
);

// ── Fix 5: AnswerCard wrapper must not affect layout on mount ──
replaceOrFail(
  `            {showAnswer && <AnswerCard scenario={scenario} trigger={idx} show={showAnswer} />}
          </div>`,
  `            <div style={{
              minHeight: 150,
              opacity: showAnswer ? 1 : 0,
              transition: 'opacity 0.5s ease',
            }}>
              <AnswerCard scenario={scenario} trigger={idx} show={showAnswer} />
            </div>
          </div>`,
  'AnswerCard stable height'
);

// ── Fix 6: AI Reasoning container fixed height ──
replaceOrFail(
  `            {/* AI Reasoning */}
            <div style={{
              marginTop: 20,
              marginBottom: 18,
              paddingTop: 18,
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}>`,
  `            {/* AI Reasoning */}
            <div style={{
              marginTop: 20,
              marginBottom: 18,
              paddingTop: 18,
              borderTop: '1px solid rgba(255,255,255,0.08)',
              minHeight: 170,
            }}>`,
  'AI Reasoning fixed minHeight'
);

// ── Fix 7: Fused answer bubble fixed min height prevents jump ──
replaceOrFail(
  `            {/* Fused Answer */}
            <div style={{
              padding: '14px 16px',
              borderRadius: 10,
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.25)',
              fontSize: 13,
              color: '#fff',
              fontWeight: 600,
              lineHeight: 1.5,
              marginBottom: showAnswer ? 14 : 0,
              opacity: fusedText || phase === 'hold' ? 1 : 0.3,
              transition: 'opacity 0.4s',
              minHeight: 40,
            }}>`,
  `            {/* Fused Answer */}
            <div style={{
              padding: '14px 16px',
              borderRadius: 10,
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.25)',
              fontSize: 13,
              color: '#fff',
              fontWeight: 600,
              lineHeight: 1.5,
              marginBottom: 14,
              opacity: fusedText || phase === 'hold' ? 1 : 0.3,
              transition: 'opacity 0.4s',
              minHeight: 48,
            }}>`,
  'Fused answer stable margin'
);

fs.writeFileSync(file, content, 'utf8');
console.log('\n✓ MLSFusion stability fixes applied.');
console.log('Next: npx tsc --noEmit, then npm run dev to preview.');