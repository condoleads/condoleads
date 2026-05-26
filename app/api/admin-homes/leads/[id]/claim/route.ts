// app/api/admin-homes/leads/[id]/claim/route.ts
// W-TERRITORY-MASTER P4: claim an unowned lead.
//
// Atomic single-transaction operation:
//   1. Verify lead exists, is currently unowned (agent_id IS NULL),
//      and claiming_agent belongs to lead's tenant.
//   2. Walk the claiming agent's hierarchy (manager/area_manager/tenant_admin).
//   3. UPDATE leads SET agent_id, claimed_at, claimed_by_agent_id,
//      manager_id, area_manager_id, tenant_admin_id, assignment_source='claim'.
//   4. If lead has a listing_id: INSERT agent_listing_assignments (pin the listing).
//   5. INSERT lead_ownership_changes audit row with reason='claim'.
//
// Multi-tenant safety: every step checks the lead's tenant matches the
// claiming agent's tenant. Cross-tenant claim returns 403.

import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'
import { walkHierarchy } from '@/lib/admin-homes/hierarchy'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const leadId = params.id
  if (!leadId) {
    return NextResponse.json({ error: 'lead id required' }, { status: 400 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const claimingAgentId = body?.claiming_agent_id
  if (!claimingAgentId || typeof claimingAgentId !== 'string') {
    return NextResponse.json({ error: 'claiming_agent_id required' }, { status: 400 })
  }

  const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!cs) {
    return NextResponse.json({ error: 'DB connection unconfigured' }, { status: 500 })
  }

  const supabase = createServiceClient()
  const client = new Client({ connectionString: cs })
  await client.connect()

  try {
    await client.query('BEGIN')

    // 1. Lock + verify lead
    const leadRes = await client.query(
      `SELECT id, tenant_id, agent_id, listing_id
         FROM leads WHERE id = $1 FOR UPDATE`,
      [leadId]
    )
    if (leadRes.rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'lead not found' }, { status: 404 })
    }
    const lead = leadRes.rows[0]
    if (lead.agent_id !== null) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'lead already owned' }, { status: 409 })
    }

    // 2. Verify claiming agent in lead's tenant
    const agentRes = await client.query(
      `SELECT id, tenant_id, is_active, is_selling
         FROM agents WHERE id = $1`,
      [claimingAgentId]
    )
    if (agentRes.rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'claiming agent not found' }, { status: 404 })
    }
    const agent = agentRes.rows[0]
    if (agent.tenant_id !== lead.tenant_id) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'cross-tenant claim refused' }, { status: 403 })
    }
    if (!agent.is_active) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'claiming agent inactive' }, { status: 400 })
    }

    // 3. Walk hierarchy
    const chain = await walkHierarchy(claimingAgentId, supabase)

    // 4. UPDATE lead
    await client.query(
      `UPDATE leads
          SET agent_id          = $1,
              claimed_at        = now(),
              claimed_by_agent_id = $1,
              manager_id        = $2,
              area_manager_id   = $3,
              tenant_admin_id   = $4,
              assignment_source = 'claim',
              updated_at        = now()
        WHERE id = $5`,
      [
        claimingAgentId,
        chain.manager_id,
        chain.area_manager_id,
        chain.tenant_admin_id,
        leadId,
      ]
    )

    // 5. Pin listing if lead carries one
    if (lead.listing_id) {
      await client.query(
        `INSERT INTO agent_listing_assignments (agent_id, listing_id, assigned_by)
         VALUES ($1, $2, $1)
         ON CONFLICT DO NOTHING`,
        [claimingAgentId, lead.listing_id]
      )
    }

    // 6. Audit
    await client.query(
      `INSERT INTO lead_ownership_changes
         (lead_id, tenant_id, old_agent_id, new_agent_id, reason, changed_by, notes)
       VALUES ($1, $2, NULL, $3, 'claim', $3, $4)`,
      [
        leadId,
        lead.tenant_id,
        claimingAgentId,
        lead.listing_id
          ? `Claimed via unowned-lead feed. Listing pin created on ${lead.listing_id}.`
          : 'Claimed via unowned-lead feed. No listing on lead — no pin created.',
      ]
    )

    await client.query('COMMIT')

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      claimed_by: claimingAgentId,
      pinned_listing_id: lead.listing_id || null,
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[leads/claim] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  } finally {
    await client.end()
  }
}