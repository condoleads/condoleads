// components/estimator/WalliamVipForm.tsx
// Single-step WALLiam VIP form: marketing banner + phone (pre-filled) + questionnaire
// Used in EstimatorBuyerModal when tenantId is present
// System 1 VipPrompt + VipRequestForm are NOT used for WALLiam

'use client'

import { useState } from 'react'
import { Loader2, Send, Star, Phone, Lock } from 'lucide-react'

export interface WalliamVipFormData {
  phone: string
  buyerType: string
  budgetRange: string
  timeline: string
  requirements: string
}

interface WalliamVipFormProps {
  agentName: string
  buildingName?: string
  initialPhone?: string
  onSubmit: (data: WalliamVipFormData) => Promise<void>
  onCancel: () => void
  isLoading: boolean
}

export default function WalliamVipForm({
  agentName,
  buildingName,
  initialPhone = '',
  onSubmit,
  onCancel,
  isLoading,
}: WalliamVipFormProps) {
  const [formData, setFormData] = useState<WalliamVipFormData>({
    phone: initialPhone,
    buyerType: '',
    budgetRange: '',
    timeline: '',
    requirements: '',
  })
  const [errors, setErrors] = useState<Partial<WalliamVipFormData>>({})

  const validate = (): boolean => {
    const newErrors: Partial<WalliamVipFormData> = {}
    if (formData.phone.trim() && formData.phone.trim().length < 10) {
      newErrors.phone = 'Please enter a valid phone number'
    }
    if (!formData.buyerType) {
      newErrors.buyerType = 'Please select your interest'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (validate()) {
      await onSubmit(formData)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Marketing banner */}
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-4">
        <div className="flex items-center gap-2 mb-1">
          <Star className="w-5 h-5 text-white flex-shrink-0" />
          <h3 className="font-semibold text-white text-base">Unlock VIP Estimates</h3>
        </div>
        <p className="text-xs text-white/85 leading-relaxed">
          {agentName} will personally review your request and grant you continued access to comparable market data.
        </p>
      </div>

      {/* Form body */}
      <div className="p-5 space-y-4">
        {buildingName && (
          <div className="bg-blue-50 text-blue-700 text-xs px-3 py-2 rounded-lg">
            Inquiring about: <strong>{buildingName}</strong>
          </div>
        )}

        {/* Phone — pre-filled */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            <Phone className="w-3.5 h-3.5 inline mr-1" />
            Phone Number *
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            placeholder="416-555-1234"
            disabled={isLoading}
            className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${
              errors.phone ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
        </div>

        {/* Buyer Type */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            I am a... *
          </label>
          <select
            value={formData.buyerType}
            onChange={(e) => setFormData(prev => ({ ...prev, buyerType: e.target.value }))}
            disabled={isLoading}
            className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${
              errors.buyerType ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">Select one...</option>
            <option value="buyer">Buyer</option>
            <option value="renter">Renter</option>
            <option value="seller">Seller</option>
            <option value="investor">Investor</option>
          </select>
          {errors.buyerType && <p className="text-xs text-red-500 mt-1">{errors.buyerType}</p>}
        </div>

        {/* Budget Range */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Budget Range
          </label>
          <select
            value={formData.budgetRange}
            onChange={(e) => setFormData(prev => ({ ...prev, budgetRange: e.target.value }))}
            disabled={isLoading}
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          >
            <option value="">Select range...</option>
            <option value="under-500k">Under $500K</option>
            <option value="500k-750k">$500K - $750K</option>
            <option value="750k-1m">$750K - $1M</option>
            <option value="1m-1.5m">$1M - $1.5M</option>
            <option value="1.5m-2m">$1.5M - $2M</option>
            <option value="2m-plus">$2M+</option>
          </select>
        </div>

        {/* Timeline */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Timeline
          </label>
          <select
            value={formData.timeline}
            onChange={(e) => setFormData(prev => ({ ...prev, timeline: e.target.value }))}
            disabled={isLoading}
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          >
            <option value="">Select timeline...</option>
            <option value="immediate">Immediate (0-3 months)</option>
            <option value="soon">Soon (3-6 months)</option>
            <option value="planning">Planning (6-12 months)</option>
            <option value="exploring">Just Exploring</option>
          </select>
        </div>

        {/* Requirements */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Specific Requirements
          </label>
          <textarea
            value={formData.requirements}
            onChange={(e) => setFormData(prev => ({ ...prev, requirements: e.target.value }))}
            disabled={isLoading}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
            rows={2}
            placeholder="e.g., 2 bed, parking, close to subway..."
          />
        </div>

        {/* Privacy note */}
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <Lock className="w-3 h-3" />
          {agentName} will use this to personalize your access and may follow up directly.
        </p>

        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 text-sm text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Request VIP Access
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}