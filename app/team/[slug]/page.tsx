import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Building2, Home, Key, Mail, Phone, MessageCircle } from 'lucide-react'

function extractSubdomain(host: string): string | null {
  if (host.includes('localhost') || host.includes('vercel.app')) {
    return process.env.DEV_SUBDOMAIN || null
  }
  const parts = host.split('.')
  if (parts.length >= 3 && parts[1] === 'condoleads') {
    return parts[0]
  }
  return null
}

async function getAgentFromHost(host: string, supabase: any) {
  const cleanHost = host.replace(/^www\./, '')
  
  const { data: customAgent } = await supabase
    .from('agents')
    .select('*')
    .eq('custom_domain', cleanHost)
    .eq('is_active', true)
    .single()
  
  if (customAgent) return customAgent

  const subdomain = extractSubdomain(host)
  if (subdomain) {
    const { data: subAgent } = await supabase
      .from('agents')
      .select('*')
      .eq('subdomain', subdomain)
      .eq('is_active', true)
      .single()
    return subAgent
  }
  
  return null
}

export default async function TeamMemberPage({ params }: { params: { slug: string } }) {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const supabase = createClient()

  // Get site owner (manager)
  const siteOwner = await getAgentFromHost(host, supabase)
  if (!siteOwner || !siteOwner.can_create_children) {
    notFound()
  }

  // Get team member by slug
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('slug', params.slug)
    .eq('parent_id', siteOwner.id)
    .eq('is_active', true)
    .single()

  if (!agent) {
    notFound()
  }

  // Get agent's assigned buildings with listing counts
  const { data: agentBuildings } = await supabase
    .from('agent_buildings')
    .select(`
      is_featured,
      buildings (
        id,
        building_name,
        slug,
        canonical_address,
        street_number,
        street_name
      )
    `)
    .eq('agent_id', agent.id)

  // Get listing counts and photos for each building
  const buildingsWithCounts = await Promise.all(
    (agentBuildings || []).map(async (ab: any) => {
      const building = ab.buildings
      if (!building) return null

      const { data: listings } = await supabase
        .from('mls_listings')
        .select('id, transaction_type, standard_status')
        .eq('building_id', building.id)

      const forSale = listings?.filter(
        (l: any) => l.transaction_type === 'For Sale' && l.standard_status === 'Active'
      ).length || 0
      const forLease = listings?.filter(
        (l: any) => l.transaction_type === 'For Lease' && l.standard_status === 'Active'
      ).length || 0

      const { data: photo } = await supabase
        .from('media')
        .select('media_url')
        .in('listing_id', listings?.map((l: any) => l.id) || [])
        .eq('variant_type', 'large')
        .order('preferred_photo_yn', { ascending: false })
        .limit(1)

      return {
        ...building,
        forSale,
        forLease,
        isFeatured: ab.is_featured,
        photoUrl: photo?.[0]?.media_url || null
      }
    })
  )

  const buildings = buildingsWithCounts.filter(Boolean)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/team" className="inline-flex items-center text-blue-200 hover:text-white mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Team
          </Link>
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Agent Photo */}
            <div className="w-40 h-40 rounded-full overflow-hidden bg-white border-4 border-white shadow-xl flex-shrink-0">
              {agent.profile_photo_url ? (
                <img src={agent.profile_photo_url} alt={agent.full_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-5xl font-bold text-blue-600 bg-blue-100">
                  {agent.full_name.charAt(0)}
                </div>
              )}
            </div>
            {/* Agent Info */}
            <div className="text-center md:text-left">
              <h1 className="text-4xl font-bold mb-2">{agent.full_name}</h1>
              <p className="text-xl text-blue-200 mb-1">{agent.title || 'Real Estate Agent'}</p>
              <p className="text-blue-300">{siteOwner.team_name || siteOwner.full_name} Team</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Contact Card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-6 sticky top-24">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Contact {agent.full_name.split(' ')[0]}</h2>
              
              <div className="space-y-4">
                {agent.cell_phone && (
                  <a href={`tel:${agent.cell_phone}`} className="flex items-center gap-3 text-gray-700 hover:text-blue-600">
                    <Phone className="w-5 h-5" />
                    <span>{agent.cell_phone}</span>
                  </a>
                )}
                {agent.email && (
                  <a href={`mailto:${agent.email}`} className="flex items-center gap-3 text-gray-700 hover:text-blue-600">
                    <Mail className="w-5 h-5" />
                    <span>{agent.email}</span>
                  </a>
                )}
                {agent.whatsapp_number && (
                  <a href={`https://wa.me/${agent.whatsapp_number.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-gray-700 hover:text-green-600">
                    <MessageCircle className="w-5 h-5" />
                    <span>WhatsApp</span>
                  </a>
                )}
              </div>

              {agent.bio && (
                <div className="mt-6 pt-6 border-t">
                  <h3 className="font-semibold text-gray-900 mb-2">About</h3>
                  <p className="text-gray-600 text-sm">{agent.bio}</p>
                </div>
              )}

              <div className="mt-6 pt-6 border-t">
                <p className="text-sm text-gray-500">{agent.brokerage_name}</p>
                <p className="text-xs text-gray-400">{agent.brokerage_address}</p>
              </div>
            </div>
          </div>

          {/* Right: Buildings */}
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {agent.full_name.split(' ')[0]}'s Buildings ({buildings.length})
            </h2>

            {buildings.length === 0 ? (
              <div className="bg-white rounded-xl shadow p-8 text-center">
                <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No buildings assigned yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {buildings.map((building: any) => (
                  <Link
                    key={building.id}
                    href={`/${building.slug}`}
                    className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow overflow-hidden group"
                  >
                    <div className="relative h-40 overflow-hidden">
                      {building.photoUrl ? (
                        <img src={building.photoUrl} alt={building.building_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                          <Building2 className="w-16 h-16 text-white/30" />
                        </div>
                      )}
                      {building.isFeatured && (
                        <span className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 px-2 py-1 rounded-full text-xs font-bold">⭐ Featured</span>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{building.building_name}</h3>
                      <p className="text-sm text-gray-600 mb-3">{building.street_number} {building.street_name}</p>
                      <div className="flex gap-4 text-sm">
                        {building.forSale > 0 && (
                          <span className="flex items-center gap-1 text-green-600">
                            <Home className="w-4 h-4" /> {building.forSale} Sale
                          </span>
                        )}
                        {building.forLease > 0 && (
                          <span className="flex items-center gap-1 text-blue-600">
                            <Key className="w-4 h-4" /> {building.forLease} Lease
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}