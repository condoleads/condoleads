const fs = require('fs');
const path = 'app/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace the walliam redirect with actual homepage render
content = content.replace(
  `import { getWalliamTenantId } from '@/lib/utils/is-walliam'\nimport { redirect } from 'next/navigation'`,
  `import { getWalliamTenantId } from '@/lib/utils/is-walliam'\nimport HomePageComprehensiveClient from '@/components/HomePageComprehensiveClient'`
);

content = content.replace(
  `  // WALLiam tenant check — redirect to /whitby or show WALLiam homepage
  const walliamTenantId = await getWalliamTenantId()
  if (walliamTenantId) {
    redirect('/whitby')
  }

  `,
  `  // WALLiam tenant check — show WALLiam homepage
  const walliamTenantId = await getWalliamTenantId()
  if (walliamTenantId) {
    return <HomePageComprehensiveClient tenantId={walliamTenantId} />
  }

  `
);

fs.writeFileSync(path, content, 'utf8');
console.log('Done.');
