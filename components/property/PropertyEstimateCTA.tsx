'use client'

import { useState } from 'react'
import { MLSListing } from '@/lib/types/building'
import EstimatorBuyerModal from '@/app/estimator/components/EstimatorBuyerModal'
import { extractExactSqft } from '@/lib/estimator/types'

interface PropertyEstimateCTAProps {
  listing: MLSListing
  status: 'Active' | 'Closed'
  isSale: boolean
  buildingName: string
}

export default function PropertyEstimateCTA({ listing, status, isSale, buildingName }: PropertyEstimateCTAProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const isClosed = status === 'Closed'
  const exactSqft = extractExactSqft(listing.square_foot_source)
  
  const config = {
    active_sale: {
      title: 'Get Instant Sale Estimate',
      description: 'See comparable sales and estimated market value',
      buttonText: 'Get Free Estimate',
      buttonColor: 'bg-emerald-600 hover:bg-emerald-700',
      borderColor: 'border-emerald-500',
      bgColor: 'bg-emerald-50'
    },
    closed_sale: {
      title: 'What Would This Sell For Today?',
      description: 'Get current market estimate based on recent sales',
      buttonText: 'Get Current Estimate',
      buttonColor: 'bg-blue-600 hover:bg-blue-700',
      borderColor: 'border-blue-500',
      bgColor: 'bg-blue-50'
    },
    active_lease: {
      title: 'Get Instant Rent Estimate',
      description: 'See comparable leases and estimated market rent',
      buttonText: 'Get Free Estimate',
      buttonColor: 'bg-sky-600 hover:bg-sky-700',
      borderColor: 'border-sky-500',
      bgColor: 'bg-sky-50'
    },
    closed_lease: {
      title: 'What Would This Rent For Today?',
      description: 'Get current rental estimate based on recent leases',
      buttonText: 'Get Current Estimate',
      buttonColor: 'bg-purple-600 hover:bg-purple-700',
      borderColor: 'border-purple-500',
      bgColor: 'bg-purple-50'
    }
  }
  
  const key = isClosed 
    ? (isSale ? 'closed_sale' : 'closed_lease')
    : (isSale ? 'active_sale' : 'active_lease')
  
  const { title, description, buttonText, buttonColor, borderColor, bgColor } = config[key]
  
  return (
    <>
      <div className={`${bgColor} border-2 ${borderColor} rounded-xl p-6 sticky top-4`}>
        <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-600 mb-4">{description}</p>
        <button 
          onClick={() => setModalOpen(true)}
          className={`w-full ${buttonColor} text-white py-3 rounded-lg font-semibold transition-colors`}
        >
          {buttonText}
        </button>
      </div>
      
      <EstimatorBuyerModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        listing={listing}
        buildingName={buildingName}
        buildingId={listing.building_id}
        type={isSale ? 'sale' : 'rent'}
        exactSqft={exactSqft}
      />
    </>
  )
}
