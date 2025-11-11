'use client'

import { useState } from 'react'
import { Mail, Building2, MapPin, TrendingUp, DollarSign, CheckCircle, Plus, Trash2 } from 'lucide-react'

export default function CommunityApplication() {
  const [buildings, setBuildings] = useState([
    { id: 1, name: '', address: '' },
    { id: 2, name: '', address: '' }
  ])
  
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    brokerage: '',
    marketArea: '',
    manualMarketArea: '',
    condoExperience: '',
    digitalMarketing: '',
    budget: '',
    timeline: '',
    additionalInfo: ''
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const torontoMarkets = [
    'Select Market Area',
    'Toronto - Downtown Core',
    'Toronto - North York',
    'Toronto - Etobicoke',
    'Toronto - Scarborough',
    'Toronto - East York',
    'Mississauga',
    'Markham',
    'Vaughan',
    'Richmond Hill',
    'Brampton',
    'Oakville',
    'Burlington',
    'Ajax',
    'Pickering',
    'Whitby',
    'Oshawa',
    'Other (specify below)'
  ]

  const addBuilding = () => {
    const newId = buildings.length > 0 ? Math.max(...buildings.map(b => b.id)) + 1 : 1
    setBuildings([...buildings, { id: newId, name: '', address: '' }])
  }

  const removeBuilding = (id: number) => {
    if (buildings.length > 2) {
      setBuildings(buildings.filter(b => b.id !== id))
    }
  }

  const updateBuilding = (id: number, field: 'name' | 'address', value: string) => {
    setBuildings(buildings.map(b => 
      b.id === id ? { ...b, [field]: value } : b
    ))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // TODO: Replace with actual API call
    const applicationData = {
      ...formData,
      buildings: buildings.filter(b => b.name || b.address)
    }
    
    console.log('Application submitted:', applicationData)

    setTimeout(() => {
      setIsSubmitting(false)
      setIsSubmitted(true)
    }, 2000)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  if (isSubmitted) {
    return (
      <section className="py-20 bg-gradient-to-br from-green-50 to-blue-50">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="bg-white rounded-2xl shadow-2xl p-12 border-2 border-green-200">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Application Received!
            </h2>
            <p className="text-xl text-gray-600 mb-6">
              Thank you for your interest in joining the CondoLeads community.
            </p>
            <p className="text-lg text-gray-600 mb-8">
              We'll review your application and reach out within 24-48 hours to discuss next steps.
            </p>
            <div className="bg-blue-50 rounded-xl p-6 border-2 border-blue-200">
              <p className="text-gray-700 font-semibold mb-2">Questions in the meantime?</p>
              <a href="mailto:hello@condoleads.ca" className="text-blue-600 hover:text-blue-700 font-bold text-lg">
                hello@condoleads.ca
              </a>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="py-20 bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="max-w-4xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-block px-4 py-2 bg-purple-100 text-purple-700 rounded-full font-bold mb-4">
             We're Selective
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Join the CondoLeads Community
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            We partner with serious Toronto condo specialists. Let's see if we're a fit.
          </p>
        </div>

        {/* Application Form */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-12 border-2 border-purple-100">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Personal Info */}
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Mail className="w-6 h-6 text-purple-600" />
                Your Information
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Brokerage *
                  </label>
                  <input
                    type="text"
                    name="brokerage"
                    value={formData.brokerage}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Market Area */}
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <MapPin className="w-6 h-6 text-purple-600" />
                Target Market
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Primary Market Area *
                  </label>
                  <select
                    name="marketArea"
                    value={formData.marketArea}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                  >
                    {torontoMarkets.map((market) => (
                      <option key={market} value={market} disabled={market === 'Select Market Area'}>
                        {market}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* Manual Market Area */}
                {(formData.marketArea === 'Other (specify below)' || formData.marketArea !== 'Select Market Area') && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      {formData.marketArea === 'Other (specify below)' 
                        ? 'Specify Your Market Area *' 
                        : 'Additional Market Areas (Optional)'}
                    </label>
                    <input
                      type="text"
                      name="manualMarketArea"
                      value={formData.manualMarketArea}
                      onChange={handleChange}
                      required={formData.marketArea === 'Other (specify below)'}
                      placeholder="e.g. King West, Liberty Village, Yonge & Eglinton"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Target Buildings - Dynamic */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Building2 className="w-6 h-6 text-purple-600" />
                  Target Buildings
                </h3>
                <button
                  type="button"
                  onClick={addBuilding}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 font-semibold rounded-lg transition-all"
                >
                  <Plus className="w-5 h-5" />
                  Add Building
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-6">
                Add the condo buildings you'd like to focus on (minimum 2 required)
              </p>
              
              <div className="space-y-4">
                {buildings.map((building, index) => (
                  <div key={building.id} className="border-2 border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-semibold text-gray-700">
                        Building {index + 1} {index < 2 && '*'}
                      </p>
                      {buildings.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeBuilding(building.id)}
                          className="text-red-600 hover:text-red-700 p-1"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-2">
                          Building Name {index < 2 && '*'}
                        </label>
                        <input
                          type="text"
                          value={building.name}
                          onChange={(e) => updateBuilding(building.id, 'name', e.target.value)}
                          required={index < 2}
                          placeholder="e.g. X2 Condos"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-2">
                          Address {index < 2 && '*'}
                        </label>
                        <input
                          type="text"
                          value={building.address}
                          onChange={(e) => updateBuilding(building.id, 'address', e.target.value)}
                          required={index < 2}
                          placeholder="e.g. 110 Charles St E, Toronto"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Experience & Background */}
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-purple-600" />
                Your Experience
              </h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Condo Market Experience *
                  </label>
                  <textarea
                    name="condoExperience"
                    value={formData.condoExperience}
                    onChange={handleChange}
                    required
                    rows={4}
                    placeholder="How long have you been selling condos? What's your specialty? Any notable achievements?"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Digital Marketing Background *
                  </label>
                  <textarea
                    name="digitalMarketing"
                    value={formData.digitalMarketing}
                    onChange={handleChange}
                    required
                    rows={4}
                    placeholder="What's your experience with digital marketing? Social media? Paid ads? Website/SEO?"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Budget & Timeline */}
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <DollarSign className="w-6 h-6 text-purple-600" />
                Investment & Timeline
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Monthly Budget *
                  </label>
                  <select
                    name="budget"
                    value={formData.budget}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                  >
                    <option value="">Select Budget Range</option>
                    <option value="$200-$500">$200-$500</option>
                    <option value="$500-$1000">$500-$1000</option>
                    <option value="$1000-$2000">$1000-$2000</option>
                    <option value="$2000+">$2000+</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    When to Start? *
                  </label>
                  <select
                    name="timeline"
                    value={formData.timeline}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                  >
                    <option value="">Select Timeline</option>
                    <option value="Immediately">Immediately</option>
                    <option value="Within 2 weeks">Within 2 weeks</option>
                    <option value="Within 1 month">Within 1 month</option>
                    <option value="Just exploring">Just exploring</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Additional Info */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Anything else we should know?
              </label>
              <textarea
                name="additionalInfo"
                value={formData.additionalInfo}
                onChange={handleChange}
                rows={4}
                placeholder="Questions? Special requirements? Tell us more..."
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full px-8 py-5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white text-xl font-bold rounded-lg transition-all transform hover:scale-105 shadow-lg disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-3">
                  <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Submitting Application...
                </span>
              ) : (
                'Submit Application'
              )}
            </button>

            <p className="text-center text-sm text-gray-500">
              Questions? Email us at{' '}
              <a href="mailto:hello@condoleads.ca" className="text-purple-600 hover:text-purple-700 font-semibold">
                hello@condoleads.ca
              </a>
            </p>
          </form>
        </div>
      </div>
    </section>
  )
}
