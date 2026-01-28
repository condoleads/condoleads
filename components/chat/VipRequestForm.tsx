// components/chat/VipRequestForm.tsx
'use client'

import { useState } from 'react'
import { Loader2, Send, Star } from 'lucide-react'

interface VipRequestFormProps {
  agentName: string
  buildingName?: string
  onSubmit: (data: VipRequestData) => Promise<void>
  onCancel: () => void
  isLoading: boolean
  variant?: 'chat' | 'inline' // NEW: inline for estimator
}

export interface VipRequestData {
  phone: string
  fullName: string
  email: string
  budgetRange: string
  timeline: string
  buyerType: string
  requirements: string
}

export default function VipRequestForm({ 
  agentName, 
  buildingName,
  onSubmit, 
  onCancel,
  isLoading,
  variant = 'chat'
}: VipRequestFormProps) {
  const [formData, setFormData] = useState<VipRequestData>({
    phone: '',
    fullName: '',
    email: '',
    budgetRange: '',
    timeline: '',
    buyerType: '',
    requirements: ''
  })
  const [errors, setErrors] = useState<Partial<VipRequestData>>({})

  const validate = (): boolean => {
    const newErrors: Partial<VipRequestData> = {}

    if (!formData.buyerType) {
      newErrors.buyerType = 'Please select your interest'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      await onSubmit(formData)
    }
  }

  // Inline variant for estimator - centered card
  if (variant === 'inline') {
    return (
      <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-white" />
            <h3 className="font-semibold text-white">Request VIP Access</h3>
          </div>
          <p className="text-xs text-white/80 mt-1">
            Get personalized assistance from {agentName}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {buildingName && (
            <div className="bg-blue-50 text-blue-700 text-xs px-3 py-2 rounded-lg">
              Inquiring about: {buildingName}
            </div>
          )}

          {/* Buyer Type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              I am a... *
            </label>
            <select
              value={formData.buyerType}
              onChange={(e) => setFormData(prev => ({ ...prev, buyerType: e.target.value }))}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${  
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
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
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
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
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
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
              rows={2}
              placeholder="e.g., 2 bed, parking, close to subway..."
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2 text-sm text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit Request
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    )
  }

  // Default chat variant - absolute positioning
  return (
    <div className="absolute inset-0 bg-white z-10 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-white" />
          <h3 className="font-semibold text-white">Request VIP Access</h3>
        </div>
        <p className="text-xs text-white/80 mt-1">
          Get personalized assistance from {agentName}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-3">
        {buildingName && (
          <div className="bg-blue-50 text-blue-700 text-xs px-3 py-2 rounded-lg">
            Inquiring about: {buildingName}
          </div>
        )}

        {/* Buyer Type */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            I am a... *
          </label>
          <select
            value={formData.buyerType}
            onChange={(e) => setFormData(prev => ({ ...prev, buyerType: e.target.value }))}
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${  
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
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
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
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
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
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
            rows={2}
            placeholder="e.g., 2 bed, parking, close to subway..."
          />
        </div>
      </form>

      {/* Footer Buttons */}
      <div className="p-4 border-t bg-gray-50 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={isLoading}
          className="flex-1 px-4 py-2 text-sm text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Submit Request
            </>
          )}
        </button>
      </div>
    </div>
  )
}