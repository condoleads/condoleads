const fs = require('fs');
const path = require('path');
const comp = 'app/zerooneleads/components';

// Fix 1: Add color:#fff to all h2 tags missing it
// Fix 2: Mobile horizontal scroll for feature cards
// Fix 3: Binary counter animation on Nav 01 logo

const files = ['Solution.tsx','Features.tsx','HowItWorks.tsx','Pricing.tsx','FAQ.tsx','FooterCTA.tsx','Problem.tsx'];

files.forEach(f => {
  const fp = path.join(comp, f);
  let c = fs.readFileSync(fp, 'utf8');
  
  // Add color:#fff to h2 tags that don't have it
  c = c.replace(/<h2 style=\{\{ ([^}]*?)(?<!color: '#fff'[^}]*?)\}\}>/g, (match, inner) => {
    if (inner.includes("color:")) return match;
    return `<h2 style={{ ${inner}, color: '#fff' }}>`;
  });
  
  fs.writeFileSync(fp, c);
  console.log(f + ': done');
});