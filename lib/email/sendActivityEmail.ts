'use server'

import { Resend } from 'resend'
import { generateActivityEmailHtml } from './activityEmailTemplate'
import { createClient as createServerClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const CRITICAL_ACTIVITIES = [
  'message_agent',
  'contact_form',
  'property_inquiry',
  'building_visit_request',
  'sale_evaluation_request',
  'lease_evaluation_request',
  'sale_offer_inquiry',
  'lease_offer_inquiry',
  'estimator',
  'estimator_contact_submitted',
  'registration',
  'unit_history_inquiry'
]

const HIGH_INTENT_ACTIVITIES = [
  'estimator_used'
]

const PASSIVE_ACTIVITIES = [
  'viewed_transaction_history',
  'viewed_sold_listings',
  'viewed_leased_listings',
  'viewed_single_listing',
  'clicked_get_estimate_cta'
]

function calculateEngagement(activities: any[]): { score: '🔥 HOT' | '🌡️ WARM' | '❄️ COLD', text: string } {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const recentActivities = activities.filter(a => new Date(a.created_at) > oneHourAgo)

  if (recentActivities.length >= 4) {
    return {
      score: '🔥 HOT',
      text: `High engagement - ${recentActivities.length} actions in the last hour!`
    }
  }
  if (recentActivities.length >= 2) {
    return {
      score: '🌡️ WARM',
      text: `Actively browsing - ${recentActivities.length} recent actions`
    }
  }
  return {
    score: '❄️ COLD',
    text: 'New activity detected'
  }
}

function formatActivityForEmail(activity: any, fallbackBuilding?: { building_name?: string, canonical_address?: string }) {
  const activityIcons: Record<string, string> = {
  contact_form: '📧',
  property_inquiry: '🏢',
  estimator: '💰',
  estimator_used: '💰',
  estimator_contact_submitted: '📞',
  sale_evaluation_request: '📊',
  sale_offer_inquiry: '🔥',
  lease_evaluation_request: '📋',
  lease_offer_inquiry: '🔥',
  building_visit_request: '🗝️',
  viewed_transaction_history: '📈',
  registration: '✅',
    unit_history_inquiry: '📜'
}

  const activityNames: Record<string, string> = {
  message_agent: 'Contact Agent Message',
  contact_form: 'Contact Form Submission',
  property_inquiry: 'Property Inquiry',
  estimator: 'Used Price Estimator',
  estimator_used: 'Used Price Estimator',
  estimator_contact_submitted: 'Requested Agent Contact',
  sale_evaluation_request: 'Requested Sale Evaluation',
  sale_offer_inquiry: 'Sale Offer Inquiry',
  lease_evaluation_request: 'Requested Lease Evaluation',
  lease_offer_inquiry: 'Lease Offer Inquiry',
  building_visit_request: 'Requested Building Visit',
  viewed_transaction_history: 'Viewed Transaction History',
  registration: 'New User Registration',
  unit_history_inquiry: 'Unit History Inquiry'
}

  const timestamp = new Date(activity.created_at)
  const minutesAgo = Math.floor((Date.now() - timestamp.getTime()) / 60000)

  let timeText = ''
  if (minutesAgo < 1) timeText = 'Just now'
  else if (minutesAgo < 60) timeText = `${minutesAgo} minute${minutesAgo > 1 ? 's' : ''} ago`
  else timeText = `${Math.floor(minutesAgo / 60)} hour${Math.floor(minutesAgo / 60) > 1 ? 's' : ''} ago`

  let description = activityNames[activity.activity_type] || activity.activity_type
  const details = extractActivityDetails(activity.activity_type, activity.activity_data)
  if (details) {
    description += ` - ${details}`
  }

  const activityData = activity.activity_data || {}
    const bName = activityData.buildingName || fallbackBuilding?.building_name
    const bAddress = activityData.buildingAddress || fallbackBuilding?.canonical_address
    const buildingInfo = bName
      ? `${bName}${activityData.unitNumber ? ` • Unit ${activityData.unitNumber}` : ''}${bAddress ? ` • ${bAddress}` : ''}`
      : ''

  return {
    icon: activityIcons[activity.activity_type] || '📌',
    type: activityNames[activity.activity_type] || activity.activity_type,
    description,
    timestamp: timeText,
    buildingInfo
  }
}

async function shouldSendActivityEmail(
  leadId: string,
  activityType: string
): Promise<boolean> {
  const supabase = createServiceClient()

  if (CRITICAL_ACTIVITIES.includes(activityType)) {
    console.log('✅ Critical activity - sending email')
    return true
  }

  if (PASSIVE_ACTIVITIES.includes(activityType)) {
    console.log('❌ Passive activity - no email')
    return false
  }

  if (HIGH_INTENT_ACTIVITIES.includes(activityType)) {
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
        console.log('⏸️ Email throttled - sent one recently')
        return false
      }
    }

    console.log('✅ High-intent activity - sending email')
    return true
  }

  return false
}

