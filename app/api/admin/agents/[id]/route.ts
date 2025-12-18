import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser, isAdmin } from '@/lib/auth/helpers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET single agent
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminStatus = await isAdmin(user.id)
  if (!adminStatus) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { data: agent, error } = await supabase
    .from('agents')
    .select(`
      *,
      parent:parent_id (id, full_name, subdomain)
    `)
    .eq('id', params.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ agent })
}

// UPDATE agent
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminStatus = await isAdmin(user.id)
  if (!adminStatus) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const data = await request.json()
  const agentId = params.id

  // Check if subdomain is taken by another agent
  if (data.subdomain) {
    const { data: existingSubdomain } = await supabase
      .from('agents')
      .select('id')
      .eq('subdomain', data.subdomain)
      .neq('id', agentId)
      .single()

    if (existingSubdomain) {
      return NextResponse.json({ error: 'Subdomain already taken by another agent' }, { status: 400 })
    }
  }

  // Check if custom_domain is taken by another agent
  if (data.custom_domain) {
    const { data: existingDomain } = await supabase
      .from('agents')
      .select('id')
      .eq('custom_domain', data.custom_domain)
      .neq('id', agentId)
      .single()

    if (existingDomain) {
      return NextResponse.json({ error: 'Custom domain already in use by another agent' }, { status: 400 })
    }
  }

  // Check if email is taken by another agent
  if (data.email) {
    const { data: existingEmail } = await supabase
      .from('agents')
      .select('id')
      .eq('email', data.email)
      .neq('id', agentId)
      .single()

    if (existingEmail) {
      return NextResponse.json({ error: 'Email already registered to another agent' }, { status: 400 })
    }
  }

  // Validate parent_id if provided
  if (data.parent_id) {
    // Prevent self-reference
    if (data.parent_id === agentId) {
      return NextResponse.json({ error: 'Agent cannot be their own parent' }, { status: 400 })
    }

    const { data: parentAgent, error: parentError } = await supabase
      .from('agents')
      .select('id, can_create_children')
      .eq('id', data.parent_id)
      .single()

    if (parentError || !parentAgent) {
      return NextResponse.json({ error: 'Invalid parent agent' }, { status: 400 })
    }

    if (!parentAgent.can_create_children) {
      return NextResponse.json({ error: 'Selected parent cannot have team members' }, { status: 400 })
    }

    // Prevent circular hierarchy (check if parent_id is a child of this agent)
    const { data: children } = await supabase
      .from('agents')
      .select('id')
      .eq('parent_id', agentId)

    if (children?.some(c => c.id === data.parent_id)) {
      return NextResponse.json({ error: 'Circular hierarchy detected' }, { status: 400 })
    }
  }

  // If disabling can_create_children, check if agent has children
  if (data.can_create_children === false) {
    const { data: children } = await supabase
      .from('agents')
      .select('id')
      .eq('parent_id', agentId)

    if (children && children.length > 0) {
      return NextResponse.json({ 
        error: 'Cannot disable team management - this agent has team members. Reassign them first.' 
      }, { status: 400 })
    }
  }

  // Build update object
  const updateData: Record<string, any> = {}
  
  const allowedFields = [
    'full_name', 'email', 'cell_phone', 'office_phone', 'whatsapp_number', 'title', 'license_number',
    'brokerage_name', 'brokerage_address', 'subdomain', 'custom_domain',
    'bio', 'profile_photo_url', 'notification_email', 'is_active',
    'parent_id', 'can_create_children', 'branding'
  ]

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      // Handle null for optional fields
      if (field === 'parent_id' || field === 'custom_domain' || field === 'bio' || field === 'profile_photo_url') {
        updateData[field] = data[field] || null
      } else {
        updateData[field] = data[field]
      }
    }
  }

  updateData.updated_at = new Date().toISOString()

  const { data: agent, error } = await supabase
    .from('agents')
    .update(updateData)
    .eq('id', agentId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, agent })
}

// DELETE agent (soft delete - set inactive)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminStatus = await isAdmin(user.id)
  if (!adminStatus) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Check if agent has children
  const { data: children } = await supabase
    .from('agents')
    .select('id')
    .eq('parent_id', params.id)

  if (children && children.length > 0) {
    return NextResponse.json({ 
      error: 'Cannot deactivate agent with team members. Reassign them first.' 
    }, { status: 400 })
  }

  // Soft delete
  const { error } = await supabase
    .from('agents')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}