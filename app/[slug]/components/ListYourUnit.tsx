'use client'

import { useState } from 'react'

interface ListYourUnitProps {
  buildingName: string
}

export default function ListYourUnit({ buildingName }: ListYourUnitProps) {
  const [evaluationForm, setEvaluationForm] = useState({
    name: '',
    email: '',
    phone: ''
  })
  
  const [visitForm, setVisitForm] = useState({
    name: '',
    email: '',
    phone: '',
    date: '',
    time: ''
  })

  const [isEvaluationSubmitting, setIsEvaluationSubmitting] = useState(false)
  const [isVisitSubmitting, setIsVisitSubmitting] = useState(false)
  const [evaluationSuccess, setEvaluationSuccess] = useState(false)
  const [visitSuccess, setVisitSuccess] = useState(false)

  const handleEvaluationSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsEvaluationSubmitting(true)
    
    // TODO: Connect to your backend API
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    setEvaluationSuccess(true)
    setIsEvaluationSubmitting(false)
    setEvaluationForm({ name: '', email: '', phone: '' })
    
    setTimeout(() => setEvaluationSuccess(false), 5000)
  }

  const handleVisitSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsVisitSubmitting(true)
    
    // TODO: Connect to your backend API
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    setVisitSuccess(true)
    setIsVisitSubmitting(false)
    setVisitForm({ name: '', email: '', phone: '', date: '', time: '' })
    
    setTimeout(() => setVisitSuccess(false), 5000)
  }

  const handleEvaluationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEvaluationForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleVisitChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setVisitForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  // Generate time slots (9 AM - 6 PM, 30-min intervals)
  const timeSlots = []
  for (let hour = 9; hour <= 18; hour++) {
    for (let min = 0; min < 60; min += 30) {
      if (hour === 18 && min > 0) break
      const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`
      const period = hour >= 12 ? 'PM' : 'AM'
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
      timeSlots.push({
        value: time,
        label: `${displayHour}:${min.toString().padStart(2, '0')} ${period}`
      })
    }
  }

  // Get today's date in YYYY-MM-DD format for min attribute
  const today = new Date().toISOString().split('T')[0]

  return (
    <section id="list-your-unit" className="py-16 bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
      <div className="max-w-7xl mx-auto px-6">
        {/* Agent Card - Fixed Overlap */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Agent Photo & Info - 3 columns */}
            <div className="lg:col-span-3 flex items-start gap-3">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                JS
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">John Smith</h3>
                <p className="text-slate-600 text-xs">Sales Representative</p>
              </div>
            </div>
            
            {/* Middle: Contact Info - 3 columns */}
            <div className="lg:col-span-3 space-y-2">
              <div className="flex items-center gap-2 text-slate-700">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span className="text-xs">(416) 555-1234</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-xs break-all">john.smith@condoleads.com</span>
              </div>
            </div>

            {/* Right: Benefits in 2 columns - 6 columns total */}
            <div className="lg:col-span-6 grid md:grid-cols-2 gap-6 lg:border-l lg:border-slate-200 lg:pl-6">
              {/* Why List With Us */}
              <div>
                <h4 className="font-semibold text-slate-900 mb-2 text-xs">Why List With Us?</h4>
                <ul className="space-y-1 text-xs text-slate-600">
                  <li className="flex items-start gap-1.5">
                    <svg className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Free professional photography & virtual tours</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <svg className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Maximum exposure across all major platforms</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <svg className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Expert negotiation & market analysis</span>
                  </li>
                </ul>
              </div>

              {/* Why Buy With Us */}
              <div>
                <h4 className="font-semibold text-slate-900 mb-2 text-xs">Why Buy With Us?</h4>
                <ul className="space-y-1 text-xs text-slate-600">
                  <li className="flex items-start gap-1.5">
                    <svg className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Access to exclusive pre-market listings</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <svg className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Personalized property recommendations</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <svg className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Guided tours & building insights</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Two Forms Side by Side - Equal Prominence */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Left: Market Evaluation Form */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              List Your {buildingName} Condo With Us
            </h2>
            <h3 className="text-base font-medium text-slate-600 mb-6">Get Your Free Market Evaluation</h3>
            
            {evaluationSuccess && (
              <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm">
                Thank you! We'll contact you within 24 hours.
              </div>
            )}

            <form onSubmit={handleEvaluationSubmit} className="space-y-4">
              <div>
                <label htmlFor="eval-name" className="block text-sm font-medium text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  id="eval-name"
                  name="name"
                  required
                  value={evaluationForm.name}
                  onChange={handleEvaluationChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label htmlFor="eval-email" className="block text-sm font-medium text-slate-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  id="eval-email"
                  name="email"
                  required
                  value={evaluationForm.email}
                  onChange={handleEvaluationChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label htmlFor="eval-phone" className="block text-sm font-medium text-slate-700 mb-1">
                  Phone *
                </label>
                <input
                  type="tel"
                  id="eval-phone"
                  name="phone"
                  required
                  value={evaluationForm.phone}
                  onChange={handleEvaluationChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                  placeholder="(416) 555-1234"
                />
              </div>

              {/* Match the height of Date/Time row on right */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="invisible">
                  <label className="block text-sm font-medium mb-1">Spacer</label>
                  <input className="w-full px-4 py-3 border rounded-lg" disabled />
                </div>
                <div className="invisible">
                  <label className="block text-sm font-medium mb-1">Spacer</label>
                  <input className="w-full px-4 py-3 border rounded-lg" disabled />
                </div>
              </div><button
                type="submit"
                disabled={isEvaluationSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEvaluationSubmitting ? 'Submitting...' : 'Get Free Market Evaluation'}
              </button>

              <p className="text-xs text-slate-500 text-center mt-4">
                By submitting, you agree to our privacy policy and terms of service.
              </p>
            </form>
          </div>

          {/* Right: Book a Visit Form - Equal Prominence */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Book a Visit</h2>
            <p className="text-base font-medium text-slate-600 mb-6">Schedule a personalized tour</p>
            
            {visitSuccess && (
              <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm">
                Visit scheduled! We'll contact you to confirm.
              </div>
            )}

            <form onSubmit={handleVisitSubmit} className="space-y-4">
              <div>
                <label htmlFor="visit-name" className="block text-sm font-medium text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  id="visit-name"
                  name="name"
                  required
                  value={visitForm.name}
                  onChange={handleVisitChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label htmlFor="visit-email" className="block text-sm font-medium text-slate-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  id="visit-email"
                  name="email"
                  required
                  value={visitForm.email}
                  onChange={handleVisitChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label htmlFor="visit-phone" className="block text-sm font-medium text-slate-700 mb-1">
                  Phone *
                </label>
                <input
                  type="tel"
                  id="visit-phone"
                  name="phone"
                  required
                  value={visitForm.phone}
                  onChange={handleVisitChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                  placeholder="(416) 555-1234"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="visit-date" className="block text-sm font-medium text-slate-700 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    id="visit-date"
                    name="date"
                    required
                    min={today}
                    value={visitForm.date}
                    onChange={handleVisitChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="visit-time" className="block text-sm font-medium text-slate-700 mb-1">
                    Time *
                  </label>
                  <select
                    id="visit-time"
                    name="time"
                    required
                    value={visitForm.time}
                    onChange={handleVisitChange}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                  >
                    <option value="">Select time</option>
                    {timeSlots.map(slot => (
                      <option key={slot.value} value={slot.value}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isVisitSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isVisitSubmitting ? 'Scheduling...' : 'Schedule Visit'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}




