// scripts/01leads-mobile-fixes.js
// Two mobile fixes:
// 1. MLSFusion: horizontal swipe carousel (was: stacked vertical, causing shake)
// 2. HowItWorks: horizontal scroll with snap points (was: stacked vertical)

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

function replaceOrFail(content, oldStr, newStr, label) {
  if (!content.includes(oldStr)) {
    console.error(`✗ ${label}: pattern not found`);
    console.error('Looking for:\n' + oldStr.split('\n').slice(0, 3).join('\n'));
    process.exit(1);
  }
  console.log(`✓ ${label}`);
  return content.replace(oldStr, newStr);
}

// ============================================================
// FIX 1: MLSFusion.tsx — mobile carousel
// ============================================================
{
  const file = path.join(ROOT, 'app', 'zerooneleads', 'components', 'MLSFusion.tsx');
  let content = fs.readFileSync(file, 'utf8');

  // Wrap fusion-grid in scroll container + update media query in CSS
  content = replaceOrFail(content,
    `        {/* Three-column fusion layout */}
        <div className="fusion-grid" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 24,
          maxWidth: 1000,
          margin: '0 auto',
          opacity: v ? 1 : 0,
          transition: 'opacity 0.8s ease 0.5s',
        }}>`,
    `        {/* Fusion layout — grid on desktop, horizontal carousel on mobile */}
        <div className="fusion-scroll">
        <div className="fusion-grid" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 24,
          maxWidth: 1000,
          margin: '0 auto',
          opacity: v ? 1 : 0,
          transition: 'opacity 0.8s ease 0.5s',
        }}>`,
    'Fusion wrapper opened'
  );

  // Close the wrapper after the fusion-grid — find the end of fusion-grid div
  // The fusion-grid ends just before the scenario dots div
  content = replaceOrFail(content,
    `        {/* Scenario dots */}`,
    `        </div>
        {/* Scenario dots */}`,
    'Fusion wrapper closed'
  );

  // Update the styled block — replace the single @media rule with desktop + mobile behavior
  content = replaceOrFail(content,
    `        @media (max-width: 768px) {
          .fusion-grid { grid-template-columns: 1fr !important; }
        }
      \`}</style>`,
    `        .fusion-scroll {
          margin: 0 -24px;
          padding: 0 24px;
        }
        @media (max-width: 768px) {
          .fusion-scroll {
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            -webkit-overflow-scrolling: touch;
            margin: 0 -24px;
            padding: 0 24px 16px;
          }
          .fusion-scroll::-webkit-scrollbar { display: none; }
          .fusion-grid {
            grid-template-columns: 88vw 88vw !important;
            gap: 16px !important;
            width: max-content !important;
            max-width: none !important;
          }
          .fusion-grid > div {
            scroll-snap-align: center;
            min-height: auto !important;
          }
        }
      \`}</style>`,
    'Mobile carousel CSS'
  );

  fs.writeFileSync(file, content, 'utf8');
  console.log(`\n✓ MLSFusion.tsx updated`);
}

// ============================================================
// FIX 2: HowItWorks.tsx — horizontal scroll on mobile
// ============================================================
{
  const file = path.join(ROOT, 'app', 'zerooneleads', 'components', 'HowItWorks.tsx');
  let content = fs.readFileSync(file, 'utf8');

  // Wrap the grid in a scroll container and replace grid styles
  content = replaceOrFail(content,
    `        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 4 }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ padding: '40px 32px', borderRadius: 20, background: i%2===0 ? 'rgba(255,255,255,0.025)' : 'transparent', opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(30px)', transition: \`all 0.6s ease \${i*0.12}s\` }}>`,
    `        <div className="steps-scroll">
        <div className="steps-grid">
          {STEPS.map((s, i) => (
            <div key={i} className="step-card" style={{ padding: '40px 32px', borderRadius: 20, background: i%2===0 ? 'rgba(255,255,255,0.025)' : 'transparent', opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(30px)', transition: \`all 0.6s ease \${i*0.12}s\` }}>`,
    'HowItWorks grid wrapper opened'
  );

  // Close both wrappers — find end of map
  content = replaceOrFail(content,
    `          ))}
        </div>
      </div>
    </section>
  )
}`,
    `          ))}
        </div>
        </div>
      </div>
      <style>{\`
        .steps-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -24px; padding: 0 24px 16px; }
        .steps-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
        .step-card { min-width: 0; }
        .steps-scroll::-webkit-scrollbar { display: none; }
        @media (max-width: 768px) {
          .steps-scroll { scroll-snap-type: x mandatory; }
          .steps-grid { grid-template-columns: repeat(4, 280px); width: max-content; gap: 12px; }
          .step-card { width: 280px; scroll-snap-align: start; }
        }
      \`}</style>
    </section>
  )
}`,
    'HowItWorks scroll CSS added'
  );

  fs.writeFileSync(file, content, 'utf8');
  console.log(`\n✓ HowItWorks.tsx updated`);
}

console.log('\n✓ All mobile fixes applied.');
console.log('Next: npx tsc --noEmit, then npm run dev to preview.');
console.log('Test on mobile viewport (Chrome DevTools → toggle device toolbar → iPhone).');