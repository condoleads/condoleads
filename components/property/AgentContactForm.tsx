'use client'

import { useState } from 'react'
import { MLSListing } from '@/lib/types/building'

interface AgentContactFormProps {
  listing: MLSListing
  status: 'Active' | 'Closed'
  isSale: boolean
}

export default function AgentContactForm({ listing, status, isSale }: AgentContactFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: ''
  })
  const [submitted, setSubmitted] = useState(false)
  
  const isClosed = status === 'Closed'
  
  const formTitle = isClosed
    ? (isSale ? 'Own a Similar Unit?' : 'Looking to Lease a Similar Unit?')
    : (isSale ? 'Interested in This Unit?' : 'Interested in Renting?')
  
  const submitLabel = isClosed
    ? (isSale ? 'Get My Unit Valued' : 'Find Similar Rentals')
    : 'Schedule Viewing'
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // TODO: Save to leads table
    console.log('Form submitted:', formData)
    
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 3000)
  }
  
  return (
    <div className="bg-white rounded-xl border-2 border-slate-200 p-6">
      <h3 className="text-lg font-bold text-slate-900 mb-4">{formTitle}</h3>
      
      {submitted ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
          <p className="text-emerald-700 font-semibold">Thank you! We'll be in touch soon.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Message</label>
            <textarea
              rows={3}
              value={formData.message}
              onChange={(e) => setFormData({...formData, message: e.target.value})}
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          
          <button
            type="submit"
            className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-lg font-semibold transition-colors"
          >
            {submitLabel}
          </button>
        </form>
      )}
    </div>
  )
}
