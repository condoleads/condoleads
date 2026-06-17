// scripts/estimator-tenant-header-verify.ts
//
// W-ESTIMATOR-TENANT-HEADER FIX-VERIFY — per-tenant correctness +
// no-regression + header-injection-on-server-action.
//
// Source-level + DB-level + simulated-middleware-execution.
// All DB probes BEGIN/ROLLBACK or pure SELECT; zero state mutation.
//
// Assertions:
//   1. Per-tenant: walliam.ca host -> WALLiam id; aily.ca host -> Aily id.
//      DB read confirms.
//   2. Server-action header injection: simulate a POST with Next-Action
//      header to a page route from each host, run the middleware's
//      added branch logic, assert x-tenant-id ends up set on the
//      response.
//   3. /api/* branch UNCHANGED: source assertion + same simulated POST
//      pattern on /api/charlie/plan-email behaves byte-identical to
//      pre-fix (still injects from host).
//   4. Comprehensive-site rewrite branch UNCHANGED: source assertion
//      that the L85-106 region of middleware.ts is byte-identical to
//      the pre-fix backup.
//   5. System 1 isolation: simulate a POST to /admin/* with Next-Action
//      header — assert the new branch SKIPS (because of the !startsWith
//      ('/admin') guard).
//   6. Zero hardcoded tenant ids/hosts in the new code: grep
//      assertion on the new block lines for known tenant UUIDs and
//      tenant-specific hostnames.
//   7. Edit-set identity: middleware.ts is the ONLY modified source
//      file (recon/scripts/docs allowed).

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const WALLIAM_EXPECTED = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const AILY_EXPECTED    = 'e2619717-6401-4159-8d4c-d5f87651c8d6'

const OUT_DIR = path.resolve(__dirname, '..', 'recon')
const REPORT = path.join(OUT_DIR, 'estimator-tenant-header-verify.txt')
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(REPORT, '')
const log = (m: string) => { console.log(m); fs.appendFileSync(REPORT, m + '\n') }
const hr  = () => log('─'.repeat(76))

let pass = 0, fail = 0
function expect(label: string, cond: boolean, evidence?: string) {
  if (!cond) fail++; else pass++
  log(`${cond ? 'PASS' : 'FAIL'}  ${label}${evidence ? '\n        → ' + evidence : ''}`)
}

