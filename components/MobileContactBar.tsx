'use client'

import { useState } from 'react'
import { Phone, MessageCircle } from 'lucide-react'
import ContactModal from '@/components/modals/ContactModal'

interface MobileContactBarProps {
  agent: {
    id: string
    full_name: string
    email: string
    cell_phone?: string | null
    profile_photo_url?: string | null
  }
  buildingId?: string
  buildingName?: string
  buildingAddress?: string
}

export default function MobileContactBar({ agent, buildingId, buildingName, buildingAddress }: MobileContactBarProps) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      {/* Sticky bottom bar - mobile only */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg p-3 md:hidden z-50">
        <div className="flex gap-2 max-w-lg mx-auto">
          {agent.cell_phone && (
            <a 
              href={`tel:${agent.cell_phone}`} 
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg text-center font-semibold flex items-center justify-center gap-2"
            >
              <Phone className="w-5 h-5" />
              Call
            </a>
          )}
          <button 
            onClick={() => setShowModal(true)} 
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-5 h-5" />
            Message
          </button>
        </div>
      </div>

      {/* Add padding to body content so it's not hidden behind the bar */}
      <div className="h-20 md:hidden" />

      <ContactModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        agent={agent}
        source="message_agent"
        buildingId={buildingId}
        buildingName={buildingName}
        buildingAddress={buildingAddress}
      />
    </>
  )
}