'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Review {
  id: string
  user_name: string
  rating: number
  comment: string
  created_at: string
  verified_resident: boolean
}

interface ReviewsProps {
  buildingId: string
  buildingName: string
}

export default function BuildingReviews({ buildingId, buildingName }: ReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  
  const [formData, setFormData] = useState({
    user_name: '',
    rating: 5,
    comment: ''
  })

  useEffect(() => {
    fetchReviews()
  }, [buildingId])

  const fetchReviews = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('building_reviews')
        .select('*')
        .eq('building_id', buildingId)
        .order('created_at', { ascending: false })

      if (!error && data) {
        setReviews(data)
      }
    } catch (err) {
      console.error('Error fetching reviews:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('building_reviews')
        .insert({
          building_id: buildingId,
          user_name: formData.user_name,
          rating: formData.rating,
          comment: formData.comment
        })

      if (!error) {
        setFormData({ user_name: '', rating: 5, comment: '' })
        setShowForm(false)
        await fetchReviews()
      } else {
        console.error('Error submitting review:', error)
        alert('Failed to submit review. Please try again.')
      }
    } catch (err) {
      console.error('Error:', err)
      alert('Failed to submit review. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const averageRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : '0'

  return (
    <section className="py-16 bg-slate-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-4xl font-bold text-slate-900">Building Reviews</h2>
            {reviews.length > 0 && (
              <div className="flex items-center mt-2">
                <span className="text-2xl font-bold text-emerald-600 mr-2">{averageRating}</span>
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className={i < Math.round(Number(averageRating)) ? 'text-yellow-400 text-xl' : 'text-gray-300 text-xl'}>
                      
                    </span>
                  ))}
                </div>
                <span className="text-slate-600 ml-2">({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})</span>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors"
          >
            {showForm ? 'Cancel' : 'Write a Review'}
          </button>
        </div>

        {/* Review Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h3 className="text-xl font-bold mb-4">Share Your Experience</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Your Name *</label>
              <input
                type="text"
                required
                value={formData.user_name}
                onChange={(e) => setFormData({...formData, user_name: e.target.value})}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="John Smith"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">Rating *</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFormData({...formData, rating: star})}
                    className={`text-4xl transition-colors ${star <= formData.rating ? 'text-yellow-400' : 'text-gray-300'} hover:scale-110`}
                  >
                    
                  </button>
                ))}
              </div>
              <p className="text-sm text-slate-500 mt-1">{formData.rating} star{formData.rating !== 1 ? 's' : ''}</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Your Review *</label>
              <textarea
                required
                value={formData.comment}
                onChange={(e) => setFormData({...formData, comment: e.target.value})}
                rows={4}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="Share your experience living at or visiting this building..."
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </form>
        )}

        {/* Reviews List */}
        <div className="space-y-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
              <p className="mt-4 text-slate-600">Loading reviews...</p>
            </div>
          ) : reviews.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center">
              <p className="text-slate-500 text-lg">No reviews yet. Be the first to review {buildingName}!</p>
            </div>
          ) : (
            reviews.map(review => (
              <div key={review.id} className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="font-bold text-lg">{review.user_name}</h4>
                    {review.verified_resident && (
                      <span className="text-sm text-emerald-600"> Verified Resident</span>
                    )}
                  </div>
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className={i < review.rating ? 'text-yellow-400 text-xl' : 'text-gray-300 text-xl'}>
                        
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-slate-700">{review.comment}</p>
                <p className="text-sm text-slate-500 mt-4">
                  {new Date(review.created_at).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}