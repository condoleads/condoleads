// scripts/walliam-homepage-fix.js
// Targeted fix for walliam.ca 404 on homepage
//
// ROOT CAUSE:
// - app/comprehensive-site/page.tsx calls getAgentFromHost()
// - getAgentFromHost() queries agents table by custom_domain='walliam.ca'
// - No agent record has custom_domain set — walliam.ca resolves via tenant.default_agent_id
// - Middleware already handles this via KNOWN_TENANT_DOMAINS fast-path
// - Homepage was never updated to match — hits notFound() and 404s
//
// FIX:
// - Add walliam.ca fast-path in comprehensive-site/page.tsx ONLY
// - Resolve via tenant.default_agent_id (matches middleware pattern)
// - Fall through to existing getAgentFromHost for all other domains
// - Zero changes to shared utility, zero risk to System 1

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const file = path.join(ROOT, 'app', 'comprehensive-site', 'page.tsx');

const oldBody = `export default async function ComprehensiveHomePage() {
  const headersList = headers()
  const host = headersList.get('host') || ''

  const agent = await getAgentFromHost(host)
  if (!agent) notFound()

  return <HomePageComprehensive agent={{...agent, is_active: true}} />
}`;

const newBody = `// Known tenant domains resolved via tenant.default_agent_id (matches middleware pattern)
const KNOWN_TENANTS: Record<string, string> = {
  'walliam.ca': 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9',
  'www.walliam.ca': 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9',
}

export default async function ComprehensiveHomePage() {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const cleanHost = host.replace(/^www\\./, '')

  // FAST PATH: known tenant domain — resolve via tenant.default_agent_id
  const tenantId = KNOWN_TENANTS[cleanHost] || KNOWN_TENANTS[host]
  if (tenantId) {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = createClient()

    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('default_agent_id')
      .eq('id', tenantId)
      .eq('is_active', true)
      .single()

    if (!tenantErr && tenant?.default_agent_id) {
      const { data: agent } = await supabase
        .from('agents')
        .select('*')
        .eq('id', tenant.default_agent_id)
        .eq('is_active', true)
        .single()

      if (agent) {
        return <HomePageComprehensive agent={{...agent, is_active: true}} />
      }
    }
    // Tenant lookup failed for a known domain — log and fall through to default path
    console.error('[comprehensive-site] Known tenant domain but default_agent_id lookup failed:', { host, tenantId })
  }

  // DEFAULT PATH: subdomain / custom domain resolution via agent-detection utility
  const agent = await getAgentFromHost(host)
  if (!agent) notFound()

  return <HomePageComprehensive agent={{...agent, is_active: true}} />
}`;

let content = fs.readFileSync(file, 'utf8');

if (!content.includes(oldBody)) {
  console.error('✗ Pattern not found in page.tsx. File may have been modified.');
  console.error('Expected to find:\n' + oldBody.split('\n').slice(0, 3).join('\n'));
  process.exit(1);
}

content = content.replace(oldBody, newBody);

fs.writeFileSync(file, content, 'utf8');
console.log('✓ Fixed: app/comprehensive-site/page.tsx');
console.log('\n✓ walliam.ca homepage fast-path added.');
console.log('Next steps:');
console.log('  1. npx tsc --noEmit  (validate types)');
console.log('  2. npm run dev       (test locally — visit http://localhost:3000 with hostname override)');
console.log('  3. git commit + push to deploy');