// scripts/r-w-territory-master-p4-phase2-patch.js
//
// W-TERRITORY-MASTER P4 phase 2: UI patch for AdminHomesLeadsClient.
//
// Six surgical anchor-based edits:
//   A1: Add filterOwnership state next to other filter states
//   A2: Apply filterOwnership filter inside filteredLeads useMemo
//   A3: Add filterOwnership to useMemo dep array
//   A4: Add Ownership filter <select> in the filter UI grid
//   A5: Add claimLead helper + claimingLead state next to updateLeadStatus
//   A6: Add Claim button inside the Agent <td> for unowned rows
//
// Each anchor is verified unique before applying. Backup created before write.
//
// Run: node scripts/r-w-territory-master-p4-phase2-patch.js

const fs = require('fs')
const path = require('path')

const TARGET = 'components/admin-homes/AdminHomesLeadsClient.tsx'

function stamp() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function applyEdit(content, anchor, replacement, label) {
  const count = content.split(anchor).length - 1
  if (count === 0) {
    throw new Error(`${label}: anchor NOT FOUND`)
  }
  if (count > 1) {
    throw new Error(`${label}: anchor matches ${count} times, expected 1`)
  }
  return content.replace(anchor, replacement)
}

function checkPresent(content, marker, label) {
  if (!content.includes(marker)) {
    throw new Error(`POST-CHECK FAIL: ${label} — marker not found: ${marker.slice(0, 60)}`)
  }
}

