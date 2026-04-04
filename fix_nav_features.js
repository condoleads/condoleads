const fs = require('fs');
const comp = 'app/zerooneleads/components';

// Fix Nav - add binary flip animation to 01 logo
let nav = fs.readFileSync(comp + '/Nav.tsx', 'utf8');
nav = nav.replace(
  "export default function Nav() {",
  `const BINARY = ['0','1','0','1','0','0','1','1']
let binIdx = 0

export default function Nav() {`
);
nav = nav.replace(
  "{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: '#fff' }}>01",
  "{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: '#fff' }}><span className=\"bin-logo\">01</span>"
);
nav = nav.replace(
  "<style>{\`@media (max-width: 768px) { .nav-desktop { display: none !important; } }\`}</style>",
  `<style>{\`
    @media (max-width: 768px) { .nav-desktop { display: none !important; } }
    @keyframes binflip {
      0%,100% { content: '01'; }
      25% { content: '10'; }
      50% { content: '11'; }
      75% { content: '00'; }
    }
    .bin-logo { animation: binflip 3s steps(1) infinite; font-family: monospace; }
  \`}</style>`
);
fs.writeFileSync(comp + '/Nav.tsx', nav);
console.log('Nav binary: DONE');

// Fix Features - proper mobile horizontal scroll cards
let feat = fs.readFileSync(comp + '/Features.tsx', 'utf8');
feat = feat.replace(
  "<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 20, overflowX: 'auto' }}>",
  `<div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 340px)', gap: 20, overflowX: 'auto', paddingBottom: 12 }}>`
);
feat = feat.replace(
  "<style>{\`@media(max-width:640px){ .hero-stats{ grid-template-columns: repeat(2,auto) !important; gap: 24px !important; } }\`}</style>",
  "<style>{\`@media(max-width:640px){ .hero-stats{ grid-template-columns: repeat(2,auto) !important; gap: 24px !important; } }\`}</style>"
);
// Add mobile style to Features
feat = feat.replace(
  "    </div>\n    </section>\n  )\n}",
  `    </div>
    <style>{\`
      @media (max-width: 768px) {
        .features-grid { grid-template-columns: repeat(6, 280px) !important; }
      }
    \`}</style>
    </div>
    </section>
  )
}`
);
fs.writeFileSync(comp + '/Features.tsx', feat);
console.log('Features mobile: DONE');