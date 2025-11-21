'use server'

import { Resend } from 'resend'
import { generateActivityEmailHtml } from './activityEmailTemplate'
import { createClient as createServerClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)

// Create service client
function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Activity priority levels
const CRITICAL_ACTIVITIES = [
  'contact_form',
  'property_inquiry',
  'building_visit_request',
  'sale_evaluation_request',
  'lease_evaluation_request',
  'estimator_contact_submitted'
]

const HIGH_INTENT_ACTIVITIES = [
  'estimator_used',
  'registration'
]

const PASSIVE_ACTIVITIES = [
  'viewed_transaction_history',
  'viewed_sold_listings',
  'viewed_leased_listings',
  'viewed_single_listing',
  'clicked_get_estimate_cta'
]

// Calculate engagement score
function calculateEngagement(activities: any[]): { score: ' HOT' | ' WARM' | ' COLD', text: string } {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const recentActivities = activities.filter(a => new Date(a.created_at) > oneHourAgo)
  
  if (recentActivities.length >= 4) {
    return { 
      score: ' HOT', 
      text: `High engagement - ${recentActivities.length} actions in the last hour!` 
    }
  }
  if (recentActivities.length >= 2) {
    return { 
      score: ' WARM', 
      text: `Actively browsing - ${recentActivities.length} recent actions` 
    }
  }
  return { 
    score: ' COLD', 
    text: 'New activity detected' 
  }
}

// Format activity for email
function formatActivityForEmail(activity: any) {
  const activityIcons: Record<string, string> = {
    contact_form: '',
    property_inquiry: '',
    estimator_used: '',
    estimator_contact_submitted: '',
    sale_evaluation_request: '',
    lease_evaluation_request: '',
    building_visit_request: '',
    viewed_transaction_history: '',
    registration: ''
  }

  const activityNames: Record<string, string> = {
    contact_form: 'Contact Form Submission',
    property_inquiry: 'Property Inquiry',
    estimator_used: 'Used Price Estimator',
    estimator_contact_submitted: 'Requested Agent Contact',
    sale_evaluation_request: 'Requested Sale Evaluation',
    lease_evaluation_request: 'Requested Lease Evaluation',
    building_visit_request: 'Requested Building Visit',
    viewed_transaction_history: 'Viewed Transaction History',
    registration: 'New User Registration'
  }

  const timestamp = new Date(activity.created_at)
  const minutesAgo = Math.floor((Date.now() - timestamp.getTime()) / 60000)
  
  let timeText = ''
  if (minutesAgo < 1) timeText = 'Just now'
  else if (minutesAgo < 60) timeText = `${minutesAgo} minute${minutesAgo > 1 ? 's' : ''} ago`
  else timeText = `${Math.floor(minutesAgo / 60)} hour${Math.floor(minutesAgo / 60) > 1 ? 's' : ''} ago`

  let description = activityNames[activity.activity_type] || activity.activity_type
  
  // Add extra context from activity_data
  if (activity.activity_data) {
    const data = activity.activity_data
    if (data.buildingName) description += ` - ${data.buildingName}`
    if (data.totalSales || data.totalLeases) {
      description += ` (Viewed ${data.totalSales || 0} sold, ${data.totalLeases || 0} leased)`
    }
  }

  return {
    icon: activityIcons[activity.activity_type] || '',
    type: activityNames[activity.activity_type] || activity.activity_type,
    description,
    timestamp: timeText
  }
}

// Check if should send email
async function shouldSendActivityEmail(
  leadId: string,
  activityType: string
): Promise<boolean> {
  const supabase = createServiceClient()

  // Always send for critical activities
  if (CRITICAL_ACTIVITIES.includes(activityType)) {
    console.log(' Critical activity - sending email')
    return true
  }

  // Never send for passive activities
  if (PASSIVE_ACTIVITIES.includes(activityType)) {
    console.log(' Passive activity - no email')
    return false
  }

  // For high-intent activities, check throttle
  if (HIGH_INTENT_ACTIVITIES.includes(activityType)) {
    // Check last email time for this lead
    const { data: lastEmail } = await supabase
      .from('lead_email_log')
      .select('sent_at')
      .eq('lead_id', leadId)
      .order('sent_at', { ascending: false })
      .limit(1)
      .single()

    if (lastEmail) {
      const hoursSinceLastEmail = (Date.now() - new Date(lastEmail.sent_at).getTime()) / (1000 * 60 * 60)
      if (hoursSinceLastEmail < 1) {
        console.log(' Email throttled - sent one recently')
        return false
      }
    }

    console.log(' High-intent activity - sending email')
    return true
  }

  return false
}

