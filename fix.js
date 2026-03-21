const fs = require('fs');
const lines = fs.readFileSync('app/[slug]/components/GeoHeroCTA.tsx', 'utf8').split('\n');
const idx = lines.findIndex(l => l.includes('onKeyDown={e =>'));
lines[idx] = "          onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) openCharlie(undefined, (e.target as HTMLInputElement).value.trim()) }}";
const idx2 = lines.findIndex(l => l.includes('const inp = e.currentTarget.previousSibling'));
lines[idx2] = "          onClick={e => { const inp = e.currentTarget.previousSibling as HTMLInputElement; if (inp?.value?.trim()) openCharlie(undefined, inp.value.trim()); else openCharlie() }}";
fs.writeFileSync('app/[slug]/components/GeoHeroCTA.tsx', lines.join('\n'), 'utf8');
console.log('fixed');
