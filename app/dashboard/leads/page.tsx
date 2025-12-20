import { redirect } from 'next/navigation'
import { requireAgent } from '@/lib/auth/helpers'
import { getAgentLeads, getAllLeadsForAdmin } from '@/lib/actions/leads'
import { getVisibleLeads } from '@/lib/hierarchy/agent-tree'
import LeadsTable from '@/components/dashboard/LeadsTable'

export default async function LeadsPage() {
  const { error, agent } = await requireAgent()

  if (error || !agent) {
    redirect('/login')
  }

  // Fetch leads based on admin status
  const leadsResult = agent.is_admin 
    ? await getAllLeadsForAdmin()
    : agent.can_create_children
      ? { success: true, leads: await getVisibleLeads(agent.id) }
      : await getAgentLeads(agent.id)
  const leads = leadsResult.success ? leadsResult.leads : []

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
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
      
      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        <div className="max-w-7xl mx-auto p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">My Leads</h1>
            <p className="text-gray-600">
              Manage and follow up with your {leads.length} leads
            </p>
          </div>

          <LeadsTable leads={leads} agentId={agent.id} isAdmin={agent.is_admin} isManager={agent.can_create_children} />
        </div>
      </div>
    </div>
  )
}
