'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateAgentBranding(
  agentId: string,
  data: {
    custom_domain?: string | null
    site_title?: string | null
    site_tagline?: string | null
    og_image_url?: string | null
    google_analytics_id?: string | null
    google_ads_id?: string | null
    google_conversion_label?: string | null
    facebook_pixel_id?: string | null
    anthropic_api_key?: string | null
    ai_chat_enabled?: boolean | null
    ai_estimator_enabled?: boolean | null
    vip_auto_approve?: boolean | null
    // AI limits
    ai_free_messages?: number | null
    ai_auto_approve_limit?: number | null
    ai_manual_approve_limit?: number | null
    ai_hard_cap?: number | null
    // Estimator limits
    estimator_free_attempts?: number | null
    estimator_auto_approve_attempts?: number | null
    estimator_manual_approve_attempts?: number | null
    estimator_hard_cap?: number | null
  }
) {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('agents')
    .update({
      custom_domain: data.custom_domain || null,
      site_title: data.site_title || null,
      site_tagline: data.site_tagline || null,
      og_image_url: data.og_image_url || null,
      google_analytics_id: data.google_analytics_id || null,
      google_ads_id: data.google_ads_id || null,
      google_conversion_label: data.google_conversion_label || null,
      facebook_pixel_id: data.facebook_pixel_id || null,
      anthropic_api_key: data.anthropic_api_key || null,
      ai_chat_enabled: data.ai_chat_enabled ?? true,
      ai_estimator_enabled: data.ai_estimator_enabled ?? false,
      vip_auto_approve: data.vip_auto_approve ?? false,
      // AI limits (with defaults)
      ai_free_messages: data.ai_free_messages ?? 1,
      ai_auto_approve_limit: data.ai_auto_approve_limit ?? 10,
      ai_manual_approve_limit: data.ai_manual_approve_limit ?? 10,
      ai_hard_cap: data.ai_hard_cap ?? 25,
      // Estimator limits (with defaults)
      estimator_free_attempts: data.estimator_free_attempts ?? 3,
      estimator_auto_approve_attempts: data.estimator_auto_approve_attempts ?? 10,
      estimator_manual_approve_attempts: data.estimator_manual_approve_attempts ?? 10,
      estimator_hard_cap: data.estimator_hard_cap ?? 25
    })
    .eq('id', agentId)

  if (error) {
    console.error('Error updating agent branding:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/branding')
  return { success: true }
}

export async function addAgentCustomDomain(agentId: string, domain: string) {
  const supabase = createClient()

  const { error } = await supabase
    .from('agents')
    .update({ custom_domain: domain })
    .eq('id', agentId)

  if (error) {
    console.error('Error adding custom domain:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/branding')
  return { success: true }
}

export async function removeAgentCustomDomain(agentId: string) {
  const supabase = createClient()

  const { error } = await supabase
    .from('agents')
    .update({
      custom_domain: null,
      site_title: null,
      site_tagline: null,
      og_image_url: null
    })
    .eq('id', agentId)

  if (error) {
    console.error('Error removing custom domain:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/branding')
  return { success: true }
}