async function logEmailSent(leadId: string, activityType: string) {
  const supabase = createServiceClient()
  await supabase.from('lead_email_log').insert({
    lead_id: leadId,
    activity_type: activityType,
    sent_at: new Date().toISOString()
  })
}

function extractActivityDetails(activityType: string, activityData: any): string {
  if (!activityData) return ''

  let details = ''

  switch (activityType) {
    case 'contact_form':
    case 'message_agent':
      if (activityData.buildingName) {
        details += `Building: ${activityData.buildingName}`
      }
      if (activityData.unitNumber) {
        details += details ? ` • Unit ${activityData.unitNumber}` : `Unit ${activityData.unitNumber}`
      }
      if (activityData.source) {
        const sourceText = activityData.source.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
        details += details ? ` • Source: ${sourceText}` : `Source: ${sourceText}`
      }
      if (activityData.userMessage) {
        details += details ? ` • Message: "${activityData.userMessage}"` : `Message: "${activityData.userMessage}"`
      }
      break

    case 'estimator_used':
      if (activityData.sqft) {
        details += `Unit Size: ${activityData.sqft} sqft`
      }
      if (activityData.bedrooms || activityData.bathrooms) {
        const bedBath = `${activityData.bedrooms || '?'}BR / ${activityData.bathrooms || '?'}BA`
        details += details ? ` • ${bedBath}` : bedBath
      }
      if (activityData.estimatedPrice) {
        const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(activityData.estimatedPrice)
        details += details ? ` • Estimated: ${price}` : `Estimated: ${price}`
      }
      if (activityData.buildingName) {
        details += details ? ` • ${activityData.buildingName}` : activityData.buildingName
      }
      break

    case 'building_visit_request':
      if (activityData.buildingName) {
        details += activityData.buildingName
      }
      if (activityData.requestedDate) {
        const date = new Date(activityData.requestedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        details += details ? ` • Requested: ${date}` : `Requested: ${date}`
      }
      if (activityData.requestedTime) {
        details += details ? ` at ${activityData.requestedTime}` : activityData.requestedTime
      }
      break

    case 'property_inquiry':
      if (activityData.buildingName) {
        details += activityData.buildingName
      }
      if (activityData.unitNumber) {
        details += details ? ` • Unit ${activityData.unitNumber}` : `Unit ${activityData.unitNumber}`
      }
      if (activityData.userMessage) {
        details += details ? ` • Message: "${activityData.userMessage}"` : `Message: "${activityData.userMessage}"`
      }
      break

      case 'registration':
      if (activityData.buildingName) {
        details += activityData.buildingName
      }
      if (activityData.unitNumber) {
        details += details ? ` • Unit ${activityData.unitNumber}` : `Unit ${activityData.unitNumber}`
      }
      if (activityData.buildingAddress) {
        details += details ? ` • ${activityData.buildingAddress}` : activityData.buildingAddress
      }
      break

    case 'viewed_transaction_history':
      if (activityData.totalSales || activityData.totalLeases) {
        details += `Viewed ${activityData.totalSales || 0} sales, ${activityData.totalLeases || 0} leases`
      }
      if (activityData.buildingName) {
        details += details ? ` at ${activityData.buildingName}` : activityData.buildingName
      }
      if (activityData.unitNumber) {
        details += ` • Unit ${activityData.unitNumber}`
      }
      break

    case 'estimator':
     case 'sale_offer_inquiry':
        case 'lease_offer_inquiry':
          if (activityData.buildingName) {
            details += activityData.buildingName
          }
          if (activityData.unitNumber) {
            details += details ? ` • Unit ${activityData.unitNumber}` : `Unit ${activityData.unitNumber}`
          }
          if (activityData.buildingAddress) {
            details += details ? ` • ${activityData.buildingAddress}` : activityData.buildingAddress
          }
          if (activityData.userMessage) {
            details += details ? ` • Message: "${activityData.userMessage}"` : `Message: "${activityData.userMessage}"`
          }
      if (activityData.estimatedPrice) {
        const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(activityData.estimatedPrice)
        details += details ? ` • Estimated: ${price}` : `Estimated: ${price}`
      }
      if (activityData.bedrooms || activityData.bathrooms) {
        const bedBath = `${activityData.bedrooms || '?'}BR / ${activityData.bathrooms || '?'}BA`
        details += details ? ` • ${bedBath}` : bedBath
      }
      if (activityData.sqft) {
        details += details ? ` • ${activityData.sqft} sqft` : `${activityData.sqft} sqft`
      }
      break

    default:
      if (activityData.buildingName) {
        details += activityData.buildingName
      }
  }

  return details
}

// Activity type display names for email subject
const ACTIVITY_TYPE_NAMES: Record<string, string> = {
  'message_agent': 'Contact Agent',
  'registration': 'New User Registration',
  'sale_evaluation_request': 'Request to List',
  'contact_form': 'Contact Form',
  'building_visit_request': 'Building Visit Request',
  'property_inquiry': 'Property Inquiry',
  'lease_evaluation_request': 'Lease Evaluation',
  'sale_offer_inquiry': 'Sale Offer Inquiry',
  'lease_offer_inquiry': 'Lease Offer Inquiry',
  'estimator': 'Used Price Estimator',
  'unit_history_inquiry': 'Unit History Inquiry'
}

export async function sendActivityEmail({
    leadId,
    activityType,
    agentEmail,
    agentName,
    buildingName: overrideBuildingName,
    buildingAddress: overrideBuildingAddress,
    unitNumber: overrideUnitNumber,
    message: overrideMessage,
    isManagerNotification = false,
    isAdminNotification = false,
    teamAgentName,
    teamManagerName
  }: {
    leadId: string
    activityType: string
    agentEmail: string
    agentName: string
    buildingName?: string
    buildingAddress?: string
    unitNumber?: string
    message?: string
    isManagerNotification?: boolean
    isAdminNotification?: boolean
    teamAgentName?: string
    teamManagerName?: string
  }) {
  try {
    console.log('🔵 Checking if should send activity email...', { leadId, activityType })

    const shouldSend = await shouldSendActivityEmail(leadId, activityType)
    if (!shouldSend) {
      return { success: true, skipped: true }
    }

    const supabase = createServiceClient()

    const { data: lead } = await supabase
      .from('leads')
      .select('*, buildings(*)')
      .eq('id', leadId)
      .single()

    if (!lead) {
      console.error('❌ Lead not found')
      return { success: false, error: 'Lead not found' }
    }

    const { data: activities } = await supabase
      .from('user_activities')
      .select('*')
      .eq('contact_email', lead.contact_email)
      .order('created_at', { ascending: false })
      .limit(10)

    if (!activities || activities.length === 0) {
      console.error('❌ No activities found')
      return { success: false, error: 'No activities' }
    }

    const engagement = calculateEngagement(activities)
    const latestActivity = activities[0]
    const latestFormatted = formatActivityForEmail(latestActivity, lead.buildings)
    // Get building name from lead's building relationship, activity data, or fetch it
let buildingName = overrideBuildingName || lead.buildings?.building_name || latestActivity?.activity_data?.buildingName
let buildingAddress = overrideBuildingAddress || lead.buildings?.canonical_address || latestActivity?.activity_data?.buildingAddress
let unitNumber = overrideUnitNumber || latestActivity?.activity_data?.unitNumber

// If still no building name but lead has building_id, fetch it
if (!buildingName && lead.building_id) {
  const { data: building } = await supabase
    .from('buildings')
    .select('building_name, canonical_address')
    .eq('id', lead.building_id)
    .single()
  if (building) {
  buildingName = building.building_name
  buildingAddress = building.canonical_address
}
}
     
      // Build override activity data from passed parameters
      const overrideActivityData = {
        buildingName: overrideBuildingName || buildingName,
        buildingAddress: overrideBuildingAddress || buildingAddress,
        unitNumber: overrideUnitNumber || unitNumber,
        userMessage: overrideMessage
      }
      
      // Use triggering activity type details, not DB's latest activity
      const triggeringDetails = extractActivityDetails(activityType, overrideActivityData)
      const latestDetails = triggeringDetails || extractActivityDetails(latestActivity.activity_type, latestActivity.activity_data)

      // Use the triggering activity type for subject, not the latest activity
      const subjectActivityName = ACTIVITY_TYPE_NAMES[activityType] || latestFormatted.type
      // Extract KEY MILESTONES (always visible regardless of recency)
    const keyMilestoneTypes = ['registration', 'sale_offer_inquiry', 'lease_offer_inquiry', 'contact_form', 'message_agent', 'property_inquiry']
    
    // Create triggering activity entry (not in DB yet)
    const triggeringActivity = {
      activity_type: activityType,
      activity_data: overrideActivityData,
      created_at: new Date().toISOString()
    }
    
    // Add triggering activity to recent activities (it's not in DB yet)
    const allActivities = [triggeringActivity, ...activities.filter(a => a.activity_type !== activityType)]
    const recentActivities = allActivities.slice(0, 20).map(a => formatActivityForEmail(a, lead.buildings))
    
    // Add triggering activity to front if it's a key milestone type
    const allKeyActivities = keyMilestoneTypes.includes(activityType)
      ? [triggeringActivity, ...activities.filter(a => a.activity_type !== activityType && keyMilestoneTypes.includes(a.activity_type))]
      : activities.filter(a => keyMilestoneTypes.includes(a.activity_type))
    
    const keyMilestones = allKeyActivities.map(a => formatActivityForEmail(a, lead.buildings))

    const emailData = {
      agentName,
      leadName: lead.contact_name,
      leadEmail: lead.contact_email,
      leadPhone: lead.contact_phone,
      buildingName,
      buildingAddress,
      unitNumber,
      latestActivity: {
        type: activityType,
        description: ACTIVITY_TYPE_NAMES[activityType] || latestFormatted.type,
        details: latestDetails,
        timestamp: 'Just now'
      },
      recentActivities,
      keyMilestones,
      engagementScore: engagement.score,
      engagementText: engagement.text,
      totalActivityCount: activities.length,
      leadUrl: `https://condoleads.ca/dashboard/leads/${leadId}`,
      callUrl: lead.contact_phone ? `tel:${lead.contact_phone}` : undefined,
      whatsappUrl: lead.contact_phone ? `https://wa.me/${lead.contact_phone.replace(/\D/g, '')}` : undefined,
        isManagerNotification,
        isAdminNotification,
        teamAgentName,
        teamManagerName
      }

    const html = generateActivityEmailHtml(emailData)

    const { data, error } = await resend.emails.send({
      from: 'CondoLeads <notifications@condoleads.ca>',
      to: agentEmail,
      subject: `${engagement.score} ${isManagerNotification ? '[Team] ' : ''}${isAdminNotification ? '[Admin] ' : ''}Lead Activity: ${lead.contact_name} - ${subjectActivityName}${buildingName ? " - " + buildingName : ""}${unitNumber ? " Unit " + unitNumber : ""}${teamAgentName ? ` (Agent: ${teamAgentName})` : ''} (${activities.length} actions)`,
      html
    })

    if (error) {
      console.error('❌ Error sending activity email:', error)
      return { success: false, error: error.message }
    }

    await logEmailSent(leadId, activityType)

    console.log('✅ Activity email sent successfully:', data?.id)
    return { success: true, emailId: data?.id }

  } catch (error) {
    console.error('❌ Error in sendActivityEmail:', error)
    return { success: false, error: String(error) }
  }
}
