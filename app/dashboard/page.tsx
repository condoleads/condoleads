import { redirect } from 'next/navigation'
import DashboardLogout from '@/components/dashboard/DashboardLogout'
import { requireAgent } from '@/lib/auth/helpers'
import { getAgentLeads, getAllLeadsForAdmin } from '@/lib/actions/leads'
import { getVisibleLeads } from '@/lib/hierarchy/agent-tree'

export default async function DashboardPage() {
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

  const totalLeads = leads.length
  const hotLeads = leads.filter((l: any) => l.quality === 'hot').length
  const newLeads = leads.filter((l: any) => {
    const createdToday = new Date(l.created_at).toDateString() === new Date().toDateString()
    return createdToday
  }).length

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
            <a href="/dashboard" className="flex items-center px-3 py-2 bg-blue-50 text-blue-600 rounded-lg">
              <span className="text-sm font-medium">Dashboard</span>
            </a>
            <a href="/dashboard/leads" className="flex items-center px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
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
        {/* Top Header Bar */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-30 px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back, {agent.full_name}!
            </h1>
            <DashboardLogout />
          </div>
        </div>
        <div className="max-w-7xl mx-auto p-8">

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-gray-600 text-sm mb-2">Total Leads</h3>
              <p className="text-3xl font-bold">{totalLeads}</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-gray-600 text-sm mb-2">Hot Leads</h3>
              <p className="text-3xl font-bold text-red-600">{hotLeads}</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-gray-600 text-sm mb-2">New Today</h3>
              <p className="text-3xl font-bold text-green-600">{newLeads}</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-gray-600 text-sm mb-2">Conversion</h3>
              <p className="text-3xl font-bold text-purple-600">
                {totalLeads > 0 ? Math.round((hotLeads / totalLeads) * 100) : 0}%
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Recent Leads</h2>
            {leads.length === 0 ? (
              <p className="text-gray-500">No leads yet</p>
            ) : (
              <div className="space-y-4">
                {leads.slice(0, 10).map((lead: any) => (
                  <div key={lead.id} className="border-b pb-4">
                    <p className="font-medium">{lead.contact_name}</p>
                    <p className="text-sm text-gray-600">{lead.contact_email}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
