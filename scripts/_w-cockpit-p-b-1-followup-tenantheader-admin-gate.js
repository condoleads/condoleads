// scripts/_w-cockpit-p-b-1-followup-tenantheader-admin-gate.js
// W-COCKPIT P-B-1 followup — gate the public TenantHeader off admin routes.
//
// Problem: components/TenantHeader.tsx renders <SiteHeader/> on every tenant-
// domain request regardless of pathname. On /admin-homes/* this buries the
// W5a admin TenantHeader visually (both sticky top-0; public one wins by DOM
// order + opacity). Fix: skip on /admin*, /dashboard*, /login, /reset-password.
//
// Two anchor-based edits, both fail-loud if anchors don't match exactly.

const fs = require('fs');
const path = require('path');

function patch(filePath, edits) {
  const abs = path.resolve(filePath);
  let src = fs.readFileSync(abs, 'utf8');
  for (const [i, e] of edits.entries()) {
    if (!src.includes(e.find)) {
      console.error(`ANCHOR MISS in ${filePath} edit #${i+1}:`);
      console.error('--- expected ---'); console.error(e.find);
      process.exit(1);
    }
    const occurrences = src.split(e.find).length - 1;
    if (occurrences > 1) {
      console.error(`ANCHOR AMBIGUOUS in ${filePath} edit #${i+1}: ${occurrences} matches`);
      process.exit(1);
    }
    src = src.replace(e.find, e.replace);
    console.log(`  ✓ ${filePath} edit #${i+1} applied`);
  }
  fs.writeFileSync(abs, src, 'utf8');
}

// ─── Edit 1: middleware.ts — forward pathname as x-pathname header ─────────
patch('middleware.ts', [{
  find: `export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  let supabaseResponse = NextResponse.next({ request })`,
  replace: `export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // W-COCKPIT P-B-1 followup: forward pathname so server components can route-gate
  // (specifically the public TenantHeader, which must skip on /admin-homes/*).
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })`
}]);

// ─── Edit 2: components/TenantHeader.tsx — gate on admin/dashboard/auth ───
patch('components/TenantHeader.tsx', [{
  find: `import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import SiteHeader from './navigation/SiteHeader'

// Shows WALLiam SiteHeader on tenant domains only
export default async function TenantHeader() {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const cleanHost = host.replace(/^www\\./, '')
  
  // Skip on condoleads, localhost, vercel.app
  if (
    cleanHost.includes('condoleads.ca') ||
    cleanHost.includes('localhost') ||
    cleanHost.includes('vercel.app')
  ) return null`,
  replace: `import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import SiteHeader from './navigation/SiteHeader'

// Shows public SiteHeader on tenant domains for buyer-facing routes only.
// W-COCKPIT P-B-1 followup: never render on admin/dashboard/auth routes —
// those have their own chrome (admin-homes layout's TenantHeader w/ W5a switcher,
// dashboard's own nav, login's bare page) and the public bar buries them visually.
export default async function TenantHeader() {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const cleanHost = host.replace(/^www\\./, '')
  const pathname = headersList.get('x-pathname') || ''

  // Skip on admin/dashboard/auth routes — public chrome doesn't belong there.
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/dashboard') ||
    pathname === '/login' ||
    pathname.startsWith('/reset-password')
  ) return null

  // Skip on condoleads, localhost, vercel.app — public site uses its own chrome there.
  if (
    cleanHost.includes('condoleads.ca') ||
    cleanHost.includes('localhost') ||
    cleanHost.includes('vercel.app')
  ) return null`
}]);

console.log('\n✅ Both edits applied. Run `npx tsc --noEmit` next.');