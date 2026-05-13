const {Pool} = require('pg');
require('dotenv').config({path:'.env.local'});
const p = new Pool({connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL});
(async () => {
  const r = await p.query(`SELECT role, COUNT(*) AS cnt FROM agents GROUP BY role ORDER BY cnt DESC`);
  console.log('  agents by role:');
  r.rows.forEach(x => console.log('    ' + x.role + ': ' + x.cnt));
  
  const d = await p.query(`SELECT a1.role AS top_role, COUNT(*) AS direct_children FROM agents a1 JOIN agents a2 ON a2.parent_id = a1.id GROUP BY a1.role ORDER BY direct_children DESC`);
  console.log('\n  parent->child distribution:');
  d.rows.forEach(x => console.log('    ' + x.top_role + ' has ' + x.direct_children + ' direct reports'));
  
  // Max depth check
  const maxDepth = await p.query(`
    WITH RECURSIVE tree AS (
      SELECT id, parent_id, role, 1 AS depth FROM agents WHERE parent_id IS NULL
      UNION ALL
      SELECT a.id, a.parent_id, a.role, t.depth + 1 FROM agents a JOIN tree t ON a.parent_id = t.id
    )
    SELECT MAX(depth) AS max_depth, COUNT(*) AS total FROM tree`);
  console.log('\n  hierarchy max depth: ' + maxDepth.rows[0].max_depth + ' (over ' + maxDepth.rows[0].total + ' rows)');
  
  await p.end();
})().catch(e => { console.error(e.message); process.exit(1); });
