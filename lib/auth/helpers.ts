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
  console.log('🔍 Looking for agent with user_id:', userId)
  
  // Use service client to bypass RLS for this specific check
  // This is safe because we already verified the user is authenticated
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
  
  console.log(' Agent authenticated:', agent.full_name)
  return { error: null, agent }
}

export async function isAdmin(userId: string) {
  const supabase = await createServerClient()
  
  const { data, error } = await supabase.rpc('get_user_role', { user_id: userId })
  
  if (error) {
    console.error('Error checking admin status:', error)
    return false
  }
  
  return data === 'admin'
}
