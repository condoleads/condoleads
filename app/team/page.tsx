import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Building2, Mail, Phone } from 'lucide-react'

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
  
  // Check custom domain first
  const { data: customAgent } = await supabase
    .from('agents')
    .select('*')
    .eq('custom_domain', cleanHost)
    .eq('is_active', true)
    .single()
  
  if (customAgent) return customAgent

  // Check subdomain
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

export default async function TeamPage() {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const supabase = createClient()

  const siteOwner = await getAgentFromHost(host, supabase)
  if (!siteOwner || !siteOwner.can_create_children) {
    notFound()
  }

  // Get team members
  const { data: teamMembers } = await supabase
    .from('agents')
    .select('id, full_name, slug, email, cell_phone, profile_photo_url, bio, title')
    .eq('parent_id', siteOwner.id)
    .eq('is_active', true)
    .order('full_name')

  // Get building counts for each team member
  const membersWithBuildings = await Promise.all(
    (teamMembers || []).map(async (member) => {
      const { count } = await supabase
        .from('agent_buildings')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', member.id)
      return { ...member, buildingCount: count || 0 }
    })
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex items-center text-blue-200 hover:text-white mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
          <h1 className="text-4xl font-bold mb-4">{siteOwner.team_name || `${siteOwner.full_name}'s Team`}</h1>
          <p className="text-xl text-blue-200">{siteOwner.team_tagline || 'Meet our expert real estate professionals'}</p>
        </div>
      </div>

      {/* Team Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {membersWithBuildings.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg">No team members yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {membersWithBuildings.map((member) => (
              <Link
                key={member.id}
                href={`/team/${member.slug}`}
                className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow p-6 group"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-32 h-32 rounded-full overflow-hidden bg-blue-100 mb-4">
                    {member.profile_photo_url ? (
                      <img src={member.profile_photo_url} alt={member.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-blue-600">
                        {member.full_name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                    {member.full_name}
                  </h3>
                  <p className="text-gray-500 mb-3">{member.title || 'Real Estate Agent'}</p>
                  
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    <Building2 className="w-4 h-4" />
                    <span>{member.buildingCount} buildings</span>
                  </div>

                  {member.bio && (
                    <p className="text-sm text-gray-600 line-clamp-2 mt-2">{member.bio}</p>
                  )}

                  <div className="mt-4 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg font-medium group-hover:bg-blue-100 transition-colors">
                    View Profile
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}