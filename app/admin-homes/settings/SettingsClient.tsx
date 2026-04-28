// app/admin-homes/settings/SettingsClient.tsx
// Phase 3.3 — tenant settings workspace (client)

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, AlertTriangle, Power, RotateCcw, XCircle, Eye, EyeOff, RefreshCw, CheckCircle2 } from 'lucide-react'

type Tab = 'general' | 'branding' | 'caps' | 'integrations' | 'content' | 'notifications' | 'lifecycle'

interface Tenant {
  id: string
  name: string
  brand_name: string | null
  assistant_name: string | null
  domain: string
  admin_email: string
  primary_color: string | null
  secondary_color: string | null
  logo_url: string | null
  homepage_layout: string
  footer_tagline: string | null
  brokerage_name: string | null
  brokerage_address: string | null
  brokerage_phone: string | null
  broker_of_record: string | null
  license_number: string | null
  ai_free_messages: number | null
  ai_auto_approve_limit: number | null
  ai_manual_approve_limit: number | null
  ai_hard_cap: number | null
  plan_free_attempts: number | null
  plan_auto_approve_limit: number | null
  plan_manual_approve_limit: number | null
  plan_hard_cap: number | null
  plan_mode: string | null
  seller_plan_free_attempts: number | null
  seller_plan_auto_approve_limit: number | null
  seller_plan_manual_approve_limit: number | null
  seller_plan_hard_cap: number | null
  estimator_free_attempts: number | null
  estimator_auto_approve_attempts: number | null
  estimator_manual_approve_attempts: number | null
  estimator_hard_cap: number | null
  manager_cc: string | null
  admin_bcc: string | null
  send_from: string | null
  lifecycle_status: 'active' | 'suspended' | 'terminated'
  suspended_at: string | null
  suspended_reason: string | null
  terminated_at: string | null
  termination_grace_until: string | null
  // Integrations
  anthropic_api_key: string | null
  resend_api_key: string | null
  email_from_domain: string | null
  google_analytics_id: string | null
  google_ads_id: string | null
  google_conversion_label: string | null
  facebook_pixel_id: string | null
  // Site Content
  about_content: string | null
  privacy_content: string | null
  terms_content: string | null
  // VIP toggles
  vip_auto_approve: boolean | null
  plan_vip_auto_approve: boolean | null
  estimator_ai_enabled: boolean | null
  estimator_nonai_enabled: boolean | null
  estimator_vip_auto_approve: boolean | null
  is_active: boolean
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'branding', label: 'Branding' },
  { id: 'caps', label: 'VIP & Credits' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'content', label: 'Site Content' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'lifecycle', label: 'Lifecycle' },
]

