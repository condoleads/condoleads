'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateLeadStatus(leadId: string, status: string) {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', leadId)
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  revalidatePath('/dashboard/leads')
  return { success: true }
}

export async function updateLeadQuality(leadId: string, quality: string) {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('leads')
    .update({ quality, updated_at: new Date().toISOString() })
    .eq('id', leadId)
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  revalidatePath('/dashboard/leads')
  return { success: true }
}

export async function addLeadNote(leadId: string, agentId: string, note: string) {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('lead_notes')
    .insert({
      lead_id: leadId,
      agent_id: agentId,
      note,
      created_at: new Date().toISOString()
    })
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  revalidatePath(`/dashboard/leads/${leadId}`)
  return { success: true }
}

export async function getLeadNotes(leadId: string) {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('lead_notes')
    .select(`
      *,
      agents (
        full_name
      )
    `)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
  
  if (error) {
    return { success: false, notes: [], error: error.message }
  }
  
  return { success: true, notes: data }
}

export async function addLeadTag(leadId: string, tag: string) {
  const supabase = createClient()
  
  const { data: lead } = await supabase
    .from('leads')
    .select('tags')
    .eq('id', leadId)
    .single()
  
  if (!lead) {
    return { success: false, error: 'Lead not found' }
  }
  
  const currentTags = lead.tags || []
  if (currentTags.includes(tag)) {
    return { success: true }
  }
  
  const { error } = await supabase
    .from('leads')
    .update({ 
      tags: [...currentTags, tag],
      updated_at: new Date().toISOString()
    })
    .eq('id', leadId)
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  revalidatePath(`/dashboard/leads/${leadId}`)
  return { success: true }
}

export async function removeLeadTag(leadId: string, tag: string) {
  const supabase = createClient()
  
  const { data: lead } = await supabase
    .from('leads')
    .select('tags')
    .eq('id', leadId)
    .single()
  
  if (!lead) {
    return { success: false, error: 'Lead not found' }
  }
  
  const currentTags = lead.tags || []
  const newTags = currentTags.filter((t: string) => t !== tag)
  
  const { error } = await supabase
    .from('leads')
    .update({ 
      tags: newTags,
      updated_at: new Date().toISOString()
    })
    .eq('id', leadId)
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  revalidatePath(`/dashboard/leads/${leadId}`)
  return { success: true }
}

export async function setFollowUpDate(leadId: string, followUpDate: string) {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('leads')
    .update({ 
      follow_up_date: followUpDate,
      updated_at: new Date().toISOString()
    })
    .eq('id', leadId)
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  revalidatePath(`/dashboard/leads/${leadId}`)
  return { success: true }
}
