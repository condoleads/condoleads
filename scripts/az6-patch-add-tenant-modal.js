const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const MODAL = path.join(ROOT, 'components', 'admin-homes', 'AddTenantModal.tsx')

let src = fs.readFileSync(MODAL, 'utf8')
let applied = 0

// Edit 1: Add import for deriveSourceKey + state for showing source_key field
const importAnchor = `import { X, Eye, EyeOff, Loader2, CheckCircle2, XCircle } from 'lucide-react'`
const importNew = `import { X, Eye, EyeOff, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { deriveSourceKey } from '@/lib/admin-homes/tenant-source-key'`

if (!src.includes(importAnchor)) {
  console.error('FAIL edit 1: import anchor not found')
  process.exit(1)
}
if (src.includes(`from '@/lib/admin-homes/tenant-source-key'`)) {
  console.log('SKIP edit 1: import already present (idempotent)')
} else {
  src = src.replace(importAnchor, importNew)
  applied++
  console.log('PASS edit 1: import added')
}

// Edit 2: Add source_key + sourceKeyEdited to formData state
// Anchor on the existing formData useState initialization
const stateAnchor = `const [formData, setFormData] = useState({`
if (!src.includes(stateAnchor)) {
  console.error('FAIL edit 2: state anchor not found')
  process.exit(1)
}
// Just add new fields right after the opening brace -- prepend the new fields
const stateNew = `const [formData, setFormData] = useState({
    source_key: '',
    source_key_overridden: false,`
if (src.includes(`source_key: '',`)) {
  console.log('SKIP edit 2: source_key state already present (idempotent)')
} else {
  src = src.replace(stateAnchor, stateNew)
  applied++
  console.log('PASS edit 2: source_key + override flag added to state')
}

// Edit 3: Add source_key derivation effect (computes when domain changes and not overridden)
// Anchor: the formData useState block closes with }) -- find the line and insert useEffect after
// Look for the const [keyTestResult declaration as a stable anchor
const effectAnchor = `const [keyTestResult, setKeyTestResult] = useState<{ valid: boolean; error?: string } | null>(null)`
const effectNew = `const [keyTestResult, setKeyTestResult] = useState<{ valid: boolean; error?: string } | null>(null)

  // Auto-derive source_key from domain unless admin has overridden it
  useEffect(() => {
    if (!formData.source_key_overridden) {
      const derived = deriveSourceKey(formData.domain)
      if (derived !== formData.source_key) {
        setFormData(fd => ({ ...fd, source_key: derived }))
      }
    }
  }, [formData.domain, formData.source_key_overridden])`

if (!src.includes(effectAnchor)) {
  console.error('FAIL edit 3: keyTestResult anchor not found')
  process.exit(1)
}
if (src.includes(`Auto-derive source_key from domain`)) {
  console.log('SKIP edit 3: derivation effect already present (idempotent)')
} else {
  src = src.replace(effectAnchor, effectNew)
  applied++
  console.log('PASS edit 3: derivation useEffect added')
  // Need to ensure useEffect is imported -- check
  if (!src.includes(`useState, useEffect`) && !src.includes(`useEffect`)) {
    // Patch the React import
    src = src.replace(`import { useState } from 'react'`, `import { useState, useEffect } from 'react'`)
    console.log('       (also patched: useState -> useState, useEffect)')
  }
}

// Edit 4: Send source_key in the fetch body
const fetchAnchor = `domain: formData.domain.toLowerCase(),`
const fetchNew = `domain: formData.domain.toLowerCase(),
          source_key: formData.source_key,`

if (!src.includes(fetchAnchor)) {
  console.error('FAIL edit 4: fetch body anchor not found')
  process.exit(1)
}
if (src.includes(`source_key: formData.source_key,`)) {
  console.log('SKIP edit 4: source_key already in fetch body (idempotent)')
} else {
  src = src.replace(fetchAnchor, fetchNew)
  applied++
  console.log('PASS edit 4: source_key added to POST body')
}

