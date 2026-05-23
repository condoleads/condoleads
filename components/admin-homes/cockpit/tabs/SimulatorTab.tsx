// components/admin-homes/cockpit/tabs/SimulatorTab.tsx
// W-COCKPIT P-A-2 — Lens 5 placeholder. Phase C builds the simulator UI +
// /api/admin-homes/territory/explain endpoint that wraps the existing
// resolve_agent_for_context RPC and returns a narrative resolution chain.

'use client'

import { Play } from 'lucide-react'

interface Props { tenantId: string }

export default function SimulatorTab({}: Props) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
      <Play className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <h3 className="text-lg font-semibold text-gray-800 mb-1">Routing simulator</h3>
      <p className="text-sm text-gray-500 max-w-md mx-auto">
        "If a customer arrived with context X, who would the resolver pick?"
        Phase C builds the simulator form + resolution-chain explainer.
      </p>
    </div>
  )
}
