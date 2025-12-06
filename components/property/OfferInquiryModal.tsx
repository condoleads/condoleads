'use client'

import { useState } from 'react'
import { getOrCreateLead } from '@/lib/actions/leads'
import { trackActivity } from '@/lib/actions/user-activity'

interface OfferInquiryModalProps {
  isOpen: boolean
  onClose: () => void
  listing: {
    id: string
    unit_number?: string
    unparsed_address?: string
    building_id: string
    list_price: number
  }
  buildingName: string
  isSale: boolean
  agent: {
    id: string
    full_name: string
  }
}

export default function OfferInquiryModal({
  isOpen,
  onClose,
  listing,
  buildingName,
  isSale,
  agent
}: OfferInquiryModalProps) {
  const defaultMessage = isSale
    ? `I'm interested in making an offer on Unit ${listing.unit_number || ''} at ${buildingName}. Please contact me to discuss.`
    : `I'm interested in applying for the lease on Unit ${listing.unit_number || ''} at ${buildingName}. Please contact me to discuss.`

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: defaultMessage
  })
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Create or get lead
      const lead = await getOrCreateLead({
        contactName: formData.name,
        contactEmail: formData.email,
        contactPhone: formData.phone,
        source: isSale ? 'sale_offer_inquiry' : 'lease_offer_inquiry',
        agentId: agent.id,
        buildingId: listing.building_id,
        listingId: listing.id,
        message: formData.message,
        forceNew: true
      })

      if (lead) {
        // Track activity
        await trackActivity({
          contactEmail: formData.email,
          agentId: agent.id,
          activityType: isSale ? 'sale_offer_inquiry' : 'lease_offer_inquiry',
          activityData: {
            buildingId: listing.building_id,
            buildingName: buildingName,
            listingId: listing.id,
            listingAddress: listing.unparsed_address || '',
            unitNumber: listing.unit_number || '',
            message: formData.message,
            listPrice: listing.list_price
          }
        })
      }

      setSubmitted(true)
    } catch (error) {
      console.error('Error submitting offer inquiry:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setSubmitted(false)
    setFormData({
      name: '',
      email: '',
      phone: '',
      message: defaultMessage
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {submitted ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Inquiry Sent!</h3>
            <p className="text-slate-600 mb-6">
              {agent.full_name} will contact you shortly to discuss Unit {listing.unit_number}.
            </p>
            <button
              onClick={handleClose}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-slate-900 mb-1">
              {isSale ? 'Make an Offer' : 'Apply for Lease'}
            </h2>
            <p className="text-slate-600 mb-6">
              Unit {listing.unit_number} at {buildingName}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="(416) 555-1234"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
                <textarea
                  rows={3}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                  isSale
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isSubmitting ? 'Sending...' : (isSale ? 'Submit Offer Inquiry' : 'Submit Lease Application')}
              </button>
            </form>

            <p className="text-xs text-slate-500 mt-4 text-center">
              By submitting, you agree to be contacted by {agent.full_name} regarding this property.
            </p>
          </>
        )}
      </div>
    </div>
  )
}