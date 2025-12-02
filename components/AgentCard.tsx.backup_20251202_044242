'use client'

import { useState } from 'react'
import { Mail, Phone, Home, Send } from 'lucide-react'
import Link from 'next/link'
import ContactModal from '@/components/modals/ContactModal'

interface AgentCardProps {
  agent: {
    id: string
    full_name: string
    email: string
    phone?: string | null
    profile_photo_url?: string | null
    subdomain: string
  }
  // Optional context for different pages
  source?: 'home_page' | 'building_page' | 'property_inquiry'
  buildingId?: string
  buildingName?: string
  listingId?: string
  listingAddress?: string
}

export function AgentCard({ 
  agent, 
  source = 'building_page',
  buildingId,
  buildingName,
  listingId,
  listingAddress
}: AgentCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex items-center gap-4 mb-4">
          {agent.profile_photo_url ? (
            <img 
              src={agent.profile_photo_url} 
              alt={agent.full_name}
              className="w-20 h-20 rounded-full border-4 border-white shadow-lg object-cover"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-white/20 border-4 border-white flex items-center justify-center">
              <span className="text-2xl font-bold">
                {agent.full_name.split(' ').map(n => n[0]).join('')}
              </span>
            </div>
          )}
          
          <div>
            <p className="text-sm text-blue-200 mb-1">Your Agent</p>
            <h3 className="text-2xl font-bold">{agent.full_name}</h3>
            <p className="text-blue-200">Condo Specialist</p>
          </div>
        </div>
        
        <div className="space-y-3">
          <a 
            href={`mailto:${agent.email}`}
            className="flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-3 rounded-lg transition-all group"
          >
            <Mail className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="text-sm truncate">{agent.email}</span>
          </a>
          
          {agent.phone && (
            <a 
              href={`tel:${agent.phone}`}
              className="flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-3 rounded-lg transition-all group"
            >
              <Phone className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span className="text-sm">{agent.phone}</span>
            </a>
          )}
          
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full flex items-center justify-center gap-3 bg-white text-blue-900 hover:bg-blue-50 px-4 py-3 rounded-lg transition-all font-semibold group"
          >
            <Send className="w-5 h-5 group-hover:scale-110 transition-transform" />
            Send Message
          </button>

          <Link 
            href="/"
            className="flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white px-4 py-3 rounded-lg transition-all font-semibold group justify-center"
          >
            <Home className="w-5 h-5 group-hover:scale-110 transition-transform" />
            View My Portfolio
          </Link>
        </div>
      </div>

      {/* Contact Modal */}
      <ContactModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        agent={agent}
        source="message_agent"
        buildingId={buildingId}
        buildingName={buildingName}
        listingId={listingId}
        listingAddress={listingAddress}
      />
    </>
  )
}
