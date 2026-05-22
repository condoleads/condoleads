// components/admin-homes/AddTenantModal.tsx
'use client'

import { useState, useEffect } from 'react'
import { X, Eye, EyeOff, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { deriveSourceKey } from '@/lib/admin-homes/tenant-source-key'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddTenantModal({ isOpen, onClose, onSuccess }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [testingKey, setTestingKey] = useState(false)
  const [keyTestResult, setKeyTestResult] = useState<{ valid: boolean; error?: string } | null>(null)
  const [createdTenant, setCreatedTenant] = useState<{ id: string; name: string; domain: string; source_key: string } | null>(null)
  const [formData, setFormData] = useState({
    source_key: '',
    source_key_overridden: false,
    // Brand
    name: '', domain: '', brand_name: '', admin_email: '',
    logo_url: '', primary_color: '#1d4ed8', secondary_color: '#4f46e5',
    // API Key
    anthropic_api_key: '',
    // AI Configuration (Charlie chat)
    ai_free_messages: 5, vip_auto_approve: false,
    ai_auto_approve_limit: 0, ai_manual_approve_limit: 10, ai_hard_cap: 25,
    // Estimator Configuration (non-AI comparables)
    // Plan Configuration
    plan_mode: 'shared', plan_free_attempts: 1, plan_auto_approve_limit: 0,
    plan_manual_approve_limit: 3, plan_hard_cap: 10, plan_vip_auto_approve: false,
    seller_plan_free_attempts: 1, seller_plan_hard_cap: 10, seller_plan_auto_approve_limit: 0, seller_plan_manual_approve_limit: 3,
    estimator_nonai_enabled: true,
    estimator_free_attempts: 1, estimator_vip_auto_approve: false,
    estimator_auto_approve_attempts: 2, estimator_manual_approve_attempts: 3,
    estimator_hard_cap: 10,
    // Assistant & Brokerage
    assistant_name: 'Charlie',
    brokerage_name: '',
    brokerage_address: '',
    brokerage_phone: '',
    broker_of_record: '',
    license_number: '',
    footer_tagline: '',
    about_content: '',
    privacy_content: '',
    terms_content: '',
    homepage_layout: 'v1',
    // Resend email stack (verify_status/verified_at set by verify-resend route)
    send_from: '',
    resend_api_key: '',
    email_from_domain: '',
    // Analytics & tracking (all optional)
    google_analytics_id: '',
    google_ads_id: '',
    google_conversion_label: '',
    facebook_pixel_id: '',
    // CC routing for lead emails (optional)
    manager_cc: '',
    admin_bcc: '',
  })

  useEffect(() => {
    if (!formData.source_key_overridden) {
      const derived = deriveSourceKey(formData.domain)
      if (derived !== formData.source_key) {
        setFormData(fd => ({ ...fd, source_key: derived }))
      }
    }
  }, [formData.domain, formData.source_key_overridden, formData.source_key])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin-homes/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          domain: formData.domain.toLowerCase(),
          source_key: formData.source_key,
          brand_name: formData.brand_name || formData.name,
          admin_email: formData.admin_email,
          logo_url: formData.logo_url || null,
          primary_color: formData.primary_color,
          secondary_color: formData.secondary_color,
          anthropic_api_key: formData.anthropic_api_key || null,
          ai_free_messages: formData.ai_free_messages,
          vip_auto_approve: formData.vip_auto_approve,
          ai_auto_approve_limit: formData.ai_auto_approve_limit,
          ai_manual_approve_limit: formData.ai_manual_approve_limit,
          ai_hard_cap: formData.ai_hard_cap,
          plan_mode: formData.plan_mode,
          plan_free_attempts: formData.plan_free_attempts,
          plan_auto_approve_limit: formData.plan_auto_approve_limit,
          plan_manual_approve_limit: formData.plan_manual_approve_limit,
          plan_hard_cap: formData.plan_hard_cap,
          plan_vip_auto_approve: formData.plan_vip_auto_approve,
          seller_plan_free_attempts: formData.seller_plan_free_attempts,
          seller_plan_hard_cap: formData.seller_plan_hard_cap,
          seller_plan_auto_approve_limit: formData.seller_plan_auto_approve_limit,
          seller_plan_manual_approve_limit: formData.seller_plan_manual_approve_limit,
          estimator_ai_enabled: false,
          estimator_nonai_enabled: formData.estimator_nonai_enabled,
          estimator_free_attempts: formData.estimator_free_attempts,
          estimator_vip_auto_approve: formData.estimator_vip_auto_approve,
          estimator_auto_approve_attempts: formData.estimator_auto_approve_attempts,
          estimator_manual_approve_attempts: formData.estimator_manual_approve_attempts,
          estimator_hard_cap: formData.estimator_hard_cap,
          assistant_name: formData.assistant_name || 'Charlie',
          brokerage_name: formData.brokerage_name || null,
          brokerage_address: formData.brokerage_address || null,
          brokerage_phone: formData.brokerage_phone || null,
          broker_of_record: formData.broker_of_record || null,
          license_number: formData.license_number || null,
          footer_tagline: formData.footer_tagline || null,
          about_content: formData.about_content || null,
          privacy_content: formData.privacy_content || null,
          terms_content: formData.terms_content || null,
          homepage_layout: formData.homepage_layout,
          send_from: formData.send_from || null,
          resend_api_key: formData.resend_api_key || null,
          email_from_domain: formData.email_from_domain || null,
          google_analytics_id: formData.google_analytics_id || null,
          google_ads_id: formData.google_ads_id || null,
          google_conversion_label: formData.google_conversion_label || null,
          facebook_pixel_id: formData.facebook_pixel_id || null,
          manager_cc: formData.manager_cc || null,
          admin_bcc: formData.admin_bcc || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to create tenant' }))
        setError(data.error || 'Failed to create tenant')
        return
      }
      const result = await res.json().catch(() => ({ tenant: null }))
      if (result && result.tenant) {
        setCreatedTenant({
          id: result.tenant.id,
          name: result.tenant.name,
          domain: result.tenant.domain,
          source_key: result.tenant.source_key,
        })
        onSuccess()
      } else {
        onSuccess(); onClose()
      }
    } catch { setError('Failed to create tenant') }
    setSaving(false)
  }

  async function handleTestKey() {
    const key = formData.anthropic_api_key?.trim()
    if (!key) {
      setKeyTestResult({ valid: false, error: 'Enter a key first' })
      return
    }
    setTestingKey(true); setKeyTestResult(null)
    try {
      const res = await fetch('/api/admin-homes/tenants/verify-anthropic-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      const data = await res.json()
      setKeyTestResult({ valid: !!data.valid, error: data.error })
    } catch {
      setKeyTestResult({ valid: false, error: 'Network error' })
    } finally {
      setTestingKey(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Add Tenant</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        {createdTenant ? (
        <div className="p-6 space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-900">Tenant Created: {createdTenant.name}</h3>
                <p className="text-xs text-green-700 mt-1">
                  domain: <span className="font-mono">{createdTenant.domain}</span>
                  {' '}&middot;{' '}
                  source_key: <span className="font-mono">{createdTenant.source_key}</span>
                  {' '}&middot;{' '}
                  id: <span className="font-mono text-[10px]">{createdTenant.id}</span>
                </p>
              </div>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h3 className="font-semibold text-amber-900 mb-2">Required next steps to make this tenant fully operational</h3>
            <ol className="space-y-3 text-sm text-amber-900 list-decimal list-inside">
              <li>
                <strong>Verify Resend domain.</strong> Tenant cannot send emails (lead notifications, VIP requests) until <code className="text-xs bg-amber-100 px-1 rounded">resend_api_key</code> + <code className="text-xs bg-amber-100 px-1 rounded">email_from_domain</code> are configured and verified.
              </li>
              <li>
                <strong>Anthropic API key.</strong> Charlie AI requires a per-tenant key (or platform fallback). Configure in tenant Settings.
              </li>
              <li>
                <strong>Create at least one agent + set as default.</strong> Go to Agents &rarr; Add Agent for <strong>{createdTenant.name}</strong>, then set that agent as <code className="text-xs bg-amber-100 px-1 rounded">default_agent_id</code> in tenant settings. Without a default agent, leads have no fallback owner when the territory resolver returns null.
              </li>
              <li>
                <strong>Territory assignments.</strong> Assign at least one geo level (area / municipality / community / neighbourhood) to agents via the Agents page so the resolver has a real cascade.
              </li>
            </ol>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800">Done</button>
          </div>
        </div>
        ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}

          {/* Brand */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Brand</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tenant Name *</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Your Brand" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                <input type="text" value={formData.brand_name} onChange={e => setFormData({ ...formData, brand_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Defaults to name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Domain *</label>
                <input required type="text" value={formData.domain} onChange={e => setFormData({ ...formData, domain: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="yourbrand.ca" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email *</label>
                <input required type="email" value={formData.admin_email} onChange={e => setFormData({ ...formData, admin_email: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="admin@yourbrand.ca" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                <div className="flex gap-2">
                  <input type="color" value={formData.primary_color} onChange={e => setFormData({ ...formData, primary_color: e.target.value })} className="w-10 h-10 border rounded cursor-pointer" />
                  <input type="text" value={formData.primary_color} onChange={e => setFormData({ ...formData, primary_color: e.target.value })} className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
                <div className="flex gap-2">
                  <input type="color" value={formData.secondary_color} onChange={e => setFormData({ ...formData, secondary_color: e.target.value })} className="w-10 h-10 border rounded cursor-pointer" />
                  <input type="text" value={formData.secondary_color} onChange={e => setFormData({ ...formData, secondary_color: e.target.value })} className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
                <input type="url" value={formData.logo_url} onChange={e => setFormData({ ...formData, logo_url: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="https://..." />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Homepage Layout</label>
                <select value={formData.homepage_layout} onChange={e => setFormData({ ...formData, homepage_layout: e.target.value as 'v1' | 'v2' | 'v3' })} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                  <option value="v1">v1 — AI-first (current)</option>
                  <option value="v2">v2 — With Browse toggle</option>
                  <option value="v3">v3 — Reserved (not yet built)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Controls which homepage layout renders for this tenant. Change takes effect on next page load.</p>
              </div>
            </div>
          </div>

          {/* Anthropic API Key */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-1">Anthropic API Key</h3>
            <p className="text-xs text-blue-600 mb-3">Powers Charlie AI for this tenant. Falls back to platform key if not set.</p>
            <div className="flex gap-2">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={formData.anthropic_api_key}
                onChange={e => setFormData({ ...formData, anthropic_api_key: e.target.value })}
                className="flex-1 px-3 py-2 border rounded-lg text-sm font-mono"
                placeholder="sk-ant-..."
              />
              <button type="button" onClick={() => setShowApiKey(v => !v)} className="px-3 py-2 border rounded-lg text-gray-500 hover:bg-gray-50">
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={handleTestKey}
                disabled={testingKey || !formData.anthropic_api_key}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {testingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {testingKey ? 'Testing...' : 'Test Key'}
              </button>
            </div>
            {keyTestResult && (
              <p className={`text-xs mt-2 flex items-center gap-1 ${keyTestResult.valid ? 'text-green-700' : 'text-red-600'}`}>
                {keyTestResult.valid
                  ? <><CheckCircle2 className="w-3 h-3" /> Key is valid</>
                  : <><XCircle className="w-3 h-3" /> {keyTestResult.error || 'Invalid key'}</>}
              </p>
            )}
          </div>

          {/* Brokerage & Branding */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h3 className="font-semibold text-slate-900 mb-1">Brokerage & Branding</h3>
            <p className="text-xs text-slate-600 mb-3">Assistant name + legal info shown in footer. All optional.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assistant Name</label>
                <input type="text" value={formData.assistant_name} onChange={e => setFormData({ ...formData, assistant_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Charlie" />
              </div>
              <div className="pt-2 border-t border-slate-200">
                <p className="text-xs font-semibold text-slate-700 mb-2">Brokerage Legal Info</p>
                <div className="space-y-2">
                  <input type="text" value={formData.brokerage_name} onChange={e => setFormData({ ...formData, brokerage_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Brokerage Legal Name (e.g. RE/MAX Crossroads Realty Inc., Brokerage)" />
                  <input type="text" value={formData.brokerage_address} onChange={e => setFormData({ ...formData, brokerage_address: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Office Address (street, city, province, postal)" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={formData.brokerage_phone} onChange={e => setFormData({ ...formData, brokerage_phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Office Phone" />
                    <input type="text" value={formData.broker_of_record} onChange={e => setFormData({ ...formData, broker_of_record: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Broker of Record" />
                  </div>
                  <input type="text" value={formData.license_number} onChange={e => setFormData({ ...formData, license_number: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="RECO Registration #" />
                  <input type="text" value={formData.footer_tagline} onChange={e => setFormData({ ...formData, footer_tagline: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Footer tagline (e.g. AI-powered real estate for the GTA)" />
                  <div className="pt-3 border-t border-slate-200 mt-3">
                    <p className="text-xs font-semibold text-slate-700 mb-2">Editable Page Content (leave blank to use the default template)</p>
                    <div className="space-y-2">
                      <textarea value={formData.about_content} onChange={e => setFormData({ ...formData, about_content: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="About page content (HTML or Markdown)" rows={4} />
                      <textarea value={formData.privacy_content} onChange={e => setFormData({ ...formData, privacy_content: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Privacy Policy (HTML or Markdown)" rows={4} />
                      <textarea value={formData.terms_content} onChange={e => setFormData({ ...formData, terms_content: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Terms of Use (HTML or Markdown)" rows={4} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Resend Email — required for lead notifications, VIP requests */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h3 className="font-semibold text-orange-900 mb-1">✉ Resend Email</h3>
            <p className="text-xs text-orange-700 mb-3">Required for the tenant to send lead notifications, VIP requests, and admin emails. After save, use the Verify Domain action to complete DNS verification.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send-From Header</label>
                <input type="text" value={formData.send_from} onChange={e => setFormData({ ...formData, send_from: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="Tenant Name <notifications@tenant.ca>" />
                <p className="text-xs text-gray-500 mt-1">Full RFC 5322 From header. Example: <code className="text-xs bg-orange-100 px-1 rounded">Your Brand &lt;notifications@yourbrand.ca&gt;</code></p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resend API Key</label>
                <input type="password" value={formData.resend_api_key} onChange={e => setFormData({ ...formData, resend_api_key: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="re_..." />
                <p className="text-xs text-gray-500 mt-1">Resend API key with sending permissions for the from-domain.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email From-Domain</label>
                <input type="text" value={formData.email_from_domain} onChange={e => setFormData({ ...formData, email_from_domain: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="tenant.ca" />
                <p className="text-xs text-gray-500 mt-1">DNS-verified sender domain registered with Resend. Must match the domain in Send-From.</p>
              </div>
            </div>
          </div>

          {/* Analytics & Tracking — all optional */}
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
            <h3 className="font-semibold text-cyan-900 mb-1">⊿ Analytics &amp; Tracking</h3>
            <p className="text-xs text-cyan-700 mb-3">All optional. Configure for production marketing measurement.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Google Analytics ID</label>
                <input type="text" value={formData.google_analytics_id} onChange={e => setFormData({ ...formData, google_analytics_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="G-XXXXXXXXXX" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Google Ads ID</label>
                <input type="text" value={formData.google_ads_id} onChange={e => setFormData({ ...formData, google_ads_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="AW-XXXXXXXXX" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Google Conversion Label</label>
                <input type="text" value={formData.google_conversion_label} onChange={e => setFormData({ ...formData, google_conversion_label: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="AbCdEfGhIj-1234567890" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Facebook Pixel ID</label>
                <input type="text" value={formData.facebook_pixel_id} onChange={e => setFormData({ ...formData, facebook_pixel_id: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="123456789012345" />
              </div>
            </div>
          </div>

          {/* CC Routing — manager/admin email copies on lead notifications */}
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
            <h3 className="font-semibold text-stone-900 mb-1">⇉ CC Routing</h3>
            <p className="text-xs text-stone-700 mb-3">Optional comma-separated email lists copied on lead notifications. Manager CC receives a copy of all lead emails; Admin BCC receives a blind copy for compliance / oversight.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Manager CC</label>
                <input type="text" value={formData.manager_cc} onChange={e => setFormData({ ...formData, manager_cc: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="manager1@tenant.ca, manager2@tenant.ca" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin BCC</label>
                <input type="text" value={formData.admin_bcc} onChange={e => setFormData({ ...formData, admin_bcc: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="admin@tenant.ca" />
              </div>
            </div>
          </div>

          {/* AI Configuration — Charlie chat */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-1">✦ AI Configuration</h3>
            <p className="text-xs text-green-700 mb-3">Controls Charlie AI chat access for all users on this tenant.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Free Chat Messages</label>
                <input type="number" min={0} value={formData.ai_free_messages} onChange={e => setFormData({ ...formData, ai_free_messages: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                <p className="text-xs text-gray-400 mt-1">Chat messages before approval required</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hard Cap</label>
                <input type="number" min={1} value={formData.ai_hard_cap} onChange={e => setFormData({ ...formData, ai_hard_cap: parseInt(e.target.value) || 10 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chats on Auto-Approve</label>
                <input type="number" min={0} value={formData.ai_auto_approve_limit} onChange={e => setFormData({ ...formData, ai_auto_approve_limit: parseInt(e.target.value) || 2 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chats on Manual Approve</label>
                <input type="number" min={0} value={formData.ai_manual_approve_limit} onChange={e => setFormData({ ...formData, ai_manual_approve_limit: parseInt(e.target.value) || 3 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.vip_auto_approve} onChange={e => setFormData({ ...formData, vip_auto_approve: e.target.checked })} className="w-4 h-4 text-green-600" />
                  <div>
                    <span className="text-sm font-medium text-gray-700">Auto-Approve Requests</span>
                    <p className="text-xs text-gray-400">Instantly grant plans without manual review</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Plan Configuration */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <h3 className="font-semibold text-indigo-900 mb-1">📋 Plan Configuration</h3>
            <p className="text-xs text-indigo-700 mb-3">Controls AI Buyer/Seller plan access for all users on this tenant.</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Plan Mode</label>
              <div className="flex gap-2">
                {[{v:'shared',l:'🔗 Shared Pool'},{v:'independent',l:'⚡ Independent'}].map(m => (
                  <button key={m.v} type="button" onClick={() => setFormData({...formData, plan_mode: m.v})}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${formData.plan_mode === m.v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                    {m.l}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">{formData.plan_mode === 'shared' ? 'Buyer + seller plans draw from one shared pool' : 'Buyer and seller plans have independent limits'}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {formData.plan_mode === 'shared' ? <>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Free Plans (shared)</label>
                  <input type="number" min={0} value={formData.plan_free_attempts} onChange={e => setFormData({...formData, plan_free_attempts: parseInt(e.target.value)||1})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Hard Cap</label>
                  <input type="number" min={1} value={formData.plan_hard_cap} onChange={e => setFormData({...formData, plan_hard_cap: parseInt(e.target.value)||10})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </> : <>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Free Buyer Plans</label>
                  <input type="number" min={0} value={formData.plan_free_attempts} onChange={e => setFormData({...formData, plan_free_attempts: parseInt(e.target.value)||1})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Buyer Hard Cap</label>
                  <input type="number" min={1} value={formData.plan_hard_cap} onChange={e => setFormData({...formData, plan_hard_cap: parseInt(e.target.value)||10})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Free Seller Plans</label>
                  <input type="number" min={0} value={formData.seller_plan_free_attempts} onChange={e => setFormData({...formData, seller_plan_free_attempts: parseInt(e.target.value)||1})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Seller Hard Cap</label>
                  <input type="number" min={1} value={formData.seller_plan_hard_cap} onChange={e => setFormData({...formData, seller_plan_hard_cap: parseInt(e.target.value)||10})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </>}
              <div><label className="block text-sm font-medium text-gray-700 mb-1">{formData.plan_mode === 'shared' ? 'Auto-Approve Limit' : 'Buyer Auto-Approve'}</label>
                <input type="number" min={0} value={formData.plan_auto_approve_limit} onChange={e => setFormData({...formData, plan_auto_approve_limit: parseInt(e.target.value)||0})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">{formData.plan_mode === 'shared' ? 'Manual Approve Limit' : 'Buyer Manual Approve'}</label>
                <input type="number" min={0} value={formData.plan_manual_approve_limit} onChange={e => setFormData({...formData, plan_manual_approve_limit: parseInt(e.target.value)||3})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              {formData.plan_mode === 'split' && <>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Seller Auto-Approve</label>
                  <input type="number" min={0} value={formData.seller_plan_auto_approve_limit} onChange={e => setFormData({...formData, seller_plan_auto_approve_limit: parseInt(e.target.value)||0})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Seller Manual Approve</label>
                  <input type="number" min={0} value={formData.seller_plan_manual_approve_limit} onChange={e => setFormData({...formData, seller_plan_manual_approve_limit: parseInt(e.target.value)||3})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </>}
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.plan_vip_auto_approve} onChange={e => setFormData({...formData, plan_vip_auto_approve: e.target.checked})} className="w-4 h-4 text-indigo-600" />
                  <div><span className="text-sm font-medium text-gray-700">Auto-Approve Plan Requests</span>
                  <p className="text-xs text-gray-400">Instantly grant plans without manual review</p></div>
                </label>
              </div>
            </div>
          </div>


          {/* Estimator Configuration — non-AI comparables */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900 mb-1">⊹ Estimator Configuration</h3>
            <p className="text-xs text-purple-700 mb-3">Controls property estimator access (comparable data) for all users on this tenant.</p>

            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer p-3 bg-white rounded-lg border">
                <input type="checkbox" checked={formData.estimator_nonai_enabled} onChange={e => setFormData({ ...formData, estimator_nonai_enabled: e.target.checked })} className="w-4 h-4 text-purple-600" />
                <div>
                  <span className="text-sm font-medium text-gray-700">Enable Estimator</span>
                  <p className="text-xs text-gray-400">Allow users to request property estimates</p>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Free Attempts Per User</label>
                <input type="number" min={0} value={formData.estimator_free_attempts} onChange={e => setFormData({ ...formData, estimator_free_attempts: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hard Cap</label>
                <input type="number" min={1} value={formData.estimator_hard_cap} onChange={e => setFormData({ ...formData, estimator_hard_cap: parseInt(e.target.value) || 10 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Attempts on Auto-Approve</label>
                <input type="number" min={0} value={formData.estimator_auto_approve_attempts} onChange={e => setFormData({ ...formData, estimator_auto_approve_attempts: parseInt(e.target.value) || 2 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Attempts on Manual Approve</label>
                <input type="number" min={0} value={formData.estimator_manual_approve_attempts} onChange={e => setFormData({ ...formData, estimator_manual_approve_attempts: parseInt(e.target.value) || 3 })} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.estimator_vip_auto_approve} onChange={e => setFormData({ ...formData, estimator_vip_auto_approve: e.target.checked })} className="w-4 h-4 text-purple-600" />
                  <div>
                    <span className="text-sm font-medium text-gray-700">Auto-Approve Estimator Requests</span>
                    <p className="text-xs text-gray-400">Instantly grant attempts without manual review</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Tenant'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}