// Log email sent
async function logEmailSent(leadId: string, activityType: string) {
  const supabase = createServiceClient()
  await supabase.from('lead_email_log').insert({
    lead_id: leadId,
    activity_type: activityType,
    sent_at: new Date().toISOString()
  })
}

export async function sendActivityEmail({
  leadId,
  activityType,
  agentEmail,
  agentName
}: {
  leadId: string
  activityType: string
  agentEmail: string
  agentName: string
}) {
  try {
    console.log(' Checking if should send activity email...', { leadId, activityType })

    // Check if we should send email for this activity
    const shouldSend = await shouldSendActivityEmail(leadId, activityType)
    if (!shouldSend) {
      return { success: true, skipped: true }
    }

    const supabase = createServiceClient()

    // Get lead details
    const { data: lead } = await supabase
      .from('leads')
      .select('*, buildings(*)')
      .eq('id', leadId)
      .single()

    if (!lead) {
      console.error(' Lead not found')
      return { success: false, error: 'Lead not found' }
    }

    // Get recent activities
    const { data: activities } = await supabase
      .from('user_activities')
      .select('*')
      .eq('contact_email', lead.contact_email)
      .order('created_at', { ascending: false })
      .limit(10)

    if (!activities || activities.length === 0) {
      console.error(' No activities found')
      return { success: false, error: 'No activities' }
    }

    // Calculate engagement
    const engagement = calculateEngagement(activities)

    // Format latest activity
    const latestActivity = activities[0]
    const latestFormatted = formatActivityForEmail(latestActivity)

    // Get building name
    const buildingName = lead.buildings?.name || lead.activity_data?.buildingName

    // Format recent activities
    const recentActivities = activities.slice(0, 5).map(formatActivityForEmail)

    // Get latest activity details
    let latestDetails = ''
    if (latestActivity.activity_data) {
      const data = latestActivity.activity_data
      if (data.sqft) latestDetails += `${data.bedrooms || 'N/A'}BR/${data.bathrooms || 'N/A'}BA, ${data.sqft} sqft`
      if (data.estimatedValue) latestDetails += `\nEstimated: ${data.estimatedValue}`
    }

    // Build email data
    const emailData = {
      agentName,
      leadName: lead.contact_name,
      leadEmail: lead.contact_email,
      leadPhone: lead.contact_phone,
      buildingName,
      latestActivity: {
        type: activityType,
        description: latestFormatted.type,
        details: latestDetails,
        timestamp: latestFormatted.timestamp
      },
      recentActivities,
      engagementScore: engagement.score,
      engagementText: engagement.text,
      totalActivityCount: activities.length,
      leadUrl: `https://condoleads.ca/dashboard/leads/${leadId}`,
      callUrl: lead.contact_phone ? `tel:${lead.contact_phone}` : undefined,
      whatsappUrl: lead.contact_phone ? `https://wa.me/${lead.contact_phone.replace(/\D/g, '')}` : undefined
    }

    // Generate HTML
    const html = generateActivityEmailHtml(emailData)

    // Send email
    const { data, error } = await resend.emails.send({
      from: 'CondoLeads <condoleads.ca@gmail.com>',
      to: agentEmail,
      subject: `${engagement.score} Lead Activity: ${lead.contact_name} - ${latestFormatted.type} (${activities.length} actions)`,
      html
    })

    if (error) {
      console.error(' Error sending activity email:', error)
      return { success: false, error: error.message }
    }

    // Log email sent
    await logEmailSent(leadId, activityType)

    console.log(' Activity email sent successfully:', data?.id)
    return { success: true, emailId: data?.id }

  } catch (error) {
    console.error(' Error in sendActivityEmail:', error)
    return { success: false, error: String(error) }
  }
}
