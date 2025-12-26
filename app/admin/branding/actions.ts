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
  }
) {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('agents')
    .update({
      custom_domain: data.custom_domain || null,
      site_title: data.site_title || null,
      site_tagline: data.site_tagline || null,
      og_image_url: data.og_image_url || null
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