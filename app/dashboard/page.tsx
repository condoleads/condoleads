import { redirect } from 'next/navigation'
import { requireAgent } from '@/lib/auth/helpers'
import { getAgentLeads } from '@/lib/actions/leads'

export default async function DashboardPage() {
  const { error, agent } = await requireAgent()

  if (error || !agent) {
    redirect('/login')
  }

  // Fetch agent's leads
  const leadsResult = await getAgentLeads(agent.id)
  const leads = leadsResult.success ? leadsResult.leads : []

  // Calculate stats
  const totalLeads = leads.length
  const hotLeads = leads.filter((l: any) => l.quality === 'hot').length
  const newLeads = leads.filter((l: any) => {
    const createdToday = new Date(l.created_at).toDateString() === new Date().toDateString()
    return createdToday
  }).length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Welcome back, {agent.full_name}!
        </h1>

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
                  <p className="text-xs text-gray-500">{lead.source}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
