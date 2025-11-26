'use server'

import { createClient as createServerClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { sendActivityEmail } from '@/lib/email/sendActivityEmail'

// Create service role client that bypasses RLS
function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

export type ActivityType =
  // Lead Generation (existing)
  | 'registration'
  | 'contact_form'
  | 'property_inquiry'
  
  // Service Requests
  | 'sale_evaluation_request'
  | 'lease_evaluation_request'
  | 'building_visit_request'
  | 'sale_offer_inquiry'
  | 'lease_offer_inquiry'
  
  // Estimator Usage
  | 'estimator_used'
  | 'estimator_contact_submitted'
  
  // Content Viewing
  | 'viewed_sold_listings'
  | 'viewed_leased_listings'
  | 'viewed_transaction_history'
  | 'viewed_unit_history'
  | 'viewed_single_listing'
  
  // Engagement
  | 'clicked_get_estimate_cta'
  | 'unlocked_gated_content'

interface TrackActivityParams {
  contactEmail: string
  agentId?: string
  activityType: ActivityType
  activityData?: any
  pageUrl?: string
}

export async function trackActivity(params: TrackActivityParams) {
  console.log(' trackActivity CALLED:', params)
  try {
    const supabase = createServiceClient()
    
    // Get request metadata
    const headersList = headers()
    const userAgent = headersList.get('user-agent') || ''
    const referer = headersList.get('referer') || params.pageUrl || ''
    
    // If no agentId provided, try to find it from the lead
    let agentId = params.agentId
    if (!agentId && params.contactEmail) {
      const { data: lead } = await supabase
        .from('leads')
        .select('agent_id')
        .eq('contact_email', params.contactEmail)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      agentId = lead?.agent_id
    }
    
    // Insert activity
    console.log(' About to INSERT:', { email: params.contactEmail, type: params.activityType })
    const { data, error } = await supabase
      .from('user_activities')
      .insert({
        contact_email: params.contactEmail,
        agent_id: agentId,
        activity_type: params.activityType,
        activity_data: params.activityData || {},
        page_url: referer,
        user_agent: userAgent
      })
      .select()
      .single()
    
    if (error) {
      console.error('❌ Error tracking activity:', error)
      return { success: false, error: error.message }
    }
    
    console.log('✅ Activity tracked:', {
      email: params.contactEmail,
      type: params.activityType,
      agent: agentId
    })
    
    
    // Send activity email if agent exists
    if (agentId) {
      const { data: agentData } = await supabase.from('agents').select('full_name, email').eq('id', agentId).single()
      if (agentData?.email) {
        const { data: leadData } = await supabase.from('leads').select('id').eq('contact_email', params.contactEmail).eq('agent_id', agentId).single()
        if (leadData?.id) {
          console.log(' Sending activity email...')
          await sendActivityEmail({ leadId: leadData.id, activityType: params.activityType, agentEmail: agentData.email, agentName: agentData.full_name }).catch(e => console.error('?? Email failed:', e))
        }
      }
    }
    return { success: true, activity: data }
  } catch (error) {
    console.error('❌ Unexpected error tracking activity:', error)
    return { success: false, error: 'Failed to track activity' }
  }
}

// Get activities for a specific user
export async function getUserActivities(contactEmail: string) {
  const supabase = createServiceClient()
  
  const { data, error } = await supabase
    .from('user_activities')
    .select('*')
    .eq('contact_email', contactEmail)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching user activities:', error)
    return { success: false, activities: [] }
  }
  
  return { success: true, activities: data || [] }
}

// Get activities for an agent (their leads only)
export async function getAgentActivities(agentId: string) {
  const supabase = createServiceClient()
  
  const { data, error } = await supabase
    .from('user_activities')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching agent activities:', error)
    return { success: false, activities: [] }
  }
  
  return { success: true, activities: data || [] }
}

// Get ALL activities (admin only)
export async function getAllActivities(limit: number = 100) {
  const supabase = createServiceClient()
  
  const { data, error } = await supabase
    .from('user_activities')
    .select(`
      *,
      agents (
        id,
        full_name,
        email,
        subdomain
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (error) {
    console.error('Error fetching all activities:', error)
    return { success: false, activities: [] }
  }
  
  return { success: true, activities: data || [] }
}

// Calculate engagement score for a user
export async function calculateEngagementScore(contactEmail: string) {
  const { activities } = await getUserActivities(contactEmail)
  
  const scoring = {
    registration: 10,
    estimator_used: 20,
    viewed_sold_listings: 15,
    viewed_leased_listings: 15,
    viewed_single_listing: 10,
    sale_evaluation_request: 25,
    lease_evaluation_request: 25,
    building_visit_request: 25,
    estimator_contact_submitted: 30,
    property_inquiry: 20,
    contact_form: 15,
    viewed_transaction_history: 10,
    viewed_unit_history: 10,
    unlocked_gated_content: 10,
    clicked_get_estimate_cta: 5
  }
  
  let score = 0
  activities.forEach((activity: any) => {
    score += scoring[activity.activity_type as keyof typeof scoring] || 0
  })
  
  // Cap at 100
  score = Math.min(score, 100)
  
  // Determine status
  let status: 'hot' | 'warm' | 'cold'
  if (score >= 75) status = 'hot'
  else if (score >= 50) status = 'warm'
  else status = 'cold'
  
  return {
    score,
    status,
    activityCount: activities.length
  }
}
