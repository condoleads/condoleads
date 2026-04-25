// app/admin-homes/agents/tree/page.tsx
// Phase 3.3b — full-screen org chart route.

import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'

const AgentOrgChart = dynamic(() => import('@/components/admin-homes/AgentOrgChart'), {
  ssr: false,
  loading: () => <div className="p-8 text-gray-500">Loading org chart…</div>,
})

export const dynamicParams = false

export default async function AgentsTreePage() {
  const user = await resolveAdminHomesUser()
  if (!user) redirect('/login?redirect=/admin-homes/agents/tree')

  const allowed =
    user.isPlatformAdmin === true ||
    user.position === 'tenant_admin' ||
    user.position === 'assistant' ||
    user.position === 'area_manager' ||
    user.position === 'manager'
  if (!allowed) redirect('/admin-homes')

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Org Chart</h1>
          <p className="text-sm text-gray-500">Drag a node onto another to reassign its parent.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin-homes/agents"
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            ← List view
          </Link>
        </div>
      </div>

      <div className="hidden md:block">
        <AgentOrgChart />
      </div>

      <div className="md:hidden p-6 bg-white border border-gray-200 rounded-lg text-center">
        <p className="text-sm text-gray-700 mb-3">
          Org chart needs a wider screen. Switch to list view to manage agents on mobile.
        </p>
        <Link
          href="/admin-homes/agents"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md"
        >
          Open list view
        </Link>
      </div>
    </div>
  )
}