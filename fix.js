const fs = require('fs');
const lines = fs.readFileSync('app/[slug]/components/GeoHero.tsx', 'utf8').split('\n');

// Find and remove the WALLiam CTA block with anchor tags (lines between WALLiam CTA comment and GeoHeroCTA)
const ctaStart = lines.findIndex(l => l.includes('WALLiam CTA'));
const ctaEnd = lines.findIndex(l => l.includes('<GeoHeroCTA />'));

if (ctaStart !== -1 && ctaEnd !== -1) {
  // Remove everything from ctaStart+1 to ctaEnd (exclusive) - the div and anchor tags
  lines.splice(ctaStart + 1, ctaEnd - ctaStart - 1);
  console.log('removed lines', ctaStart + 1, 'to', ctaEnd);
}

fs.writeFileSync('app/[slug]/components/GeoHero.tsx', lines.join('\n'), 'utf8');
console.log('done');