// Edit 5: Add Source Key field UI in the Brand section
// Anchor: the existing Domain input block. Insert source_key field after Admin Email
const uiAnchor = `<label className="block text-sm font-medium text-gray-700 mb-1">Admin Email *</label>
                <input required type="email" value={formData.admin_email} onChange={e => setFormData({ ...formData, admin_email: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="admin@walliam.ca" />`

const uiNew = `<label className="block text-sm font-medium text-gray-700 mb-1">Admin Email *</label>
                <input required type="email" value={formData.admin_email} onChange={e => setFormData({ ...formData, admin_email: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="admin@walliam.ca" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Source Key {!formData.source_key_overridden && <span className="text-xs font-normal text-gray-400">(auto-derived from domain — click to override)</span>}</label>
                <input
                  type="text"
                  value={formData.source_key}
                  readOnly={!formData.source_key_overridden}
                  onClick={() => { if (!formData.source_key_overridden) setFormData({ ...formData, source_key_overridden: true }) }}
                  onChange={e => setFormData({ ...formData, source_key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                  className={\`w-full px-3 py-2 border rounded-lg text-sm font-mono \${formData.source_key_overridden ? 'bg-white' : 'bg-gray-50 cursor-pointer'}\`}
                  placeholder="walliam"
                />
                <p className="text-xs text-gray-500 mt-1">Used as prefix in lead source strings. Must be unique across tenants. Lowercase letters/digits/hyphens/underscores only.</p>`

if (!src.includes(uiAnchor)) {
  console.error('FAIL edit 5: UI anchor (Admin Email block) not found')
  process.exit(1)
}
if (src.includes(`Source Key`) && src.includes(`source_key_overridden`)) {
  console.log('SKIP edit 5: Source Key UI already present (idempotent)')
} else {
  src = src.replace(uiAnchor, uiNew)
  applied++
  console.log('PASS edit 5: Source Key UI field added')
}

// Edit 6: Add post-create onboarding checklist component
// Find the successful POST handler and surface the checklist via state
// Anchor: const handleSubmit -- after successful create, set createdTenant state
// Look for the existing onSuccess pattern -- in this modal, it's onClose() after success

// First, add createdTenant state + showChecklist state near other useState calls
const createdStateAnchor = `const [keyTestResult, setKeyTestResult] = useState<{ valid: boolean; error?: string } | null>(null)`
const createdStateNew = `const [keyTestResult, setKeyTestResult] = useState<{ valid: boolean; error?: string } | null>(null)
  const [createdTenant, setCreatedTenant] = useState<{ id: string; name: string; domain: string; source_key: string } | null>(null)`

if (src.includes(`const [createdTenant, setCreatedTenant]`)) {
  console.log('SKIP edit 6a: createdTenant state already present (idempotent)')
} else {
  src = src.replace(createdStateAnchor, createdStateNew)
  applied++
  console.log('PASS edit 6a: createdTenant state added')
}

// Edit 6b: After successful POST, set createdTenant instead of closing immediately
// Anchor: the handleSubmit success path -- look for `if (res.ok)` block that calls onClose/onSuccess
const successAnchor = `      if (res.ok) {
        onSuccess()
        onClose()
      }`
const successNew = `      if (res.ok) {
        const result = await res.json()
        if (result.tenant) {
          setCreatedTenant({
            id: result.tenant.id,
            name: result.tenant.name,
            domain: result.tenant.domain,
            source_key: result.tenant.source_key,
          })
          onSuccess()
          // Do not close -- show post-create checklist instead. User dismisses via "Done".
        } else {
          onSuccess()
          onClose()
        }
      }`

if (!src.includes(successAnchor)) {
  console.error('FAIL edit 6b: success path anchor not found — modal handleSubmit success block has unexpected shape')
  process.exit(1)
}
if (src.includes(`setCreatedTenant({`)) {
  console.log('SKIP edit 6b: success path already patched (idempotent)')
} else {
  src = src.replace(successAnchor, successNew)
  applied++
  console.log('PASS edit 6b: success path now sets createdTenant')
}

