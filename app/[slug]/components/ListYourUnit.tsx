'use client'
import { useState } from 'react'
import { getOrCreateLead } from '@/lib/actions/leads'
import { trackActivity } from '@/lib/actions/user-activity'

interface ListYourUnitProps {
  buildingName: string
  buildingId: string
  agentId: string
}

export default function ListYourUnit({ buildingName, buildingId, agentId }: ListYourUnitProps) {
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
    
    // Track market evaluation request
    await trackActivity({
      contactEmail: evaluationForm.email,
      agentId: agentId,
      activityType: 'sale_evaluation_request',
      activityData: {
        buildingId,
        buildingName,
        requestType: 'market_evaluation'
      }
    })

    // Create lead for market evaluation request
    const result = await getOrCreateLead({
      agentId,
      contactName: evaluationForm.name,
      contactEmail: evaluationForm.email,
      contactPhone: evaluationForm.phone,
      source: 'sale_evaluation_request',
      buildingId,
      message: `Requested market evaluation for ${buildingName}`,
      forceNew: true
    }
    })
    
    if (result.success) {
      setEvaluationSuccess(true)
      setEvaluationForm({ name: '', email: '', phone: '' })
      setTimeout(() => setEvaluationSuccess(false), 5000)
    }
    
    setIsEvaluationSubmitting(false)
  }

  const handleVisitSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsVisitSubmitting(true)
    
    // Track building visit request
    await trackActivity({
      contactEmail: visitForm.email,
      agentId: agentId,
      activityType: 'building_visit_request',
      activityData: {
        buildingId,
        buildingName,
        requestedDate: visitForm.date,
        requestedTime: visitForm.time
      }
    })

    // Create lead for visit booking
    const result = await getOrCreateLead({
      agentId,
      contactName: visitForm.name,
      contactEmail: visitForm.email,
      contactPhone: visitForm.phone,
      source: 'building_visit_request',
      buildingId,
      message: `Requested building visit for ${buildingName} on ${visitForm.date} at ${visitForm.time}`,
      forceNew: true,
      propertyDetails: {
        requestedDate: visitForm.date,
        requestedTime: visitForm.time
      }
    })
    
    if (result.success) {
      setVisitSuccess(true)
      setVisitForm({ name: '', email: '', phone: '', date: '', time: '' })
      setTimeout(() => setVisitSuccess(false), 5000)
    }
    
    setIsVisitSubmitting(false)
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

  return (
    <section className="py-20 bg-gradient-to-br from-slate-50 to-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-12">
          {/* Market Evaluation Form */}
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
            <h3 className="text-3xl font-bold text-slate-900 mb-2">
              List Your {buildingName} Condo With Us
            </h3>
            <p className="text-slate-600 mb-8">Get Your Free Market Evaluation</p>
            
            {evaluationSuccess && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800 font-semibold"> Request submitted! We'll contact you soon.</p>
              </div>
            )}
            
            <form onSubmit={handleEvaluationSubmit} className="space-y-6">
              <div>
                <label htmlFor="eval-name" className="block text-sm font-semibold text-slate-700 mb-2">
                  Full Name *
                </label>
                <input
                  id="eval-name"
                  name="name"
                  type="text"
                  required
                  value={evaluationForm.name}
                  onChange={handleEvaluationChange}
                  placeholder="John Doe"
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div>
                <label htmlFor="eval-email" className="block text-sm font-semibold text-slate-700 mb-2">
                  Email *
                </label>
                <input
                  id="eval-email"
                  name="email"
                  type="email"
                  required
                  value={evaluationForm.email}
                  onChange={handleEvaluationChange}
                  placeholder="john@example.com"
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div>
                <label htmlFor="eval-phone" className="block text-sm font-semibold text-slate-700 mb-2">
                  Phone *
                </label>
                <input
                  id="eval-phone"
                  name="phone"
                  type="tel"
                  required
                  value={evaluationForm.phone}
                  onChange={handleEvaluationChange}
                  placeholder="(416) 555-1234"
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>
              
              <button
                type="submit"
                disabled={isEvaluationSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-8 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
              >
                {isEvaluationSubmitting ? 'Submitting...' : 'Get Free Market Evaluation'}
              </button>
            </form>
          </div>

          {/* Visit Booking Form */}
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
            <h3 className="text-3xl font-bold text-slate-900 mb-2">Book a Visit</h3>
            <p className="text-slate-600 mb-8">Schedule a personalized tour</p>
            
            {visitSuccess && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800 font-semibold"> Visit scheduled! We'll confirm shortly.</p>
              </div>
            )}
            
            <form onSubmit={handleVisitSubmit} className="space-y-6">
              <div>
                <label htmlFor="visit-name" className="block text-sm font-semibold text-slate-700 mb-2">
                  Full Name *
                </label>
                <input
                  id="visit-name"
                  name="name"
                  type="text"
                  required
                  value={visitForm.name}
                  onChange={handleVisitChange}
                  placeholder="John Doe"
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div>
                <label htmlFor="visit-email" className="block text-sm font-semibold text-slate-700 mb-2">
                  Email *
                </label>
                <input
                  id="visit-email"
                  name="email"
                  type="email"
                  required
                  value={visitForm.email}
                  onChange={handleVisitChange}
                  placeholder="john@example.com"
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div>
                <label htmlFor="visit-phone" className="block text-sm font-semibold text-slate-700 mb-2">
                  Phone *
                </label>
                <input
                  id="visit-phone"
                  name="phone"
                  type="tel"
                  required
                  value={visitForm.phone}
                  onChange={handleVisitChange}
                  placeholder="(416) 555-1234"
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div>
                <label htmlFor="visit-date" className="block text-sm font-semibold text-slate-700 mb-2">
                  Date *
                </label>
                <input
                  id="visit-date"
                  name="date"
                  type="date"
                  required
                  value={visitForm.date}
                  onChange={handleVisitChange}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div>
                <label htmlFor="visit-time" className="block text-sm font-semibold text-slate-700 mb-2">
                  Time *
                </label>
                <select
                  id="visit-time"
                  name="time"
                  required
                  value={visitForm.time}
                  onChange={handleVisitChange}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                >
                  <option value="">Select time</option>
                  {timeSlots.map(slot => (
                    <option key={slot.value} value={slot.value}>
                      {slot.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <button
                type="submit"
                disabled={isVisitSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-8 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
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