function main() {
  const full = path.resolve(process.cwd(), TARGET)
  if (!fs.existsSync(full)) {
    console.error('FAIL: target not found:', full)
    process.exit(1)
  }

  const original = fs.readFileSync(full, 'utf8')
  const backup = full + '.backup_' + stamp()
  fs.writeFileSync(backup, original, 'utf8')
  console.log('Backup:', backup)

  let content = original

  // ============================================================
  // A1: filterOwnership state declaration
  // Anchor: existing filterSource state line, unique in file
  // ============================================================
  content = applyEdit(
    content,
    `  const [filterSource, setFilterSource] = useState('all')\n`,
    `  const [filterSource, setFilterSource] = useState('all')\n` +
    `  // W-TERRITORY-MASTER P4 phase 2: ownership filter (all | owned | unowned)\n` +
    `  const [filterOwnership, setFilterOwnership] = useState<'all' | 'owned' | 'unowned'>('all')\n` +
    `  const [claimingLead, setClaimingLead] = useState<string | null>(null)\n`,
    'A1 filterOwnership state'
  )

  // ============================================================
  // A2: ownership filter inside useMemo
  // Anchor: filterSource branch, unique
  // ============================================================
  content = applyEdit(
    content,
    `    if (filterSource !== 'all') f = f.filter(l => deriveLeadOriginRoute(l.source) === filterSource)\n`,
    `    if (filterSource !== 'all') f = f.filter(l => deriveLeadOriginRoute(l.source) === filterSource)\n` +
    `    // W-TERRITORY-MASTER P4 phase 2: ownership filter\n` +
    `    if (filterOwnership === 'owned')   f = f.filter(l => l.agent_id !== null)\n` +
    `    if (filterOwnership === 'unowned') f = f.filter(l => l.agent_id === null)\n`,
    'A2 ownership filter logic'
  )

  // ============================================================
  // A3: dep array — add filterOwnership
  // Anchor: the exact dep array string
  // ============================================================
  content = applyEdit(
    content,
    `  }, [leads, searchTerm, filterAgent, filterStatus, filterQuality, filterTemperature, filterIntent, filterSource, sortBy, sortOrder, showTerminal])`,
    `  }, [leads, searchTerm, filterAgent, filterStatus, filterQuality, filterTemperature, filterIntent, filterSource, filterOwnership, sortBy, sortOrder, showTerminal])`,
    'A3 dep array'
  )

  // ============================================================
  // A4: Ownership filter select in UI
  // Anchor: existing Temperature select block closing div (unique by full string)
  // We insert AFTER the temperature select div closes.
  // ============================================================
  content = applyEdit(
    content,
    `          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Temperature</label>
            <select value={filterTemperature} onChange={e => setFilterTemperature(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="all">All</option>
              {TEMPERATURE_VALUES.map(v => <option key={v} value={v}>{TEMPERATURE_LABELS[v]}</option>)}
              <option value="none">(none)</option>
            </select>
          </div>`,
    `          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Temperature</label>
            <select value={filterTemperature} onChange={e => setFilterTemperature(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="all">All</option>
              {TEMPERATURE_VALUES.map(v => <option key={v} value={v}>{TEMPERATURE_LABELS[v]}</option>)}
              <option value="none">(none)</option>
            </select>
          </div>
          {/* W-TERRITORY-MASTER P4 phase 2: Ownership filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Ownership</label>
            <select value={filterOwnership} onChange={e => setFilterOwnership(e.target.value as 'all' | 'owned' | 'unowned')} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="all">All</option>
              <option value="owned">Owned</option>
              <option value="unowned">Unowned (claimable)</option>
            </select>
          </div>`,
    'A4 ownership select in UI'
  )

  // ============================================================
  // A5: claimLead helper next to updateLeadStatus
  // Anchor: closing brace of updateLeadStatus
  // ============================================================
  content = applyEdit(
    content,
    `  const updateLeadStatus = async (leadId: string, field: 'status' | 'quality' | 'temperature', value: string | null) => {
    setUpdatingStatus(leadId)
    try {
      const res = await fetch(\`/api/admin-homes/leads/\${leadId}\`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (res.ok) {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, [field]: value } : l))
      }
    } catch (err) {
      console.error('Failed to update lead:', err)
    } finally {
      setUpdatingStatus(null)
    }
  }`,
    `  const updateLeadStatus = async (leadId: string, field: 'status' | 'quality' | 'temperature', value: string | null) => {
    setUpdatingStatus(leadId)
    try {
      const res = await fetch(\`/api/admin-homes/leads/\${leadId}\`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (res.ok) {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, [field]: value } : l))
      }
    } catch (err) {
      console.error('Failed to update lead:', err)
    } finally {
      setUpdatingStatus(null)
    }
  }

  // W-TERRITORY-MASTER P4 phase 2: claim an unowned lead
  const claimLead = async (leadId: string) => {
    if (!currentAgentId) {
      alert('Cannot claim: no agent identity in session.')
      return
    }
    if (!confirm('Claim this lead? You become the primary contact and the listing (if any) is pinned to you.')) {
      return
    }
    setClaimingLead(leadId)
    try {
      const res = await fetch(\`/api/admin-homes/leads/\${leadId}/claim\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claiming_agent_id: currentAgentId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert('Claim failed: ' + (body?.error || \`HTTP \${res.status}\`))
        return
      }
      // Optimistic local update: stamp agent_id + assignment_source so the row
      // moves out of the "Unowned" filter and shows the claiming agent.
      const claimingAgent = agents.find(a => a.id === currentAgentId)
      setLeads(prev => prev.map(l => l.id === leadId ? {
        ...l,
        agent_id: currentAgentId,
        assignment_source: 'claim',
        agents: claimingAgent ? { id: claimingAgent.id, full_name: claimingAgent.full_name, email: claimingAgent.email } : l.agents,
      } : l))
    } catch (err: any) {
      console.error('Claim failed:', err)
      alert('Claim failed: ' + (err?.message || 'network error'))
    } finally {
      setClaimingLead(null)
    }
  }`,
    'A5 claimLead helper'
  )

  // ============================================================
  // A6: Claim button inside Agent column
  // Anchor: the existing Agent <td> block (unique by full string)
  // ============================================================
  content = applyEdit(
    content,
    `                    <td className="px-4 py-3">
                      <div className="text-xs font-medium text-gray-900">{lead.agents?.full_name || 'ΓÇö'}</div>
                    </td>`,
    `                    <td className="px-4 py-3">
                      {lead.agent_id ? (
                        <div className="text-xs font-medium text-gray-900">{lead.agents?.full_name || 'ΓÇö'}</div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); claimLead(lead.id) }}
                          disabled={claimingLead === lead.id}
                          className="px-2 py-1 rounded-md text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                          title="Claim this unowned lead"
                        >
                          {claimingLead === lead.id ? 'Claiming...' : 'Claim'}
                        </button>
                      )}
                    </td>`,
    'A6 Claim button in Agent column'
  )

  // ============================================================
  // Post-checks: confirm every new marker present
  // ============================================================
  checkPresent(content, `const [filterOwnership, setFilterOwnership]`, 'A1 marker')
  checkPresent(content, `if (filterOwnership === 'owned')`, 'A2 marker')
  checkPresent(content, `filterSource, filterOwnership,`, 'A3 marker')
  checkPresent(content, `Unowned (claimable)`, 'A4 marker')
  checkPresent(content, `const claimLead = async`, 'A5 marker')
  checkPresent(content, `claimLead(lead.id)`, 'A6 marker')

  // No-regression: confirm key pre-existing markers still present
  checkPresent(content, `const [filterSource, setFilterSource]`, 'no-regress filterSource state')
  checkPresent(content, `updateLeadStatus`, 'no-regress updateLeadStatus helper')
  checkPresent(content, `exportToCSV`, 'no-regress exportToCSV')
  checkPresent(content, `Export CSV`, 'no-regress Export CSV button')
  checkPresent(content, `handleDeleteSelected`, 'no-regress bulk delete')
  checkPresent(content, `<th key={h}`, 'no-regress table header')

  fs.writeFileSync(full, content, 'utf8')

  const originalLines = original.split('\n').length
  const newLines = content.split('\n').length
  console.log('')
  console.log('PASS: 6/6 anchor edits applied + 12/12 post-checks PASS')
  console.log('Lines:', originalLines, '->', newLines, '(+' + (newLines - originalLines) + ')')
  console.log('Bytes:', original.length, '->', content.length)
}

try {
  main()
} catch (e) {
  console.error('FATAL:', e.message)
  process.exit(1)
}