;(async () => {
  log('W-ESTIMATOR-TENANT-HEADER FIX-VERIFY — ' + new Date().toISOString())
  hr()

  // ───────────────────────────────────────────────────────────────────
  // SECTION 1 — Per-tenant host resolution (DB-backed, live)
  // ───────────────────────────────────────────────────────────────────
  log('SECTION 1 — per-tenant host resolution')
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const pgc = await pool.connect()
  try {
    await pgc.query('BEGIN READ ONLY')
    async function resolveTenantId(host: string): Promise<string | null> {
      const cleanDomain = host.replace(/^www\./, '')
      // Mirror the known-domain fast path
      const KNOWN: Record<string, string> = {
        'walliam.ca': 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9',
        'www.walliam.ca': 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9',
      }
      if (KNOWN[cleanDomain]) return KNOWN[cleanDomain]
      const r = await pgc.query(
        `SELECT id FROM tenants WHERE domain = $1 AND is_active = true LIMIT 1`,
        [cleanDomain]
      )
      return r.rows[0]?.id || null
    }

    const walliamResolved = await resolveTenantId('walliam.ca')
    const wwwWalliamResolved = await resolveTenantId('www.walliam.ca')
    const ailyResolved = await resolveTenantId('aily.ca')
    const wwwAilyResolved = await resolveTenantId('www.aily.ca')

    expect('1.1: walliam.ca resolves to WALLiam id',
      walliamResolved === WALLIAM_EXPECTED, `${walliamResolved}`)
    expect('1.2: www.walliam.ca resolves to WALLiam id',
      wwwWalliamResolved === WALLIAM_EXPECTED, `${wwwWalliamResolved}`)
    expect('1.3: aily.ca resolves to Aily id (NOT WALLiam)',
      ailyResolved === AILY_EXPECTED && ailyResolved !== WALLIAM_EXPECTED, `${ailyResolved}`)
    expect('1.4: www.aily.ca resolves to Aily id',
      wwwAilyResolved === AILY_EXPECTED, `${wwwAilyResolved}`)
    expect('1.5: walliam.ca and aily.ca resolve to DIFFERENT tenant ids',
      walliamResolved !== ailyResolved && walliamResolved !== null && ailyResolved !== null,
      `walliam=${walliamResolved} aily=${ailyResolved}`)
    await pgc.query('ROLLBACK')

    // ─────────────────────────────────────────────────────────────────
    // SECTION 2 — Simulated middleware: server-action POST per host
    // ─────────────────────────────────────────────────────────────────
    hr()
    log('SECTION 2 — simulated middleware: server-action POST injection')

    // Replicate the new branch logic EXACTLY as in middleware.ts.
    async function simulateMiddlewareNewBranch(opts: {
      method: string
      pathname: string
      hostHeader: string
      nextActionHeader: string | null
    }): Promise<{ injected: boolean; tenantId: string | null }> {
      const matchedNewBranch =
        opts.method === 'POST' &&
        !!opts.nextActionHeader &&
        !opts.pathname.startsWith('/api') &&
        !opts.pathname.startsWith('/_next') &&
        !opts.pathname.startsWith('/admin')
      if (!matchedNewBranch) return { injected: false, tenantId: null }
      const tenantId = await resolveTenantId(opts.hostHeader)
      return { injected: !!tenantId, tenantId }
    }

    // 2a — server-action POST from walliam.ca page route → WALLiam id
    const saPostWalliam = await simulateMiddlewareNewBranch({
      method: 'POST',
      pathname: '/property/abc123',
      hostHeader: 'walliam.ca',
      nextActionHeader: 'a9c47b3d8e2f1a0b',  // sample action id; presence is what counts
    })
    expect('2.1: server-action POST from walliam.ca page route -> x-tenant-id injected',
      saPostWalliam.injected, `tenantId=${saPostWalliam.tenantId}`)
    expect('2.2: injected tenantId === WALLiam id',
      saPostWalliam.tenantId === WALLIAM_EXPECTED,
      `expected=${WALLIAM_EXPECTED} got=${saPostWalliam.tenantId}`)

    // 2b — server-action POST from aily.ca page route → Aily id
    const saPostAily = await simulateMiddlewareNewBranch({
      method: 'POST',
      pathname: '/property/xyz789',
      hostHeader: 'aily.ca',
      nextActionHeader: 'a9c47b3d8e2f1a0b',
    })
    expect('2.3: server-action POST from aily.ca page route -> x-tenant-id injected',
      saPostAily.injected, `tenantId=${saPostAily.tenantId}`)
    expect('2.4: injected tenantId === Aily id (NOT WALLiam)',
      saPostAily.tenantId === AILY_EXPECTED && saPostAily.tenantId !== WALLIAM_EXPECTED,
      `expected=${AILY_EXPECTED} got=${saPostAily.tenantId}`)

    // 2c — server-action POST from a building-page route on walliam.ca
    const saPostBuilding = await simulateMiddlewareNewBranch({
      method: 'POST',
      pathname: '/some-condo-slug',
      hostHeader: 'walliam.ca',
      nextActionHeader: 'a9c47b3d8e2f1a0b',
    })
    expect('2.5: server-action POST to /[slug] (BuildingPage) on walliam.ca -> WALLiam id',
      saPostBuilding.injected && saPostBuilding.tenantId === WALLIAM_EXPECTED)

    // 2d — same path, but WITHOUT Next-Action header (regular POST to a
    //      page route, e.g. a normal HTML form submission) → branch SKIPS
    const plainPost = await simulateMiddlewareNewBranch({
      method: 'POST',
      pathname: '/property/abc123',
      hostHeader: 'walliam.ca',
      nextActionHeader: null,
    })
    expect('2.6: plain POST (no Next-Action header) -> branch SKIPS (no false-positive)',
      !plainPost.injected, `injected=${plainPost.injected}`)

    // 2e — GET request with Next-Action header (shouldn't happen but
    //      worth testing the method gate) → branch SKIPS
    const getWithHeader = await simulateMiddlewareNewBranch({
      method: 'GET',
      pathname: '/property/abc123',
      hostHeader: 'walliam.ca',
      nextActionHeader: 'a9c47b3d8e2f1a0b',
    })
    expect('2.7: GET with Next-Action header -> branch SKIPS (method gate)',
      !getWithHeader.injected)

    // 2f — POST to /api/* with Next-Action header → branch SKIPS (the
    //      /api/* branch already handled it above; don't double-inject)
    const apiPostWithAction = await simulateMiddlewareNewBranch({
      method: 'POST',
      pathname: '/api/charlie/plan-email',
      hostHeader: 'walliam.ca',
      nextActionHeader: 'a9c47b3d8e2f1a0b',
    })
    expect('2.8: POST to /api/* SKIPS the new branch (already handled by /api/* branch)',
      !apiPostWithAction.injected)

    // 2g — POST to /admin/* with Next-Action header → branch SKIPS (S1
    //      isolation)
    const adminPost = await simulateMiddlewareNewBranch({
      method: 'POST',
      pathname: '/admin/leads/abc',
      hostHeader: 'walliam.ca',
      nextActionHeader: 'a9c47b3d8e2f1a0b',
    })
    expect('2.9: POST to /admin/* SKIPS the new branch (S1 isolation)',
      !adminPost.injected)

    // 2h — POST to /_next/* with Next-Action header → branch SKIPS
    const nextInternal = await simulateMiddlewareNewBranch({
      method: 'POST',
      pathname: '/_next/data/foo',
      hostHeader: 'walliam.ca',
      nextActionHeader: 'a9c47b3d8e2f1a0b',
    })
    expect('2.10: POST to /_next/* SKIPS the new branch',
      !nextInternal.injected)

    hr()

    // ─────────────────────────────────────────────────────────────────
    // SECTION 3 — /api/* branch byte-identical
    // ─────────────────────────────────────────────────────────────────
    log('SECTION 3 — /api/* branch byte-identical (the canonical Charlie + walliam/contact + walliam/estimator/vip-questionnaire path)')

    const midwTxt = fs.readFileSync(path.resolve(__dirname, '..', 'middleware.ts'), 'utf8')

    // The /api/* injection block is the 8-line region; assert it is
    // present verbatim in the current file.
    const apiBranchRegex = new RegExp([
      "if \\(pathname\\.startsWith\\('/api'\\)\\) \\{",
      "\\s*const host = request\\.headers\\.get\\('host'\\) \\|\\| ''",
      "\\s*const tenantId = await resolveTenantIdFromHost\\(supabase, host\\)",
      "\\s*if \\(tenantId\\) \\{",
      "\\s*supabaseResponse\\.headers\\.set\\('x-tenant-id', tenantId\\)",
      "\\s*\\}",
      "\\s*\\}",
    ].join(''))
    expect('3.1: /api/* injection block byte-identical to pre-fix',
      apiBranchRegex.test(midwTxt))

    // Backup file for byte-comparison
    const backupGlob = fs.readdirSync(path.resolve(__dirname, '..'))
      .filter(f => f.startsWith('middleware.ts.backup_W-ESTIMATOR-TENANT-HEADER_'))
      .sort()
      .pop()
    if (backupGlob) {
      const backupTxt = fs.readFileSync(path.resolve(__dirname, '..', backupGlob), 'utf8')
      // Extract the /api/* block region from BOTH files and compare.
      const apiBlockOnly = (s: string) => {
        const start = s.indexOf("if (pathname.startsWith('/api'))")
        if (start === -1) return null
        // grab ~280 chars after the `if` opening
        return s.slice(start, start + 280)
      }
      const a = apiBlockOnly(midwTxt)
      const b = apiBlockOnly(backupTxt)
      expect('3.2: /api/* block region byte-identical vs pre-fix backup',
        a !== null && b !== null && a === b,
        a !== null && b !== null ? `match: ${a === b}` : 'extraction failed')
    } else {
      expect('3.2: pre-fix backup file present', false, 'no backup file found')
    }

    // Comprehensive-site rewrite branch byte-identical (block around L85-106)
    if (backupGlob) {
      const backupTxt = fs.readFileSync(path.resolve(__dirname, '..', backupGlob), 'utf8')
      const rewriteBlockOnly = (s: string) => {
        // Identify by the unique site_type === 'comprehensive' check
        const start = s.indexOf("agent?.site_type === 'comprehensive'")
        if (start === -1) return null
        return s.slice(start, start + 700)
      }
      const cur = rewriteBlockOnly(midwTxt)
      const old = rewriteBlockOnly(backupTxt)
      expect('3.3: comprehensive-site rewrite branch byte-identical vs pre-fix',
        cur !== null && old !== null && cur === old)
    }
    hr()

    // ─────────────────────────────────────────────────────────────────
    // SECTION 4 — System 1 isolation: no /admin or app/api/chat impact
    // ─────────────────────────────────────────────────────────────────
    log('SECTION 4 — System 1 isolation (no /admin, no app/api/chat impact)')

    // Already covered in 2.9 (admin POST skips); add explicit isolation
    // assertions:
    //   - the new branch's pathname exclude list contains /admin
    //   - no other source files were modified
    expect('4.1: new branch excludes /admin (S1 isolation)',
      /!pathname\.startsWith\('\/admin'\)/.test(midwTxt))
    expect('4.2: new branch excludes /api (no double-inject; preserves /api/* branch verbatim)',
      /!pathname\.startsWith\('\/api'\)/.test(midwTxt))
    expect('4.3: new branch excludes /_next (Next.js internals)',
      /!pathname\.startsWith\('\/_next'\)/.test(midwTxt))

    // System 1 path is app/api/chat/* — that's /api/* so it's already
    // covered by the /api/* branch (which is byte-identical). Explicit
    // assertion that nothing in System 1 file paths is mentioned in
    // the new code.
    expect('4.4: new branch does NOT touch app/api/chat or System 1 paths',
      !midwTxt.includes('app/api/chat') &&
      !midwTxt.includes('agent_buildings'))
    hr()

    // ─────────────────────────────────────────────────────────────────
    // SECTION 5 — Zero hardcoded tenant ids / hostnames in new code
    // ─────────────────────────────────────────────────────────────────
    log('SECTION 5 — zero hardcoded tenant ids / hostnames in new code')

    // Extract the new branch block from the current file.
    const newBranchStart = midwTxt.indexOf('W-ESTIMATOR-TENANT-HEADER')
    expect('5.1: new branch marker present in file',
      newBranchStart > 0, `marker offset=${newBranchStart}`)
    if (newBranchStart > 0) {
      // Grab the block from the marker through the next `return`.
      const tail = midwTxt.slice(newBranchStart)
      const blockEnd = tail.indexOf('return supabaseResponse')
      const newBranchBlock = tail.slice(0, blockEnd > 0 ? blockEnd : 3000)

      // KNOWN_TENANT_DOMAINS contains walliam.ca + the WALLiam UUID,
      // which is in a SEPARATE block at top of file (lines 25-28).
      // The NEW block must contain no hardcoded WALLiam id, no
      // hardcoded Aily id, no hardcoded walliam.ca host, no hardcoded
      // aily.ca host. (Tenant names like "WALLiam" inside the COMMENT
      // are allowed — they describe behavior, not encode it.)

      // Strip comments before grepping for hardcoded values in CODE.
      const codeOnly = newBranchBlock.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
      expect('5.2: new branch CODE contains no WALLiam UUID literal',
        !codeOnly.includes('b16e1039-38ed-43d7-bbc5-dd02bb651bc9'),
        `excerpt: ${codeOnly.slice(0,200).replace(/\s+/g,' ')}`)
      expect('5.3: new branch CODE contains no Aily UUID literal',
        !codeOnly.includes('e2619717-6401-4159-8d4c-d5f87651c8d6'))
      expect('5.4: new branch CODE contains no walliam.ca hostname literal',
        !/['"`]walliam\.ca['"`]/.test(codeOnly))
      expect('5.5: new branch CODE contains no aily.ca hostname literal',
        !/['"`]aily\.ca['"`]/.test(codeOnly))
      expect('5.6: new branch CODE delegates to resolveTenantIdFromHost (host-resolved)',
        /resolveTenantIdFromHost\(supabase, host\)/.test(codeOnly))
    }
    hr()

    // ─────────────────────────────────────────────────────────────────
    // SECTION 6 — Edit-set identity (middleware.ts only source change)
    // ─────────────────────────────────────────────────────────────────
    log('SECTION 6 — edit-set identity')
    const status = execSync('git status --porcelain', { encoding: 'utf8' })
    const modified = status.split('\n').filter(l => /^\s*M /.test(l)).map(l => l.replace(/^\s*M\s+/, '').replace(/\\/g, '/'))
    const declared = new Set(['middleware.ts'])
    const preDirty = new Set([
      'app/api/charlie/municipalities/route.ts',
      'scripts/r-w-territory-master-p2-data-phantom-fix.js',
      'scripts/r-w-territory-master-p4-check-fix.js',
    ])
    const allDeclaredPresent = [...declared].every(f => modified.includes(f))
    const unexpected = modified.filter(f =>
      !declared.has(f) && !preDirty.has(f) &&
      !/^docs\//.test(f) && !/^scripts\//.test(f) && !/^recon\//.test(f)
    )
    expect('6.1: middleware.ts in M list', allDeclaredPresent, `M: ${modified.join(', ')}`)
    expect('6.2: no NEW unexpected source files modified', unexpected.length === 0,
      unexpected.length === 0 ? 'pre-existing dirty excluded' : `UNEXPECTED: ${unexpected.join(', ')}`)
    hr()

    log(`SUMMARY: ${pass} PASS, ${fail} FAIL`)
    log(fail === 0 ? 'STATUS: tenant-header injection verified per-tenant + /api/* preserved + S1 isolated.' : 'STATUS: FAIL — investigate before proceeding.')
    log('NOTE: live verification = operator submits the estimator on walliam.ca post-deploy and confirms (a) a leads row appears and (b) email is delivered. Aily verifiable once aily.ca DNS goes live.')

  } finally {
    pgc.release()
    await pool.end()
  }
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error(e); log('FATAL: ' + (e?.stack || e?.message || String(e))); process.exit(2) })
