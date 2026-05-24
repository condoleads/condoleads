// scripts/_w-cockpit-f-cockpit-header-url-scope-mismatch.js
// W-COCKPIT followup -- F-COCKPIT-HEADER-URL-SCOPE-MISMATCH.
//
// Admin TenantHeader reads x-pathname (plumbed via middleware in 5dcfe08),
// matches /admin-homes/tenants/<uuid>, uses that UUID as display tenant ID
// for header pill + switcher currentTenantId. Display-only -- does NOT write
// cookie, does NOT bypass auth. URL tenant ID is only honored for platform
// admins or tenant_managers whose assignment list includes it.

const fs = require('fs');
const path = require('path');

const FILE = 'components/admin-homes/TenantHeader.tsx';

function patch(filePath, edits) {
  const abs = path.resolve(filePath);
  let src = fs.readFileSync(abs, 'utf8');
  for (const [i, e] of edits.entries()) {
    if (!src.includes(e.find)) {
      console.error('ANCHOR MISS in ' + filePath + ' edit #' + (i+1) + ':');
      console.error('--- expected ---'); console.error(e.find);
      process.exit(1);
    }
    const occurrences = src.split(e.find).length - 1;
    if (occurrences > 1) {
      console.error('ANCHOR AMBIGUOUS in ' + filePath + ' edit #' + (i+1) + ': ' + occurrences + ' matches');
      process.exit(1);
    }
    src = src.replace(e.find, e.replace);
    console.log('  OK ' + filePath + ' edit #' + (i+1) + ' applied');
  }
  fs.writeFileSync(abs, src, 'utf8');
}

patch(FILE, [
  {
    find: "import Link from 'next/link'\nimport { createClient } from '@/lib/supabase/server'\nimport type { AdminHomesUser } from '@/lib/admin-homes/auth'\nimport TenantSwitcher, { TenantOption } from './TenantSwitcher'",
    replace: "import Link from 'next/link'\nimport { headers } from 'next/headers'\nimport { createClient } from '@/lib/supabase/server'\nimport type { AdminHomesUser } from '@/lib/admin-homes/auth'\nimport TenantSwitcher, { TenantOption } from './TenantSwitcher'\n\n// F-COCKPIT-HEADER-URL-SCOPE-MISMATCH: extract tenant UUID from cockpit URL\n// (/admin-homes/tenants/<uuid>) so header reflects URL-driven scope when a\n// platform admin browses into a specific tenant without setting the cookie.\nconst COCKPIT_PATH_RE = /^\\/admin-homes\\/tenants\\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\\/|$)/i\n\nfunction tenantIdFromPathname(pathname: string | null): string | null {\n  if (!pathname) return null\n  const m = pathname.match(COCKPIT_PATH_RE)\n  return m ? m[1] : null\n}\n\n// Authorization gate for URL-derived tenant ID. Platform admins can view any\n// tenant; tenant_managers can only view tenants in their assignment list.\nasync function userMayViewTenantId(\n  user: AdminHomesUser,\n  tenantId: string,\n): Promise<boolean> {\n  if (user.isPlatformAdmin) return true\n  const supabase = createClient()\n  const { data: { user: authUser } } = await supabase.auth.getUser()\n  if (!authUser) return false\n  const { data: row } = await supabase\n    .from('tenant_manager_assignments')\n    .select('tenant_id')\n    .eq('user_id', authUser.id)\n    .eq('tenant_id', tenantId)\n    .is('revoked_at', null)\n    .maybeSingle()\n  return !!row\n}"
  },
  {
    find: "export default async function TenantHeader({ user }: TenantHeaderProps) {\n  const tenantId = user.tenantId\n  const isPlatformAdmin = user.isPlatformAdmin\n\n  // Fetch switcher options (empty -> no switcher rendered).\n  const { tenants: switcherTenants, allowUniversal } = await fetchSwitcherTenants(user)\n  const canSwitch = allowUniversal || switcherTenants.length > 0",
    replace: "export default async function TenantHeader({ user }: TenantHeaderProps) {\n  const isPlatformAdmin = user.isPlatformAdmin\n\n  // F-COCKPIT-HEADER-URL-SCOPE-MISMATCH: prefer URL-derived tenant ID on\n  // /admin-homes/tenants/[id] pages, gated by authorization. Falls back to\n  // existing user.tenantId (cookie > x-tenant-id > home tenant > null) when\n  // not on a cockpit page or when authorization fails.\n  const pathname = headers().get('x-pathname')\n  const urlTenantId = tenantIdFromPathname(pathname)\n  const urlTenantAllowed = urlTenantId\n    ? await userMayViewTenantId(user, urlTenantId)\n    : false\n  const tenantId = (urlTenantId && urlTenantAllowed) ? urlTenantId : user.tenantId\n\n  // Fetch switcher options (empty -> no switcher rendered).\n  const { tenants: switcherTenants, allowUniversal } = await fetchSwitcherTenants(user)\n  const canSwitch = allowUniversal || switcherTenants.length > 0"
  }
]);

console.log('\nDone. Run: npx tsc --noEmit');