// Edit 6c: Render onboarding checklist when createdTenant is set
// Anchor: the modal's top-level return JSX -- inject checklist near the top
// Easiest: replace the entire <form onSubmit={handleSubmit} ...> with a conditional render
// that shows checklist OR form

const formStartAnchor = `<form onSubmit={handleSubmit} className="p-6 space-y-6">`
const formStartNew = `{createdTenant ? (
          <div className="p-6 space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-green-900">Tenant Created: {createdTenant.name}</h3>
                  <p className="text-xs text-green-700 mt-1">domain: <span className="font-mono">{createdTenant.domain}</span> · source_key: <span className="font-mono">{createdTenant.source_key}</span> · id: <span className="font-mono text-[10px]">{createdTenant.id}</span></p>
                </div>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="font-semibold text-amber-900 mb-2">⚠ Required next steps to make this tenant fully operational</h3>
              <ul className="space-y-2 text-sm text-amber-900">
                <li className="flex items-start gap-2">
                  <span className="font-bold">1.</span>
                  <div>
                    <strong>Verify Resend domain</strong> — tenant cannot send emails (lead notifications, VIP requests) until <code className="text-xs bg-amber-100 px-1 rounded">resend_api_key</code> + <code className="text-xs bg-amber-100 px-1 rounded">email_from_domain</code> are configured and verified. Use the Resend verification flow in the tenant's Edit page.
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold">2.</span>
                  <div>
                    <strong>Anthropic API key</strong> — Charlie AI is currently {formData.anthropic_api_key ? 'configured with the key provided' : 'unconfigured. Falls back to platform key if available, otherwise AI features are disabled'}. Manage via the tenant's Settings page.
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold">3.</span>
                  <div>
                    <strong>Create at least one agent + set as default</strong> — go to Agents → Add Agent for tenant <strong>{createdTenant.name}</strong>, then set that agent as <code className="text-xs bg-amber-100 px-1 rounded">default_agent_id</code> in the tenant settings. Without a default agent, leads have no fallback owner when territory resolver returns null.
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold">4.</span>
                  <div>
                    <strong>Territory assignments</strong> — assign at least one geo level (area / municipality / community / neighbourhood) to agents via the Agents page so the resolver has a real cascade.
                  </div>
                </li>
              </ul>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800">Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">`

if (!src.includes(formStartAnchor)) {
  console.error('FAIL edit 6c: form start anchor not found')
  process.exit(1)
}
if (src.includes(`{createdTenant ? (`)) {
  console.log('SKIP edit 6c: checklist render already present (idempotent)')
} else {
  src = src.replace(formStartAnchor, formStartNew)
  applied++
  console.log('PASS edit 6c: checklist conditional render added (form wrapped in else branch)')
}

// Edit 6d: Close the ternary -- the </form> needs a )} after it
// Find the </form> tag and close the ternary expression
const formEndAnchor = `</form>`
const formEndNew = `</form>
        )}`

// Use lastIndexOf to find the closing </form> -- there should only be one
if (!src.includes(formEndAnchor)) {
  console.error('FAIL edit 6d: </form> closing tag not found')
  process.exit(1)
}
if (src.includes(`</form>
        )}`)) {
  console.log('SKIP edit 6d: ternary close already present (idempotent)')
} else {
  // Replace the LAST </form> only to avoid mishaps if there are nested forms
  const lastIdx = src.lastIndexOf(formEndAnchor)
  src = src.slice(0, lastIdx) + formEndNew + src.slice(lastIdx + formEndAnchor.length)
  applied++
  console.log('PASS edit 6d: ternary closed after </form>')
}

fs.writeFileSync(MODAL, src, 'utf8')
console.log('')
console.log(`Total edits applied: ${applied}`)
console.log(`File size: ${fs.statSync(MODAL).size} bytes`)