'use client'
import { useState } from 'react'
import { MLSListing } from '@/lib/types/building'
import { getOrCreateLead } from '@/lib/actions/leads'
import { trackActivity } from '@/lib/actions/user-activity'

interface AgentContactFormProps {
  listing: MLSListing
  status: 'Active' | 'Closed'
  isSale: boolean
  agent: {
    id: string
    full_name: string
  }
}

export default function AgentContactForm({ listing, status, isSale, agent }: AgentContactFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: ''
  })
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const isClosed = status === 'Closed'
  
  const formTitle = isClosed
    ? (isSale ? 'Own a Similar Unit?' : 'Looking to Lease a Similar Unit?')
    : (isSale ? 'Interested in This Unit?' : 'Interested in Renting?')
  
  const submitLabel = isClosed
    ? (isSale ? 'Get My Unit Valued' : 'Find Similar Rentals')
    : 'Schedule Viewing'
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Build context-aware message
    const unitInfo = `${listing.unit_number || 'Unit'} - ${listing.bedrooms_total}BR/${listing.bathrooms_total_integer}BA`
    const buildingInfo = listing.unparsed_address
    const fullMessage = formData.message 
      ? `${formData.message} (Re: ${unitInfo} at ${buildingInfo})`
      : `Inquiry about ${unitInfo} at ${buildingInfo}`

    // Track property inquiry
    await trackActivity({
      contactEmail: formData.email,
      activityType: 'property_inquiry',
      activityData: {
        listingId: listing.id,
        buildingId: listing.building_id,
        address: listing.unparsed_address,
        unitNumber: listing.unit_number,
        price: listing.list_price,
        bedrooms: listing.bedrooms_total,
        bathrooms: listing.bathrooms_total_integer
      }
    })

    // Create lead with listing context
    const result = await getOrCreateLead({
      agentId: agent.id,
      contactName: formData.name,
      contactEmail: formData.email,
      contactPhone: formData.phone,
      source: 'property_inquiry',
      listingId: listing.id,
      buildingId: listing.building_id,
      message: fullMessage,
      propertyDetails: {
        unitNumber: listing.unit_number,
        bedrooms: listing.bedrooms_total,
        bathrooms: listing.bathrooms_total_integer,
        price: listing.list_price,
        transactionType: listing.transaction_type
      }
    })

    setIsSubmitting(false)

    if (result.success) {
      setSubmitted(true)
      setFormData({ name: '', email: '', phone: '', message: '' })
      setTimeout(() => setSubmitted(false), 5000)
    }
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl border-2 border-blue-200 p-8 shadow-lg">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h3 className="text-2xl font-bold text-gray-900">{formTitle}</h3>
          <p className="text-gray-600">Contact {agent.full_name}</p>
        </div>
      </div>
      
      {submitted ? (
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-green-800 font-bold text-lg mb-2">Message Sent!</p>
          <p className="text-green-700">We'll be in touch within 24 hours.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="John Doe"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Email *</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              placeholder="john@example.com"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
              placeholder="(416) 555-1234"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Message</label>
            <textarea
              rows={4}
              value={formData.message}
              onChange={(e) => setFormData({...formData, message: e.target.value})}
              placeholder="I'm interested in viewing this property..."
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-lg font-bold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
          >
            {isSubmitting ? 'Sending...' : submitLabel}
          </button>
        </form>
      )}
    </div>
  )
}
