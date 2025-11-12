import { formatDistanceToNow } from 'date-fns'

interface RecentLeadsProps {
  leads: any[]
}

export default function RecentLeads({ leads }: RecentLeadsProps) {
  if (leads.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <p className="text-gray-500">No leads yet. Check back soon!</p>
      </div>
    )
  }

  const getQualityBadge = (quality: string) => {
    const styles = {
      hot: 'bg-red-100 text-red-700',
      warm: 'bg-yellow-100 text-yellow-700',
      cold: 'bg-blue-100 text-blue-700'
    }
    return styles[quality as keyof typeof styles] || styles.cold
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      new: 'bg-green-100 text-green-700',
      contacted: 'bg-blue-100 text-blue-700',
      qualified: 'bg-purple-100 text-purple-700',
      closed: 'bg-gray-100 text-gray-700',
      lost: 'bg-red-100 text-red-700'
    }
    return styles[status as keyof typeof styles] || styles.new
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Source
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Quality
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {lead.contact_name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {lead.contact_email}
                    </p>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 capitalize">
                  {lead.source.replace(/_/g, ' ')}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getQualityBadge(lead.quality)}`}>
                    {lead.quality}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(lead.status)}`}>
                    {lead.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
                </td>
                <td className="px-6 py-4">
                  <a
                    href={`/dashboard/leads/${lead.id}`}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    View
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
