// scripts/az6a-patch.js
// AZ.6a: patch AddTenantModal.tsx -- comprehensive P3.F1 finding fix.
// 6 idempotent edits. Anchor-based, atomic.

const fs = require('fs');
const path = require('path');

const MODAL = path.join(process.cwd(), 'components', 'admin-homes', 'AddTenantModal.tsx');
let src = fs.readFileSync(MODAL, 'utf8');
let applied = 0;
const errors = [];

function tryApply(label, oldStr, newStr) {
  if (src.includes(newStr)) {
    console.log('SKIP ' + label + ' -- new content already present');
    return;
  }
  if (!src.includes(oldStr)) {
    errors.push(label + ' -- anchor not found');
    return;
  }
  src = src.replace(oldStr, newStr);
  applied++;
  console.log('PASS ' + label);
}

// ----- Edit 1: import deriveSourceKey -----
tryApply(
  'E1 import deriveSourceKey',
  "import { X, Eye, EyeOff, CheckCircle2, XCircle, Loader2 } from 'lucide-react'",
  "import { X, Eye, EyeOff, CheckCircle2, XCircle, Loader2 } from 'lucide-react'\nimport { deriveSourceKey } from '@/lib/admin-homes/tenant-source-key'"
);

// ----- Edit 2: ensure useEffect imported -----
const reactImportLine = "import { useState } from 'react'";
if (src.includes(reactImportLine)) {
  tryApply(
    'E2 useEffect import',
    reactImportLine,
    "import { useState, useEffect } from 'react'"
  );
} else if (src.includes('useEffect')) {
  console.log('SKIP E2 -- useEffect already imported');
} else {
  errors.push('E2 -- no useState import line found and no useEffect present');
}

// ----- Edit 3: add createdTenant state + source_key + override flag -----
tryApply(
  'E3 state fields',
  'const [formData, setFormData] = useState({',
  "const [createdTenant, setCreatedTenant] = useState<{ id: string; name: string; domain: string; source_key: string } | null>(null)\n  const [formData, setFormData] = useState({\n    source_key: '',\n    source_key_overridden: false,"
);

// ----- Edit 4: derivation useEffect -----
// Anchor on the boundary between formData useState block close and the handleSubmit
// function. This places the useEffect AFTER formData is fully declared.
const e4Old =
  "  })\r\n" +
  "\r\n" +
  "  async function handleSubmit(e: React.FormEvent) {";
const e4New =
  "  })\r\n" +
  "\r\n" +
  "  useEffect(() => {\r\n" +
  "    if (!formData.source_key_overridden) {\r\n" +
  "      const derived = deriveSourceKey(formData.domain)\r\n" +
  "      if (derived !== formData.source_key) {\r\n" +
  "        setFormData(fd => ({ ...fd, source_key: derived }))\r\n" +
  "      }\r\n" +
  "    }\r\n" +
  "  }, [formData.domain, formData.source_key_overridden, formData.source_key])\r\n" +
  "\r\n" +
  "  async function handleSubmit(e: React.FormEvent) {";
tryApply('E4 derivation useEffect', e4Old, e4New);

// ----- Edit 5: send source_key in POST body -----
tryApply(
  'E5 fetch body',
  'domain: formData.domain.toLowerCase(),',
  'domain: formData.domain.toLowerCase(),\n          source_key: formData.source_key,'
);

// ----- Edit 6: success handler -- store createdTenant, do not close immediately -----
// File is CRLF-normalized: anchors use \r\n.
const successOld =
  "      if (!res.ok) {\r\n" +
  "        const data = await res.json().catch(() => ({ error: 'Failed to create tenant' }))\r\n" +
  "        setError(data.error || 'Failed to create tenant')\r\n" +
  "        return\r\n" +
  "      }\r\n" +
  "      onSuccess(); onClose()";
const successNew =
  "      if (!res.ok) {\r\n" +
  "        const data = await res.json().catch(() => ({ error: 'Failed to create tenant' }))\r\n" +
  "        setError(data.error || 'Failed to create tenant')\r\n" +
  "        return\r\n" +
  "      }\r\n" +
  "      const result = await res.json().catch(() => ({ tenant: null }))\r\n" +
  "      if (result && result.tenant) {\r\n" +
  "        setCreatedTenant({\r\n" +
  "          id: result.tenant.id,\r\n" +
  "          name: result.tenant.name,\r\n" +
  "          domain: result.tenant.domain,\r\n" +
  "          source_key: result.tenant.source_key,\r\n" +
  "        })\r\n" +
  "        onSuccess()\r\n" +
  "      } else {\r\n" +
  "        onSuccess(); onClose()\r\n" +
  "      }";
tryApply('E6 success handler', successOld, successNew);

if (errors.length > 0) {
  console.error('');
  console.error('ABORT -- ' + errors.length + ' anchor failures:');
  for (const e of errors) console.error('  ' + e);
  console.error('No changes written to disk.');
  process.exit(1);
}

fs.writeFileSync(MODAL, src, 'utf8');
console.log('');
console.log('Total edits applied: ' + applied);
console.log('Modal size: ' + fs.statSync(MODAL).size + ' bytes');