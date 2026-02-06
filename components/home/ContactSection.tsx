'use client'

import { useState } from 'react'
import { Send, Phone, Mail, MessageSquare, Sparkles } from 'lucide-react'
import { getOrCreateLead } from '@/lib/actions/leads'
import { trackActivity } from '@/lib/actions/user-activity'

interface ContactSectionProps {
  agent: {
    id: string
    full_name: string
    email: string
    cell_phone?: string | null
  }
}

export function ContactSection({ agent }: ContactSectionProps) {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', message: '' })
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await getOrCreateLead({
        contactEmail: formData.email,
        contactName: formData.name,
        contactPhone: formData.phone || undefined,
        agentId: agent.id,
        source: 'contact_form',
        forceNew: true
      })
      await trackActivity({
        contactEmail: formData.email,
        activityType: 'contact_form',
        activityData: { name: formData.name, phone: formData.phone, message: formData.message, source: 'homepage' },
        agentId: agent.id
      })
      setSubmitted(true)
    } catch (error) {
      console.error('Error submitting form:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <section id="contact" className="py-16 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 md:p-12">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Message Sent!</h3>
            <p className="text-slate-300">Thank you for reaching out. {agent.full_name} will get back to you shortly.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section id="contact" className="relative py-12 md:py-20 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)`,
        backgroundSize: '50px 50px'
      }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          {/* Left: Info */}
          <div>
            <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-300 px-4 py-2 rounded-full text-sm font-semibold mb-6 border border-blue-400/20">
              <Sparkles className="w-4 h-4" />
              Direct Connection
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Get in Touch
            </h2>
            <p className="text-lg text-slate-300 mb-8">
              Have questions about buying, selling, or renting a condo in Toronto? I&apos;m here to help.
            </p>

            <div className="space-y-4">
              {agent.cell_phone && (
                <a href={`tel:${agent.cell_phone}`}
                  className="flex items-center gap-4 p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 hover:border-green-400/30 transition-all">
                  <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <Phone className="w-6 h-6 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Call or Text</p>
                    <p className="font-semibold text-white">{agent.cell_phone}</p>
                  </div>
                </a>
              )}
              <a href={`mailto:${agent.email}`}
                className="flex items-center gap-4 p-4 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 hover:border-blue-400/30 transition-all">
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <Mail className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Email</p>
                  <p className="font-semibold text-white truncate">{agent.email}</p>
                </div>
              </a>
            </div>
          </div>

          {/* Right: Form */}
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 md:p-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-white">Send a Message</h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Name *</label>
                <input type="text" required value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Your name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email *</label>
                <input type="email" required value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="your@email.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Phone</label>
                <input type="tel" value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="(416) 555-0123" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Message</label>
                <textarea rows={3} value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="How can I help you?" />
              </div>
              <button type="submit" disabled={isSubmitting}
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20">
                {isSubmitting ? 'Sending...' : (<><Send className="w-5 h-5" /> Send Message</>)}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}