const fs = require('fs');
const file = 'app/charlie/lib/charlie-prompts.ts';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(
  "- NEVER use markdown tables or pipe characters (|) in responses.",
  "- NEVER use pipe characters (|) anywhere in responses. Use plain sentences or line breaks instead.\n- NEVER use markdown tables."
);

fs.writeFileSync(file, c);
console.log('DONE');