const fs = require('fs');
const comp = 'app/zerooneleads/components';

// Fix each h2 that's missing color:#fff
const fixes = [
  {
    file: 'Solution.tsx',
    old: "fontSize: 'clamp(28px,5vw,58px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 20, opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease 0.1s'",
    new: "fontSize: 'clamp(28px,5vw,58px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 20, color: '#fff', opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease 0.1s'"
  },
  {
    file: 'Features.tsx',
    old: "fontSize: 'clamp(28px,5vw,54px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1",
    new: "fontSize: 'clamp(28px,5vw,54px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#fff'"
  },
  {
    file: 'HowItWorks.tsx',
    old: "fontSize: 'clamp(28px,5vw,54px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1",
    new: "fontSize: 'clamp(28px,5vw,54px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#fff'"
  },
  {
    file: 'Pricing.tsx',
    old: "fontSize: 'clamp(28px,5vw,54px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 16",
    new: "fontSize: 'clamp(28px,5vw,54px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 16, color: '#fff'"
  },
  {
    file: 'FAQ.tsx',
    old: "fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, letterSpacing: '-0.02em'",
    new: "fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, letterSpacing: '-0.02em', color: '#fff'"
  },
  {
    file: 'FooterCTA.tsx',
    old: "fontSize: 'clamp(32px,6.5vw,68px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.08, marginBottom: 24, opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.7s ease'",
    new: "fontSize: 'clamp(32px,6.5vw,68px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.08, marginBottom: 24, color: '#fff', opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(30px)', transition: 'all 0.7s ease'"
  },
  {
    file: 'Problem.tsx',
    old: "fontSize: 'clamp(28px,5vw,54px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease 0.1s'",
    new: "fontSize: 'clamp(28px,5vw,54px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#fff', opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease 0.1s'"
  },
];

fixes.forEach(({file, old, new: n}) => {
  const fp = comp + '/' + file;
  let c = fs.readFileSync(fp, 'utf8');
  if (c.includes(old)) { c = c.replace(old, n); fs.writeFileSync(fp, c); console.log(file + ': DONE'); }
  else console.log(file + ': NO MATCH');
});

// Fix Features mobile - horizontal scroll
let feat = fs.readFileSync(comp + '/Features.tsx', 'utf8');
feat = feat.replace(
  "display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 20",
  "display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 20, overflowX: 'auto'"
);
fs.writeFileSync(comp + '/Features.tsx', feat);
console.log('Features mobile scroll: DONE');