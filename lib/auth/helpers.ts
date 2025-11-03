import { createServerClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function getCurrentUser() {
  const supabase = await createServerClient()
  
  const { data: { user }, error } = await supabase.auth.getUser()
  
  console.log(' getCurrentUser result:', { 
    userId: user?.id, 
    email: user?.email,
    error: error?.message 
  })
  
  if (error || !user) {
    return null
  }
  
  return user
}

export async function getAgentByUserId(userId: string) {
  console.log(' Looking for agent with user_id:', userId)
  
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: agent, error } = await supabase
    .from('agents')
    .select('*')
    .eq('user_id', userId)
    .single()

  console.log(' getAgentByUserId result:', {
    found: !!agent,
    agentId: agent?.id,
    role: agent?.role,
    error: error?.message 
  })

  if (error) {
    console.error(' Error fetching agent:', error)
    return null
  }

  return agent
}

export async function requireAgent() {
  console.log(' requireAgent called')
  const user = await getCurrentUser()
  
  if (!user) {
    console.log(' No user found')
    return { error: 'Not authenticated', agent: null }
  }

  const agent = await getAgentByUserId(user.id)
  
  if (!agent) {
    console.log(' No agent found for user')
    return { error: 'Not authorized as agent', agent: null }
  }

  console.log(' Agent authenticated:', agent.full_name, '| Role:', agent.role)
  return { error: null, agent }
}

export async function isAdmin(userId: string) {
  console.log(' isAdmin called for userId:', userId)
  
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: agent, error } = await supabase
    .from('agents')
    .select('role')
    .eq('user_id', userId)
    .single()

  console.log(' isAdmin result:', { role: agent?.role, isAdmin: agent?.role === 'admin', error: error?.message })

  if (error || !agent) {
    console.error(' Error checking admin status:', error)
    return false
  }

  return agent.role === 'admin'
}
