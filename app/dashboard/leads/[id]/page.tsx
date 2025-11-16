import { redirect } from 'next/navigation'
import { requireAgent } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { getLeadNotes, getAgentBuildings } from '@/lib/actions/lead-management'
import LeadDetailClient from '@/components/dashboard/LeadDetailClient'
import ActivityTimeline from '@/components/dashboard/ActivityTimeline'
import { getUserActivities, calculateEngagementScore } from '@/lib/actions/user-activity'

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const { error, agent } = await requireAgent()

  if (error || !agent) {
    redirect('/login')
  }

  // Fetch lead details with building info
  const supabase = createClient()
  // Build query based on admin status
  let leadQuery = supabase
    .from('leads')
    .select(`
      *,
      buildings (
        id,
        building_name,
        canonical_address
      ),
      agents!leads_agent_id_fkey (
        id,
        full_name,
        email,
        subdomain
      )
    `)
    .eq('id', params.id)

  // If not admin, only show their own leads
  if (!agent.is_admin) {
    leadQuery = leadQuery.eq('agent_id', agent.id)
  }

  const { data: lead, error: leadError } = await leadQuery.single()

  if (leadError || !lead) {
    redirect('/dashboard/leads')
  }

  // Fetch notes
  const notesResult = await getLeadNotes(params.id)
  const notes = notesResult.success ? notesResult.notes : []

  // Fetch user activities
  const activitiesResult = await getUserActivities(lead.contact_email)
  const activities = activitiesResult.success ? activitiesResult.activities : []

  // Calculate engagement score
  const engagement = await calculateEngagementScore(lead.contact_email)

  // Fetch available buildings for dropdown
  const buildingsResult = await getAgentBuildings(agent.id)
  const buildings = buildingsResult.success ? buildingsResult.buildings : []

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="fixed top-0 left-0 z-40 h-full w-64 bg-white border-r border-gray-200 hidden lg:block">
        <div className="flex flex-col h-full">
          <div className="h-16 px-6 border-b border-gray-200 flex items-center">
            <h1 className="text-xl font-bold text-blue-600">CondoLeads</h1>
          </div>

          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                {agent.full_name?.charAt(0) || 'A'}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{agent.full_name}</p>
                <p className="text-xs text-gray-500">{agent.email}</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1">
            <a href="/dashboard" className="flex items-center px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
              <span className="text-sm font-medium">Dashboard</span>
            </a>
            <a href="/dashboard/leads" className="flex items-center px-3 py-2 bg-blue-50 text-blue-600 rounded-lg">
              <span className="text-sm font-medium">Leads</span>
            </a>
            <a href="/dashboard/buildings" className="flex items-center px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
              <span className="text-sm font-medium">Buildings</span>
            </a>
          </nav>
        </div>
      </aside>
      
      <div className="flex-1 lg:ml-64">
        <LeadDetailClient 
          lead={lead} 
          agent={agent} 
          initialNotes={notes}
          engagementScore={engagement}
        />
        
        {/* Activity Timeline */}
        <div className="mt-8">
          <ActivityTimeline activities={activities} />
        </div>
      </div>
    </div>
  )
}
