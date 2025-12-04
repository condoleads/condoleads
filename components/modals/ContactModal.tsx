'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, Loader2 } from 'lucide-react'
import { getOrCreateLead } from '@/lib/actions/leads'
import { trackActivity } from '@/lib/actions/user-activity'

interface ContactModalProps {
  isOpen: boolean
  onClose: () => void
  agent: {
    id: string
    full_name: string
    email: string
    phone?: string | null
    profile_photo_url?: string | null
  }
  source: 'home_page' | 'building_page' | 'property_inquiry' | 'message_agent' | 'sale_offer' | 'building_visit'
buildingId?: string
  buildingName?: string
  buildingAddress?: string
  unitNumber?: string
  listingId?: string
  listingAddress?: string
}

export default function ContactModal({
  isOpen,
  onClose,
  agent,
  source,
  buildingId,
  buildingName,
  buildingAddress,
  unitNumber,
  listingId,
  listingAddress
}: ContactModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!isOpen || !mounted) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Build context-aware message
    let contextMessage = formData.message
    if (listingAddress) {
      contextMessage = `Inquiry about ${listingAddress}: ${formData.message}`
    } else if (buildingName) {
      contextMessage = `Inquiry about ${buildingName}: ${formData.message}`
    }

    // Track contact form submission
    await trackActivity({
        contactEmail: formData.email,
        activityType: 'contact_form',
        activityData: {
          buildingId,
          buildingName: buildingName || 'Unknown',
          buildingAddress,
          unitNumber,
          listingId,
          listingAddress,
          source,
          userMessage: formData.message
        }
      })

    // ALWAYS create new lead for form submissions (forceNew: true)
    const result = await getOrCreateLead({
      agentId: agent.id,
      contactName: formData.name,
      contactEmail: formData.email,
      contactPhone: formData.phone,
      source,
      buildingId,
      listingId,
      message: contextMessage,
      forceNew: true,  // CRITICAL: Always create new lead for form submissions
      propertyDetails: {
        buildingName,
        buildingAddress,
        unitNumber,
        userMessage: formData.message
      }
    })

    setIsSubmitting(false)

    if (result.success) {
      setSuccess(true)
      setTimeout(() => {
        onClose()
        setSuccess(false)
        setFormData({ name: '', email: '', phone: '', message: '' })
      }, 2000)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999]"
        onClick={onClose}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
          style={{ pointerEvents: 'auto' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-4">
              {agent.profile_photo_url ? (
                <img
                  src={agent.profile_photo_url}
                  alt={agent.full_name}
                  className="w-16 h-16 rounded-full object-cover border-2 border-blue-500"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold">
                  {agent.full_name.split(' ').map(n => n[0]).join('')}
                </div>
              )}
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Contact {agent.full_name}</h3>
                <p className="text-gray-600">I'll respond within 24 hours</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {success ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-2">Message Sent!</h4>
                <p className="text-gray-600">I'll get back to you soon.</p>
              </div>
            ) : (
              <>
                {/* Context Info */}
                {(listingAddress || buildingName) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm font-semibold text-blue-900">
                      Regarding: {listingAddress || buildingName}
                    </p>
                  </div>
                )}

                <div>
                  <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">
                    Your Name *
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="John Doe"
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="john@example.com"
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-2">
                    Phone
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="(416) 555-1234"
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-semibold text-gray-700 mb-2">
                    Message *
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={4}
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="I'm interested in this property..."
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Send Message
                    </>
                  )}
                </button>
              </>
            )}
          </form>
        </div>
      </div>
    </>
  )

  return createPortal(modalContent, document.body)
}
