// scripts/az6d-patch.js
// AZ.6d: insert L2.6 -- runtime DB check that every tenant has a valid source_key.
// C12 uses LF line endings. Anchors on the boundary before "Final summary".
// Idempotent: skips if "L2.6" already present.

const fs = require('fs');
const path = require('path');

const C12 = path.join(process.cwd(), 'scripts', 'test-c12-multitenant-regression.js');
let src = fs.readFileSync(C12, 'utf8');

if (src.includes('L2.6:')) {
  console.log('SKIP -- L2.6 already present (idempotent)');
  process.exit(0);
}

const oldAnchor =
  '}\n' +
  '\n' +
  '// ============================================================\n' +
  '// Final summary\n' +
  '// ============================================================';

const newAnchor =
  '}\n' +
  '\n' +
  '// L2.6: every tenant in DB has non-null source_key matching /^[a-z0-9_-]+$/\n' +
  '// W-MULTITENANT-BENCH P3.F1 / D17 regression seal.\n' +
  '// Skipped silently if Supabase env not set (CI without secrets).\n' +
  '{\n' +
  '  const label = \'L2.6: every tenant has non-null source_key matching /^[a-z0-9_-]+$/\';\n' +
  '  try {\n' +
  '    const envPath = path.join(ROOT, \'.env.local\');\n' +
  '    if (!fs.existsSync(envPath)) {\n' +
  '      console.log(\'  SKIP [\' + label + \'] -- .env.local not present\');\n' +
  '    } else {\n' +
  '      require(\'dotenv\').config({ path: envPath });\n' +
  '      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;\n' +
  '      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;\n' +
  '      if (!url || !key) {\n' +
  '        console.log(\'  SKIP [\' + label + \'] -- Supabase env vars missing\');\n' +
  '      } else {\n' +
  '        const inline = \'const { createClient } = require(\\\'@supabase/supabase-js\\\'); const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); (async () => { const { data, error } = await sb.from(\\\'tenants\\\').select(\\\'id, name, source_key\\\'); if (error) { console.error(\\\'ERR:\\\' + error.message); process.exit(1); } const bad = data.filter(t => !t.source_key || !/^[a-z0-9_-]+$/.test(t.source_key)); if (bad.length === 0) { console.log(\\\'OK:\\\' + data.length); process.exit(0); } else { console.log(\\\'BAD:\\\' + JSON.stringify(bad)); process.exit(2); } })();\';\n' +
  '        const result = require(\'child_process\').spawnSync(\'node\', [\'-e\', inline], {\n' +
  '          cwd: ROOT,\n' +
  '          encoding: \'utf8\',\n' +
  '          env: { ...process.env },\n' +
  '        });\n' +
  '        if (result.status === 0) {\n' +
  '          const m = result.stdout.match(/OK:(\\d+)/);\n' +
  '          const count = m ? m[1] : \'?\';\n' +
  '          console.log(\'  PASS [\' + label + \'] (\' + count + \' tenants checked)\');\n' +
  '          totalPasses++;\n' +
  '        } else if (result.status === 2) {\n' +
  '          console.error(\'  FAIL [\' + label + \'] -- offenders:\');\n' +
  '          const m = result.stdout.match(/BAD:(.*)/);\n' +
  '          if (m) console.error(\'    \' + m[1]);\n' +
  '          totalFailures++;\n' +
  '          failedAssertions.push(label);\n' +
  '        } else {\n' +
  '          console.error(\'  FAIL [\' + label + \'] -- runtime error\');\n' +
  '          if (result.stdout) console.error(\'    stdout: \' + result.stdout.trim());\n' +
  '          if (result.stderr) console.error(\'    stderr: \' + result.stderr.trim());\n' +
  '          totalFailures++;\n' +
  '          failedAssertions.push(label);\n' +
  '        }\n' +
  '      }\n' +
  '    }\n' +
  '  } catch (e) {\n' +
  '    console.log(\'  SKIP [\' + label + \'] -- \' + e.message);\n' +
  '  }\n' +
  '}\n' +
  '\n' +
  '// ============================================================\n' +
  '// Final summary\n' +
  '// ============================================================';

if (!src.includes(oldAnchor)) {
  console.error('FAIL -- anchor not found');
  process.exit(1);
}

src = src.replace(oldAnchor, newAnchor);
fs.writeFileSync(C12, src, 'utf8');
console.log('PASS -- L2.6 inserted');
console.log('C12 size: ' + fs.statSync(C12).size + ' bytes');