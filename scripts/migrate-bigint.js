const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function alterColumn(col) {
  const client = new Client({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false },
    statement_timeout: 600000
  });
  
  try {
    await client.connect();
    console.log(`Altering ${col} to bigint...`);
    await client.query(`ALTER TABLE mls_listings ALTER COLUMN ${col} TYPE bigint`);
    console.log(`  Done`);
  } catch (err) {
    console.error(`  Failed: ${err.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  // First check if list_price already changed
  const check = new Client({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
  });
  await check.connect();
  const res = await check.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name='mls_listings' AND column_name IN ('list_price','close_price','original_list_price','previous_list_price','close_price_hold')
    ORDER BY column_name
  `);
  console.log('Current types:');
  for (const row of res.rows) {
    console.log(`  ${row.column_name}: ${row.data_type}`);
  }
  await check.end();

  const columns = ['list_price', 'close_price', 'original_list_price', 'previous_list_price', 'close_price_hold'];
  
  for (const col of columns) {
    const match = res.rows.find(r => r.column_name === col);
    if (match && match.data_type === 'bigint') {
      console.log(`${col} already bigint - skipping`);
      continue;
    }
    await alterColumn(col);
  }
  
  console.log('Migration complete');
}
main();
