const fs = require('fs');
const file = 'app/zerooneleads/components/Solution.tsx';
let c = fs.readFileSync(file, 'utf8');
c = c.replace(
  "lineHeight: 1.1, marginBottom: 20, color: '#fff', opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease 0.1s' , color: '#fff'",
  "lineHeight: 1.1, marginBottom: 20, color: '#fff', opacity: v ? 1 : 0, transform: v ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease 0.1s'"
);
fs.writeFileSync(file, c);
console.log('DONE');