const fs = require('fs');
const lines = fs.readFileSync('components/HomePageComprehensiveClient.tsx', 'utf8').split('\n');
const idx = lines.findIndex(l => l.includes("background: '#060b18'"));
if (idx !== -1) { lines.splice(idx, 1); console.log('removed at line', idx + 1); }
fs.writeFileSync('components/HomePageComprehensiveClient.tsx', lines.join('\n'), 'utf8');