export default function SettingsClient({
  tenant: initialTenant,
  canManageLifecycle,
}: {
  tenant: Tenant
  canManageLifecycle: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('general')
  const [tenant, setTenant] = useState<Tenant>(initialTenant)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Integration health state
  const [anthropicHealth, setAnthropicHealth] = useState<{ state: HealthState; message: string; checkedAt: string | null }>({
    state: tenant.anthropic_api_key ? 'unknown' : 'unconfigured',
    message: tenant.anthropic_api_key ? 'Not yet checked — click Check now' : 'No key configured',
    checkedAt: null,
  })
  const [resendHealth, setResendHealth] = useState<{ state: HealthState; message: string; checkedAt: string | null }>({
    state: tenant.resend_api_key ? 'unknown' : 'unconfigured',
    message: tenant.resend_api_key ? 'Not yet checked — click Send test' : 'No key configured',
    checkedAt: null,
  })

  async function checkAnthropic() {
    setAnthropicHealth({ state: 'checking', message: 'Checking...', checkedAt: null })
    try {
      const res = await fetch('/api/admin-homes/tenants/verify-anthropic-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: tenant.anthropic_api_key, tenantId: tenant.id }),
      })
      const j = await res.json().catch(() => ({}))
      const now = new Date().toISOString()
      if (j.valid) {
        setAnthropicHealth({ state: 'healthy', message: j.creditStatus === 'low' ? 'Key valid · credits low' : 'Key valid · credits OK', checkedAt: now })
      } else {
        const msg = (j.error || '').toLowerCase()
        if (msg.includes('credit')) setAnthropicHealth({ state: 'broken', message: 'Credits depleted — top up at console.anthropic.com', checkedAt: now })
        else if (msg.includes('invalid') || msg.includes('401')) setAnthropicHealth({ state: 'broken', message: 'Invalid API key', checkedAt: now })
        else setAnthropicHealth({ state: 'broken', message: j.error || 'Check failed', checkedAt: now })
      }
    } catch {
      setAnthropicHealth({ state: 'broken', message: 'Network error', checkedAt: new Date().toISOString() })
    }
  }

  async function checkResend() {
    setResendHealth({ state: 'checking', message: 'Sending test email...', checkedAt: null })
    try {
      const res = await fetch(`/api/admin-homes/tenants/${tenant.id}/verify-resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resend_api_key: tenant.resend_api_key,
          email_from_domain: tenant.email_from_domain,
          send_from: tenant.send_from,
        }),
      })
      const j = await res.json().catch(() => ({}))
      const now = new Date().toISOString()
      if (j.valid) {
        setResendHealth({ state: 'healthy', message: `Test email sent · ${j.messageId || 'OK'}`, checkedAt: now })
      } else {
        const msg = (j.error || '').toLowerCase()
        if (msg.includes('domain')) setResendHealth({ state: 'broken', message: 'Domain not verified in Resend', checkedAt: now })
        else if (msg.includes('401') || msg.includes('invalid')) setResendHealth({ state: 'broken', message: 'Invalid Resend API key', checkedAt: now })
        else setResendHealth({ state: 'broken', message: j.error || 'Send failed', checkedAt: now })
      }
    } catch {
      setResendHealth({ state: 'broken', message: 'Network error', checkedAt: new Date().toISOString() })
    }
  }

  function update<K extends keyof Tenant>(key: K, value: Tenant[K]) {
    setTenant(t => ({ ...t, [key]: value }))
  }

  async function saveSection(fields: (keyof Tenant)[]) {
    setSaving(true); setError(null); setSuccess(null)
    try {
      const payload: Record<string, unknown> = {}
      for (const f of fields) payload[f] = tenant[f]
      const res = await fetch(`/api/admin-homes/tenants/${tenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Save failed (${res.status})`)
      }
      setSuccess('Saved.')
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function lifecycleAction(action: 'suspend' | 'reactivate' | 'terminate', reason?: string) {
    setSaving(true); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/admin-homes/tenants/${tenant.id}/lifecycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || `Action failed (${res.status})`)
      setSuccess(`Tenant ${action}d.`)
      setTenant(t => ({
        ...t,
        lifecycle_status: j.lifecycle_status,
        is_active: action === 'reactivate',
        termination_grace_until: j.grace_until,
      }))
      router.refresh()
    } catch (e: any) {
      setError(e.message || 'Action failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tenant Settings</h1>
        <p className="text-sm text-gray-500">Configure {tenant.brand_name || tenant.name}.</p>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-2 -mb-px">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setError(null); setSuccess(null) }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                tab === t.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3 rounded">{error}</div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded">{success}</div>
      )}

      {tab === 'general' && (
        <Section title="General" onSave={() => saveSection(['name', 'brand_name', 'assistant_name', 'domain', 'admin_email', 'homepage_layout'])} saving={saving}>
          <Field label="Tenant Name" value={tenant.name} onChange={v => update('name', v)} />
          <Field label="Brand Name" value={tenant.brand_name || ''} onChange={v => update('brand_name', v)} />
          <Field label="Assistant Name (AI persona)" value={tenant.assistant_name || ''} onChange={v => update('assistant_name', v)} placeholder="e.g. Charlie, Johnny, Sage" />
          <Field label="Domain" value={tenant.domain} onChange={v => update('domain', v)} />
          <Field label="Admin Email" type="email" value={tenant.admin_email} onChange={v => update('admin_email', v)} />
          <SelectField
            label="Homepage Layout"
            value={tenant.homepage_layout}
            options={[
              { value: 'v1', label: 'V1' },
              { value: 'v2', label: 'V2' },
              { value: 'v3', label: 'V3' },
            ]}
            onChange={v => update('homepage_layout', v)}
          />
        </Section>
      )}

      {tab === 'branding' && (
        <Section title="Branding" onSave={() => saveSection(['primary_color', 'secondary_color', 'logo_url', 'footer_tagline', 'brokerage_name', 'brokerage_address', 'brokerage_phone', 'broker_of_record', 'license_number'])} saving={saving}>
          <ColorField label="Primary Color" value={tenant.primary_color || '#1d4ed8'} onChange={v => update('primary_color', v)} />
          <ColorField label="Secondary Color" value={tenant.secondary_color || '#4f46e5'} onChange={v => update('secondary_color', v)} />
          <Field label="Logo URL" value={tenant.logo_url || ''} onChange={v => update('logo_url', v)} />
          <Field label="Footer Tagline" value={tenant.footer_tagline || ''} onChange={v => update('footer_tagline', v)} />
          <Field label="Brokerage Name" value={tenant.brokerage_name || ''} onChange={v => update('brokerage_name', v)} />
          <Field label="Brokerage Address" value={tenant.brokerage_address || ''} onChange={v => update('brokerage_address', v)} />
          <Field label="Brokerage Phone" value={tenant.brokerage_phone || ''} onChange={v => update('brokerage_phone', v)} />
          <Field label="Broker of Record" value={tenant.broker_of_record || ''} onChange={v => update('broker_of_record', v)} />
          <Field label="License Number" value={tenant.license_number || ''} onChange={v => update('license_number', v)} />
        </Section>
      )}

      {tab === 'caps' && (
        <Section title="VIP & Credits" onSave={() => saveSection([
          'ai_free_messages','ai_auto_approve_limit','ai_manual_approve_limit','ai_hard_cap','vip_auto_approve',
          'plan_mode','plan_free_attempts','plan_auto_approve_limit','plan_manual_approve_limit','plan_hard_cap','plan_vip_auto_approve',
          'seller_plan_free_attempts','seller_plan_auto_approve_limit','seller_plan_manual_approve_limit','seller_plan_hard_cap',
          'estimator_nonai_enabled','estimator_ai_enabled','estimator_vip_auto_approve',
          'estimator_free_attempts','estimator_auto_approve_attempts','estimator_manual_approve_attempts','estimator_hard_cap',
        ])} saving={saving}>
          <SubHeading>AI Chat (Charlie)</SubHeading>
          <BooleanField
            label="Auto-approve VIP requests"
            value={!!tenant.vip_auto_approve}
            onChange={v => update('vip_auto_approve', v)}
            help="When ON, VIP credit requests for chat are granted automatically. When OFF, agent must approve via email."
          />
          <NumberField label="Free Messages" value={tenant.ai_free_messages} onChange={v => update('ai_free_messages', v)} />
          <NumberField label="Auto-Approve Limit" value={tenant.ai_auto_approve_limit} onChange={v => update('ai_auto_approve_limit', v)} />
          <NumberField label="Manual-Approve Limit" value={tenant.ai_manual_approve_limit} onChange={v => update('ai_manual_approve_limit', v)} />
          <NumberField label="Hard Cap" value={tenant.ai_hard_cap} onChange={v => update('ai_hard_cap', v)} />

          <SubHeading>Buyer Plans</SubHeading>
          <BooleanField
            label="Auto-approve plan requests"
            value={!!tenant.plan_vip_auto_approve}
            onChange={v => update('plan_vip_auto_approve', v)}
            help="When ON, buyer/seller plan requests are granted automatically. When OFF, agent approval required via email."
          />
          <SelectField label="Plan Mode" value={tenant.plan_mode || 'shared'} options={[{ value: 'shared', label: 'Shared' }, { value: 'independent', label: 'Independent' }]} onChange={v => update('plan_mode', v)} />
          <NumberField label="Free Attempts" value={tenant.plan_free_attempts} onChange={v => update('plan_free_attempts', v)} />
          <NumberField label="Auto-Approve Limit" value={tenant.plan_auto_approve_limit} onChange={v => update('plan_auto_approve_limit', v)} />
          <NumberField label="Manual-Approve Limit" value={tenant.plan_manual_approve_limit} onChange={v => update('plan_manual_approve_limit', v)} />
          <NumberField label="Hard Cap" value={tenant.plan_hard_cap} onChange={v => update('plan_hard_cap', v)} />

          <SubHeading>Seller Plans</SubHeading>
          <NumberField label="Free Attempts" value={tenant.seller_plan_free_attempts} onChange={v => update('seller_plan_free_attempts', v)} />
          <NumberField label="Auto-Approve Limit" value={tenant.seller_plan_auto_approve_limit} onChange={v => update('seller_plan_auto_approve_limit', v)} />
          <NumberField label="Manual-Approve Limit" value={tenant.seller_plan_manual_approve_limit} onChange={v => update('seller_plan_manual_approve_limit', v)} />
          <NumberField label="Hard Cap" value={tenant.seller_plan_hard_cap} onChange={v => update('seller_plan_hard_cap', v)} />

          <SubHeading>Estimator</SubHeading>
          <BooleanField
            label="Enable Estimator (statistical)"
            value={!!tenant.estimator_nonai_enabled}
            onChange={v => update('estimator_nonai_enabled', v)}
            help="Show comparable sales data and price estimate. Master switch for the estimator surface."
          />
          <BooleanField
            label="Enable AI Insights"
            value={!!tenant.estimator_ai_enabled}
            onChange={v => update('estimator_ai_enabled', v)}
            help="Add AI analysis on top of the statistical estimate (concession %, negotiation position, comparable units cited). Requires Estimator to be enabled."
          />
          <BooleanField
            label="Auto-approve estimator requests"
            value={!!tenant.estimator_vip_auto_approve}
            onChange={v => update('estimator_vip_auto_approve', v)}
            help="When ON, estimator credit requests are granted automatically. When OFF, agent approval required."
          />
          <NumberField label="Free Attempts" value={tenant.estimator_free_attempts} onChange={v => update('estimator_free_attempts', v)} />
          <NumberField label="Auto-Approve Attempts" value={tenant.estimator_auto_approve_attempts} onChange={v => update('estimator_auto_approve_attempts', v)} />
          <NumberField label="Manual-Approve Attempts" value={tenant.estimator_manual_approve_attempts} onChange={v => update('estimator_manual_approve_attempts', v)} />
          <NumberField label="Hard Cap" value={tenant.estimator_hard_cap} onChange={v => update('estimator_hard_cap', v)} />
        </Section>
      )}

      {tab === 'integrations' && (
        <Section title="Integrations" onSave={() => saveSection([
          'anthropic_api_key', 'resend_api_key', 'email_from_domain',
          'google_analytics_id', 'google_ads_id', 'google_conversion_label', 'facebook_pixel_id',
        ])} saving={saving}>
          <div className="md:col-span-2 space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-blue-900">Anthropic API</h3>
                  <p className="text-xs text-blue-700">Powers Charlie AI. Tenant pays Anthropic directly.</p>
                </div>
                <button
                  type="button"
                  onClick={checkAnthropic}
                  disabled={!tenant.anthropic_api_key || anthropicHealth.state === 'checking'}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-blue-300 text-blue-700 text-xs font-medium rounded hover:bg-blue-100 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${anthropicHealth.state === 'checking' ? 'animate-spin' : ''}`} />
                  Check now
                </button>
              </div>
              <StatusBadge state={anthropicHealth.state} message={anthropicHealth.message} lastCheckedAt={anthropicHealth.checkedAt} />
              <MaskedField
                label="API Key"
                value={tenant.anthropic_api_key || ''}
                onChange={v => update('anthropic_api_key', v)}
                placeholder="sk-ant-..."
                help="Console: https://console.anthropic.com"
              />
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-orange-900">Resend (Email Delivery)</h3>
                  <p className="text-xs text-orange-700">All tenant emails. Domain must be verified in Resend.</p>
                </div>
                <button
                  type="button"
                  onClick={checkResend}
                  disabled={!tenant.resend_api_key || resendHealth.state === 'checking'}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-orange-300 text-orange-700 text-xs font-medium rounded hover:bg-orange-100 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${resendHealth.state === 'checking' ? 'animate-spin' : ''}`} />
                  Send test
                </button>
              </div>
              <StatusBadge state={resendHealth.state} message={resendHealth.message} lastCheckedAt={resendHealth.checkedAt} />
              <MaskedField
                label="API Key"
                value={tenant.resend_api_key || ''}
                onChange={v => update('resend_api_key', v)}
                placeholder="re_..."
                help="Dashboard: https://resend.com/api-keys"
              />
              <Field
                label="From Domain"
                value={tenant.email_from_domain || ''}
                onChange={v => update('email_from_domain', v)}
                placeholder="walliam.ca"
              />
              <p className="text-xs text-orange-700 -mt-2">From-domain must be verified in your Resend account. The Send-From address (Notifications tab) must use this domain.</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h3 className="font-semibold text-slate-900 mb-1">Marketing & Analytics</h3>
              <p className="text-xs text-slate-700 mb-3">Tenant-level tracking IDs. No live health check — verify in each provider's dashboard.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Google Analytics ID" value={tenant.google_analytics_id || ''} onChange={v => update('google_analytics_id', v)} placeholder="G-XXXXXXX" />
                <Field label="Google Ads ID" value={tenant.google_ads_id || ''} onChange={v => update('google_ads_id', v)} placeholder="AW-XXXXXXX" />
                <Field label="Google Conversion Label" value={tenant.google_conversion_label || ''} onChange={v => update('google_conversion_label', v)} placeholder="AbCdEfGhIjKlMnOp" />
                <Field label="Facebook Pixel ID" value={tenant.facebook_pixel_id || ''} onChange={v => update('facebook_pixel_id', v)} placeholder="XXXXXXXXXXXXXXXX" />
              </div>
            </div>
          </div>
        </Section>
      )}

      {tab === 'content' && (
        <Section title="Site Content" onSave={() => saveSection(['about_content', 'privacy_content', 'terms_content'])} saving={saving}>
          <div className="md:col-span-2">
            <p className="text-xs text-gray-500 mb-3">Custom content for About, Privacy, and Terms pages. HTML or Markdown supported. Leave blank to use the platform default template.</p>
          </div>
          <TextareaField
            label="About Page"
            value={tenant.about_content || ''}
            onChange={v => update('about_content', v)}
            placeholder="Tell visitors about your brokerage, your team, your specialty areas..."
            rows={8}
          />
          <TextareaField
            label="Privacy Policy"
            value={tenant.privacy_content || ''}
            onChange={v => update('privacy_content', v)}
            placeholder="Your tenant's privacy policy. Required for CASL/PIPEDA compliance."
            rows={8}
          />
          <TextareaField
            label="Terms of Use"
            value={tenant.terms_content || ''}
            onChange={v => update('terms_content', v)}
            placeholder="Terms governing visitor use of your site."
            rows={8}
          />
        </Section>
      )}

      {tab === 'notifications' && (
        <Section title="Notifications" onSave={() => saveSection(['manager_cc', 'admin_bcc', 'send_from'])} saving={saving}>
          <Field label="Manager CC" value={tenant.manager_cc || ''} onChange={v => update('manager_cc', v)} placeholder="manager@brokerage.com" />
          <Field label="Admin BCC" value={tenant.admin_bcc || ''} onChange={v => update('admin_bcc', v)} placeholder="admin@brokerage.com" />
          <Field label="Send-From Address" value={tenant.send_from || ''} onChange={v => update('send_from', v)} placeholder="notifications@yourdomain.com" />
          <p className="text-xs text-gray-500 mt-2">Send-from must be from a verified domain. Defaults to platform notifications address if blank.</p>
        </Section>
      )}

      {tab === 'lifecycle' && (
        <LifecyclePanel
          tenant={tenant}
          canManage={canManageLifecycle}
          saving={saving}
          onAction={lifecycleAction}
        />
      )}
    </div>
  )
}

function Section({ title, children, onSave, saving }: { title: string; children: React.ReactNode; onSave: () => void; saving: boolean }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
      <div className="mt-6 flex justify-end">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>
    </div>
  )
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <div className="md:col-span-2 mt-2 text-xs uppercase tracking-wide text-gray-500 font-semibold">{children}</div>
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type="number" value={value ?? 0} onChange={e => onChange(parseInt(e.target.value, 10) || 0)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
    </div>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-12 h-10 border border-gray-300 rounded cursor-pointer" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm" />
      </div>
    </div>
  )
}

function MaskedField({ label, value, onChange, placeholder, help }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; help?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="md:col-span-2">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="px-3 py-2 border border-gray-300 rounded-md text-gray-500 hover:bg-gray-50"
          title={show ? 'Hide' : 'Show'}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {help && <p className="text-xs text-gray-500 mt-1">{help}</p>}
    </div>
  )
}

function TextareaField({ label, value, onChange, placeholder, rows = 6 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <div className="md:col-span-2">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={rows}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
  )
}

function BooleanField({ label, value, onChange, help }: { label: string; value: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <div className="md:col-span-2">
      <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-50 rounded-md border border-gray-200 hover:bg-gray-100 transition">
        <input
          type="checkbox"
          checked={value}
          onChange={e => onChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex-1">
          <span className="text-sm font-medium text-gray-900">{label}</span>
          {help && <p className="text-xs text-gray-500 mt-0.5">{help}</p>}
        </div>
      </label>
    </div>
  )
}

type HealthState = 'healthy' | 'warning' | 'broken' | 'unknown' | 'unconfigured' | 'checking'
function StatusBadge({ state, message, lastCheckedAt }: { state: HealthState; message: string; lastCheckedAt?: string | null }) {
  const styles: Record<HealthState, { dot: string; text: string; bg: string; border: string }> = {
    healthy:      { dot: 'bg-green-500',  text: 'text-green-800',  bg: 'bg-green-50',  border: 'border-green-200' },
    warning:      { dot: 'bg-amber-500',  text: 'text-amber-800',  bg: 'bg-amber-50',  border: 'border-amber-200' },
    broken:       { dot: 'bg-red-500',    text: 'text-red-800',    bg: 'bg-red-50',    border: 'border-red-200' },
    unknown:      { dot: 'bg-gray-400',   text: 'text-gray-700',   bg: 'bg-gray-50',   border: 'border-gray-200' },
    unconfigured: { dot: 'bg-gray-300',   text: 'text-gray-600',   bg: 'bg-gray-50',   border: 'border-gray-200' },
    checking:     { dot: 'bg-blue-400 animate-pulse', text: 'text-blue-800', bg: 'bg-blue-50', border: 'border-blue-200' },
  }
  const s = styles[state]
  let ago = ''
  if (lastCheckedAt) {
    const diff = Math.max(0, Math.floor((Date.now() - new Date(lastCheckedAt).getTime()) / 1000))
    if (diff < 60) ago = `${diff}s ago`
    else if (diff < 3600) ago = `${Math.floor(diff / 60)}m ago`
    else ago = `${Math.floor(diff / 3600)}h ago`
  }
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-md border ${s.bg} ${s.border}`}>
      <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`}></span>
      <span className={`text-sm font-medium ${s.text}`}>{message}</span>
      {ago && <span className="text-xs text-gray-500 ml-auto">checked {ago}</span>}
    </div>
  )
}

function LifecyclePanel({ tenant, canManage, saving, onAction }: { tenant: Tenant; canManage: boolean; saving: boolean; onAction: (a: 'suspend' | 'reactivate' | 'terminate', reason?: string) => void }) {
  const [reason, setReason] = useState('')
  const [confirmTerminate, setConfirmTerminate] = useState(false)

  const status = tenant.lifecycle_status
  const statusBadge = {
    active:     'bg-green-100 text-green-800 border-green-200',
    suspended:  'bg-amber-100 text-amber-800 border-amber-200',
    terminated: 'bg-red-100 text-red-800 border-red-200',
  }[status]

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Lifecycle</h2>
          <p className="text-sm text-gray-500">Suspend, reactivate, or terminate this tenant.</p>
        </div>
        <span className={`text-sm font-medium px-3 py-1 rounded-full border ${statusBadge}`}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </div>

      {tenant.suspended_reason && status === 'suspended' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded text-sm">
          <strong>Suspended reason:</strong> {tenant.suspended_reason}
          {tenant.suspended_at && <div className="text-xs mt-1">Since {new Date(tenant.suspended_at).toLocaleString()}</div>}
        </div>
      )}

      {status === 'terminated' && tenant.termination_grace_until && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm">
          <strong>Terminated.</strong> Data preserved until {new Date(tenant.termination_grace_until).toLocaleDateString()}.
          {tenant.suspended_reason && <div className="text-xs mt-1">Reason: {tenant.suspended_reason}</div>}
        </div>
      )}

      {!canManage && (
        <div className="bg-gray-50 border border-gray-200 text-gray-700 px-4 py-3 rounded text-sm">
          Lifecycle actions require Tenant Admin or Platform Admin permissions.
        </div>
      )}

      {canManage && status !== 'terminated' && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Reason (required for suspend/terminate)</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Audit reason..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            rows={3}
          />

          <div className="flex flex-wrap gap-3 pt-2">
            {status === 'active' && (
              <button
                onClick={() => onAction('suspend', reason)}
                disabled={saving || !reason.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-md hover:bg-amber-700 disabled:opacity-50"
              >
                <Power className="w-4 h-4" /> Suspend
              </button>
            )}
            {status === 'suspended' && (
              <button
                onClick={() => onAction('reactivate')}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" /> Reactivate
              </button>
            )}
            {!confirmTerminate ? (
              <button
                onClick={() => setConfirmTerminate(true)}
                disabled={saving || !reason.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" /> Terminate...
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-red-50 border border-red-300 px-4 py-2 rounded-md">
                <AlertTriangle className="w-5 h-5 text-red-700" />
                <span className="text-sm text-red-800">Terminate triggers a 90-day grace period before hard deletion. Continue?</span>
                <button
                  onClick={() => onAction('terminate', reason)}
                  disabled={saving}
                  className="px-3 py-1.5 bg-red-700 text-white text-xs font-medium rounded hover:bg-red-800 disabled:opacity-50"
                >
                  Confirm Terminate
                </button>
                <button
                  onClick={() => setConfirmTerminate(false)}
                  className="px-3 py-1.5 border border-gray-300 text-xs rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}