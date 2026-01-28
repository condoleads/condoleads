import { createClient } from '@/lib/supabase/server'
import BrandingClient from './BrandingClient'

export default async function BrandingPage() {
  const supabase = createClient()
  
  const { data: agents, error } = await supabase
    .from('agents')
    .select(`
      id, full_name, subdomain, custom_domain, site_title, site_tagline, og_image_url,
      google_analytics_id, google_ads_id, google_conversion_label, facebook_pixel_id,
      anthropic_api_key, ai_chat_enabled, ai_estimator_enabled, vip_auto_approve,
      ai_free_messages, ai_auto_approve_limit, ai_manual_approve_limit, ai_hard_cap,
      estimator_free_attempts, estimator_auto_approve_attempts, estimator_manual_approve_attempts, estimator_hard_cap,
      is_active
    `)
    .order('full_name')
  
  if (error) {
    console.error('Error fetching agents:', error)
  }
  
  return <BrandingClient initialAgents={agents || []} />
}