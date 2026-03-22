const fs = require('fs');
const lines = fs.readFileSync('components/auth/RegisterModal.tsx', 'utf8').split('\n');
const idx = lines.findIndex(l => l.includes('if (profileError) console.error'));
lines.splice(idx + 1, 0, 
  "        // Assign agent to user based on page context (WALLiam System 2)",
  "        fetch('/api/walliam/assign-user-agent', {",
  "          method: 'POST',",
  "          headers: { 'Content-Type': 'application/json' },",
  "          body: JSON.stringify({",
  "            user_id: authData.user.id,",
  "            listing_id: listingId || null,",
  "            building_id: buildingId || null,",
  "          })",
  "        }).catch(e => console.error('Agent assignment error:', e))"
);
fs.writeFileSync('components/auth/RegisterModal.tsx', lines.join('\n'), 'utf8');
console.log('done at line', idx + 1);
