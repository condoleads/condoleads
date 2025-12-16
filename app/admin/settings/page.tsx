'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({
    parking_value_sale: 50000,
    parking_value_lease: 200,
    locker_value_sale: 10000,
    locker_value_lease: 50
  })

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (data.success && data.settings?.setting_value) {
        setSettings(data.settings.setting_value)
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      const data = await res.json()
      if (data.success) {
        alert('Settings saved successfully!')
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="animate-pulse">Loading settings...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin" className="text-blue-600 hover:underline mb-4 inline-block">
             Back to Admin
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Estimator Settings</h1>
          <p className="text-gray-600 mt-2">
            Set universal default values for the price estimator. These apply to all buildings unless overridden per-building.
          </p>
        </div>

        {/* Settings Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {/* Priority Explanation */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-2">How Values Are Applied</h3>
            <ol className="text-sm text-blue-800 space-y-1">
              <li>1. <strong>Building-Specific</strong>  Used if set for that building</li>
              <li>2. <strong>Universal Default</strong>  These values (if building has none)</li>
              <li>3. <strong>System Hardcoded</strong>  Fallback if nothing is set</li>
            </ol>
          </div>

          {/* Sale Estimates */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
              Sale Estimates
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Parking Value (per space)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={settings.parking_value_sale}
                    onChange={(e) => setSettings({...settings, parking_value_sale: parseInt(e.target.value) || 0})}
                    className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">System default: $50,000</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Locker Value
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={settings.locker_value_sale}
                    onChange={(e) => setSettings({...settings, locker_value_sale: parseInt(e.target.value) || 0})}
                    className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">System default: $10,000</p>
              </div>
            </div>
          </div>

          {/* Lease Estimates */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
              Lease Estimates (Monthly)
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Parking Value (per space/month)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={settings.parking_value_lease}
                    onChange={(e) => setSettings({...settings, parking_value_lease: parseInt(e.target.value) || 0})}
                    className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">System default: $200/mo</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Locker Value (per month)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={settings.locker_value_lease}
                    onChange={(e) => setSettings({...settings, locker_value_lease: parseInt(e.target.value) || 0})}
                    className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">System default: $50/mo</p>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Defaults'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}